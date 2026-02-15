# Cafelua OS

Bazzite 기반 배포형 AI OS. USB 꽂으면 Alpha가 맞이하는 개인 AI 운영체제.

## 비전

```
USB 꽂기 → Bazzite 부팅 → Alpha(AI 아바타)가 화면에 등장 → 대화 시작
```

- **OS 자체가 AI의 도구** — AI에게 OS를 통째로 준다
- **Virtual Avatar** — Alpha가 화면에 살아있는 존재
- **개인 AI 데몬** — 항상 켜져있고, 어디서든 대화 가능
- **게임도 같이** — AI랑 Minecraft, Factorio 등을 함께 플레이

## 아키텍처

```
┌─────────────────────────────────────┐
│         Cafelua Shell (UI)          │
│  ┌──────────┬──────────────────┐    │
│  │  Alpha   │  대화 / 작업     │    │
│  │  Avatar  │  패널            │    │
│  │ (VRM 3D) │                  │    │
│  └──────────┴──────────────────┘    │
├─────────────────────────────────────┤
│         Agent Core (AI 엔진)        │
│  LLM 연결 · 도구 · 서브에이전트     │
├─────────────────────────────────────┤
│         Gateway (항상 실행)          │
│  채널 통합 · Skills · 메모리         │
├─────────────────────────────────────┤
│         Bazzite (불변 Linux OS)      │
│  GPU 드라이버 · Podman · rpm-ostree │
└─────────────────────────────────────┘
```

## 프로젝트 구조

```
cafelua-os/
├── shell/          # Cafelua Shell (Tauri 2 + Three.js Avatar)
├── agent/          # AI 에이전트 코어
├── gateway/        # 항상 실행되는 데몬
├── os/             # Bazzite 커스텀 이미지 (BlueBuild)
├── .agents/        # AI용 컨텍스트 (영어, JSON/YAML)
└── .users/         # 사람용 컨텍스트 (한국어, Markdown)
```

## 문서

- [비전](.users/context/vision.md) — 핵심 컨셉: "OS 자체가 AI의 도구"
- [구현 계획](.users/context/plan.md) — Phase 0-5 상세 계획, 각 단계 결과물
- [Careti 재사용](.users/context/careti-reuse.md) — project-careti에서 가져올 코드/전략
- [프로젝트 규칙](.users/context/agents-rules.md) — 코딩 컨벤션, 테스트, 로깅, 보안, 개발 프로세스

## 기술 스택

| 계층 | 기술 |
|------|------|
| OS 기반 | Bazzite (Fedora Atomic, 불변) |
| 이미지 빌드 | BlueBuild + GitHub Actions |
| 데스크탑 셸 | Tauri 2 + Three.js (VRM Avatar) |
| AI 엔진 | Node.js (멀티 LLM 프로바이더) |
| 데몬 | systemd 서비스 |
| 메모리 | SQLite + 벡터 검색 |
| 포맷터 | Biome |
| 테스트 | Vitest + tauri-driver (WebDriver) |

## 참조 프로젝트

| 프로젝트 | 가져오는 것 |
|---------|------------|
| [Bazzite](https://github.com/ublue-os/bazzite) | 불변 Linux OS, GPU, 게이밍 최적화 |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, 플러그인 프로토콜, 게임 에이전트 |
| [MoltBot/OpenClaw](https://github.com/steipete/openclaw) | Gateway 데몬, 채널 통합, Skills |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server 분리, Provider 추상화 |
| Careti | LLM 연결, 도구 세트, 서브에이전트, 컨텍스트 관리 |

## 배포

```
Phase 0 (Day 1-3):  BlueBuild 파이프라인 → push하면 ISO 자동 생성
Phase 1 (Week 1):   아바타 탑재 → Alpha가 보이는 ISO
Phase 2 (Week 2):   대화 추가 → Alpha와 대화하는 ISO ← 공개 데모
Phase 3 (Week 3-4): 도구 → Alpha가 일하는 ISO
Phase 4 (Week 5-7): 데몬 → 완성된 AI OS
Phase 5 (Week 8+):  게임 → AI랑 마인크래프트
```

## 상태

Phase 0: 설계 완료, 구현 준비 중

## 참고

- Bazzite fork 불필요 — BlueBuild 레이어링으로 충분
- 상세 보안 정책은 [규칙 문서](.users/context/agents-rules.md#보안) 참조
