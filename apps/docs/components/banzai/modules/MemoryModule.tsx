'use client'

import { useState } from 'react'
import { getOperatorMemory, saveOperatorMemory, type OperatorMemory, type TimelineEvent } from '@/lib/banzai-client'

const LEVEL_COLORS = ['#374151', '#2A3A8C', '#0E7490', '#7C3AED', '#990011']

const EVENT_STYLE: Record<TimelineEvent['type'], { dot: string; label: string }> = {
  assessment:     { dot: 'bg-bia-primary',  label: 'Assessment' },
  certification:  { dot: 'bg-bia-green',    label: 'Certification' },
  federation:     { dot: 'bg-purple-500',   label: 'Federation' },
  conformance:    { dot: 'bg-blue-500',     label: 'Conformance' },
  research:       { dot: 'bg-amber-500',    label: 'Research' },
  manifest_change:{ dot: 'bg-bia-gold',     label: 'Manifest' },
}

export function MemoryModule() {
  const [operatorId, setOperatorId] = useState('op_example_001')
  const [memory, setMemory] = useState<OperatorMemory | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [activeTab, setActiveTab] = useState<'timeline' | 'assessments' | 'research'>('timeline')

  const load = async () => {
    if (!operatorId.trim()) return
    setLoading(true)
    const mem = await getOperatorMemory(operatorId.trim())
    setMemory(mem)
    setLoading(false)
  }

  const saveNote = async () => {
    if (!note.trim() || !operatorId) return
    setSavingNote(true)
    const updated = await saveOperatorMemory(operatorId, { note: note.trim() })
    setMemory(updated)
    setNote('')
    setSavingNote(false)
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-5">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Protocol Memory</h2>
          <p className="text-sm text-bia-muted">
            Operator journey history — assessments, certification milestones, federation events, and
            research history. Memory accumulates across sessions as the operator interacts with BanzAI.
          </p>
        </div>

        {/* Operator lookup */}
        <div className="rounded-xl border border-bia-border bg-bia-surface p-4 flex items-center gap-3">
          <div className="flex-1">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-bia-muted-2">Operator ID</label>
            <input
              value={operatorId}
              onChange={e => setOperatorId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && load()}
              placeholder="op_example_001"
              className="w-full mt-1 rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 text-sm text-bia-text font-mono outline-none focus:border-bia-primary/50"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="mt-5 rounded-lg bg-bia-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? 'Loading…' : 'Load Memory'}
          </button>
        </div>

        {memory && (
          <>
            {/* Overview */}
            <div className="rounded-xl border border-bia-border bg-bia-surface p-5">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div
                    className="text-3xl font-bold"
                    style={{ color: memory.current_level >= 0 ? LEVEL_COLORS[memory.current_level] : '#9CA3AF' }}
                  >
                    {memory.current_level >= 0 ? memory.current_level : '—'}
                  </div>
                  <div className="text-xs text-bia-muted mt-0.5">Current Level</div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-bia-text mb-0.5">{memory.operator_id}</div>
                  <div className="text-xs text-bia-muted">
                    {memory.assessments.length} assessment{memory.assessments.length !== 1 ? 's' : ''} ·{' '}
                    {memory.timeline.length} timeline event{memory.timeline.length !== 1 ? 's' : ''} ·{' '}
                    {memory.research_history.length} research queries
                  </div>
                  <div className="text-[10px] text-bia-muted-2 mt-1">
                    Created {memory.created_at.slice(0, 10)} · Last updated {memory.updated_at.slice(0, 10)}
                  </div>
                </div>
                {memory.assessments.length > 0 && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-bia-primary">
                      {memory.assessments.at(-1)!.readiness_score}%
                    </div>
                    <div className="text-xs text-bia-muted">Readiness</div>
                    {memory.assessments.length > 1 && (() => {
                      const delta = memory.assessments.at(-1)!.readiness_score - memory.assessments.at(-2)!.readiness_score
                      return (
                        <div className={`text-[10px] font-semibold ${delta > 0 ? 'text-bia-green' : delta < 0 ? 'text-red-600' : 'text-bia-muted'}`}>
                          {delta > 0 ? '+' : ''}{delta} pts
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              {/* Readiness trajectory */}
              {memory.assessments.length >= 2 && (
                <div className="mt-4 h-12 flex items-end gap-px overflow-hidden">
                  {memory.assessments.map((a, i) => {
                    const h = Math.max(4, (a.readiness_score / 100) * 48)
                    return (
                      <div key={i} className="relative flex-1 flex flex-col justify-end group">
                        <div
                          className="rounded-t transition-all"
                          style={{ height: `${h}px`, backgroundColor: '#990011', opacity: 0.6 + (i / memory.assessments.length) * 0.4 }}
                        />
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap text-[9px] bg-bia-text text-white rounded px-1 py-0.5">
                          {a.readiness_score}% · {a.timestamp.slice(0, 10)}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
              <div className="flex border-b border-bia-border">
                {([
                  { id: 'timeline', label: `Timeline (${memory.timeline.length})` },
                  { id: 'assessments', label: `Assessments (${memory.assessments.length})` },
                  { id: 'research', label: `Research (${memory.research_history.length})` },
                ] as const).map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id ? 'border-bia-primary text-bia-primary' : 'border-transparent text-bia-muted hover:text-bia-text'
                    }`}
                  >{tab.label}</button>
                ))}
              </div>

              {/* Timeline */}
              {activeTab === 'timeline' && (
                <div className="p-4">
                  {memory.timeline.length === 0
                    ? <p className="text-sm text-bia-muted text-center py-6">No timeline events yet. Run a certification assessment to start building history.</p>
                    : (
                      <div className="space-y-0">
                        {[...memory.timeline].reverse().map((event, i) => {
                          const style = EVENT_STYLE[event.type]
                          return (
                            <div key={i} className="flex gap-3 pb-4 last:pb-0">
                              <div className="flex flex-col items-center">
                                <div className={`h-3 w-3 shrink-0 rounded-full mt-0.5 ${style.dot}`} />
                                {i < memory.timeline.length - 1 && <div className="flex-1 w-px bg-bia-border mt-1" />}
                              </div>
                              <div className="flex-1 min-w-0 pb-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-bia-text">{event.title}</span>
                                  {event.level !== undefined && (
                                    <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded" style={{ backgroundColor: LEVEL_COLORS[event.level] }}>L{event.level}</span>
                                  )}
                                </div>
                                {event.detail && <div className="text-xs text-bia-muted mt-0.5">{event.detail}</div>}
                                <div className="text-[10px] text-bia-muted-2 mt-0.5">{event.date}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  }
                </div>
              )}

              {/* Assessments */}
              {activeTab === 'assessments' && (
                <div className="divide-y divide-bia-border">
                  {memory.assessments.length === 0
                    ? <p className="text-sm text-bia-muted text-center py-6">No assessments yet.</p>
                    : [...memory.assessments].reverse().map((a, i) => (
                      <div key={i} className="flex items-center gap-4 px-4 py-3">
                        <div className="text-[10px] text-bia-muted-2 w-24 shrink-0">{a.timestamp.slice(0, 10)}</div>
                        <div className="flex-1">
                          <div className="text-xs text-bia-muted">Target L{a.target_level} · {a.capabilities.length} capabilities</div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-bia-primary">{a.readiness_score}%</div>
                          <div className="text-[10px] text-bia-muted">Level {a.current_level < 0 ? '—' : a.current_level}</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}

              {/* Research */}
              {activeTab === 'research' && (
                <div className="divide-y divide-bia-border">
                  {memory.research_history.length === 0
                    ? <p className="text-sm text-bia-muted text-center py-6">No research history yet.</p>
                    : [...memory.research_history].reverse().map((r, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-3">
                        <svg className="h-4 w-4 shrink-0 text-bia-muted mt-0.5" viewBox="0 0 16 16" fill="none">
                          <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
                          <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                        </svg>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-bia-text">{r.question}</div>
                          <div className="text-[10px] text-bia-muted-2 mt-0.5">{r.timestamp.slice(0, 16).replace('T', ' ')} UTC</div>
                        </div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>

            {/* Add note */}
            <div className="rounded-xl border border-bia-border bg-bia-surface p-4 space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-bia-muted-2">Add Note</label>
              <div className="flex gap-2">
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveNote()}
                  placeholder="Operator note…"
                  className="flex-1 rounded-lg border border-bia-border bg-bia-surface-2 px-3 py-2 text-sm text-bia-text outline-none focus:border-bia-primary/50"
                />
                <button
                  onClick={saveNote}
                  disabled={savingNote || !note.trim()}
                  className="rounded-lg bg-bia-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {savingNote ? 'Saving…' : 'Add'}
                </button>
              </div>
              {memory.notes.length > 0 && (
                <div className="space-y-1 pt-1">
                  {memory.notes.map((n, i) => (
                    <div key={i} className="text-xs text-bia-muted border-l-2 border-bia-primary/30 pl-2">{n}</div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
