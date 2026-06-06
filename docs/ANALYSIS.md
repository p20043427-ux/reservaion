# 스마트 진료 예약 관리 — 분석 문서

> 배포: https://medical-appointment-nine.vercel.app/#/
> 분석 대상 커밋: `fc7b21c` (Initial commit: reservation app — Vite + React + TS)
> 작성일: 2026-06-06

환자의 **자연어 문의**를 LLM이 구조화하고, 진료 일정과 대조해 **자동으로 예약 후보를 제안**하는
프론트엔드 중심 SPA입니다. 백엔드는 LLM 호출을 중계하는 서버리스 함수 하나만 두고, 예약 데이터는
브라우저 `localStorage` 에 저장합니다.

---

## 1. 개요

| 항목 | 내용 |
| --- | --- |
| 성격 | 병원 접수 데스크용 AI 예약 보조 데모 |
| 핵심 흐름 | 문의 인식 → 일정 확인 → 자동 제안 → 환자정보 입력 → 예약 확정/예약증 |
| 프론트엔드 | React 18 + TypeScript + Vite 6 (SPA, 해시 라우팅 없이 단일 화면 + 탭) |
| 백엔드 | Vercel 서버리스 함수 `api/llm.ts` (OpenRouter 프록시) 1개 |
| LLM | OpenRouter `openrouter/auto` (자동 모델 선택), `response_format: json_object` |
| 영속성 | 브라우저 `localStorage` (`med_reservations_v1`), 서버 DB 없음 |
| 배포 | Vercel (정적 빌드 + 서버리스 함수) |
| 의존성 | 런타임은 `react`, `react-dom` 단 둘 (외부 UI/상태 라이브러리 없음) |

---

## 2. 기술 스택 / 의존성

- **런타임 의존성**: `react@^18.3.1`, `react-dom@^18.3.1` — 그 외 UI 프레임워크·상태관리·라우터·HTTP 클라이언트 없음.
- **개발 의존성**: `vite@^6`, `@vitejs/plugin-react`, `typescript@^5.6`, `@types/*`.
- **TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` 등 엄격 설정 (`tsconfig.json`).
- **스타일**: `src/index.css` 단일 파일 (약 948줄), 프레임워크 없는 순수 CSS. 인쇄용 `@media print` / `.no-print` 클래스 사용.

특징: 의존성을 최소화하고 자체 구현(상태 훅, 검증, 일정 생성)으로 채운 가벼운 구조.

---

## 3. 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│ 브라우저 (React SPA)                                          │
│                                                               │
│  App.tsx ── 탭: [신규 접수] [예약 현황]                       │
│   │                                                           │
│   ├─ lib/openrouter.ts ──POST /api/llm──┐  (키 없음)          │
│   ├─ lib/store.ts ──► localStorage      │                     │
│   └─ data/schedule.ts (데모 일정, 결정론적 생성)             │
└─────────────────────────────────────────┼───────────────────┘
                                           │ POST {messages, temperature}
                                           ▼
                        ┌──────────────────────────────────────┐
                        │ 서버리스 함수 api/llm.ts (Vercel)     │
                        │  process.env.OPENROUTER_API_KEY       │
                        │  Bearer 키 부착 후 중계               │
                        └──────────────────┬───────────────────┘
                                           │ Authorization: Bearer …
                                           ▼
                              OpenRouter (openrouter/auto)
```

**보안 설계의 핵심**: OpenRouter API 키는 **브라우저 번들에 절대 포함되지 않습니다.**
- 운영(Vercel): `api/llm.ts` 가 `process.env.OPENROUTER_API_KEY` 로 키를 붙여 중계.
- 로컬(`npm run dev`): `vite.config.ts` 의 `devLlmProxy` 미들웨어가 동일 역할 (`.env` 의 키 사용).
- 클라이언트는 항상 동일한 `/api/llm` 경로만 호출하므로 운영/로컬 코드 분기가 없음.

---

## 4. 사용자 플로우 (신규 접수)

상태 머신은 `App.tsx` 의 `Step = 'inquiry' | 'schedule' | 'suggest'` 으로 표현되며, 상단 `StepBar` 가 진행도를 표시합니다.

1. **① 환자 문의 입력** (`InquiryStep`)
   - 자연어 입력 + 예시 칩 4종.
   - `analyzeInquiry()` → LLM 이 증상·진료과·긴급도·선호 시간대/날짜를 JSON 으로 구조화 → `step='schedule'`.

