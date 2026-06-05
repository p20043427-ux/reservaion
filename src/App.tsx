import { useMemo, useState } from 'react'
import type { ParsedInquiry, Patient, Reservation, Slot, Suggestion, Urgency } from './types'
import { buildSchedule, formatDate, periodLabel, toISODate } from './data/schedule'
import { analyzeInquiry, suggestAppointments } from './lib/openrouter'
import { useReservations } from './lib/store'
import { PatientForm } from './components/PatientForm'
import { ReservationSlip } from './components/ReservationSlip'
import { ManageReservations } from './components/ManageReservations'

type Step = 'inquiry' | 'schedule' | 'suggest'
type Tab = 'new' | 'manage'

const TODAY = new Date()
const TODAY_ISO = toISODate(TODAY)

const EXAMPLES = [
  '어제부터 기침이 심하고 미열이 있어요. 이번 주 오후에 진료받고 싶습니다.',
  '계단에서 넘어져서 발목이 많이 부었어요. 가능한 한 빨리 봐주세요.',
  '아이가 귀가 아프다고 합니다. 내일 오전에 소아과 예약 되나요?',
  '얼굴에 두드러기가 났는데 가렵습니다. 평일 저녁에 가능할까요?',
]

const URGENCY_LABEL: Record<Urgency, string> = { low: '낮음', medium: '보통', high: '높음' }

