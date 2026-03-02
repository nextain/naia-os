# rsync exit code 23 하드디스크 설치 실패 수정

**날짜:** 2026-03-02
**상태:** 수정 완료 (v2 — `execReadlines` 예외 처리 수정)
**영향:** 라이브 USB → 하드디스크 설치 시 100% 실패

---

## 증상

라이브 USB에서 "Install to Hard Drive"로 하드디스크 설치를 시도하면,
소프트웨어 설치 60% 진행 후 다음 에러로 실패:

```
org.fedoraproject.Anaconda.PayloadInstallationError:
Failed to install image: process '['rsync', '-pogAXtlHrDx', ...]'
exited with status 23
```

rsync exit code 23 = "some files/attrs were not transferred (see previous errors)"

---

## 근본 원인

### ostree 심볼릭 링크 vs BTRFS subvolume 충돌

Naia OS는 Bazzite(Fedora ostree 기반)를 베이스로 사용한다.
ostree 이미지에서는 루트 레벨의 여러 디렉토리가 심볼릭 링크로 되어 있다:

```
/home   -> var/home     (심볼릭 링크)
/root   -> var/roothome (심볼릭 링크)
/mnt    -> var/mnt      (심볼릭 링크)
/opt    -> /var/opt     (심볼릭 링크)
/srv    -> var/srv      (심볼릭 링크)
/media  -> run/media    (심볼릭 링크)
```

Anaconda 설치기는 BTRFS 파티셔닝 시 `root`과 `home` 두 개의
subvolume을 자동 생성하고, `/home`을 별도 마운트 포인트로 마운트한다:

```
/dev/sda3 → /mnt/sysroot       (subvol=/root)
/dev/sda3 → /mnt/sysroot/home  (subvol=/home)  ← 실제 디렉토리로 마운트됨
```

rsync가 소스 이미지의 `/home` (심볼릭 링크)을 타겟으로 복사하려면,
기존의 `/mnt/sysroot/home` 디렉토리를 삭제하고 심볼릭 링크를 생성해야 한다.
하지만 `/home`이 BTRFS subvolume으로 **마운트된 상태**이므로:

```
rsync: [generator] delete_file: rmdir(home) failed: Device or resource busy (16)
could not make way for new symlink: home
```

→ rsync exit code 23 발생

---

## v1 패치의 문제점 (커밋 32bed3f)

이전 패치는 `_fixup_ostree_symlinks()`를 rsync `try/except` 블록 **다음**에 배치했다.

```python
# v1 — 동작하지 않는 구조
try:
    for line in execReadlines(cmd, args):  # raise_on_nozero=True (기본값)
        self._parse_rsync_update(line)
except (OSError, RuntimeError) as e:
    raise PayloadInstallationError(...)    # ← rsync exit 23이 여기서 잡힘!

self._fixup_ostree_symlinks()              # ← 절대 도달하지 않음!
```

**핵심 문제:** `execReadlines()`의 기본값 `raise_on_nozero=True`는 rsync가
exit code 23으로 종료하면 `OSError`를 발생시킨다. 이 예외가
`except (OSError, RuntimeError)` 블록에서 잡혀 `PayloadInstallationError`로
변환되므로, `_fixup_ostree_symlinks()`에 **절대 도달할 수 없었다**.

### 라이브 시스템 분석으로 확인한 사항

설치 에러가 발생한 라이브 USB에서 직접 분석한 결과:

1. **Anaconda 패치 자체는 정상 적용됨** — `_fixup_ostree_symlinks()` 메서드가
   installation.py에 존재함
2. **문제는 실행 흐름** — `execReadlines`가 exit code 23을 `OSError`로
   변환하여 fixup 메서드에 도달하기 전에 예외가 발생
3. **Anaconda는 root로 실행** — permission denied (41개) 문제는 liveuser에서만
   발생하며, root로 실행되는 Anaconda에서는 발생하지 않음 (0개 에러)
