# 스마트 진료 예약 관리

환자의 자연어 문의를 AI가 인식하고, 진료 일정을 확인한 뒤, 자동으로 예약 시간을 제안하는 진료 예약 관리 애플리케이션입니다.

- **흐름**: 환자 문의 인식 → 일정 확인 → 자동 예약 제안 → 환자 정보 입력 → 예약 확정/예약증
- **LLM**: OpenRouter `openrouter/auto`
- **배포**: Vercel (프론트엔드 + 서버리스 함수)

## 아키텍처 (API 키 보안)

브라우저는 **절대 OpenRouter 키를 보지 못합니다.** 키는 서버 환경변수에만 존재합니다.

```
브라우저 (React)  ──POST /api/llm──►  서버리스 함수 (api/llm.ts)  ──Bearer 키──►  OpenRouter
                                       └ process.env.OPENROUTER_API_KEY
```

- 운영(Vercel): `api/llm.ts` 서버리스 함수가 프록시
- 로컬(`npm run dev`): `vite.config.ts` 의 dev 미들웨어가 동일 역할 (`.env` 의 키 사용)

## 주요 기능 (실무용)

| 기능 | 설명 |
| --- | --- |
| 환자 문의 인식 | 자연어 → 증상·진료과·긴급도·선호 시간대 구조화 (LLM) |
| 자동 예약 제안 | 문의 + 일정 → 적합도 점수가 붙은 후보 3개 추천 (LLM) |
| 환자 정보 입력·검증 | 이름·연락처·생년월일 입력, 형식 검증 |
| 예약 현황 관리 | 전체 예약 조회·검색·진료과/상태 필터·취소, 새로고침해도 유지 |
| 중복예약 방지 | 예약된 슬롯 자동 마감, 동시 접수 충돌 차단 |
| 예약증 | 인쇄(브라우저 인쇄) · 텍스트 복사 |

> 예약 데이터는 브라우저 `localStorage` 에 저장됩니다(단일 기기 기준).
> 여러 접수 창구가 데이터를 공유하려면 Vercel KV/Postgres 등 서버 저장소 연동이 추가로 필요합니다.

## 로컬 실행

```bash
npm install
copy .env.example .env     # (PowerShell: Copy-Item .env.example .env)
#  → .env 의 OPENROUTER_API_KEY 에 실제 키 입력 (https://openrouter.ai/keys)
npm run dev
```

`.env` 를 저장하면 dev 서버가 자동 재시작됩니다. http://localhost:5173 접속.

## 빌드 / 배포

```bash
npm run build      # dist/ 생성
npm run preview    # 빌드 미리보기
```

### Vercel 배포

1. 저장소를 GitHub 등에 푸시
2. Vercel → New Project → 저장소 선택 (Framework: **Vite** 자동 감지)
3. **Settings → Environment Variables** 에 `OPENROUTER_API_KEY` 추가
4. 배포 — `/api/llm` 서버리스 함수가 자동 구성됨

## 한계 / 다음 단계

- 진료 일정은 `src/data/schedule.ts` 의 데모 데이터입니다(실제 EMR/예약 시스템 미연동).
- `/api/llm` 은 단순 프록시이므로, 공개 운영 시 호출 인증·레이트리밋·로깅 추가를 권장합니다.
- 다중 사용자 공유가 필요하면 서버 저장소(예약 DB) 도입이 필요합니다.
