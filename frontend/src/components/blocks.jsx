import React, { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useStore, clock } from '../lib/store.jsx';
import { Sheet, Field, RiskTag, Sparkline, riskHex, riskColor } from './ui.jsx';
import { ACTION_PRESETS } from '../lib/derive.js';

/*
 * Unit constellation: one ring per storage unit. Each dot is one reading from
 * the last 72 minutes, coloured by how close it came to the upper limit.
 * The marker on each ring carries the unit's current excursion risk.
 */
const DOTS = 72;
const ANGLES = [-128, 152, 32, -32];
export function Constellation({ units, onPick }) {
  const C = 200;
  const radii = [74, 106, 138, 170];
  const order = [...units].sort((a, b) => b.assessment.probability - a.assessment.probability);
  const dotColor = (t, u) => {
    if (t == null) return '#2a3447';
    if (t > u.upper || t < u.lower) return '#ff6b6b';
    if (t >= u.upper - 1.5) return '#ff8a4c';
    if (t >= u.upper - 3) return '#c79a3a';
    return '#3a4659';
  };
  return (
    <div className="constellation">
      <svg viewBox="0 0 400 400" role="img" aria-label="Last 72 minutes of readings for each unit, one ring per unit">
        <circle cx={C} cy={C} r={194} fill="none" stroke="#2c3850" strokeDasharray="2 5" />
        {Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          return <circle key={i} cx={C + Math.cos(a) * 194} cy={C + Math.sin(a) * 194} r={2.4} fill="#0b1220" stroke="#4a5670" />;
        })}
        <text x={C} y={C - 194 - 10} textAnchor="middle" fill="#8e98a8" fontSize="10.5" letterSpacing="1.5">LAST 72 MINUTES</text>
        {order.map((u, ri) => {
          const r = radii[ri];
          const vals = u.series.slice(-DOTS).map((x) => x.temp);
          return (
            <g key={u.id}>
              <circle cx={C} cy={C} r={r} fill="none" stroke="#1a2333" />
              <text x={C} y={C - r - 5} textAnchor="middle" fill="#6d788b" fontSize="9.5" letterSpacing="1.2">{u.id}</text>
              <g className={`spin ${ri % 2 ? 'rev' : ''}`}>
                {vals.map((t, i) => {
                  const a = (i / DOTS) * Math.PI * 2 + ri * 0.7;
                  const hot = t != null && t >= u.upper - 1.5;
                  return <circle key={i} className="cdot" style={{ animationDelay: `${(ri * DOTS + i) * 5}ms` }} cx={C + Math.cos(a) * r} cy={C + Math.sin(a) * r} r={hot ? 3.4 : 2.4} fill={dotColor(t, u)} />;
                })}
              </g>
            </g>
          );
        })}
        <circle cx={C} cy={C} r={40} fill="#141c2b" />
        <text x={C} y={C - 2} textAnchor="middle" fill="#edf0f5" fontSize="22" fontWeight="300">{units.length}</text>
        <text x={C} y={C + 16} textAnchor="middle" fill="#8e98a8" fontSize="11">units</text>
        {order.map((u, ri) => {
          const a = (ANGLES[ri] * Math.PI) / 180;
          const x = C + Math.cos(a) * radii[ri];
          const y = C + Math.sin(a) * radii[ri];
          const hex = riskHex(u.assessment.category, u.assessment.inExcursion);
          return (
            <g key={`m-${u.id}`}>
              {u.assessment.category === 'High' && <circle className="pulse" cx={x} cy={y} r={9} fill="none" stroke={hex} strokeWidth="1.5" />}
              <circle cx={x} cy={y} r={7} fill="#0b1220" stroke="#edf0f5" strokeWidth="1.5" />
              <circle cx={x} cy={y} r={3.2} fill={hex} />
            </g>
          );
        })}
      </svg>
      {order.map((u, ri) => {
        const a = (ANGLES[ri] * Math.PI) / 180;
        const x = 50 + ((Math.cos(a) * radii[ri]) / 400) * 100;
        const y = 50 + ((Math.sin(a) * radii[ri]) / 400) * 100;
        const side = Math.cos(a) >= 0 ? 1 : -1;
        return (
          <button key={`l-${u.id}`} type="button" className="clabel" onClick={() => onPick(u.id)}
            style={{ left: `calc(${x}% + ${side * 40}px)`, top: `${y}%`, animationDelay: `${600 + ri * 120}ms` }}
            aria-label={`${u.id} ${u.name}, ${u.assessment.probability}% excursion risk`}>
            <span>{u.id}</span>
            <b className="num" style={{ fontWeight: 500, color: riskColor(u.assessment.category, u.assessment.inExcursion) }}>{u.assessment.probability}%</b>
          </button>
        );
      })}
    </div>
  );
}

