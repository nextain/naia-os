# 구현 계획

## 핵심 전략: 배포 먼저, 기능은 점진적으로

```
❌ 기존: 기능 완성 → 배포
✅ 변경: 배포 파이프라인 먼저 → 기능을 계속 추가
```

BlueBuild + GitHub Actions는 push할 때마다 자동으로 OS 이미지를 빌드한다.
즉, **Day 1부터 배포 가능**. 매 Phase마다 새 ISO가 나온다.

---

## Phase 0: 배포 파이프라인 (Day 1-3)

> **결과물**: GitHub에 push하면 Cafelua OS 이미지가 자동 빌드됨

### 0-1. BlueBuild 템플릿 세팅

**작업:**
- `os/` 디렉토리에 BlueBuild recipe 생성
- GitHub Actions 워크플로우 설정
- Bazzite를 base-image로 지정

```yaml
# os/recipe.yml
name: cafelua-os
description: Personal AI OS with Alpha
base-image: ghcr.io/ublue-os/bazzite
image-version: latest

modules:
  - type: rpm-ostree
    install: [nodejs20]
  - type: files
    files:
      - source: usr/
        destination: /usr/
```

### 0-2. GitHub Actions 자동 빌드

**작업:**
- BlueBuild GitHub Action 설정
- push → 이미지 빌드 → ghcr.io 게시
- ISO 생성 (ublue-os/isogenerator)

**결과:**
```
git push → GitHub Actions → ghcr.io/luke-n-alpha/cafelua-os:latest
                          → cafelua-os.iso (Releases)
```

### Phase 0 완료 = 배포 가능
```
✅ BlueBuild recipe 동작
✅ push마다 OS 이미지 자동 빌드
✅ ISO 다운로드 가능 (GitHub Releases)
✅ USB에 구워서 부팅 확인 (아직 Bazzite 그대로)
```

**이 시점에 공유 가능:** "Cafelua OS 첫 이미지 나왔다" (아직은 Bazzite + Node.js뿐이지만)

---

## Phase 1: Alpha가 화면에 나타난다 (Week 1)

> **결과물**: Bazzite 부팅 → Alpha 아바타가 자동으로 화면에 등장

### 1-1. AIRI Avatar 최소 추출

**작업:**
- AIRI `packages/stage-ui-three`에서 VRM 로더 추출
- Three.js + @pixiv/three-vrm 최소 세트
- 눈 깜빡임, idle 애니메이션
- 기본 VRM 모델 파일 포함

**결과:** 독립 HTML/JS로 VRM 아바타 렌더링 데모

### 1-2. Tauri 셸 생성

**작업:**
- `shell/` 디렉토리에 Tauri 2 프로젝트 초기화
- Avatar 렌더러를 webview에 통합
- 기본 레이아웃 (Avatar 좌측 + 대화 패널 우측)

**결과:** `cargo tauri dev` → Alpha 아바타가 창에 표시

### 1-3. OS에 탑재

**작업:**
- Tauri 앱 빌드 → 바이너리를 OS 이미지에 포함
- 로그인 시 자동 시작 (autostart desktop entry)
- recipe.yml에 Cafelua Shell 추가

**결과:** ISO → USB → 부팅 → Alpha 아바타 자동 등장

### Phase 1 완료 = 첫 데모
```
✅ USB 부팅하면 Alpha가 화면에 나타남
✅ VRM 3D 아바타, 눈 깜빡임, idle 모션
✅ 아직 대화 불가 (다음 Phase)
```

**이 시점에 공유 가능:** "USB 꽂으면 AI 캐릭터가 맞이하는 OS" (스크린샷/영상)

---

## Phase 2: Alpha와 대화할 수 있다 (Week 2)

> **결과물**: 채팅 패널에서 Alpha와 텍스트 대화. 표정 변화 + 립싱크.

### 2-1. Agent Core 최소 구현

**작업:**
- `agent/`에 Node.js 프로젝트
- LLM 1개 연결 (Claude API) — Careti 프로바이더 코드 복사
- stdio JSON lines 프로토콜 — Careti stdio-adapter 복사
- Alpha 페르소나 시스템 프롬프트

**결과:** `node agent/core.js --stdio` 로 대화 가능

### 2-2. Shell ↔ Agent 연결

**작업:**
- Tauri Rust에서 agent-core spawn — Careti `lib.rs` 복사
- stdio 브릿지 (자동 재시작 포함)
- 채팅 패널 UI
- 스트리밍 응답 표시

**결과:** 채팅 패널에서 Alpha와 실시간 대화

### 2-3. Avatar 감정 + 립싱크

**작업:**
- LLM 응답에서 감정 추출
- VRM 표정 변경 (기쁨, 놀람, 생각 중)
- 응답 중 립싱크

**결과:** Alpha가 말하면서 표정이 바뀌고 입이 움직임

### 2-4. OS 이미지 업데이트

**작업:**
- agent-core 바이너리를 OS 이미지에 포함
- 첫 부팅 시 API 키 입력 화면 (온보딩)
- recipe.yml 업데이트 → 자동 빌드 → 새 ISO

**결과:** 새 ISO로 USB 부팅 → 키 입력 → Alpha와 대화

