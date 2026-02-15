# Cafelua OS

Bazzite 기반 배포형 AI OS. Alpha(AI 아바타)가 상주하는 개인 운영체제.

## 프로젝트 구조

```
cafelua-os/
├── shell/          # Cafelua Shell (Tauri 2, Three.js Avatar)
├── agent/          # AI 에이전트 코어 (LLM 연결, 도구)
├── gateway/        # 항상 실행되는 데몬 (채널, Skills, 메모리)
├── os/             # Bazzite 커스텀 이미지 (BlueBuild recipe)
└── docs/           # 설계 문서, ADR
```

## 핵심 원칙

1. **최소주의** — 필요한 것만 만든다. 군더더기 없이.
2. **배포형 OS** — USB 꽂으면 바로 동작. 설치 과정 최소화.
3. **Avatar 중심** — 텍스트 채팅이 아닌, Alpha가 살아있는 경험.
4. **데몬 아키텍처** — AI가 항상 켜져있다. OS의 일부.
5. **프라이버시** — 로컬 실행 기본. 사용자 데이터는 사용자 기기에.

## 컨벤션

- **한국어 응답**: AI는 한국어로 응답
- **커밋 메시지**: 영어, conventional commits
- **코드 스타일**: 각 하위 프로젝트의 linter 설정 따름
