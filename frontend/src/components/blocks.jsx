import React, { useState } from 'react';
import { ArrowRight, DoorOpen, DoorClosed, Fan, Power, ClipboardCheck, TriangleAlert, Gauge } from 'lucide-react';
import { useStore, clock, fmtT, riskClass } from '../lib/store.jsx';
import { RiskBadge, Badge, FactorBars, Dial, KV, Field } from './ui.jsx';
import { ACTION_PRESETS } from '../lib/derive.js';

export function UnitCard({ u }) {
  const { settings } = useStore();
  const a = u.assessment;
  const cls = riskClass(a.category);
  return (
    <article className={`unit-card ${cls}`} aria-label={`${u.id} ${u.name}`}>
      <div className="flex justify-between gap-2">
        <div className="min-w-0">
          <div className="unit-id">{u.id}</div>
          <div className="unit-name">{u.name}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-label">Excursion risk</div>
          <div className={`big-prob c-${cls}`}>{a.probability}%</div>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="big-temp">{fmtT(a.features.temp)}</div>
        <RiskBadge cat={a.category} />
      </div>
      {!settings.prefs.compactCards && (
        <KV items={[
          ['Limit', `${u.lower.toFixed(1)}–${u.upper.toFixed(1)}°C`],
          ['Window', `next ${a.horizon} min`],
          ['Status', a.status],
          ['Data', a.quality.level],
          ['Updated', `${clock(u.lastReadingM)}${u.simulated ? ' · sim' : ''}`],
        ]} />
      )}
      <div className="flex items-center gap-2 c-muted" style={{ fontSize: 12 }}>
        {u.series[u.series.length - 1].door ? <><DoorOpen size={14} className="c-medium" aria-hidden="true" />Door open</> : <><DoorClosed size={14} aria-hidden="true" />Door closed</>}
        <span style={{ opacity: 0.4 }}>|</span>
        {u.series[u.series.length - 1].cooling ? <><Fan size={14} className="c-low" aria-hidden="true" />Cooling on</> : <><Power size={14} aria-hidden="true" />Cooling off</>}
      </div>
      <a className="btn sm" href={`#monitor-${u.id}`} style={{ marginTop: 'auto' }}>Open monitoring <ArrowRight size={14} aria-hidden="true" /></a>
    </article>
  );
}

export function RiskSummary({ u, compact = false }) {
  const a = u.assessment;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Dial value={a.probability} cat={a.category} size={compact ? 112 : 136} />
        <div className="flex flex-col gap-1">
          <div style={{ fontWeight: 600 }}>{a.inExcursion ? 'Excursion in progress' : 'Excursion probability'}</div>
          <div className="c-muted" style={{ fontSize: 12.5 }}>Window: next {a.horizon} min</div>
          <div><RiskBadge cat={a.category} label={`Category: ${a.category}`} /></div>
          <div className="c-faint" style={{ fontSize: 11.5 }}>Demo model output · not a validated prediction</div>
        </div>
      </div>
      <div>
        <div className="stat-label" style={{ marginBottom: 8 }}>Main contributing factors <span className="c-faint">(prototype rule weights, not SHAP)</span></div>
        <FactorBars factors={a.factors} limit={compact ? 4 : 8} />
      </div>
    </div>
  );
}

export function WarningBanner({ u, onRecord }) {
  const a = u.assessment;
  if (a.category === 'Low') return null;
  return (
    <div className={`alert-box ${riskClass(a.category)}`} role="alert">
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
        <TriangleAlert size={18} className={`c-${riskClass(a.category)}`} aria-hidden="true" />
        <b className={`c-${riskClass(a.category)}`} style={{ letterSpacing: '.04em' }}>{a.category.toUpperCase()} RISK · {u.id} {u.name}</b>
        <Badge kind="neutral">{u.simulated ? 'Simulator scenario' : 'Simulated example'}</Badge>
      </div>
      <p style={{ margin: '0 0 6px' }}>{a.explanation}</p>
      <p style={{ margin: '0 0 4px' }}><b className="c-medium">Possible factors:</b> {a.factors.slice(0, 3).map((f) => f.label.toLowerCase()).join(' · ')}</p>
      <p style={{ margin: 0 }}><b className="c-low">Suggested action:</b> {a.action}</p>
      <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
        <a className="btn sm" href="#alerts">Open alert</a>
        <a className="btn sm" href={`#risk-${u.id}`}>Why? <Gauge size={13} aria-hidden="true" /></a>
        {onRecord && <button className="btn sm" onClick={onRecord}><ClipboardCheck size={13} aria-hidden="true" />Record action</button>}
      </div>
    </div>
  );
}

export function ActionForm({ unitId, alertId, onDone, compact }) {
  const { dispatch, toast } = useStore();
  const [action, setAction] = useState(ACTION_PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const submit = (e) => {
    e.preventDefault();
    const text = action === '__custom' ? custom.trim() : action;
    if (!text) { toast('Describe the action before saving.', 'error'); return; }
    dispatch({ type: 'action', action: { unitId, alertId, action: text, note: note.trim() } });
    toast(`Action recorded for ${unitId}. This logs intent only; it does not confirm a physical intervention.`);
    setNote(''); setCustom('');
    onDone?.();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className={compact ? 'flex flex-col gap-2' : 'grid gap-2'} style={compact ? {} : { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <Field label="Preventive action">
          <select className="select" id={`act-${unitId}-${alertId || 'u'}`} value={action} onChange={(e) => setAction(e.target.value)}>
            {ACTION_PRESETS.map((p) => <option key={p}>{p}</option>)}
            <option value="__custom">Other (describe)…</option>
          </select>
        </Field>
        {action === '__custom' ? (
          <Field label="Describe action"><input className="input" id={`actc-${unitId}-${alertId || 'u'}`} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="e.g. Called facilities engineer" /></Field>
        ) : (
          <Field label="Note (optional)"><input className="input" id={`actn-${unitId}-${alertId || 'u'}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was found or planned" /></Field>
        )}
      </div>
      <div><button className="btn primary sm" type="submit"><ClipboardCheck size={14} aria-hidden="true" />Record action</button></div>
    </form>
  );
}
