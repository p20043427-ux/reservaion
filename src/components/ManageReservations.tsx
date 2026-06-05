import { useMemo, useState } from 'react'
import type { Reservation } from '../types'
import { formatDate, periodLabel, DEPARTMENTS } from '../data/schedule'
import { ReservationSlip } from './ReservationSlip'

const URGENCY_LABEL = { low: '낮음', medium: '보통', high: '높음' } as const
type StatusFilter = 'all' | 'booked' | 'cancelled'

interface Props {
  reservations: Reservation[]
  onCancel: (id: string) => void
}

/** 예약 현황 관리: 조회 / 검색 / 진료과·상태 필터 / 취소 / 예약증 출력 */
export function ManageReservations({ reservations, onCancel }: Props) {
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState<string>('all')
  const [status, setStatus] = useState<StatusFilter>('booked')
  const [slip, setSlip] = useState<Reservation | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return reservations
      .filter((r) => (status === 'all' ? true : r.status === status))
      .filter((r) => (dept === 'all' ? true : r.department === dept))
      .filter((r) => {
        if (!q) return true
        return (
          r.patient.name.toLowerCase().includes(q) ||
          r.patient.phone.replace(/-/g, '').includes(q.replace(/-/g, '')) ||
          r.id.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }, [reservations, query, dept, status])

  const bookedCount = reservations.filter((r) => r.status === 'booked').length

  return (
    <div className="card">
      <h2>예약 현황</h2>
      <p className="sub">
        전체 {reservations.length}건 · 예약중 <strong>{bookedCount}</strong>건
      </p>

      <div className="manage-toolbar">
        <input
          className="search"
          placeholder="환자명 · 연락처 · 예약번호 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">전체 진료과</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="booked">예약중</option>
          <option value="cancelled">취소됨</option>
          <option value="all">전체 상태</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">조건에 맞는 예약이 없습니다.</div>
      ) : (
        <div className="table-wrap">
          <table className="res-table">
            <thead>
              <tr>
                <th>예약일시</th>
                <th>환자</th>
                <th>진료과 / 담당의</th>
                <th>긴급</th>
                <th>예약번호</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className={r.status === 'cancelled' ? 'cancelled' : ''}>
                  <td>
                    <strong>{formatDate(r.date)}</strong> {r.time}
                    <div className="cell-sub">{periodLabel(r.period)}</div>
                  </td>
                  <td>
                    {r.patient.name}
                    <div className="cell-sub">{r.patient.phone}</div>
                  </td>
                  <td>
                    {r.department}
                    <div className="cell-sub">{r.doctor} 선생님</div>
                  </td>
                  <td>
                    <span className={`badge ${r.urgency}`}>{URGENCY_LABEL[r.urgency]}</span>
                  </td>
                  <td className="mono">{r.id}</td>
                  <td className="actions-cell">
                    <button className="link-btn" onClick={() => setSlip(r)}>
                      예약증
                    </button>
                    {r.status === 'booked' ? (
                      <button
                        className="link-btn danger"
                        onClick={() => {
                          if (confirm(`${r.patient.name} 환자의 예약을 취소할까요?`)) onCancel(r.id)
                        }}
                      >
                        취소
                      </button>
                    ) : (
                      <span className="cancelled-tag">취소됨</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {slip && (
        <ReservationSlip reservation={slip} title="예약증" onClose={() => setSlip(null)} />
      )}
    </div>
  )
}
