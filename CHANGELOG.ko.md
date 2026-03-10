# 변경 이력

Naia OS의 주요 변경 사항을 기록합니다.
원본 데이터: [`releases/v*.yaml`](releases/)

[English](CHANGELOG.md)

---

## v0.1.2 (2026-03-10)

인앱 자동 업데이트, 음성 프로바이더 리팩토링, 스킬/음성 버그 수정, CI 품질 게이트 및 OS 개선

- **feat(shell)**: 배너 알림 및 설정 버전 푸터가 포함된 인앱 업데이트 체커 ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(ci)**: Tauri 업데이터 서명, latest.json 생성 및 itch.io butler 자동 배포 ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(web)**: releases/*.yaml 기반 naia.nextain.io 다운로드 페이지 changelog 섹션 ([#30](https://github.com/nextain/naia-os/issues/30))
- **feat(voice)**: 라이브 대화를 프로바이더 패턴으로 추상화 (Gemini Live, OpenAI Realtime) ([#25](https://github.com/nextain/naia-os/issues/25))
- **fix(shell)**: 음성 대화 에코 억제 및 VRM 성별 기반 음성 기본값 추가 ([#22](https://github.com/nextain/naia-os/issues/22))
- **refactor(shell)**: 미사용 STT 코드 및 레거시 SettingsModal 제거 ([#25](https://github.com/nextain/naia-os/issues/25))
- **fix(agent)**: 비영어 환경에서 커스텀 스킬 탐색 실패 수정 ([#28](https://github.com/nextain/naia-os/issues/28))
- **fix(skills)**: 스킬 설치 피드백, 이벤트 릭, i18n 수정 및 20개 빌트인 스킬 동기화 ([#28](https://github.com/nextain/naia-os/issues/28))
- **refactor(agent)**: 시스템 프롬프트 파이프라인 중복 제거
- **feat(agent)**: Ollama 호스트 설정 지원
- **feat(shell)**: Shell-OpenClaw 간 양방향 메모리 동기화
- **fix(shell)**: AI 응답 언어가 로케일 설정을 따르도록 수정
- **feat(ci)**: CI 품질 게이트 (lint, typecheck, build-test) 및 Biome 적용 ([#12](https://github.com/nextain/naia-os/issues/12))
- **feat(ci)**: 파이프라인 체인: Release → Build OS → Generate ISO, 주간 자동 리빌드 ([#12](https://github.com/nextain/naia-os/issues/12))
- **fix(installer)**: DNS 삼중 fallback 복원, CJK 폰트 수정, Plymouth two-step 모듈
- **fix(branding)**: 설치된 시스템에 태스크바 핀, 배경화면, 잠금화면 추가

## v0.1.1 (2026-03-05)

Flatpak 지원 및 OpenClaw 통합이 포함된 첫 공개 릴리스

- **feat(shell)**: OpenClaw 번들 Flatpak 패키징
- **feat(shell)**: 감정 표현이 있는 VRM 3D 아바타
- **feat(agent)**: 멀티 프로바이더 LLM 지원 (Gemini, Claude, OpenAI, xAI, Ollama)
- **feat(shell)**: Edge, Google, OpenAI, ElevenLabs TTS 음성 대화
- **feat(shell)**: 14개 언어 UI 다국어 지원 ([#1](https://github.com/nextain/naia-os/issues/1))
