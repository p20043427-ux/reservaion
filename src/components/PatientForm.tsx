import { useState } from 'react'
import type { Patient, Slot } from '../types'
import { formatDate, periodLabel } from '../data/schedule'
import { hasErrors, normalizePhone, validatePatient, type PatientErrors } from '../lib/validation'

interface Props {
  slot: Slot
  today: string
  onCancel: () => void
  onConfirm: (patient: Patient) => void
}

/** 예약 확정 전 환자 인적사항 입력 모달 (검증 포함) */
export function PatientForm({ slot, today, onCancel, onConfirm }: Props) {
  const [patient, setPatient] = useState<Patient>({ name: '', phone: '', birth: '' })
  const [errors, setErrors] = useState<PatientErrors>({})

  const set = (k: keyof Patient, v: string) => setPatient((p) => ({ ...p, [k]: v }))

  const submit = () => {
    const normalized: Patient = {
      name: patient.name.trim(),
      phone: normalizePhone(patient.phone),
      birth: patient.birth.trim(),
    }
    const errs = validatePatient(normalized, today)
    setErrors(errs)
    if (hasErrors(errs)) return
    onConfirm(normalized)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>환자 정보 입력</h2>
        <p>예약을 확정하려면 환자 인적사항을 입력하세요.</p>

        <div className="slot-summary">
          <span className="badge-blue">{slot.department}</span>
          <strong>
            {formatDate(slot.date)} {slot.time}
          </strong>
          <span className="muted">
            {slot.doctor} 선생님 · {periodLabel(slot.period)}
          </span>
        </div>

        <div className="form-field">
          <label>
            이름 <span className="req">*</span>
          </label>
          <input
            value={patient.name}
            placeholder="홍길동"
            autoFocus
            onChange={(e) => set('name', e.target.value)}
          />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </div>

        <div className="form-field">
          <label>
            연락처 <span className="req">*</span>
          </label>
          <input
            value={patient.phone}
            placeholder="010-1234-5678"
            inputMode="numeric"
            onChange={(e) => set('phone', e.target.value)}
            onBlur={(e) => set('phone', normalizePhone(e.target.value))}
          />
          {errors.phone && <span className="field-error">{errors.phone}</span>}
        </div>

        <div className="form-field">
          <label>
            생년월일 <span className="req">*</span>
          </label>
          <input
            type="date"
            value={patient.birth}
            max={today}
            onChange={(e) => set('birth', e.target.value)}
          />
          {errors.birth && <span className="field-error">{errors.birth}</span>}
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel}>
            취소
          </button>
          <button className="primary-btn" onClick={submit}>
            예약 확정
          </button>
        </div>
      </div>
    </div>
  )
}
