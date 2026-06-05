import { useState } from 'react'
import type { Reservation } from '../types'
import { formatDate, periodLabel } from '../data/schedule'

const URGENCY_LABEL = { low: '낮음', medium: '보통', high: '높음' } as const

function slipText(r: Reservation): string {
  return [
    '────────── 진료 예약증 ──────────',
    `예약번호 : ${r.id}`,
    `환자명   : ${r.patient.name}`,
    `연락처   : ${r.patient.phone}`,
    `생년월일 : ${r.patient.birth}`,
    `진료과   : ${r.department}`,
    `담당의   : ${r.doctor} 선생님`,
    `일시     : ${formatDate(r.date)} ${r.time} (${periodLabel(r.period)})`,
    `긴급도   : ${URGENCY_LABEL[r.urgency]}`,
    `증상     : ${r.symptoms.join(', ') || '-'}`,
    `접수시각 : ${new Date(r.createdAt).toLocaleString('ko-KR')}`,
    '────────────────────────────────',
  ].join('\n')
}

/** 예약증: 모달로 표시하며 인쇄 / 텍스트 복사 지원 */
export function ReservationSlip({
  reservation,
  onClose,
  title = '예약이 접수되었습니다',
}: {
  reservation: Reservation
  onClose: () => void
  title?: string
}) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(slipText(reservation))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const print = () => window.print()

  const r = reservation
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {/* 인쇄 영역 */}
        <div id="print-slip" className="slip">
          <div className="slip-head">
            <div className="slip-title">진료 예약증</div>
            <div className="slip-no">{r.id}</div>
          </div>
          <table className="slip-table">
            <tbody>
              <tr>
                <th>환자명</th>
                <td>{r.patient.name}</td>
                <th>연락처</th>
                <td>{r.patient.phone}</td>
              </tr>
              <tr>
                <th>생년월일</th>
                <td>{r.patient.birth}</td>
                <th>긴급도</th>
                <td>{URGENCY_LABEL[r.urgency]}</td>
              </tr>
              <tr>
                <th>진료과</th>
                <td>{r.department}</td>
                <th>담당의</th>
                <td>{r.doctor} 선생님</td>
              </tr>
              <tr>
                <th>예약일시</th>
                <td colSpan={3}>
                  <strong>
                    {formatDate(r.date)} {r.time}
                  </strong>{' '}
                  ({periodLabel(r.period)})
                </td>
              </tr>
              <tr>
                <th>증상</th>
                <td colSpan={3}>{r.symptoms.join(', ') || '-'}</td>
              </tr>
            </tbody>
          </table>
          <div className="slip-foot">
            접수시각 {new Date(r.createdAt).toLocaleString('ko-KR')} · 스마트 진료 예약 관리
          </div>
        </div>

        <div className="modal-actions no-print">
          <button className="ghost-btn" onClick={copy}>
            {copied ? '✓ 복사됨' : '텍스트 복사'}
          </button>
          <button className="ghost-btn" onClick={print}>
            🖨 인쇄
          </button>
          <button className="primary-btn" onClick={onClose}>
            {title === '예약이 접수되었습니다' ? '확인' : '닫기'}
          </button>
        </div>
      </div>
    </div>
  )
}