export function App() {
  const [tab, setTab] = useState<Tab>('new')

  const [step, setStep] = useState<Step>('inquiry')
  const [inquiryText, setInquiryText] = useState('')
  const [parsed, setParsed] = useState<ParsedInquiry | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])

  const [pendingSlot, setPendingSlot] = useState<Slot | null>(null)
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { list, activeSlotIds, book, cancel } = useReservations()

  const schedule = useMemo(() => buildSchedule(TODAY), [])
  const slotById = useMemo(() => new Map(schedule.map((s) => [s.id, s])), [schedule])

  // 분석된 진료과의 예약 가능 슬롯 (이미 예약된 슬롯 제외 → 중복예약 방지)
  const deptSlots = useMemo(() => {
    if (!parsed) return []
    return schedule
      .filter((s) => s.department === parsed.department && s.available && !activeSlotIds.has(s.id))
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
  }, [schedule, parsed, activeSlotIds])

  async function handleAnalyze() {
    if (!inquiryText.trim()) return
    setError('')
    setLoading(true)
    try {
      const result = await analyzeInquiry(inquiryText.trim(), TODAY_ISO)
      setParsed(result)
      setStep('schedule')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleSuggest() {
    if (!parsed) return
    setError('')
    setLoading(true)
    try {
      const result = await suggestAppointments(parsed, deptSlots.slice(0, 24))
      setSuggestions(result)
      setStep('suggest')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  // 슬롯 선택 → 환자정보 입력 모달 오픈
  function selectSlot(slot: Slot) {
    setError('')
    setPendingSlot(slot)
  }

  // 환자정보 확정 → 예약 생성(중복 방지)
  function confirmBooking(patient: Patient) {
    if (!pendingSlot || !parsed) return
    const reservation = book({
      slot: pendingSlot,
      patient,
      summary: parsed.summary,
      symptoms: parsed.symptoms,
      urgency: parsed.urgency,
    })
    setPendingSlot(null)
    if (!reservation) {
      setError('방금 다른 접수에서 예약된 시간입니다. 다른 시간을 선택해 주세요.')
      return
    }
    setLastReservation(reservation)
  }

  // 예약증 닫기 → 신규 접수 흐름 초기화
  function finishBooking() {
    setLastReservation(null)
    setStep('inquiry')
    setInquiryText('')
    setParsed(null)
    setSuggestions([])
    setError('')
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo">+</div>
          <div>
            <h1>스마트 진료 예약 관리</h1>
            <p>환자 문의 인식 → 일정 확인 → 자동 예약 제안</p>
          </div>
        </div>
      </header>

      <nav className="tabs no-print">
        <button className={tab === 'new' ? 'tab active' : 'tab'} onClick={() => setTab('new')}>
          신규 접수
        </button>
        <button className={tab === 'manage' ? 'tab active' : 'tab'} onClick={() => setTab('manage')}>
          예약 현황
          {activeSlotIds.size > 0 && <span className="pill">{activeSlotIds.size}</span>}
        </button>
      </nav>

      {tab === 'new' && (
        <>
          <StepBar step={step} />

          {step === 'inquiry' && (
            <InquiryStep
              text={inquiryText}
              onChange={setInquiryText}
              onSubmit={handleAnalyze}
              loading={loading}
            />
          )}

          {step === 'schedule' && parsed && (
            <ScheduleStep
              parsed={parsed}
              slots={deptSlots}
              onBack={() => setStep('inquiry')}
              onSuggest={handleSuggest}
              onPick={selectSlot}
              loading={loading}
            />
          )}

          {step === 'suggest' && parsed && (
            <SuggestStep
              parsed={parsed}
              suggestions={suggestions}
              slotById={slotById}
              reservedIds={activeSlotIds}
              onBack={() => setStep('schedule')}
              onPick={selectSlot}
            />
          )}

          {error && (
            <div className="error">
              <strong>오류:</strong> {error}
            </div>
          )}
        </>
      )}

      {tab === 'manage' && <ManageReservations reservations={list} onCancel={cancel} />}

      {pendingSlot && (
        <PatientForm
          slot={pendingSlot}
          today={TODAY_ISO}
          onCancel={() => setPendingSlot(null)}
          onConfirm={confirmBooking}
        />
      )}

      {lastReservation && (
        <ReservationSlip reservation={lastReservation} onClose={finishBooking} />
      )}
    </div>
  )
}

/* ───────────────────────── 단계 표시줄 ───────────────────────── */

function StepBar({ step }: { step: Step }) {
  const order: Step[] = ['inquiry', 'schedule', 'suggest']
  const labels = ['환자 문의 인식', '일정 확인', '자동 예약 제안']
  const current = order.indexOf(step)
  return (
    <div className="steps">
      {labels.map((label, i) => {
        const cls = i < current ? 'done' : i === current ? 'active' : ''
        return (
          <div key={label} className={`step ${cls}`}>
            <span className="num">{i < current ? '✓' : i + 1}</span>
            {label}
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── 1단계 ───────────────────────── */

function InquiryStep({
  text,
  onChange,
  onSubmit,
  loading,
}: {
  text: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
}) {
  return (
    <div className="card">
      <h2>① 환자 문의 입력</h2>
      <p className="sub">환자가 자연어로 작성한 문의를 입력하면 AI가 증상·진료과·긴급도를 인식합니다.</p>
      <textarea
        value={text}
        placeholder="예) 어제부터 목이 붓고 침 삼킬 때 아파요. 이번 주 중에 진료받고 싶어요."
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button key={ex} className="chip" onClick={() => onChange(ex)}>
            {ex.length > 24 ? ex.slice(0, 24) + '…' : ex}
          </button>
        ))}
      </div>
      <button className="primary-btn" onClick={onSubmit} disabled={loading || !text.trim()}>
        {loading ? (
          <>
            <span className="spinner" />
            문의 분석 중…
          </>
        ) : (
          'AI로 문의 분석하기'
        )}
      </button>
    </div>
  )
}

/* ───────────────────────── 인식 결과 요약 ───────────────────────── */

function InquirySummary({ parsed }: { parsed: ParsedInquiry }) {
  return (
    <div className="card">
      <h2>인식 결과</h2>
      <p className="sub">{parsed.summary}</p>
      <div className="field-grid">
        <div className="field">
          <div className="label">추천 진료과</div>
          <div className="value">{parsed.department}</div>
        </div>
        <div className="field">
          <div className="label">긴급도</div>
          <div className="value">
            <span className={`badge ${parsed.urgency}`}>{URGENCY_LABEL[parsed.urgency]}</span>
          </div>
        </div>
        <div className="field">
          <div className="label">선호 시간대</div>
          <div className="value">{periodLabel(parsed.preferredPeriod)}</div>
        </div>
        <div className="field">
          <div className="label">선호 날짜</div>
          <div className="value">
            {parsed.preferredDates.length
              ? parsed.preferredDates.map(formatDate).join(', ')
              : '지정 없음'}
          </div>
        </div>
      </div>
      {parsed.symptoms.length > 0 && (
        <div className="field" style={{ marginTop: 14 }}>
          <div className="label">인식된 증상</div>
          <div className="tags">
            {parsed.symptoms.map((s) => (
              <span key={s} className="tag">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {parsed.note && <div className="note-box">💬 {parsed.note}</div>}
    </div>
  )
}

/* ───────────────────────── 2단계 ───────────────────────── */

function ScheduleStep({
  parsed,
  slots,
  onBack,
  onSuggest,
  onPick,
  loading,
}: {
  parsed: ParsedInquiry
  slots: Slot[]
  onBack: () => void
  onSuggest: () => void
  onPick: (s: Slot) => void
  loading: boolean
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Slot[]>()
    for (const s of slots) {
      const arr = map.get(s.date) ?? []
      arr.push(s)
      map.set(s.date, arr)
    }
    return [...map.entries()]
  }, [slots])

  return (
    <>
      <InquirySummary parsed={parsed} />
      <div className="card">
        <h2>② 일정 확인</h2>
        <p className="sub">
          <strong>{parsed.department}</strong> 의 예약 가능한 시간입니다. 직접 선택하거나 아래에서 AI 자동 제안을 받을 수 있습니다.
        </p>

        {groups.length === 0 && <div className="empty">예약 가능한 시간이 없습니다.</div>}

        {groups.map(([date, daySlots]) => (
          <div key={date} className="day-group">
            <h3>
              {formatDate(date)} <span className="count">· {daySlots.length}자리</span>
            </h3>
            <div className="slot-grid">
              {daySlots.map((s) => (
                <button key={s.id} className="slot free" onClick={() => onPick(s)}>
                  <div className="slot-time">{s.time}</div>
                  <div className="slot-meta">
                    {s.doctor} 선생님 · {periodLabel(s.period)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="row-actions">
          <button className="ghost-btn" onClick={onBack}>
            ← 문의 다시 입력
          </button>
          <button
            className="primary-btn"
            style={{ marginTop: 0, width: 'auto' }}
            onClick={onSuggest}
            disabled={loading || slots.length === 0}
          >
            {loading ? (
              <>
                <span className="spinner" />
                AI가 분석 중…
              </>
            ) : (
              '🤖 AI 자동 예약 제안 받기'
            )}
          </button>
        </div>
      </div>
    </>
  )
}

/* ───────────────────────── 3단계 ───────────────────────── */

function SuggestStep({
  parsed,
  suggestions,
  slotById,
  reservedIds,
  onBack,
  onPick,
}: {
  parsed: ParsedInquiry
  suggestions: Suggestion[]
  slotById: Map<string, Slot>
  reservedIds: Set<string>
  onBack: () => void
  onPick: (s: Slot) => void
}) {
  return (
    <>
      <InquirySummary parsed={parsed} />
      <div className="card">
        <h2>③ 자동 예약 제안</h2>
        <p className="sub">문의 내용과 일정을 바탕으로 AI가 추천하는 예약 후보입니다.</p>

        {suggestions.length === 0 && (
          <div className="empty">추천할 수 있는 예약이 없습니다. 일정에서 직접 선택해 주세요.</div>
        )}

        {suggestions.map((sug, i) => {
          const slot = slotById.get(sug.slotId)
          if (!slot) return null
          const taken = reservedIds.has(slot.id)
          return (
            <div key={sug.slotId} className={`suggestion ${i === 0 && !taken ? 'top' : ''}`}>
              <div className="rank">{i + 1}</div>
              <div className="body">
                <div className="when">
                  {formatDate(slot.date)} {slot.time}
                  {i === 0 && !taken && ' · 추천'}
                </div>
                <div className="who">
                  {slot.department} · {slot.doctor} 선생님 · {periodLabel(slot.period)}
                </div>
                <div className="reason">{sug.reason}</div>
                <div className="score">
                  적합도 {sug.matchScore}%
                  <span className="bar">
                    <span style={{ width: `${sug.matchScore}%` }} />
                  </span>
                </div>
              </div>
              {taken ? (
                <span className="taken-tag">예약 마감</span>
              ) : (
                <button className="book-btn" onClick={() => onPick(slot)}>
                  이 시간 예약
                </button>
              )}
            </div>
          )
        })}

        <div className="row-actions">
          <button className="ghost-btn" onClick={onBack}>
            ← 일정 다시 보기
          </button>
        </div>
      </div>
    </>
  )
}
