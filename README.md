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

## Google Gemini 설정 가이드

### 1. API 키 발급

1. [Google AI Studio](https://aistudio.google.com/) 접속 → 로그인
2. 좌측 메뉴 **Get API Key** → **Create API Key** 클릭
3. 프로젝트 선택 (없으면 새로 생성) → API 키 복사

### 2. Cloud API 활성화 (TTS/STT용)

AI Studio에서 발급한 키는 기본적으로 Gemini만 사용 가능합니다.
음성 기능(TTS/STT)을 쓰려면 Google Cloud Console에서 추가 API를 활성화해야 합니다.

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. AI Studio 키가 속한 **같은 프로젝트** 선택
3. **APIs & Services** → **Enable APIs and Services** 클릭
4. 아래 두 API를 검색하여 각각 **Enable** 클릭:
   - **Cloud Text-to-Speech API** (TTS — AI 음성 합성)
   - **Cloud Speech-to-Text API** (STT — 음성 인식)

> 두 API 모두 매월 무료 할당량이 있습니다:
> - TTS: 월 400만 글자 무료 (WaveNet)
> - STT: 월 60분 무료

### 3. Cafelua OS에서 설정

1. 앱 실행 후 우측 상단 ⚙️ (설정) 클릭
2. 아래와 같이 입력:

| 항목 | 값 |
|------|------|
| **프로바이더** | `gemini` |
| **모델** | `gemini-2.5-flash` (권장) 또는 `gemini-2.5-pro` |
| **API 키** | AI Studio에서 발급한 키 붙여넣기 |

3. **저장** 클릭

### 4. 기능별 동작

| 기능 | 설명 | 필요 API |
|------|------|----------|
| **대화** | 텍스트 입력 → AI 응답 | Gemini API (기본) |
| **TTS (음성 합성)** | AI 응답 완료 후 자동 음성 재생 + 립싱크 | Cloud Text-to-Speech |
| **STT (음성 인식)** | 🎤 버튼 누른 채로 말하기 → 텍스트 변환 | Cloud Speech-to-Text |

### 5. 다른 프로바이더 사용 시

| 프로바이더 | 대화 | TTS | STT |
|-----------|------|-----|-----|
| **Gemini** | ✅ | ✅ 자동 | ✅ 마이크 버튼 |
| **xAI (Grok)** | ✅ | ❌ | ❌ |
| **Claude** | ✅ | ❌ | ❌ |

> TTS/STT는 현재 Google API 키를 재사용하는 Gemini 프로바이더에서만 작동합니다.

## 상태

Phase 2: 대화 + 감정 표정 + TTS 립싱크 + STT 구현 완료

## 참고

- Bazzite fork 불필요 — BlueBuild 레이어링으로 충분
- 상세 보안 정책은 [규칙 문서](.users/context/agents-rules.md#보안) 참조
