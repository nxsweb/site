<p align="center">
  <img src="./asset/logo-horizontal-1600.png" alt="NEXUS 공식 로고" width="680">
</p>

<h1 align="center">NEXUS</h1>
<p align="center"><strong>개복디 넥서스 · 유닛도감 / 체크리스트 / 빌더</strong></p>
<p align="center"><sub>by VAERON · 첫 공개 버전 NXSBuild-V1</sub></p>

---

## 프로젝트 소개

![VAERON SLD PROJECT 공식 프로젝트 소개 이미지](./asset/og-image.jpg)

<sub>출처: VAERON SLD PROJECT 공식 에셋</sub>

**NEXUS**는 게임 유닛 탐색과 조합 관리부터 전투 수치 분석까지 한곳에서 제공하는 통합 웹 도구입니다. 기존 유닛도감·체크리스트와 빌더를 하나의 `index.html`에서 실행하도록 구성했습니다.

- **유닛도감:** 유닛 정보, 종족별 탐색, 검색, 즐겨찾기, 나의 조합, 필요 재료 확인
- **체크리스트:** 목표 유닛과 조합 진행 상태 관리
- **빌더:** 전투 조건·특성·쥬얼 설정, DPS 분석, 프리셋 및 클리어 기록 관련 기능

## 주요 기능

| 구성 | 핵심 내용 |
| --- | --- |
| 유닛도감 | 유닛/카테고리 탐색, 검색, 즐겨찾기, 조합 및 재료 계산 |
| 체크리스트 | 조합 목표 확인 및 진행 상태 체크 |
| 빌더 | 기본/전투 설정, DPS 계산, 특성 및 쥬얼, 프리셋 관리 |
| 독립창 | 넥서스 조합/재료 창과 빌더 분석·특성 유틸 창을 별도로 실행 |
| 글씨 크기 | 공통 헤더에서 표시 크기 조절 |
| 화면 기억 | 마지막 메인 화면을 브라우저 로컬 저장소에 보관 |
| 반응형 | PC·태블릿·모바일 레이아웃 제공 |

### 화면 복원 규칙

브라우저를 닫았다가 다시 열면 마지막 메인 화면을 복원합니다. **체크리스트는 유닛도감의 구성 화면**으로 간주합니다.

| 종료 전 사용 화면 | 다음 접속 시 시작 화면 |
| --- | --- |
| 유닛도감 | 유닛도감 |
| 체크리스트 | 유닛도감 |
| 빌더 | 빌더 |

### 독립창 사용

상단 독립창 메뉴에서 **넥서스 - 나의 조합/필요 재료**, **빌더 - 분석 보드**, **빌더 - 특성 유틸 목록**, **빌더 - 분석 보드 + 특성 유틸**을 선택할 수 있습니다. 브라우저의 팝업 및 Picture-in-Picture 지원 여부에 따라 일부 실행 방식이나 동시 실행이 제한될 수 있습니다.

## 기술 및 파일 구성

- **프런트엔드:** HTML, CSS, JavaScript
- **호스팅:** GitHub Pages에 배포 가능한 정적 사이트
- **로컬 데이터:** 브라우저 `localStorage`를 통한 즐겨찾기·화면 선택·설정/프리셋 등의 저장
- **통합 실행:** 하나의 `index.html`에 넥서스 화면과 빌더 실행 템플릿을 구성

```text
/
├── index.html                  # 통합 진입점 · APP_VERSION
├── nexus_app.js                # 넥서스 화면·이벤트·상태
├── nexus_data.js               # 넥서스 유닛 및 조합 데이터
├── nexus_checklist.js          # 체크리스트 기능
├── nexus_responsive.js         # 넥서스 반응형 처리
├── nexus_style.css
├── nexus_checklist.css
├── build_app.js                # 빌더 앱
├── build_calc.js               # 계산 로직
├── build_data.js               # 빌더 데이터
├── build_unit.js               # 유닛/쥬얼 처리
├── build_preset.js             # 프리셋 관리
├── build_responsive.js         # 빌더 반응형 처리
├── build_style.css
├── build_unit.css
├── build_preset.css
├── asset/                      # 아이콘·로고·파비콘·공유 이미지
│   ├── jw/                     # 쥬얼 이미지 25개
│   ├── og-image.jpg            # VAERON SLD PROJECT 소개 이미지
│   └── vaeron.png              # VAERON 제작자 심볼
└── README.md
```

빌더는 `index.html` 내부 템플릿을 독립된 프레임에 구성해 실행합니다. 파일명은 `nexus_`/`build_` 접두어로 구분합니다. 쥬얼 이미지는 `asset/jw/`에 있으며 빌더에서 `./asset/jw/파일명.png` 경로로 불러옵니다. `asset/`에는 VAERON SLD PROJECT의 공식 이미지 에셋도 포함되어 있습니다.

## GitHub Pages 배포

1. GitHub의 공개 리포지토리 최상위에 **이 폴더의 내부 파일 전체**를 업로드합니다. (ZIP 안의 버전 폴더 자체를 추가로 중첩하지 않습니다.)
2. **Settings → Pages**에서 소스를 **Deploy from a branch**, 브랜치는 `main`, 폴더는 `/(root)`로 지정합니다.
3. GitHub Pages에서 제공한 주소로 접속합니다.
4. 배포 시 `index.html`의 Open Graph URL과 공유 이미지 URL이 실제 배포 환경에 맞는지 확인합니다.

## 버전 및 캐시

최초 공개 버전은 **`NXSBuild-V1`**입니다. 버전 상수는 `index.html` 상단에 있습니다.

```js
window.APP_VERSION = "NXSBuild-V1";
```

공통 버전이 연결된 JS·CSS, 사이트 파비콘, 매니페스트 요청, 쥬얼 이미지는 URL 버전 매개변수를 통해 새 파일을 요청합니다. 매니페스트 **내부** 아이콘과 Google·메신저가 수집하는 Open Graph 이미지는 브라우저의 일반 캐시와 독립된 업데이트 정책이 적용될 수 있으므로, 실제 배포 후 별도 확인해야 합니다.

## 데이터 보관 및 사용 환경

- 계정 로그인 없이 사용할 수 있는 정적 웹 도구입니다.
- 사용자 설정은 기본적으로 **현재 브라우저 저장소에 보관**되며 다른 기기로 자동 동기화되지 않습니다.
- 시크릿 모드 사용이나 브라우저 데이터 삭제 시 일부 저장 내용이 사라질 수 있습니다.
- 독립창·모바일 표시·이미지 로딩은 브라우저 환경에 따라 차이가 날 수 있습니다.

## 제작

<p align="center">
  <img src="./asset/vaeron.png" alt="VAERON 공식 제작자 심볼" width="200">
</p>

**VAERON** · NEXUS / SLD PROJECT

---

<sub>© VAERON. NEXUS Project.</sub>
