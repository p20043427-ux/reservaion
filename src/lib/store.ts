import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Patient, Reservation, Slot } from '../types'

const STORAGE_KEY = 'med_reservations_v1'

function load(): Reservation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Reservation[]) : []
  } catch {
    return []
  }
}

function save(list: Reservation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* 용량 초과 등은 무시 */
  }
}

/** 예약번호: R + YYMMDD + 4자리 시퀀스(시간 기반) */
function genReservationNo(existing: Reservation[]): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const prefix = `R${yy}${mm}${dd}`
  // 같은 날 접수 수 + 1
  const todayCount = existing.filter((r) => r.id.startsWith(prefix)).length
  return `${prefix}-${String(todayCount + 1).padStart(3, '0')}`
}

export interface BookInput {
  slot: Slot
  patient: Patient
  summary: string
  symptoms: string[]
  urgency: Reservation['urgency']
}

export function useReservations() {
  const [list, setList] = useState<Reservation[]>(load)

  // 다른 탭/창에서의 변경 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setList(load())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    save(list)
  }, [list])

  /** 현재 '예약중' 상태인 슬롯 id 집합 (중복예약 방지에 사용) */
  const activeSlotIds = useMemo(
    () => new Set(list.filter((r) => r.status === 'booked').map((r) => r.slotId)),
    [list],
  )

  /**
   * 예약 생성. 이미 같은 슬롯이 예약중이면 null 반환(중복예약 방지).
   * 성공 시 생성된 Reservation 반환.
   */
  const book = useCallback(
    (input: BookInput): Reservation | null => {
      if (activeSlotIds.has(input.slot.id)) return null
      const reservation: Reservation = {
        id: genReservationNo(list),
        slotId: input.slot.id,
        department: input.slot.department,
        doctor: input.slot.doctor,
        date: input.slot.date,
        time: input.slot.time,
        period: input.slot.period,
        patient: input.patient,
        summary: input.summary,
        symptoms: input.symptoms,
        urgency: input.urgency,
        createdAt: new Date().toISOString(),
        status: 'booked',
      }
      setList((prev) => [reservation, ...prev])
      return reservation
    },
    [activeSlotIds, list],
  )

  const cancel = useCallback((id: string) => {
    setList((prev) => prev.map((r) => (r.id === id ? { ...r, status: 'cancelled' } : r)))
  }, [])

  return { list, activeSlotIds, book, cancel }
}
