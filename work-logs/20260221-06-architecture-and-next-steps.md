# 작업 로그: NanoClaw 아키텍처 분석 및 향후 로드맵 (Sandboxing)

## 일시
2026-02-21

## 논의 사항: OpenClaw vs NanoClaw 아키텍처 비교

### 1. 현황 (Naia OS의 OpenClaw 래핑)
- **장점**: 50+ 모듈, 다양한 채널 연동(Discord 등)을 지원하는 강력한 허브. 멀티 프로바이더(Gemini, Claude, Grok 등)와 API Gateway 역할을 완벽히 수행.
- **격리(Sandboxing) 방식**: Bazzite OS의 **Immutable Root** 특성과 **Systemd Hardening**(`ProtectHome=read-only`, `NoNewPrivileges=true`)을 통해 데몬 수준에서 시스템을 보호. 프론트엔드(Tauri)는 **Flatpak**으로 격리됨.

### 2. NanoClaw의 접근 방식
- **특징**: "1인 사용자를 위한 가볍고 투명한 코드베이스." 애플리케이션 레벨 권한 제어 대신, **OS 레벨 컨테이너 샌드박스(Docker / Apple Container)**를 생성하여 각 채팅 그룹이나 에이전트 작업 공간을 하드웨어 수준에서 격리함.
- **장점**: 에이전트가 알 수 없는 터미널 명령어나 패키지 설치를 시도해도, 컨테이너 내부로 한정되므로 호스트 OS는 100% 안전함.

### 3. 결론 및 인사이트
현재 Naia OS(Bazzite 환경)의 보안 구조(Systemd + Flatpak + Immutable)는 이미 매우 훌륭합니다. 하지만 NanoClaw가 보여준 **"컨테이너 기반 동적 작업 환경(Workspace)"** 개념은 Naia OS에 다음과 같은 영감을 줍니다:
- 에이전트가 코드 컴파일, 라이브러리 설치 등 "위험하거나 시스템 환경을 어지럽히는 작업"을 수행해야 할 때, **Distrobox(또는 Podman) 컨테이너를 일회용으로 Spawn**하여 그 안에서만 실행하게 만드는 **'컨테이너 샌드박스 스킬'**을 도입할 수 있음.

---

## 당장 해야 할 작업 (Action Items)

윈도우 지원 등의 먼 미래 로드맵을 제외하고, 당장 프로젝트(Naia OS / Web)에 필요한 즉각적인 후속 작업들은 다음과 같습니다:

1. **GitHub README 및 문서 현행화 (Documentation)**
   - 리브랜딩(`Nextain` -> `Naia OS`) 사항이 모든 외부 문서(README.md, CLI 도움말 등)에 반영되었는지 최종 검토.
   - 특히 추가된 SSoT(Single Source of Truth) 기반 모델 선택, API 키 로딩(.env) 기능에 대한 개발자/사용자 가이드 업데이트.

2. **온보딩 마법사 완료 플래그 동기화 확인 (UX/Bug)**
   - UI E2E 테스트 과정에서 온보딩 마법사(Onboarding Wizard)의 마지막 단계(Webhook) 후 완료가 제대로 기록(`naia-config`의 `onboardingComplete`)되고, 이후 앱 재시작 시 온보딩을 건너뛰는지 확인 및 강화.

3. **Flatpak 빌드 파이프라인 검증 (CI/CD)**
   - 로컬 테스트는 완벽하지만, 오늘 변경된 모델 목록 동적 로딩 기능과 추가된 VRM `.webp` 썸네일 파일들이 Flatpak 빌드(`/build-dir`) 및 GitHub Action ISO 생성 파이프라인에 누락 없이 포함되는지 CI 빌드를 통해 최종 검증.
