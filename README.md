![NEXUS 공식 로고](./asset/logo-horizontal-1600.png)

# NEXUS

**개복디 넥서스 | by VAERON**

유닛도감 · 체크리스트 · 빌더를 하나로 통합한 웹 기반 게임 정보 및 계산 도구입니다.

별도 프로그램 설치 없이 PC, 태블릿, 모바일 브라우저에서 이용할 수 있습니다.

**Version:** `NXSBuild-V1`

[웹사이트 바로가기](https://nxsweb.github.io/site/)

---

## 프로젝트 소개

![NEXUS 통합 웹 대표 이미지](./asset/og-image-1200x630.png)

NEXUS는 게임 유닛 정보 확인, 조합 관리, 재료 계산 및 빌드 분석을 하나의 환경에서 제공하는 통합 웹사이트입니다.

기존 넥서스와 빌더의 기능을 하나로 구성했으며, 통합된 인터페이스에서 필요한 기능을 전환해 사용할 수 있습니다.

## 주요 기능

### 유닛도감

- 종족 및 카테고리별 유닛 탐색
- 유닛 검색 및 즐겨찾기
- 조합 재료와 필요 수량 확인
- 나의 조합 및 재료 관리
- 조합 프리셋 관리
- 선택 상태 및 진행 정보 저장

### 체크리스트

유닛도감과 연결된 조합 관리 기능입니다.

- 조합 목표 및 필요 재료 확인
- 진행 상태 체크
- 목표 유닛 추적
- 체크리스트 상태 관리

### 빌더

- 유닛 및 전투 조건 설정
- DPS 및 전투 관련 수치 계산
- 난이도·특성·효과 설정
- 프리셋 저장 및 관리
- 쥬얼 데이터 활용
- 분석 보드 및 특성 유틸리티

### 통합 편의 기능

- 넥서스 및 빌더 독립창 실행
- 독립창 동시 사용 지원
- 통합 글씨 크기 조절
- 마지막 사용 화면 자동 복원
- 브라우저 로컬 저장소를 통한 설정 관리
- 통합 버전 및 정적 리소스 캐시 관리
- PC·태블릿·모바일 반응형 레이아웃

## 자동 화면 복원

마지막으로 사용한 메인 화면을 기억합니다.

| 마지막 사용 화면 | 다음 접속 시 |
|---|---|
| 유닛도감 | 유닛도감 |
| 체크리스트 | 유닛도감 |
| 빌더 | 빌더 |

브라우저의 `localStorage`를 이용하며, 브라우저 데이터가 삭제되면 저장된 설정도 초기화될 수 있습니다.

## 프로젝트 파일 구조

```text
/
├── index.html
│
├── nexus_app.js
├── nexus_data.js
├── nexus_checklist.js
├── nexus_responsive.js
├── nexus_style.css
├── nexus_checklist.css
│
├── build_app.js
├── build_calc.js
├── build_data.js
├── build_unit.js
├── build_preset.js
├── build_responsive.js
├── build_style.css
├── build_unit.css
├── build_preset.css
│
├── asset/
│   ├── favicon.ico
│   ├── icon-master-1024.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192.png
│   ├── android-chrome-512.png
│   ├── logo-horizontal-1600.png
│   ├── logo-square-512.png
│   ├── og-image-1200x630.png
│   └── site.webmanifest
│
├── jw/
│   └── 쥬얼 이미지 25개
│
└── README.md
```

넥서스와 빌더는 공통 `index.html`을 사용하며, 기능별 JavaScript와 CSS는 파일명 접두어로 구분합니다.

## 개발 환경

| 항목 | 기술 |
|---|---|
| 웹 기술 | HTML5 · CSS3 · JavaScript |
| 사용자 데이터 | LocalStorage |
| 호스팅 | GitHub Pages |
| 앱 구성 | 단일 페이지 통합 웹 |
| 화면 지원 | PC · 태블릿 · 모바일 |
| 브랜드 리소스 | `asset/` |
| 쥬얼 이미지 | `jw/` |

## 버전 관리

**최초 공개 버전: `NXSBuild-V1`**

넥서스와 빌더는 공통 버전 관리 구조를 사용합니다.

정적 리소스의 캐시 갱신과 새로운 버전 확인 기능을 포함하며, 사용자 저장 데이터는 버전과 별도로 관리합니다.

## 이용 안내

- 별도의 회원가입 없이 이용할 수 있습니다.
- 일부 설정과 진행 정보는 사용 중인 브라우저에 저장됩니다.
- 다른 브라우저나 기기로 데이터가 자동 동기화되지는 않습니다.
- 독립창 기능은 브라우저의 지원 환경과 팝업 정책에 따라 차이가 있을 수 있습니다.

---

## 프로젝트 정보

**Project:** NEXUS  
**Developer:** VAERON  
**Release:** NXSBuild-V1  
**Platform:** GitHub Pages  
**Language:** Korean

© VAERON. NEXUS Project.