### Phase 2 완료 = 사용 가능한 데모
```
✅ USB 부팅 → API 키 설정 → Alpha와 대화
✅ 스트리밍 응답
✅ 아바타 표정 변화 + 립싱크
✅ ISO 자동 빌드 (push마다)
```

**이 시점에 공유 가능:** "USB 꽂으면 AI와 대화할 수 있는 OS" (데모 영상)
**관심 끌기에 충분한 지점.**

---

## Phase 3: Alpha가 일을 한다 (Week 3-4)

> **결과물**: Alpha가 파일 편집, 터미널 실행, 웹 검색 가능

### 3-1. 도구 시스템

**작업:**
- Careti 도구 코드 복사 + 정리:
  - `file_read`, `file_write`, `apply_diff` (SmartEditEngine)
  - `execute_command` (터미널)
  - `browser_action` (웹)
  - `search_files` (ripgrep)
- LLM tool calling 연동

**결과:** "메모 만들어줘", "npm install 해줘" → Alpha가 실행

### 3-2. 권한 + 감사

**작업:**
- Tier 0-3 권한 시스템
- 승인 요청 UI
- 감사 로그 (SQLite)

**결과:** 위험 작업은 승인 요청, 전체 이력 기록

### 3-3. 작업 UI

**작업:**
- 작업 진행 패널 (Alpha가 뭘 하고 있는지)
- 터미널 출력 실시간 표시
- 파일 변경 diff

**결과:** Alpha의 작업을 시각적으로 확인

### Phase 3 완료 = 실용적인 AI OS
```
✅ Alpha가 파일 읽기/쓰기/편집
✅ 터미널 명령 실행
✅ 웹 검색
✅ 권한 시스템 + 감사 로그
✅ 작업 진행 UI
```

**이 시점에 공유 가능:** "AI가 실제로 컴퓨터를 조작하는 OS" (데모 영상)

---

## Phase 4: Alpha가 항상 켜져있다 (Week 5-7)

> **결과물**: 데몬으로 항상 실행. 외부 채널에서도 접근 가능.

### 4-1. Gateway 데몬 (MoltBot 패턴)

**작업:**
- WebSocket 서버 (systemd user service)
- Shell → Gateway → Agent Core 구조로 전환
- Shell 닫아도 Gateway 유지

### 4-2. 채널 통합

**작업:**
- Discord 봇 (discord.js)
- Telegram 봇 (grammY)
- 외부 채널은 Tier 0-1 권한만

**결과:** 밖에서 "집 PC 상태?" → Alpha 응답

### 4-3. 메모리 + Skills

**작업:**
- 대화 이력 영속 (SQLite + 벡터 검색)
- 기본 Skills (날씨, 메모, 시스템 상태)
- 커스텀 Skills (~/.cafelua/skills/)

### Phase 4 완료 = 완성된 AI OS
```
✅ 부팅 시 자동 시작, 항상 실행
✅ 외부 채널 접근
✅ 대화 기억
✅ Skills 시스템
```

---

## Phase 5: Alpha와 게임을 한다 (Week 8+)

> **결과물**: Minecraft 같이 플레이, 게임 중 아바타 반응

### 5-1. Minecraft (AIRI 포팅)

- Mineflayer 서버 접속
- 자율 행동 (채굴, 건축, 전투)
- 게임 상황 → 대화 반영

### 5-2. 범용 게임

- 화면 캡처 + 비전 모델
- 키/마우스 제어
- 게임별 프로필

### 5-3. 게임 오버레이

- Alpha 아바타 오버레이 표시
- 게임 상황 감정 반응
- 음성 채팅

### Phase 5 완료 = 차별화
```
✅ Minecraft에서 Alpha와 함께 플레이
✅ 게임 중 대화/반응
```

---

## 배포 타임라인

```
Day 1-3:   Phase 0 (파이프라인) → 빈 ISO 나옴
Week 1:    Phase 1 (아바타)     → Alpha가 보이는 ISO
Week 2:    Phase 2 (대화)       → Alpha와 대화하는 ISO  ← 공개 데모
Week 3-4:  Phase 3 (도구)       → Alpha가 일하는 ISO
Week 5-7:  Phase 4 (데몬)       → 완성된 AI OS ISO
Week 8+:   Phase 5 (게임)       → 게임하는 AI OS ISO
```

**매 Phase마다 새 ISO가 나온다.**
push → GitHub Actions → 빌드 → ISO → 다운로드 가능.

## 관심 끌기 포인트

| 시점 | 공유 가능한 것 | 임팩트 |
|------|--------------|--------|
| Phase 0 | "AI OS 프로젝트 시작" | 낮음 (관심자만) |
| Phase 1 | 스크린샷: 부팅하면 아바타가 나타남 | **중간** |
| **Phase 2** | **데모 영상: AI와 대화하는 OS** | **높음 — 여기서 공개** |
| Phase 3 | 데모: AI가 터미널/파일 제어 | 매우 높음 |
| Phase 4 | "Discord에서 집 AI에게 명령" | 높음 |
| Phase 5 | "AI랑 마인크래프트" | 바이럴 가능성 |