export function UnitTile({ u, onOpen }) {
  const a = u.assessment;
  const last = u.series[u.series.length - 1];
  return (
    <button type="button" className="unit-tile" onClick={onOpen} aria-label={`Open ${u.id} ${u.name}`}>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="num" style={{ fontSize: 13, color: 'var(--muted)' }}>{u.id}</div>
          <div style={{ fontSize: 15.5 }}>{u.name}</div>
        </div>
        <RiskTag cat={a.category} inExcursion={a.inExcursion}>{a.inExcursion ? 'Excursion' : a.category}</RiskTag>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div style={{ fontSize: 34, fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1 }} className="tnum">{a.features.temp.toFixed(1)}<span style={{ fontSize: 18, color: 'var(--muted)' }}> °C</span></div>
        <div style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontSize: 20, color: riskColor(a.category, a.inExcursion) }}>{a.probability}%</div>
          <div className="c-faint" style={{ fontSize: 12 }}>next {a.horizon} min</div>
        </div>
      </div>
      <Sparkline values={u.series.slice(-60).map((r) => r.temp)} color={riskColor(a.category, a.inExcursion)} upper={u.upper} />
      <div className="flex justify-between c-muted" style={{ fontSize: 13 }}>
        <span>{a.status}</span>
        <span>{last.door ? 'Door open' : last.cooling ? 'Cooling on' : 'Cooling off'}</span>
      </div>
    </button>
  );
}

/* Global sheet for recording a preventive action (opened from Home, Units or Alerts). */
export function ActionSheet() {
  const { actionFor, setActionFor, dispatch, toast, unit } = useStore();
  const [action, setAction] = useState(ACTION_PRESETS[0]);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const open = !!actionFor;
  const u = open ? unit(actionFor.unitId) : null;
  const close = () => { setActionFor(null); setNote(''); setCustom(''); };
  const submit = (e) => {
    e.preventDefault();
    const text = action === '__custom' ? custom.trim() : action;
    if (!text) { toast('Describe the action first', 'error'); return; }
    dispatch({ type: 'action', action: { unitId: u.id, alertId: actionFor.alertId, action: text, note: note.trim() } });
    toast('Action recorded', 'ok', `${text} · ${u.id}${actionFor.alertId ? ` · ${actionFor.alertId}` : ''}`);
    close();
  };
  return (
    <Sheet open={open} onClose={close} title="Record an action" sub={u ? `${u.id} ${u.name}${actionFor.alertId ? ` · ${actionFor.alertId}` : ''}` : ''}>
      {u && (
        <form onSubmit={submit} className="flex flex-col gap-4" style={{ flex: 1 }}>
          <div className="note">
            <div className="note-head">Model suggests<span className="t">{clock(0)}</span></div>
            {u.assessment.action}
          </div>
          <Field label="What was done or planned">
            <select className="select" id="act-preset" value={action} onChange={(e) => setAction(e.target.value)}>
              {ACTION_PRESETS.map((p) => <option key={p}>{p}</option>)}
              <option value="__custom">Something else…</option>
            </select>
          </Field>
          {action === '__custom' && (
            <Field label="Describe it"><input className="input" id="act-custom" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Called the facilities engineer" autoFocus /></Field>
          )}
          <Field label="Note" hint="What you found, or what happens next">
            <textarea className="textarea" id="act-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Compressor breaker had tripped; reset at 12:14" />
          </Field>
          <div className="flex gap-2 justify-end" style={{ marginTop: 'auto' }}>
            <button type="button" className="btn ghost" onClick={close}>Cancel</button>
            <button type="submit" className="btn dark"><ClipboardCheck size={16} aria-hidden="true" />Save action</button>
          </div>
        </form>
      )}
    </Sheet>
  );
}