2. **② 일정 확인** (`ScheduleStep` + `InquirySummary`)
   - 인식된 진료과의 예약 가능 슬롯을 **날짜별로 그룹화**해 표시.
   - 이미 예약된 슬롯(`activeSlotIds`)은 후보에서 제외 → 중복 방지.
   - 슬롯을 직접 선택하거나 "🤖 AI 자동 예약 제안 받기" 로 다음 단계.

3. **③ 자동 예약 제안** (`SuggestStep`)
   - `suggestAppointments()` → LLM 이 후보 최대 3개를 **적합도 점수(matchScore)** 와 추천 이유와 함께 반환.
   - 1순위는 "추천" 강조, 제안된 슬롯이 그새 예약되면 "예약 마감" 표시.

4. **환자 정보 입력** (`PatientForm`, 모달)
   - 이름·연락처·생년월일 입력 및 검증(`validation.ts`).
   - 확정 시 `book()` 호출 → 중복 슬롯이면 `null` 반환 → "방금 다른 접수에서 예약된 시간" 오류.

5. **예약증** (`ReservationSlip`, 모달)
   - 예약번호·환자·진료 정보를 표 형태로 표시, **브라우저 인쇄** / **텍스트 복사** 지원.
   - 닫으면 `finishBooking()` 으로 신규 접수 흐름 초기화.

**예약 현황 탭** (`ManageReservations`): 전체 예약 조회·검색(이름/연락처/예약번호)·진료과/상태 필터·취소·예약증 재출력.

---

## 5. 모듈별 상세

### `src/App.tsx`
최상위 컴포넌트. 단계 상태, 탭 상태, 로딩/오류, 선택 슬롯/마지막 예약을 보유. `buildSchedule(TODAY)` 를
`useMemo` 로 한 번 생성하고, `deptSlots` 는 분석된 진료과 × 예약 가능 × 미점유 슬롯을 정렬해 파생.
하위 표현 컴포넌트(`StepBar`, `InquiryStep`, `InquirySummary`, `ScheduleStep`, `SuggestStep`)를 같은 파일에 포함.

