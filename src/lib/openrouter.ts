import type { ParsedInquiry, Slot, Suggestion, Period } from '../types'
import { DEPARTMENTS, periodLabel, formatDate } from '../data/schedule'

// 브라우저는 서버리스 프록시(/api/llm)만 호출한다. 실제 OpenRouter 키는 서버에만 존재.
const PROXY_URL = '/api/llm'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** /api/llm 프록시 호출 → LLM 응답 본문(content) 반환 */
async function chat(messages: ChatMessage[], temperature = 0.2): Promise<string> {
  let res: Response
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, temperature }),
    })
  } catch {
    throw new Error('AI 서버에 연결할 수 없습니다. 네트워크 또는 /api/llm 설정을 확인하세요.')
  }

  let data: any = null
  try {
    data = await res.json()
  } catch {
    /* 본문 없음 */
  }

  if (!res.ok) {
    throw new Error(data?.error || `AI 요청 실패 (${res.status})`)
  }
  const content: string | undefined = data?.content
  if (!content) throw new Error('LLM 응답이 비어 있습니다.')
  return content
}

/** 응답 문자열에서 JSON 본문만 안전하게 추출 */
function extractJson<T>(raw: string): T {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) text = text.slice(start, end + 1)
  return JSON.parse(text) as T
}

/* ───────────────────────── 1단계: 환자 문의 인식 ───────────────────────── */

export async function analyzeInquiry(inquiry: string, today: string): Promise<ParsedInquiry> {
  const system = `당신은 병원 접수 데스크의 AI 분류 도우미입니다.
환자가 자연어로 작성한 진료 문의를 분석하여 구조화된 JSON으로만 응답하세요.

오늘 날짜는 ${today} 입니다. "내일", "이번 주 금요일" 같은 표현은 이 기준으로 YYYY-MM-DD 로 환산하세요.

선택 가능한 진료과는 다음 중 하나여야 합니다: ${DEPARTMENTS.join(', ')}.
증상과 가장 적합한 진료과를 고르세요. 애매하면 "내과"로 분류하세요.

반드시 아래 JSON 스키마로만 응답하세요(설명 문장 금지):
{
  "summary": "문의 한 줄 요약(한국어)",
  "symptoms": ["추출한 증상", "..."],
  "department": "${DEPARTMENTS.join('|')}",
  "urgency": "low|medium|high",
  "preferredPeriod": "morning|afternoon|evening|any",
  "preferredDates": ["YYYY-MM-DD"],
  "confidence": 0-100,
  "note": "접수자가 참고할 메모(한국어, 1~2문장)"
}
긴급도 기준 - high: 고열/호흡곤란/심한 통증/외상, medium: 지속되는 불편, low: 단순 상담/경증.`

  const content = await chat([
    { role: 'system', content: system },
    { role: 'user', content: inquiry },
  ])

  const parsed = extractJson<Partial<ParsedInquiry>>(content)
  return normalizeInquiry(parsed)
}

function normalizeInquiry(p: Partial<ParsedInquiry>): ParsedInquiry {
  const department = (DEPARTMENTS as readonly string[]).includes(p.department ?? '')
    ? (p.department as string)
    : '내과'
  const urgency = (['low', 'medium', 'high'] as const).includes(p.urgency as never)
    ? (p.urgency as ParsedInquiry['urgency'])
    : 'medium'
  const period = (['morning', 'afternoon', 'evening', 'any'] as const).includes(
    p.preferredPeriod as never,
  )
    ? (p.preferredPeriod as ParsedInquiry['preferredPeriod'])
    : 'any'

  return {
    summary: p.summary?.trim() || '문의 내용 요약 없음',
    symptoms: Array.isArray(p.symptoms) ? p.symptoms.filter(Boolean) : [],
    department,
    urgency,
    preferredPeriod: period,
    preferredDates: Array.isArray(p.preferredDates) ? p.preferredDates.filter(Boolean) : [],
    confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(100, p.confidence)) : 70,
    note: p.note?.trim() || '',
  }
}

/* ──────────────────────── 3단계: 자동 예약 제안 ──────────────────────── */

export async function suggestAppointments(
  inquiry: ParsedInquiry,
  candidateSlots: Slot[],
): Promise<Suggestion[]> {
  const list = candidateSlots
    .map(
      (s) =>
        `- id=${s.id} | ${formatDate(s.date)} ${s.time} | ${s.doctor} 선생님 | ${periodLabel(
          s.period as Period,
        )}`,
    )
    .join('\n')

  const system = `당신은 병원 예약 코디네이터 AI입니다.
환자 문의 분석 결과와 "예약 가능한 슬롯 목록"을 받아, 가장 적합한 예약 후보 3개(슬롯이 3개 미만이면 가능한 만큼)를 고릅니다.

선택 기준(우선순위 순):
1) 환자 선호 날짜/시간대와의 일치
2) 긴급도가 높을수록 더 빠른 날짜·시각
3) 동일 조건이면 이른 시각 우선

반드시 아래 JSON으로만 응답하세요(설명 문장 금지). slotId 는 반드시 목록에 있는 id 중에서 선택하세요:
{
  "suggestions": [
    { "slotId": "목록의 id", "reason": "추천 이유(한국어, 1문장)", "matchScore": 0-100 }
  ]
}`

  const user = `[문의 분석]
요약: ${inquiry.summary}
증상: ${inquiry.symptoms.join(', ') || '없음'}
진료과: ${inquiry.department}
긴급도: ${inquiry.urgency}
선호 시간대: ${periodLabel(inquiry.preferredPeriod)}
선호 날짜: ${inquiry.preferredDates.join(', ') || '지정 없음'}

[예약 가능한 슬롯]
${list || '(가능한 슬롯 없음)'}`

  const content = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ])

  const parsed = extractJson<{ suggestions?: Suggestion[] }>(content)
  const valid = new Set(candidateSlots.map((s) => s.id))
  return (parsed.suggestions ?? [])
    .filter((s) => s && valid.has(s.slotId))
    .slice(0, 3)
    .map((s) => ({
      slotId: s.slotId,
      reason: s.reason?.trim() || '문의 조건에 적합한 시간대입니다.',
      matchScore: typeof s.matchScore === 'number' ? Math.max(0, Math.min(100, s.matchScore)) : 80,
    }))
}
