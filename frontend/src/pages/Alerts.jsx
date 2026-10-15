import React, { useEffect, useMemo, useState } from 'react';
import { Check, Wrench, CircleCheck, Ban, Search, ClipboardCheck, RotateCcw } from 'lucide-react';
import { useStore, clock, stamp, alertTime } from '../lib/store.jsx';
import { Head, Card, Tag, Sev, Tabs, KV, FactorBars, Why, Empty, AgentIcon, riskKind } from '../components/ui.jsx';
import { go } from '../App.jsx';

const STATUS = { new: ['Needs acknowledgement', 'crit'], acknowledged: ['Acknowledged', 'warn'], in_progress: ['In progress', 'info'], resolved: ['Resolved', 'ok'], dismissed: ['Dismissed', 'line'] };
const when = (a) => (a.at ? stamp(a.at) : clock(a.m));
const titleOf = (a) => `${a.unitName}: ${(a.factors[0] || 'risk rising').toLowerCase()}`;

export default function Alerts({ loc }) {
  const { alerts, units, state, dispatch, settings } = useStore();
  const [tab, setTab] = useState('open');
  const [unitF, setUnitF] = useState('All');
  const [sevF, setSevF] = useState('All');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(loc.alert || null);
  useEffect(() => { if (loc.alert) { setSel(loc.alert); setTab('all'); } }, [loc.alert]);

  const isClosed = (a) => ['resolved', 'dismissed'].includes(a.workflow.status);
  const counts = { open: alerts.filter((a) => !isClosed(a)).length, closed: alerts.filter(isClosed).length, all: alerts.length };
  const list = useMemo(() => alerts.filter((a) => {
    if (tab === 'open' && isClosed(a)) return false;
    if (tab === 'closed' && !isClosed(a)) return false;
    if (!settings.prefs.showSubsided && tab === 'open' && a.condition === 'subsided' && a.workflow.status === 'new') return false;
    if (unitF !== 'All' && a.unitId !== unitF) return false;
    if (sevF !== 'All' && a.severity !== sevF) return false;
    if (q && !`${a.id} ${a.unitId} ${a.unitName} ${a.explanation}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [alerts, tab, unitF, sevF, q, settings.prefs.showSubsided]);
  // keep the chosen alert in view even after its status moves it out of the current tab
  useEffect(() => { if (!sel && list[0]) setSel(list[0].id); }, [sel, list]);
  const current = alerts.find((a) => a.id === sel) || list[0];
  const unacked = alerts.filter((a) => a.condition === 'active' && a.workflow.status === 'new').length;

  return (
    <>
      <Head eyebrow="Alerts & incidents" title="Alerts" sub={`${counts.open} open${unacked ? `, ${unacked} waiting for acknowledgement` : ''}. Each alert keeps its reasons, the actions taken and every status change.`}
        right={<Tabs boxed label="Alert status" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open', count: counts.open }, { value: 'closed', label: 'Closed', count: counts.closed }, { value: 'all', label: 'All', count: counts.all }]} />} />

      <div className="grid">
        <section className="card s5">
          <div className="flex gap-2 flex-wrap" style={{ marginBottom: 12 }}>
            <label className="search" style={{ flex: 1, minWidth: 160, background: 'var(--card-2)', width: 'auto', padding: '0 14px', justifyContent: 'flex-start' }}>
              <Search size={16} aria-hidden="true" />
              <input id="alert-search" style={{ display: 'block' }} placeholder="Search alerts" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search alerts" />
            </label>
            <select className="select" id="alert-unit" style={{ width: 'auto' }} value={unitF} onChange={(e) => setUnitF(e.target.value)} aria-label="Unit"><option value="All">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.id}</option>)}</select>
            <select className="select" id="alert-sev" style={{ width: 'auto' }} value={sevF} onChange={(e) => setSevF(e.target.value)} aria-label="Severity"><option value="All">Any severity</option><option>High</option><option>Medium</option></select>
          </div>
          {list.length === 0 ? <Empty>No alerts match.</Empty> : (
            <div className="rows">
              {list.map((a) => (
                <button key={a.id} type="button" className={`row click ${current?.id === a.id ? 'sel' : ''}`} onClick={() => setSel(a.id)} aria-pressed={current?.id === a.id}>
                  <span className="sev"><i style={{ background: `var(--${riskKind(a.severity)})`, width: 10, height: 10 }} /></span>
                  <span className="min-w-0">
                    <span className="row-title block">{titleOf(a)}</span>
                    <span className="row-sub block"><span className="num">{a.id}</span> · {when(a)} · {STATUS[a.workflow.status][0]}{a.condition === 'subsided' ? ' · risk has eased' : ''}</span>
                  </span>
                  <span className="num" style={{ fontSize: 15 }}>{a.probability}%</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <div className="s7 flex flex-col" style={{ gap: 20 }}>{current ? <AlertDetail a={current} key={current.id} /> : <Card title="Alert detail"><Empty>Select an alert.</Empty></Card>}</div>

        <Card className="s12" title="Preventive actions" sub={`${state.actions.filter((x) => x.status !== 'done').length} still to do · ${state.actions.length} recorded`}>
          {state.actions.length === 0 ? <Empty>No actions recorded yet. Use “Record action” on an alert or unit.</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Recorded</th><th>Unit</th><th>Action</th><th>Note</th><th>Alert</th><th>By</th><th className="r">Status</th></tr></thead>
                <tbody>
                  {state.actions.map((x) => (
                    <tr key={x.id}>
                      <td className="num c-muted">{stamp(x.at)}</td>
                      <td><Tag kind="dark">{x.unitId}</Tag></td>
                      <td>{x.action}</td>
                      <td className="c-muted">{x.note || '—'}</td>
                      <td>{x.alertId ? <button className="link num" onClick={() => setSel(x.alertId)}>{x.alertId}</button> : <span className="c-faint">—</span>}</td>
                      <td>{x.by}</td>
                      <td className="r"><button className={`btn sm ${x.status === 'done' ? 'ghost' : 'dark'}`} onClick={() => dispatch({ type: 'actionStatus', id: x.id, status: x.status === 'done' ? 'planned' : 'done' })}>{x.status === 'done' ? <><Check size={14} aria-hidden="true" />Done</> : 'Mark done'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function AlertDetail({ a }) {
  const { dispatch, toast, setActionFor, settings } = useStore();
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const s = a.workflow.status;
  const closed = ['resolved', 'dismissed'].includes(s);
  const act = (status, kind, text, msg) => {
    dispatch({ type: 'workflow', alertId: a.id, unitId: a.unitId, status, kind, text, log: `${a.id}: ${msg}` });
    toast(`${a.id} ${msg}`, 'ok', `${a.unitId} ${a.unitName}`);
  };
  const addNote = (e) => {
    e.preventDefault();
    if (!note.trim()) { toast('Write a note first', 'error'); return; }
    act(null, 'note', note.trim(), 'note added');
    setNote('');
  };
  return (
    <>
      <section className="card">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="idchip">{a.id}</span>
          <Tag kind={STATUS[s][1]}>{STATUS[s][0]}</Tag>
          {a.condition === 'subsided' && <Tag kind="line">Risk has eased</Tag>}
        </div>
        <h2 className="title" style={{ fontSize: 'clamp(22px, 2.4vw, 28px)', margin: '12px 0 6px' }}>{titleOf(a)}</h2>
        <div className="c-muted">{a.unitId} · raised {when(a)} by {a.source === 'Simulator' ? `the simulator (${a.scenario})` : 'monitoring'}</div>
        <div className="flex gap-5 flex-wrap" style={{ marginTop: 14, fontSize: 14.5 }}>
          <span><span className="c-muted">Risk </span><Sev cat={a.severity} value={`${a.probability}%`} /></span>
          <span><span className="c-muted">Reading </span><span className="num">{a.temp.toFixed(1)} °C</span></span>
          <span><span className="c-muted">Limit </span><span className="num">{a.upper.toFixed(1)} °C</span></span>
          <span><span className="c-muted">Window </span><span className="num">{a.horizon || settings.horizon} min</span></span>
        </div>
      </section>

      <Card title="What we found" right={<button className="link" onClick={() => go('units', a.unitId)}>Open unit</button>}>
        <p style={{ margin: '0 0 14px', fontSize: 15 }}>{a.explanation}</p>
        <div className="note"><div className="note-head"><AgentIcon />Recommended</div>{a.action}</div>
        <div style={{ marginTop: 16 }}>
          <Why summary="Why was this alert raised?" open>
            <div className="flex gap-2 flex-wrap" style={{ marginBottom: 10 }}>{a.factors.map((f) => <Tag key={f} kind="warn">{f}</Tag>)}</div>
            {a.detail && <FactorBars factors={a.detail.factors} limit={5} />}
            <p className="c-muted" style={{ fontSize: 14, margin: '10px 0 0' }}>Risk rose from Low to {a.severity} at {when(a)}{a.crossing ? `, with the forecast reaching the ${a.crossing.limit} limit about ${a.crossing.m} min ahead` : ''}. Peak risk while open: {a.peakProbability}%.</p>
          </Why>
        </div>
      </Card>

      <Card title="Respond" sub="Every step is kept in the history below">
        <div className="flex gap-2 flex-wrap">
          <button className="btn dark" disabled={s !== 'new'} onClick={() => act('acknowledged', 'ack', 'Alert acknowledged', 'acknowledged')}><Check size={16} aria-hidden="true" />Acknowledge</button>
          <button className="btn" disabled={['in_progress', 'resolved', 'dismissed'].includes(s)} onClick={() => act('in_progress', 'status', 'Investigation started', 'marked in progress')}><Wrench size={16} aria-hidden="true" />Investigating</button>
          <button className="btn" disabled={closed} onClick={() => act('resolved', 'status', 'Alert resolved', 'resolved')}><CircleCheck size={16} aria-hidden="true" />Resolve</button>
          <button className="btn accent" onClick={() => setActionFor({ unitId: a.unitId, alertId: a.id })}><ClipboardCheck size={16} aria-hidden="true" />Record action</button>
          {closed ? <button className="btn ghost" onClick={() => act('in_progress', 'status', 'Alert reopened', 'reopened')}><RotateCcw size={16} aria-hidden="true" />Reopen</button>
            : !confirm ? <button className="btn ghost danger" onClick={() => setConfirm(true)}><Ban size={16} aria-hidden="true" />Dismiss</button>
              : <span className="flex items-center gap-2" style={{ fontSize: 14 }}>Not actionable?<button className="btn sm danger" onClick={() => { act('dismissed', 'status', 'Dismissed as not actionable', 'dismissed'); setConfirm(false); }}>Dismiss</button><button className="btn sm ghost" onClick={() => setConfirm(false)}>Keep</button></span>}
        </div>
        <form onSubmit={addNote} className="flex gap-2" style={{ marginTop: 14 }}>
          <input className="input" id={`note-${a.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add an investigation note" aria-label="Investigation note" />
          <button className="btn" type="submit">Add note</button>
        </form>
      </Card>

      <Card title="History" sub={`${a.workflow.history.length + 1} entries`}>
        <div className="timeline">
          <div className="tl"><span className="d" style={{ background: a.severity === 'High' ? 'var(--high)' : 'var(--warn)' }} /><span>Early warning raised · {a.severity.toLowerCase()} risk, {a.probability}% <span className="c-faint">· {a.source}</span></span><span className="when">{when(a)}</span></div>
          {a.workflow.history.map((h) => (
            <div className="tl" key={h.id}>
              <span className="d" style={{ background: h.kind === 'note' ? 'var(--info)' : h.kind === 'action' ? 'var(--accent)' : 'var(--text)' }} />
              <span>{h.kind === 'note' ? <>Note: {h.text}</> : h.text}{h.from !== h.to && <span className="c-faint"> · {STATUS[h.from][0]} → {STATUS[h.to][0]}</span>} <span className="c-faint">· {h.by}</span></span>
              <span className="when">{new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

