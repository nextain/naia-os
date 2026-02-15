# Cafelua OS

Bazzite 기반 배포형 AI OS. USB 꽂으면 Alpha가 맞이하는 개인 AI 운영체제.

## 비전

```
USB 꽂기 → Bazzite 부팅 → Alpha(AI 아바타)가 화면에 등장 → 대화 시작
```

- **코딩 도구가 아닌 OS** — 누구나 설치할 수 있는 AI 환경
- **Virtual Avatar** — Alpha가 화면에 살아있는 존재
- **개인 AI 데몬** — 항상 켜져있고, 어디서든 대화 가능

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
├── shell/          # Cafelua Shell (데스크탑 UI + Avatar)
├── agent/          # AI 에이전트 코어
├── gateway/        # 항상 실행되는 데몬 (채널, Skills, 메모리)
├── os/             # Bazzite 커스텀 이미지 빌드 (BlueBuild)
└── docs/           # 문서
```

## 기술 스택

| 계층 | 기술 |
|------|------|
| OS 기반 | Bazzite (Fedora Atomic, 불변) |
| 이미지 빌드 | BlueBuild |
| 데스크탑 셸 | Tauri 2 + Three.js (Avatar) |
| AI 엔진 | Node.js (LLM 프로바이더 연결) |
| 데몬 | systemd 서비스 |
| 메모리 | SQLite + 벡터 검색 |

## 참조 프로젝트

이 프로젝트는 아래 오픈소스들의 장점을 합성한 것:

| 프로젝트 | 가져오는 것 |
|---------|------------|
| [MoltBot/OpenClaw](https://github.com/nicebots-xyz/openclaw) | Gateway 데몬, 채널 통합, Skills |
| [Project AIRI](https://github.com/moeru-ai/airi) | VRM Avatar, 플러그인 프로토콜 |
| [OpenCode](https://github.com/anomalyco/opencode) | Client/Server 분리, Provider 추상화 |
| Careti | LLM 연결, 도구 세트, 서브에이전트 |

## 상태

Phase 0: 구상 중
