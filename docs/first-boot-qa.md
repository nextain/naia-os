# First-boot QA — common vs server

실기에서 무엇을 확인할지. 공통은 모든 ISO, 서버는 BC-250 음성 호스트.

## 공통 (모든 설치)

라이브 USB

1. Bazzite Portal이 **안** 뜬다. Naia 환영만 뜬다.
2. 언어를 한국어로 고르면 **다음 질문도 한국어**다.
   - USB로 쓰기 / 이 컴퓨터에 설치 / 그냥 둘러보기
3. **USB로 쓰기**: 8G ISO + 나머지 빈 공간이 있는 스틱에서 `naia-data`가 생기고, 재부팅 후 설정이 남는다. “ISO가 디스크를 다 채움”으로 거절되면 실패.
4. **이 컴퓨터에 설치**: 설치가 실패하지 않는다. 기존 빈 파티션(`NAIA2-*`)만 고를 수 있으면 고른다. sda1–3(현재 OS)는 건드리지 않는다.
5. 설치본에 **브라우저**가 있다 (Kickoff에서 Firefox 또는 동등).
6. Naia 온보딩: 아바타를 고르지 않으면 **다음이 비활성**. 고른 뒤에만 진행.
7. Naia 로그인: 브라우저가 있어 콜백이 된다.
8. 내장 브라우저 창이 화면 안에 있다.

## 서버 (BC-250 백본 — 보드당 워크로드 하나)

공통 1–8이 막히면 여기서 멈춘다. 한 보드에 음성·립싱크·가창을 동시에 올리지 않는다. 새 보드는 DEV 게이트웨이·DEV 어드민에 먼저 붙인다 (nextain/naia-os#5, naia-model-infra#25).

9. 설치 후 `loginctl show-session` / `busctl get-property org.freedesktop.login1 … CanSuspend` → `na`. `systemctl suspend`가 기기를 죽이지 않는다.
10. hostname은 기본 `naiaos` (원하면 `bc250`으로 변경).
11. 이미지에 `naia-voice-host` 쿼들렛이 **있고 enable 되어 있지 않다.**
12. `NAIA_DEVICE_ID=bc250-N NAIA_WORKLOAD=voice` provision 한 번. 운영 `bc250-0`을 건드리지 말 것.
13. DEV any-llm 슬롯 + 어드민 `/model-infra`에 그 보드가 보인다. 라이브 청취는 크레딧 정리 후.

추적: nextain/naia-os#4

## 갭 (2026-09-17 실기 → 이 이미지)

| 증상 | 층 | 조치 |
|---|---|---|
| Bazzite Portal | 공통 이미지+ISO | autostart 삭제 (branding.sh + hook) |
| 한국어 다음 영어 3선택 | 공통 | `naia-live-welcome` 언어별 카피 |
| USB 영속, ISO가 디스크를 채움 | 공통 | isohybrid GPT를 스틱 끝으로 이동 |
| 설치 실패 / 흰 화면 | 공통 | `/usr/bin/firefox` 심 + ostree Flatpak Firefox/Chrome (Anaconda WebUI) |
| 설치본에 브라우저 없음 | 공통 | 위와 동일. live `dnf firefox \|\| true` 만으로는 ostree에 안 남음 |
| VRM 없이 다음 | 셸 | naia-shell `f20994b8` (다음 이미지 RPM 핀 필요) |
| grok/codex/claude/agy | 공통 | 아직 이미지에 안 넣음. brew 첫 부팅 이후에 설치. ostree에 npm 글로벌을 굽지 않음 |
| BC-250 절전 | 서버 | `install-bc250.sh` 가 AMD 레시피에 없었음 → 추가. 보드 아니면 no-op |

셸 VRM 수정은 이미지 RPM이 아직 v0.2.2라 이번 ISO에 안 들어간다. 다음 셸 릴리스 URL을 recipe에 핀해야 한다.
