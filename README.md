# 트립보드

여행마다 날짜별 일정 보드를 만들어 폰 홈 화면에서 쓰는 앱(PWA)입니다. Next.js(정적 내보내기) + dnd-kit(끌어 옮기기) + Motion(애니메이션) + Vaul(바텀시트)로 만들었습니다. 화면은 Firebase Hosting에, 데이터는 Firestore에 저장되며 여행마다 초대한 사람과 구글 계정으로 함께 고칩니다. 인터넷이 끊겨도 보고 고칠 수 있고, 다시 연결되면 자동으로 동기화됩니다.

## 처음 한 번 설정 (약 10분)

1. **Firebase 프로젝트 만들기**: <https://console.firebase.google.com> → 프로젝트 추가 (Google Analytics는 꺼도 됩니다).
2. **로그인 켜기**: 빌드 → Authentication → 시작하기 → 로그인 방법 → **Google** 사용 설정.
3. **DB 만들기**: 빌드 → Firestore Database → 데이터베이스 만들기 → 위치 `eur3`(유럽) 또는 `asia-northeast3`(서울) → **프로덕션 모드**.
4. **웹 앱 등록**: 프로젝트 설정 → 내 앱 → `</>` 웹 → 등록 후 나오는 `firebaseConfig` 값을 `public/config.js`에 붙여 넣습니다.
   - `authDomain`은 `<프로젝트ID>.web.app` 으로 바꿔 두세요. 폰(특히 아이폰)에서 로그인이 더 안정적입니다.
5. **여행 만들기와 초대**: 구글로 로그인한 사람은 누구나 자기 여행을 만들 수 있습니다. 동행자는 여행마다 앱 안의 **⋯ 여행 관리 → 함께하는 사람**에서 초대하면 되고, 초대받은 여행만 보입니다.
6. **프로젝트 ID 지정**: `.firebaserc`의 `YOUR_FIREBASE_PROJECT_ID`를 실제 프로젝트 ID로 바꿉니다.

## 배포

```bash
npm install          # 의존성 설치
npx firebase login   # 터미널 앱에서 한 번만 (브라우저 구글 로그인)
npm run deploy       # next build → out/ 을 Firebase Hosting에 배포 + 보안 규칙 배포
```

배포가 끝나면 `https://<프로젝트ID>.web.app` 주소가 나옵니다.

## 폰에 설치

- **아이폰(Safari)**: 주소 열기 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드(Chrome)**: 주소 열기 → 메뉴 → **앱 설치** 또는 **홈 화면에 추가**

처음 로그인하면 여행 목록이 나옵니다.

## 데이터 구조 (Firestore, 모든 ID는 UUID)

```
trips/{tripId}                  title, tag, start, end, owner, members[]
trips/{tripId}/days/{dayId}     date(YYYY-MM-DD), title, place, lodging, note
trips/{tripId}/items/{itemId}   dayId → days, order, cat, time, text
trips/{tripId}/checklist/{id}   scope('item'|'day'|'none'), itemId → items | null, dayId → days | null, text, done, order
                                (scope에 맞는 ID 하나만 값이 있고 나머지는 null. 카드 체크리스트의 날짜는 카드를 따라감)
```

## 여행 관리

- **새 여행**: 여행 목록에서 + 새 여행 만들기 → 이름, 부제(예: `ICN ⇄ HND`), 출발·귀국일 입력. 날짜 칼럼이 자동으로 만들어집니다.
- **이름·부제 바꾸기, 동행자 초대·빼기, 여행 삭제**: 여행 화면 제목 아래 **여행 설정**.
- 여행마다 주소가 따로 있습니다(`.../#여행ID`). 홈 화면에 특정 여행을 바로 열도록 추가할 수도 있습니다.
- 앱 이름을 바꾸려면 `public/config.js`의 `APP_NAME`, `manifest.webmanifest`, `index.html`의 `apple-mobile-web-app-title`을 고칩니다.

## 쓰는 법

| 동작 | 컴퓨터 | 폰 |
|---|---|---|
| 다른 날 보기 | 보드를 옆으로 스크롤, 위 날짜 줄 | 좌우로 밀기, 위 날짜 줄 |
| 카드 옮기기 | 끌어서 놓기 | 카드를 꾹 눌러 들어 올린 뒤 끌기. 화면 끝에 잠깐 대면 옆 날짜로 넘어감 |
| 카드 수정 · 종류 · 체크리스트 | 카드 누르기 | 카드 짧게 누르기 |
| 날짜별 체크리스트 | 큰 날짜 숫자 누르기 | 같음 |
| 제목 · 도시 · 숙박 · 메모 | 칼럼 머리에서 바로 고치기 | 같음 |

여행 기간에는 앱을 열면 **오늘 날짜가 맨 앞에** 옵니다. 하루가 지나 앱을 다시 열어도 그날로 이동합니다.

## 로컬에서 보기

```bash
npm run dev                      # http://localhost:3000 (실제 로그인·데이터)
open "http://localhost:3000/?demo"  # 로그인 없이 data/의 일정으로 화면만 미리보기 (개발 모드 전용, 저장 안 됨)
```

## 파일

- `app/`: Next.js 페이지, 전역 스타일(`globals.css`)
- `components/`: 보드(`Board.tsx`), 시트(`Sheets.tsx`), 체크리스트·숙박 화면, 공용 UI(`ui.tsx`)
- `lib/`: Firebase 연결(`firebase.ts`, `config.ts`), 데이터 읽기(`hooks.ts`), 저장(`store.ts`)
- `public/`: 아이콘, `manifest.webmanifest`, 오프라인용 `sw.js`
- `data/iberia-2026-seed.json`: claude.ai에서 옮겨 온 원본 일정 (배포되지 않음, `?demo` 미리보기에 사용)
- `legacy/`: 이전 순수 JS 버전 (참고용, 배포되지 않음)
- `firestore.rules`: 데이터 접근 권한 (여행마다 초대된 사람만, 새 여행은 앱 주인만)
