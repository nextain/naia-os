# 작업 로그: Flatpak 릴리스 파이프라인 + 다운로드 페이지

## 날짜
- 작성: 2026-02-22
- 상태: 완료
- 완료: 2026-02-22

---

## 배경

Phase 6 (앱 배포)에서 Flatpak 로컬 빌드는 성공했으나, CI/CD 자동화와 사용자 다운로드 경로가 부재함.
- GitHub Actions `release-app.yml`은 AppImage/deb/rpm만 생성
- `naia.nextain.io`에 다운로드 페이지 없음 (Download 버튼 → `#pricing` 링크)
- install.md 매뉴얼에 "추후 제공" 상태

## 갭 분석

| 항목 | 현재 | 목표 |
|------|------|------|
| Flatpak CI/CD | ❌ 없음 | GitHub Actions로 `.flatpak` 번들 자동 빌드 + Release 첨부 |
| 다운로드 페이지 | ❌ 없음 | `/[lang]/download` 페이지 (GitHub Release 링크) |
| Header Download | `#pricing` 링크 | `/download` 페이지 링크 |
| install.md | "추후 제공" | 실제 다운로드 링크 |

---

## 작업 계획

### 1. GitHub Actions Flatpak 빌드 추가 (`release-app.yml`)
- Flatpak SDK + runtime 설치 (GNOME 47)
- `flatpak-builder`로 빌드
- `flatpak build-bundle`로 `.flatpak` 파일 생성
- Release에 첨부

### 2. 다운로드 페이지 (`naia.nextain.io`)
- `/[lang]/download` 라우트 생성
- GitHub Release 최신 버전 링크 (Flatpak, AppImage, deb, rpm)
- 각 포맷별 설치 가이드 간단 안내
- i18n 지원 (ko, en 우선)

### 3. Header + 매뉴얼 업데이트
- Download 버튼 → `/download` 링크
- install.md에 다운로드 페이지 링크 추가

---

## 수정 파일 목록

### naia-os
- `.github/workflows/release-app.yml` — Flatpak 빌드 단계 추가

### naia.nextain.io
- `src/app/[lang]/(public)/download/page.tsx` — 다운로드 페이지 (신규)
- `src/components/layout/header.tsx` — Download 링크 변경
- `src/i18n/dictionaries/types.ts` — download 섹션 타입 추가
- `src/i18n/dictionaries/ko.ts` — 한국어 번역
- `src/i18n/dictionaries/en.ts` — 영어 번역
- `src/content/manual/ko/install.md` — 다운로드 링크 업데이트
- `src/content/manual/en/install.md` — 다운로드 링크 업데이트
- `src/i18n/dictionaries/{ar,bn,de,es,fr,hi,id,ja,pt,ru,vi,zh}.ts` — 14개 언어 download 섹션 추가

---

## 검증

- [x] TypeScript 타입 체크 통과 (`tsc --noEmit`)
- [x] Next.js 프로덕션 빌드 성공 (`npm run build`)
- [x] `/[lang]/download` 라우트 빌드 출력에서 확인
- [x] 14개 언어 사전 모두 `download` 섹션 포함

## 후속 작업 (TODO)

- GitHub Actions에서 실제 Flatpak 빌드 테스트 (tag 푸시 또는 workflow_dispatch)
- 첫 릴리스 생성 후 다운로드 페이지 URL 동작 확인
- 나머지 언어 번역 (현재 ja, zh는 번역 완료, 나머지 10개는 영어 placeholder)
