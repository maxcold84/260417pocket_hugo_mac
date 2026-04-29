# PocketBase + Hugo E-Commerce (BMW Shop Prototype)
# 260417pocket_hugo_mac
초경량 단일 바이너리 백엔드인 **PocketBase**와 초고속 정적 사이트 생성기인 **Hugo**를 결합하여 만든 하이브리드 이커머스 플랫폼입니다. 

Node.js나 무거운 프론트엔드 프레임워크(React, Vue 등) 없이 **Alpine.js**와 **HTMX**만을 사용하여 매우 빠르고 가벼우면서도 완벽하게 동작하는 쇼핑몰 프론트엔드/어드민을 구현했습니다.

## 🚀 Tech Stack

- **Backend:** PocketBase v0.22+ (내장 SQLite, Goja JSVM 커스텀 라우트)
- **Frontend (Static):** Hugo (정적 카탈로그, 상품 상세 페이지 컴파일)
- **Frontend (Dynamic):** Alpine.js 3.x (장바구니 상태관리, 모달 등 UI 인터랙션)
- **Styling:** Tailwind CSS (CDN 방식 적용)
- **Payments:** PortOne V2 (Client SDK 결제 + 서버 웹훅 검증)

## ✨ 주요 기능 (Key Features)

### 1. 하이브리드 아키텍처 (Static + Dynamic)
- **정적 컴파일:** 사용자가 접속하는 주요 카탈로그 및 상품 상세 페이지는 서버 부하를 줄이기 위해 Hugo가 정적 자원(`pb_public`)으로 빌드하여 PocketBase가 정적 파일 서버로서 즉시 제공합니다.
- **동적 상태 관리:** 로그인, 장바구니, 결제 및 관리자 대시보드 등의 동적 요소는 Alpine.js를 활용하여 클라이언트 측에서 즉각적으로 처리됩니다.

### 2. 관리자 CMS 대시보드 (`/cms/`)
관리자가 직접 접속하여 쇼핑몰을 관리할 수 있는 맞춤형 CMS를 제공합니다. (Superuser 권한 필요)
- **상품 관리:** 실시간 상품 등록 및 수정 (상품당 최대 5장의 다중 이미지 업로드 지원).
- **주문 관리:** 주문 내역 실시간 검색 및 상태 확인. (필요시 주문 삭제 가능)
- **원클릭 빌드 동기화:** 관리자가 상품 정보를 수정한 뒤 `SYNC & REBUILD SITE` 버튼을 누르면, 백엔드 로직이 고아 이미지들을 정리하고 마크다운 파일을 재생성한 뒤 Hugo 엔진을 돌려 쇼핑몰 화면을 즉시 갱신합니다.

### 3. 장바구니 & 주문 검증 로직
- 브라우저의 `localStorage`와 Alpine.js를 사용해 로딩 없이 즉각 반응하는 사이드바 장바구니 구현.
- 결제 시 클라이언트의 장바구니 데이터를 백엔드 API(`/api/orders/prep`)에 전송하여 실제 DB의 가격 및 재고 정보와 대조하는 안전한 검증 과정을 거칩니다.

### 4. 소셜 로그인 설정 통합 (OAuth2)
관리자나 개발자가 코드를 직접 수정할 필요 없이, Hugo의 설정 파일인 **`hugo/hugo.toml`**에서 한 줄을 켜고 끄는 것만으로 소셜 로그인 버튼을 제어할 수 있습니다.
```toml
# hugo/hugo.toml
[params.oauth]
google = true
kakao = false
```

## 🛠 실행 및 개발 환경 구축 (Setup)

1. **저장소 클론 및 이동**
   ```bash
   git clone https://github.com/maxcold84/260417pocket_hugo_mac.git
   cd 260417pocket_hugo_mac
   ```

2. **서버 실행 (PocketBase)**
   해당 폴더 내에 위치한 PocketBase 실행 파일을 통해 서버를 구동합니다.
   ```bash
   ./pocketbase serve
   ```
   > 💡 **참고:** Windows 환경에서는 `pocketbase.exe serve`를 사용하세요.

3. **초기 관리자 접속 및 동기화**
   - 브라우저에서 `http://127.0.0.1:8090/_/` (기본 포켓베이스 관리자 페이지) 접속 후, 포트원 결제 연동 등을 위한 세팅을 확인합니다.
   - 쇼핑몰 프론트엔드는 `http://127.0.0.1:8090/` 에서 확인 가능합니다.
   - 쇼핑몰 커스텀 CMS(상품 관리)는 `http://127.0.0.1:8090/cms/` 경로를 사용합니다. 처음 접속 후 반드시 **`SYNC & REBUILD SITE`** 버튼을 클릭하여 정적 페이지를 초기화해주세요.

## 📁 주요 폴더 구조 설명

- `pb_hooks/`: PocketBase의 동적 라우팅, 서버 로직, 그리고 웹훅 검증 로직을 포함하는 Javascript 파일들 (Node.js 아님, Goja 엔진 구동).
- `pb_migrations/`: DB 스키마(Collection) 및 초기 데이터를 세팅하는 스크립트 모음.
- `hugo/`: 정적 화면을 생성하기 위한 Hugo 테마, 레이아웃(`layouts/`), 그리고 설정 파일(`hugo.toml`). 상품 정보(`content/products/`)는 CMS에서 자동으로 생성합니다.
- `pb_public/`: Hugo에 의해 컴파일된 최종 웹사이트 결과물이 위치하는 정적 폴더. (git ignore 처리됨)

---

export $(grep -v '^#' .env | xargs) && ./pocketbase serve

lsof -ti:8090 | xargs kill -9export $(grep -v '^#' .env | xargs) && ./pocketbase serve

이 저장소는 AI 코딩 에이전트와의 협업을 통해 설계된 규칙서(`AGENTS.md`)를 기반으로 엄격한 제한 사항과 효율적인 패턴을 학습하여 개발되었습니다.
