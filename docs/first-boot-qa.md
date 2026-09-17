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

## 서버 (BC-250 음성 호스트)

공통 1–8이 막히면 여기서 멈춘다.

9. 설치 후 `loginctl show-session` / `busctl get-property org.freedesktop.login1 … CanSuspend` → `na`. `systemctl suspend`가 기기를 죽이지 않는다.
10. hostname은 기본 `naiaos` (원하면 `bc250`으로 변경).
11. `NAIA_DEVICE_ID=bc250-0 profiles/naia-0.9-voice-bc250/scripts/provision.sh` 가 통과.
12. `check.sh`: 로컬 `:8892` `:8910` + 터널 헬스.
13. 데모 한 턴: 마이크 인식(Korea Foundry Fast STT) + 첫 절 TTS.

추적: nextain/naia-os#4
