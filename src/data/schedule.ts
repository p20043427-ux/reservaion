import type { Slot, Period } from '../types'

/** 선택 가능한 진료과 목록 (LLM 분류도 이 목록 안에서 선택) */
export const DEPARTMENTS = [
  '내과',
  '이비인후과',
  '정형외과',
  '피부과',
  '소아청소년과',
  '안과',
] as const

/** 진료과별 담당의 */
const DOCTORS: Record<string, string[]> = {
  내과: ['김민수', '이정훈'],
  이비인후과: ['박서연'],
  정형외과: ['최강호', '정다은'],
  피부과: ['한지우'],
  소아청소년과: ['오수빈'],
  안과: ['윤재훈'],
}

/** 시간대별 진료 시각 */
const TIMES: Record<Period, string[]> = {
  morning: ['09:00', '10:00', '11:00'],
  afternoon: ['14:00', '15:00', '16:00'],
  evening: ['17:00', '18:00'],
}

/**
 * 데모용 진료 일정 생성.
 * 기준일(오늘) 이후 평일들에 대해 진료과·담당의·시간대별 슬롯을 만들고
 * 일부는 이미 예약된 것으로 표시(available=false)한다.
 *
 * 외부 서버가 없는 프론트엔드 전용 앱이므로 결정적(deterministic)으로 생성한다.
 */
export function buildSchedule(baseDate: Date): Slot[] {
  const slots: Slot[] = []
  const dates = nextWeekdays(baseDate, 5) // 평일 5일치

  let seed = 7 // 점유 여부를 결정론적으로 흩뿌리기 위한 의사난수 시드
  const occupied = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return (seed >> 16) % 10 < 4 // 약 40% 정도는 이미 예약됨
  }

  for (const date of dates) {
    for (const department of DEPARTMENTS) {
      for (const doctor of DOCTORS[department]) {
        for (const period of Object.keys(TIMES) as Period[]) {
          // 소아청소년과/안과는 저녁 진료 없음
          if (period === 'evening' && (department === '소아청소년과' || department === '안과')) {
            continue
          }
          for (const time of TIMES[period]) {
            slots.push({
              id: `${date}_${department}_${doctor}_${time}`,
              department,
              doctor,
              date,
              time,
              period,
              available: !occupied(),
            })
          }
        }
      }
    }
  }
  return slots
}

/** baseDate 당일 포함, 주말을 건너뛴 평일 count개의 날짜(YYYY-MM-DD) */
function nextWeekdays(baseDate: Date, count: number): string[] {
  const out: string[] = []
  const d = new Date(baseDate)
  d.setHours(0, 0, 0, 0)
  while (out.length < count) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) {
      out.push(toISODate(d))
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const PERIOD_LABEL: Record<Period, string> = {
  morning: '오전',
  afternoon: '오후',
  evening: '저녁',
}

export function periodLabel(p: Period | 'any'): string {
  return p === 'any' ? '상관없음' : PERIOD_LABEL[p]
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/** 2026-06-05 -> "6/5(금)" */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return `${m}/${d}(${WEEKDAY[date.getDay()]})`
}
