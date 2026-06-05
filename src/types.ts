// 공용 타입 정의

export type Urgency = 'low' | 'medium' | 'high'
export type Period = 'morning' | 'afternoon' | 'evening'

/** 1단계: 환자 문의를 LLM이 구조화한 결과 */
export interface ParsedInquiry {
  /** 문의 한 줄 요약 */
  summary: string
  /** 추출된 증상 목록 */
  symptoms: string[]
  /** 추천 진료과 (DEPARTMENTS 중 하나) */
  department: string
  /** 긴급도 */
  urgency: Urgency
  /** 환자가 선호한 시간대 */
  preferredPeriod: Period | 'any'
  /** 환자가 선호한 날짜(YYYY-MM-DD), 명시가 없으면 빈 배열 */
  preferredDates: string[]
  /** 분류 신뢰도 0~100 */
  confidence: number
  /** 접수자가 참고할 메모 */
  note: string
}

/** 2단계: 진료 일정의 한 칸(슬롯) */
export interface Slot {
  id: string
  department: string
  doctor: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm */
  time: string
  period: Period
  available: boolean
}

/** 3단계: LLM이 제안한 예약 후보 */
export interface Suggestion {
  slotId: string
  /** 이 슬롯을 추천하는 이유 */
  reason: string
  /** 문의-슬롯 적합도 0~100 */
  matchScore: number
}

/** 환자 인적사항 */
export interface Patient {
  name: string
  /** 휴대전화 (010-0000-0000) */
  phone: string
  /** 생년월일 YYYY-MM-DD */
  birth: string
}

export type ReservationStatus = 'booked' | 'cancelled'

/** 확정된 예약 (localStorage 영속) */
export interface Reservation {
  /** 예약번호 */
  id: string
  slotId: string
  department: string
  doctor: string
  date: string
  time: string
  period: Period
  patient: Patient
  /** 접수 당시 문의 요약 정보 */
  summary: string
  symptoms: string[]
  urgency: Urgency
  /** 접수 시각 ISO */
  createdAt: string
  status: ReservationStatus
}