### `src/lib/openrouter.ts`
LLM 연동 핵심. 브라우저는 `/api/llm` 만 호출.
- `chat()`: 프록시 호출 + 네트워크/HTTP 오류를 한국어 메시지로 변환.
- `extractJson()`: 코드펜스(```json) 제거 + 첫 `{` ~ 마지막 `}` 슬라이스로 JSON 안전 추출 — LLM이 설명을 덧붙여도 견딤.
- `analyzeInquiry()`: 오늘 날짜를 시스템 프롬프트에 주입해 "내일/이번 주 금요일" 등 상대 표현을 절대 날짜로 환산하도록 지시. 결과는 `normalizeInquiry()` 로 **방어적 정규화**(진료과·긴급도·시간대 화이트리스트, confidence 클램프, 기본값).
- `suggestAppointments()`: 후보 슬롯 최대 24개를 텍스트 목록으로 변환해 전달, 반환된 `slotId` 가 실제 후보 집합에 있는지 검증 후 최대 3개로 제한. 점수는 0~100 클램프.

### `src/lib/store.ts` — `useReservations()`
- `localStorage` 로드/저장(`med_reservations_v1`), JSON 파싱 실패 시 빈 배열로 폴백.
- `storage` 이벤트 구독으로 **다른 탭/창과 동기화**.
- `activeSlotIds`: `booked` 상태 슬롯 집합 → 중복예약 방지의 단일 출처.
- `book()`: 이미 예약된 슬롯이면 `null`(충돌 차단). 예약번호 `genReservationNo()` 는 `R + YYMMDD + -NNN`(당일 접수 순번).
- `cancel()`: 삭제가 아닌 `status: 'cancelled'` 전환(이력 보존).

### `src/lib/validation.ts`
- `normalizePhone()`: 숫자만 추출해 10/11자리를 `010-0000-0000` 형태로 정규화.
- `validatePatient()`: 이름(2자 이상)·휴대전화 정규식(`01[016789]`)·생년월일(형식 + 미래 불가) 검증.

### `src/data/schedule.ts`
- `DEPARTMENTS` 6종(내과/이비인후과/정형외과/피부과/소아청소년과/안과), 진료과별 담당의, 시간대별 시각.
- `buildSchedule()`: 오늘 이후 **평일 5일**에 대해 슬롯 생성. 소아청소년과·안과는 저녁 진료 제외. 선형합동생성기(LCG) 시드로 **약 40%를 결정론적으로 점유** 처리(서버 없이 일관된 데모).
- 날짜/시간대 라벨 유틸(`formatDate` → `6/5(금)`, `periodLabel`).

### `api/llm.ts` (서버리스)
POST 만 허용, 키 미설정 시 500, `messages` 배열 검증, OpenRouter 호출 시 `HTTP-Referer`/`X-Title` 헤더 부착,
`json_object` 응답 강제, 오류를 상태코드별로 한국어 변환. `content` 만 추려 `{ content }` 로 반환.

### `vite.config.ts`
`devLlmProxy` 플러그인이 dev 서버에서 `/api/llm` 을 가로채 동일 로직 수행. `loadEnv(mode, cwd, '')` 로
`VITE_` 접두사 없는 변수까지 **서버 측에서만** 로드(클라이언트 번들 미포함).

---

## 6. 데이터 모델 (`src/types.ts`)

- `ParsedInquiry`: summary, symptoms[], department, urgency(low/medium/high), preferredPeriod, preferredDates[], confidence, note.
- `Slot`: id(`날짜_진료과_담당의_시각`), department, doctor, date, time, period, available.
- `Suggestion`: slotId, reason, matchScore(0~100).
- `Patient`: name, phone, birth.
- `Reservation`: id(예약번호), slotId, 진료 정보, patient, 접수 당시 문의 스냅샷(summary/symptoms/urgency), createdAt, status(booked/cancelled).

---

## 7. 주목할 설계 포인트

- **API 키 노출 제로**: 운영/로컬 모두 동일 프록시 경로 → 클라이언트에 키가 들어갈 경로 자체가 없음.
- **LLM 응답 방어**: JSON 추출 + 화이트리스트 정규화 + slotId 교차검증 → 모델이 비정형/환각 응답을 줘도 UI가 깨지지 않음.
- **중복예약 방지**: `activeSlotIds` 를 후보 필터·`book()` 양쪽에서 사용해 이중 차단. `storage` 이벤트로 멀티탭 충돌까지 일부 대응.
- **이력 보존형 취소**: 물리 삭제 대신 상태 전환.
- **의존성 최소화**: 라우터·상태관리·HTTP 라이브러리 없이 표준 React 훅과 `fetch` 만으로 구현.

---

## 8. 한계 / 리스크

| 구분 | 내용 |
| --- | --- |
| 영속성 | `localStorage` 단일 기기 기준. 여러 접수 창구가 데이터를 공유 못 함 → 멀티탭 동기화도 같은 브라우저 한정. |
| 일정 | `schedule.ts` 데모 데이터. 실제 EMR/예약 시스템 미연동, 매 로드마다 오늘 기준 재생성. |
| 프록시 보안 | `/api/llm` 은 인증 없는 단순 프록시 → 공개 운영 시 **호출 인증·레이트리밋·로깅** 부재(키 비용 남용 위험). |
| 라우팅 | 배포 URL의 `#/` 해시는 사용되지 않음(앱은 탭 기반 단일 화면). `vercel.json` 은 모든 경로를 `/` 로 rewrite. |
| 의료 정확성 | 진료과 분류·긴급도는 LLM 추정치이며 의료적 판단 근거가 아님(접수 보조용). |
| 테스트 | 자동화 테스트·린트 설정 없음. |

---

## 9. 개선 제안 (다음 단계)

1. **서버 저장소 도입**: Vercel KV/Postgres 또는 Supabase로 예약 DB화 → 다중 창구 공유, 서버 측 중복 차단(원자적 예약).
2. **프록시 강화**: API 라우트에 간단한 토큰 인증 + 레이트리밋 + 요청/오류 로깅.
3. **일정 소스 분리**: `schedule.ts` 를 서버 API로 대체, 슬롯 점유를 실제 예약과 연동.
4. **검증/테스트**: ESLint + 단위 테스트(검증·정규화·일정 생성·JSON 추출 로직은 순수 함수라 테스트 용이).
5. **접근성/UX**: 모달 포커스 트랩, 키보드 내비게이션, 로딩/오류 상태 ARIA 보강.
6. **LLM 비용/지연 절감**: 1단계 결과 캐싱, 제안 단계 후보 수 동적 조절.

---

## 10. 빠른 실행 메모

```bash
npm install
cp .env.example .env      # OPENROUTER_API_KEY 채우기 (https://openrouter.ai/keys)
npm run dev               # http://localhost:5173
npm run build && npm run preview
```

Vercel 배포 시 **Settings → Environment Variables** 에 `OPENROUTER_API_KEY` 추가하면 `/api/llm` 이 자동 구성됩니다.
</content>
</invoke>
