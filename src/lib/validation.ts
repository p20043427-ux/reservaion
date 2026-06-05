import type { Patient } from '../types'

export type PatientErrors = Partial<Record<keyof Patient, string>>

/** 휴대전화 → 010-0000-0000 형태로 정규화 (숫자만 추출) */
export function normalizePhone(input: string): string {
  const d = input.replace(/\D/g, '')
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  return input.trim()
}

const PHONE_RE = /^01[016789]-?\d{3,4}-?\d{4}$/

/** 환자 정보 검증. 오류가 없으면 빈 객체 반환 */
export function validatePatient(p: Patient, today: string): PatientErrors {
  const errors: PatientErrors = {}

  const name = p.name.trim()
  if (!name) errors.name = '이름을 입력하세요.'
  else if (name.length < 2) errors.name = '이름이 너무 짧습니다.'

  const phone = p.phone.trim()
  if (!phone) errors.phone = '연락처를 입력하세요.'
  else if (!PHONE_RE.test(phone.replace(/\s/g, ''))) errors.phone = '휴대전화 형식이 올바르지 않습니다. (예: 010-1234-5678)'

  const birth = p.birth.trim()
  if (!birth) {
    errors.birth = '생년월일을 입력하세요.'
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
    errors.birth = '생년월일 형식이 올바르지 않습니다.'
  } else if (birth > today) {
    errors.birth = '생년월일이 미래일 수 없습니다.'
  }

  return errors
}

export function hasErrors(e: PatientErrors): boolean {
  return Object.keys(e).length > 0
}
