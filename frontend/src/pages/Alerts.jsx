import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Wrench, CircleCheck, Ban, MessageSquarePlus, ChevronDown, ListTodo, Search } from 'lucide-react';
import { useStore, clock, stamp, riskClass, alertTime } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, RiskBadge, Badge, Seg, Empty, FactorBars, KV } from '../components/ui.jsx';
import { ActionForm } from '../components/blocks.jsx';
import { attentionItems } from '../lib/derive.js';

const STATUS_LABEL = { new: 'Awaiting acknowledgement', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', dismissed: 'Dismissed' };
const STATUS_KIND = { new: 'high', acknowledged: 'medium', in_progress: 'info', resolved: 'low', dismissed: 'neutral' };
const when = (a) => (a.at ? stamp(a.at) : clock(a.m));

export default function Alerts() {
  const { alerts, units, state, dispatch, settings } = useStore();
  const [statusF, setStatusF] = useState('open');
  const [sevF, setSevF] = useState('All');
  const [unitF, setUnitF] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);

  useEffect(() => {
    try { const f = sessionStorage.getItem('cg-focus-alert'); if (f) { setSel(f); sessionStorage.removeItem('cg-focus-alert'); } } catch { /* ignore */ }
  }, []);

  const list = useMemo(() => alerts.filter((a) => {
    const s = a.workflow.status;
    if (statusF === 'open' && ['resolved', 'dismissed'].includes(s)) return false;
    if (statusF === 'closed' && !['resolved', 'dismissed'].includes(s)) return false;
    if (!settings.prefs.showDismissed && s === 'dismissed' && statusF !== 'closed') return false;
    if (!settings.prefs.showSubsided && a.condition === 'subsided' && s === 'new') return false;
    if (sevF !== 'All' && a.severity !== sevF) return false;
    if (unitF !== 'All' && a.unitId !== unitF) return false;
    if (q && !`${a.id} ${a.unitId} ${a.explanation}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [alerts, statusF, sevF, unitF, q, settings.prefs]);

  const current = alerts.find((a) => a.id === sel) || list[0];
  const queue = attentionItems(units, alerts, state.actions).filter((i) => i.urgency !== 'Info' || i.kind === 'recovery');

  return (
    <>
      <PageHead eyebrow="Alerts & incidents" title="Explainable alerts" sub="Each alert records why it was raised, what to do, and every step taken since. Alerts come from the simulated history and from simulator runs." right={<DemoTag />} />

      <Panel title={<span className="flex items-center gap-2"><ListTodo size={14} aria-hidden="true" />Action queue</span>} note="High-risk units, rising trends, data problems, recoveries, unacknowledged alerts and unfinished actions">
        {queue.length === 0 ? <Empty>Queue is clear.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Urgency</th><th>Unit</th><th>Item</th><th>Why</th><th>Next step</th><th /></tr></thead>
              <tbody>
                {queue.map((i) => (
                  <tr key={i.key}>
                    <td>{i.urgency === 'Info' ? <Badge kind="info">Info</Badge> : <RiskBadge cat={i.urgency} label={i.urgency} />}</td>
                    <td className="mono">{i.unitId}</td>
                    <td style={{ fontWeight: 500 }}>{i.title}</td>
                    <td className="c-muted" style={{ maxWidth: 360 }}>{i.why}</td>
                    <td>{i.action}</td>
                    <td>
                      {i.kind === 'task' ? <button className="btn sm" onClick={() => dispatch({ type: 'actionStatus', id: i.actionId, status: 'done' })}>Mark done</button>
                        : i.alertId ? <button className="btn sm" onClick={() => setSel(i.alertId)}>Open</button>
                          : <a className="btn sm" href={`#monitor-${i.unitId}`}>View</a>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid-12">
        <Panel className="span-5" title={`Alerts (${list.length})`}
          right={<Seg label="Status filter" options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} value={statusF} onChange={setStatusF} />}>
          <div className="flex gap-2 flex-wrap" style={{ marginBottom: 10 }}>
            <label className="flex items-center gap-2 raised" style={{ padding: '3px 8px', flex: 1, minWidth: 150 }}>
              <Search size={14} className="c-muted" aria-hidden="true" />
              <input id="alert-search" className="input" style={{ border: 0, padding: '3px 0', background: 'transparent' }} placeholder="Search alerts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search alerts" />
            </label>
            <select className="select" id="alert-sev" style={{ width: 'auto' }} value={sevF} onChange={(e) => setSevF(e.target.value)} aria-label="Severity"><option>All</option><option>High</option><option>Medium</option></select>
            <select className="select" id="alert-unit" style={{ width: 'auto' }} value={unitF} onChange={(e) => setUnitF(e.target.value)} aria-label="Unit"><option>All</option>{units.map((u) => <option key={u.id}>{u.id}</option>)}</select>
          </div>
          {list.length === 0 ? <Empty>No alerts match these filters.</Empty> : (
            <div className="flex flex-col gap-2">
              {list.map((a) => (
                <button key={a.id} type="button" onClick={() => setSel(a.id)} className="raised flex gap-3" aria-pressed={current?.id === a.id}
                  style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', borderColor: current?.id === a.id ? 'var(--neon-dim)' : undefined }}>
                  <span className="sev" style={{ background: a.severity === 'High' ? 'var(--coral)' : 'var(--amber)' }} aria-hidden="true" />
                  <span className="min-w-0" style={{ flex: 1 }}>
                    <span className="flex items-center gap-2 flex-wrap">
                      <b className="mono">{a.unitId}</b><RiskBadge cat={a.severity} /><span className="mono c-muted">{a.probability}%</span>
                      <Badge kind={STATUS_KIND[a.workflow.status]}>{STATUS_LABEL[a.workflow.status]}</Badge>
                    </span>
                    <span className="block c-muted" style={{ fontSize: 12.5, marginTop: 4 }}>{a.explanation.split('. ')[0]}.</span>
                    <span className="block c-faint mono" style={{ fontSize: 11, marginTop: 3 }}>{a.id} · {when(a)} · {a.condition === 'active' ? 'condition active' : 'risk has subsided'} · {a.source}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>
        <div className="span-7">{current ? <AlertDetail a={current} key={current.id} horizon={settings.horizon} /> : <Panel title="Alert detail"><Empty>Select an alert.</Empty></Panel>}</div>
      </div>
    </>
  );
}

function AlertDetail({ a, horizon }) {
  const { dispatch, toast, unit } = useStore();
  const [note, setNote] = useState('');
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const s = a.workflow.status;
  const u = unit(a.unitId);
  const detail = a.detail;

  const act = (status, kind, text, logText) => {
    dispatch({ type: 'workflow', alertId: a.id, unitId: a.unitId, status, kind, text, log: logText });
    toast(logText);
  };
  const addNote = (e) => {
    e.preventDefault();
    if (!note.trim()) { toast('Write a note before adding it.', 'error'); return; }
    act(null, 'note', note.trim(), `Investigation note added to ${a.id}`);
    setNote('');
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel title={`Alert ${a.id}`} right={<Badge kind={STATUS_KIND[s]}>{STATUS_LABEL[s]}</Badge>}>
        <div className={`alert-box ${riskClass(a.severity)}`} style={{ marginBottom: 12 }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
            <RiskBadge cat={a.severity} label={`${a.severity} severity`} />
            <b>{a.unitId} · {a.unitName}</b>
            <Badge>{a.source}</Badge>
          </div>
          <p style={{ margin: '0 0 6px' }}>{a.explanation}</p>
          <p style={{ margin: 0 }}><b className="c-low">Recommended action:</b> {a.action}</p>
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <KV items={[
            ['Generated', when(a)],
            ['Storage unit', `${a.unitId} ${a.unitName}`],
            ['Temperature at alert', `${a.temp.toFixed(1)}°C`],
            ['Configured threshold', `${a.lower.toFixed(1)}–${a.upper.toFixed(1)}°C`],
          ]} />
          <KV items={[
            ['Excursion probability', `${a.probability}%`],
            ['Peak probability', `${a.peakProbability}%`],
            ['Forecast window', `${a.horizon || horizon} min`],
            ['Condition', a.condition === 'active' ? 'Still elevated' : 'Risk subsided'],
          ]} />
        </div>
        <details className="why" style={{ marginTop: 14 }} open>
          <summary><ChevronDown size={14} aria-hidden="true" />Why was this alert generated?</summary>
          <div className="flex flex-col gap-3" style={{ marginTop: 10 }}>
            <div className="flex gap-2 flex-wrap">{a.factors.map((f) => <Badge key={f} kind="medium">{f}</Badge>)}</div>
            {detail && <FactorBars factors={detail.factors} limit={6} />}
            <p className="c-muted" style={{ fontSize: 12.5, margin: 0 }}>
              Risk rose from Low into {a.severity} at {when(a)}. {a.crossing ? `The forecast then reached the ${a.crossing.limit} limit about ${a.crossing.m} min ahead. ` : ''}
              The factors are the largest contributions in the prototype rule-based model. They are prototype explanations, not SHAP values, because no trained model is connected yet.
            </p>
            {detail && <a className="btn sm" style={{ alignSelf: 'flex-start' }} href={`#risk-${a.unitId}`}>Open full risk assessment</a>}
          </div>
        </details>
      </Panel>

      <Panel title="Workflow" note="Every change is kept in the history below">
        <div className="flex gap-2 flex-wrap" style={{ marginBottom: 12 }}>
          <button className="btn sm primary" disabled={s !== 'new'} onClick={() => act('acknowledged', 'ack', 'Alert acknowledged', `${a.id} acknowledged`)}><CheckCheck size={14} aria-hidden="true" />Acknowledge</button>
          <button className="btn sm" disabled={['in_progress', 'resolved', 'dismissed'].includes(s)} onClick={() => act('in_progress', 'status', 'Investigation started', `${a.id} marked in progress`)}><Wrench size={14} aria-hidden="true" />Mark in progress</button>
          <button className="btn sm" disabled={['resolved', 'dismissed'].includes(s)} onClick={() => act('resolved', 'status', 'Alert resolved', `${a.id} resolved`)}><CircleCheck size={14} aria-hidden="true" />Resolve</button>
          {!confirmDismiss
            ? <button className="btn sm danger" disabled={['resolved', 'dismissed'].includes(s)} onClick={() => setConfirmDismiss(true)}><Ban size={14} aria-hidden="true" />Dismiss</button>
            : <span className="flex items-center gap-2 raised" style={{ padding: '4px 8px', fontSize: 12.5 }}>Dismiss as not actionable?
              <button className="btn sm danger" onClick={() => { act('dismissed', 'status', 'Alert dismissed as not actionable', `${a.id} dismissed`); setConfirmDismiss(false); }}>Yes, dismiss</button>
              <button className="btn sm ghost" onClick={() => setConfirmDismiss(false)}>Cancel</button></span>}
          {['resolved', 'dismissed'].includes(s) && <button className="btn sm ghost" onClick={() => act('in_progress', 'status', 'Alert reopened', `${a.id} reopened`)}>Reopen</button>}
        </div>
        <form onSubmit={addNote} className="flex gap-2 flex-wrap" style={{ marginBottom: 14 }}>
          <input className="input" id={`note-${a.id}`} style={{ flex: 1, minWidth: 200 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
          <button className="btn sm" type="submit"><MessageSquarePlus size={14} aria-hidden="true" />Add note</button>
        </form>
        <div className="stat-label" style={{ marginBottom: 6 }}>Record a preventive action</div>
        <ActionForm unitId={a.unitId} alertId={a.id} />
      </Panel>

      <Panel title="History" note={`${a.workflow.history.length} entr${a.workflow.history.length === 1 ? 'y' : 'ies'}`}>
        <div className="timeline">
          <div className="tl-item"><span className="mono c-faint" style={{ fontSize: 11.5 }}>{a.at ? new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : clock(a.m)}</span><span className="tl-dot" style={{ borderColor: 'var(--amber)' }} /><span>Early warning generated ({a.severity}, {a.probability}%) <span className="c-faint">· {a.source}</span></span></div>
          {a.workflow.history.map((h) => (
            <div className="tl-item" key={h.id}>
              <span className="mono c-faint" style={{ fontSize: 11.5 }}>{new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
              <span className="tl-dot" style={{ borderColor: h.kind === 'note' ? 'var(--teal)' : h.kind === 'action' ? 'var(--neon)' : 'var(--muted)' }} />
              <span>{h.kind === 'note' ? <><b>Note:</b> {h.text}</> : h.text}{h.from !== h.to && <span className="c-faint"> · {STATUS_LABEL[h.from]} → {STATUS_LABEL[h.to]}</span>} <span className="c-faint">· {h.by}</span></span>
            </div>
          ))}
        </div>
        {u && <p className="c-faint" style={{ fontSize: 11.5, marginTop: 8 }}>Stored in this browser for the demo. With the backend configured, these entries map to the alert_events and preventive_actions tables.</p>}
      </Panel>
    </div>
  );
}
