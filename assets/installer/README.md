# Naia OS 브랜딩 이미지 (실제 적용 파일)

이 폴더의 파일들이 OS 이미지 및 ISO 빌드 시 실제로 적용됩니다.
파일을 교체하면 빌드 스크립트가 자동으로 반영합니다.

---

## OS 이미지 (BlueBuild → config/files/)

### 시스템 로고 (pixmaps)
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `naia-os-logo.png` | 256x256 RGBA | 시스템 로고 (fedora-logo 대체) | `/usr/share/pixmaps/` |
| `naia-os-logo-small.png` | 48x48 RGBA | 작은 시스템 로고 | `/usr/share/pixmaps/` |

### KDE 앱 런처 아이콘 (start-here)
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `start-here.png` | 600x600 RGBA (원본, 빌드 시 16~256px 생성) | KDE 시작 메뉴 아이콘 | `/usr/share/icons/hicolor/*/places/` |
| `start-here.svg` | SVG | 벡터 버전 | `/usr/share/icons/hicolor/scalable/places/` |

### 부팅 (Plymouth)
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `plymouth-splash.png` | 300x300 RGBA | 부팅 스플래시 로고 | `/usr/share/plymouth/themes/naia/` |

### 부팅 (GRUB)
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `grub-background.jpg` | 1920x1080 RGB | GRUB 부트로더 배경 | `/usr/share/backgrounds/naia-os/` |

### 로그인 (SDDM)
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `login-background.jpg` | 1920x1080 RGB | SDDM 로그인 화면 배경 | `/usr/share/backgrounds/naia-os/` |

### 바탕화면 (KDE Plasma)
배경화면은 `assets/wallpaper/` 폴더 참조:
- `wallpaper-naia-dark-background1-*.jpg` (1080/1440/2160)
- `wallpaper-naia-dark-background2-*.jpg` (1080/1440/2160)

---

## ISO 설치 화면 (Titanoboa → hook-post-rootfs)

### Anaconda 설치 UI
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `sidebar-logo.png` | 150x69 RGBA | 설치 화면 사이드바 로고 | `/usr/share/anaconda/pixmaps/` |
| `sidebar-bg.png` | 406x767 RGBA | 사이드바 배경 | `/usr/share/anaconda/pixmaps/` |
| `topbar-bg.png` | 1040x132 RGBA | 상단 바 배경 (가로 반복) | `/usr/share/anaconda/pixmaps/` |
| `anaconda_header.png` | 119x36 RGBA | 헤더 이미지 | `/usr/share/anaconda/pixmaps/` |
| `fedora.css` | CSS | 설치 화면 색상/이미지 CSS | `/usr/share/anaconda/pixmaps/` |

### "Install to Hard Drive" 아이콘
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `anaconda-installer.svg` | SVG | 설치 바로가기 아이콘 | `/usr/share/icons/hicolor/*/apps/` |
| `anaconda-installer-symbolic.svg` | SVG | 심볼릭 변형 | `/usr/share/icons/hicolor/symbolic/apps/` |

### 라이브 데스크톱
| 파일 | 크기 | 용도 | 적용 위치 |
|------|------|------|-----------|
| `live-wallpaper.jpg` | 1920x1080 RGB | USB 부팅 라이브 세션 배경화면 | KDE Plasma 배경 |