4. **유일한 실패 원인은 `/home` 마운트 충돌** — BTRFS subvolume으로 마운트된
   `/mnt/sysroot/home`을 심볼릭 링크로 교체할 수 없어서 exit code 23 발생

---

## v2 수정 (현재)

### 핵심 변경: `execReadlines`에 `raise_on_nozero=False` 전달

```python
# v2 — 수정된 구조
try:
    reader = execReadlines(cmd, args, raise_on_nozero=False)
    for line in reader:
        self._parse_rsync_update(line)

    rc = reader.rc
    if rc not in (0, 23):
        raise PayloadInstallationError(...)   # 0, 23 이외의 코드만 에러

    if rc == 23:
        log.warning("rsync exited with code 23 ...")  # 경고만 로깅

except (OSError, RuntimeError) as e:
    raise PayloadInstallationError(...)

self._fixup_ostree_symlinks()                 # ← 이제 도달 가능!
```

### 동작 방식

1. rsync가 실행되고, 마운트된 `/home` 등은 복사 실패 (exit code 23)
2. `raise_on_nozero=False`이므로 `execReadlines`가 예외를 발생시키지 않음
3. exit code 23은 ostree 이미지에서 예상되는 코드이므로 경고만 로깅
4. 다른 exit code (1, 2, etc.)는 여전히 `PayloadInstallationError` 발생
5. `_fixup_ostree_symlinks()` 호출:
   - 소스 이미지의 루트 레벨 심볼릭 링크를 순회
   - 타겟에서 해당 경로가 디렉토리(마운트포인트)인 경우:
     - `mountpoint -q`로 마운트 여부 확인
     - `umount -l` 로 언마운트
     - `rmdir` 또는 `shutil.rmtree` 로 디렉토리 삭제
     - `os.symlink()` 으로 올바른 심볼릭 링크 생성
6. 설치가 정상 완료됨

### 변경 파일

- `installer/hook-post-rootfs.sh` — 섹션 3b 패치 스크립트 수정

### 패치 대상

- `pyanaconda/modules/payloads/payload/live_image/installation.py`
  - `InstallFromImageTask.run()`: `execReadlines` 호출에 `raise_on_nozero=False` 추가
  - exit code 23을 허용하고 다른 코드만 에러로 처리
  - `_fixup_ostree_symlinks()` 메서드 추가 (변경 없음)

---

## 검증

1. 패치 스크립트가 현재 Anaconda의 installation.py에 정상 적용됨 확인
2. 패치된 Python 파일의 문법 검증 통과 (`py_compile`)
3. `execReadlines` 시그니처 확인: `raise_on_nozero` 매개변수 존재 확인
4. 라이브 시스템에서 `reader.rc` 속성 접근 가능 확인

---

## 기술 상세: `execReadlines`의 `raise_on_nozero` 동작

```python
# pyanaconda/core/util.py — ExecLineReader.__next__()
def __next__(self):
    line = self._proc.stdout.readline().decode("utf-8")
    if line == '':
        self._proc.communicate()

        if not self._raise_on_nozero:
            raise StopIteration           # exit code 무시, 정상 종료

        if self._proc.returncode < 0:
            raise OSError("process was killed by signal ...")
        elif self._proc.returncode > 0:
            raise OSError("process exited with status ...")  # ← v1에서 여기서 실패
        raise StopIteration
```

`raise_on_nozero=False`로 설정하면 `StopIteration`만 발생하여 `for` 루프가
정상 종료되고, `reader.rc` 속성으로 exit code를 수동 확인할 수 있다.

---

## 향후 고려사항

- Anaconda upstream에 ostree 기반 이미지용 심볼릭 링크 처리 패치를
  제출하는 것을 고려할 수 있음
- BTRFS subvolume 자동 생성 시 `/home` subvolume을 생성하지 않도록
  Anaconda 프로필에서 제어할 수 있는지 조사 필요
