import React, { useMemo, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useStore, clock, stamp } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, RiskBadge, Badge, Empty } from '../components/ui.jsx';
import { MultiTrend, RiskDistribution } from '../components/charts.jsx';

function recoveries(u, range) {
  const s = u.series;
  const idx = (m) => s.length - 1 + m;
  return u.doorEvents.filter((d) => d.m >= -range).map((d) => {
    const before = s[Math.max(0, idx(d.m) - 1)]?.temp ?? s[idx(d.m)].temp;
    let peak = -Infinity, back = null;
    for (let i = idx(d.m); i < s.length; i++) {
      const t = s[i].temp; if (t == null) continue;
      peak = Math.max(peak, t);
      if (i > idx(d.m) + d.minutes && t <= before + 0.3) { back = i - (idx(d.m) + d.minutes); break; }
    }
    return { ...d, before, peak, recoveryMin: back };
  });
}

export default function Analytics() {
  const { units, alerts, state } = useStore();
  const [unitF, setUnitF] = useState('All');
  const [range, setRange] = useState(1440);
  const [riskF, setRiskF] = useState('All');
  const [scenF, setScenF] = useState('All');
  const [evF, setEvF] = useState('all');
  const scenarios = ['All', ...new Set(units.map((u) => (u.simulated ? 'Simulator run' : u.scenario)))];
  const sel = units.filter((u) => (unitF === 'All' || u.id === unitF) && (scenF === 'All' || (u.simulated ? 'Simulator run' : u.scenario) === scenF));
  const maxRange = Math.min(...units.map((u) => u.series.length - 1));
  const r = Math.min(range, Math.max(...sel.map((u) => u.series.length - 1), 60));

  const stats = useMemo(() => sel.map((u) => {
    const w = u.series.slice(-(r + 1));
    const v = w.map((x) => x.temp).filter((x) => x != null);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const std = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / v.length);
    const hist = u.history.filter((h) => h.m >= -r);
    const dist = { Low: 0, Medium: 0, High: 0 };
    hist.forEach((h) => dist[h.category]++);
    const n = Math.max(hist.length, 1);
    const rec = recoveries(u, r);
    const recDone = rec.filter((x) => x.recoveryMin != null);
    const exc = u.excursions.filter((e) => e.end >= -r);
    const warn = u.alerts.filter((a) => a.m >= -r);
    const anomalies = hist.filter((h) => h.anomaly >= 0.7).length;
    const missing = w.filter((x) => x.temp == null).length;
    const lastHour = u.series.slice(-61).map((x) => x.temp).filter((x) => x != null);
    return {
      u, mean, std, min: Math.min(...v), max: Math.max(...v), dist: { id: u.id, Low: (dist.Low / n) * 100, Medium: (dist.Medium / n) * 100, High: (dist.High / n) * 100 },
      highMin: dist.High * (u.simulated ? 2 : 5), rec, avgRec: recDone.length ? recDone.reduce((a, b) => a + b.recoveryMin, 0) / recDone.length : null,
      exc, warn, anomalies, missing, nearMin: w.filter((x) => x.temp != null && x.temp >= u.upper - 1).length,
      hourRise: lastHour.length > 1 ? lastHour[lastHour.length - 1] - lastHour[0] : 0,
    };
  }), [sel, r]);

  // insights only where the data supports them
  const insights = [];
  stats.forEach((s) => {
    const f = s.u.assessment.features;
    if (f.slope60 > 0.01 && s.hourRise > 1) insights.push({ unit: s.u.id, text: `${s.u.id} showed a sustained increase in temperature: +${s.hourRise.toFixed(1)}°C over the last hour.`, kind: 'high' });
    if (s.exc.length) insights.push({ unit: s.u.id, text: `${s.u.id} had ${s.exc.length} excursion${s.exc.length > 1 ? 's' : ''} in this period, longest ${Math.max(...s.exc.map((e) => e.minutes))} min (peak ${Math.max(...s.exc.map((e) => e.peak)).toFixed(1)}°C).`, kind: 'high' });
    if (s.rec.length >= 3 && s.avgRec != null) insights.push({ unit: s.u.id, text: `${s.u.id} recovered from ${s.rec.filter((x) => x.recoveryMin != null).length} of ${s.rec.length} door openings, on average ${s.avgRec.toFixed(0)} min after the door closed.`, kind: 'low' });
    if (s.dist.Low === 100 && s.rec.length < 3) insights.push({ unit: s.u.id, text: `${s.u.id} stayed in the low-risk band for the whole period.`, kind: 'low' });
    if (s.missing > 0) insights.push({ unit: s.u.id, text: `${s.u.id} had ${s.missing} missing reading${s.missing > 1 ? 's' : ''}; gaps are left unfilled in charts and features.`, kind: 'medium' });
  });

  const events = [];
  stats.forEach((s) => {
    s.rec.forEach((d) => events.push({ type: 'door', m: d.m, unit: s.u.id, text: `Door open ${d.minutes} min · peak ${d.peak.toFixed(1)}°C · ${d.recoveryMin == null ? 'not yet recovered' : `recovered ${d.recoveryMin} min after closing`}` }));
    s.exc.forEach((e) => events.push({ type: 'excursion', m: e.start, unit: s.u.id, text: `Excursion above ${e.limit} limit for ${e.minutes} min · peak ${e.peak.toFixed(1)}°C${e.ongoing ? ' · ongoing' : ''}` }));
    s.warn.forEach((a) => events.push({ type: 'warning', m: a.m, unit: s.u.id, text: `Early warning ${a.severity} (${a.probability}%) · ${a.condition === 'active' ? 'still active' : 'subsided'}`, sev: a.severity }));
    // cooling-off periods longer than a normal off-cycle (25 min)
    let start = null;
    const w = s.u.series.slice(-(r + 1));
    w.forEach((x, i) => {
      if (!x.cooling && start == null) start = x.m;
      if ((x.cooling || i === w.length - 1) && start != null) { const len = x.m - start; if (len > 25) events.push({ type: 'cooling', m: start, unit: s.u.id, text: `Cooling inactive for ${len} min${x.cooling ? '' : ' (still off)'}` }); start = null; }
    });
    let an = null;
    s.u.history.filter((h) => h.m >= -r).forEach((h) => {
      if (h.anomaly >= 0.7 && !an) an = h;
      if (h.anomaly < 0.7 && an) { events.push({ type: 'anomaly', m: an.m, unit: s.u.id, text: `Anomalous pattern from ${clock(an.m)} to ${clock(h.m)}` }); an = null; }
    });
    if (an) events.push({ type: 'anomaly', m: an.m, unit: s.u.id, text: `Anomalous pattern since ${clock(an.m)} (ongoing)` });
  });
  const shownEvents = events.filter((e) => evF === 'all' || e.type === evF).sort((a, b) => b.m - a.m);

  const periods = [];
  stats.forEach((s) => {
    let cur = null;
    s.u.history.filter((h) => h.m >= -r).forEach((h, i, arr) => {
      const match = riskF === 'All' ? h.category !== 'Low' : h.category === riskF;
      if (match && !cur) cur = { unit: s.u.id, a: h.m, b: h.m, peak: h.probability, cat: h.category };
      else if (match) { cur.b = h.m; cur.peak = Math.max(cur.peak, h.probability); if (h.category === 'High') cur.cat = 'High'; }
      if ((!match || i === arr.length - 1) && cur) { periods.push(cur); cur = null; }
    });
  });

  const workflowLog = alerts.flatMap((a) => a.workflow.history.map((h) => ({ ...h, alertId: a.id, unitId: a.unitId }))).sort((a, b) => b.at - a.at);
  const imported = state.imports;

  return (
    <>
      <PageHead eyebrow="Historical analytics" title="Trends and history" sub="24 hours of synthetic history per unit, evaluated by the demo model every 5 minutes. Imported observations are listed separately and never mixed into the synthetic series." right={<DemoTag>Synthetic history</DemoTag>} />
      <Panel title="Filters">
        <div className="flex gap-3 flex-wrap items-end">
          <label className="field"><span>Storage unit</span><select className="select" id="an-unit" value={unitF} onChange={(e) => setUnitF(e.target.value)}><option>All</option>{units.map((u) => <option key={u.id}>{u.id}</option>)}</select></label>
          <label className="field"><span>Date range</span><Seg label="Range" options={[{ value: 360, label: '6 h' }, { value: 720, label: '12 h' }, { value: 1440, label: '24 h' }].filter((o) => o.value <= Math.max(maxRange, 360))} value={range} onChange={setRange} /></label>
          <label className="field"><span>Risk level (periods)</span><select className="select" id="an-risk" value={riskF} onChange={(e) => setRiskF(e.target.value)}><option value="All">Medium + High</option><option>High</option><option>Medium</option></select></label>
          <label className="field"><span>Scenario</span><select className="select" id="an-scen" value={scenF} onChange={(e) => setScenF(e.target.value)}>{scenarios.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field"><span>Event type</span><select className="select" id="an-ev" value={evF} onChange={(e) => setEvF(e.target.value)}><option value="all">All events</option><option value="door">Door openings</option><option value="cooling">Cooling inactive</option><option value="excursion">Excursions</option><option value="warning">Early warnings</option><option value="anomaly">Anomalies</option></select></label>
        </div>
      </Panel>
      {sel.length === 0 ? <Empty>No units match these filters.</Empty> : (<>
        <Panel title={<span className="flex items-center gap-2"><Lightbulb size={14} aria-hidden="true" />Insights</span>} note="Shown only when the calculated history supports them">
          {insights.length === 0 ? <Empty>No notable patterns in the selected period.</Empty> : (
            <ul className="flex flex-col gap-2" style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {insights.map((i, k) => <li key={k} className="raised flex items-center gap-3" style={{ padding: '8px 12px' }}><span className="sev" style={{ background: i.kind === 'high' ? 'var(--coral)' : i.kind === 'medium' ? 'var(--amber)' : 'var(--neon-dim)' }} />{i.text}</li>)}
            </ul>
          )}
        </Panel>
        <div className="grid-12">
          <Panel className="span-6" title="Temperature trends by unit" note="°C, synthetic"><MultiTrend units={sel} range={r} /></Panel>
          <Panel className="span-6" title="Excursion probability over time" note="Demo model, evaluated every 5 min"><MultiTrend units={sel} range={r} fromHistory valueKey="probability" yLabel="%" /></Panel>
          <Panel className="span-5" title="Risk distribution" note="Share of evaluations in each band"><RiskDistribution data={stats.map((s) => s.dist)} /></Panel>
          <Panel className="span-7" title="Comparative unit performance">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Unit</th><th className="num">Mean</th><th className="num">Min–max</th><th className="num">Std</th><th className="num">Min near limit</th><th className="num">Excursions</th><th className="num">Warnings</th><th className="num">Door opens</th><th className="num">Avg recovery</th><th className="num">High-risk min</th></tr></thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.u.id}>
                      <td className="mono">{s.u.id}</td><td className="num mono">{s.mean.toFixed(2)}</td><td className="num mono">{s.min.toFixed(1)}–{s.max.toFixed(1)}</td><td className="num mono">{s.std.toFixed(2)}</td>
                      <td className="num mono">{s.nearMin}</td><td className="num mono">{s.exc.length}</td><td className="num mono">{s.warn.length}</td><td className="num mono">{s.rec.length}</td>
                      <td className="num mono">{s.avgRec == null ? '—' : `${s.avgRec.toFixed(0)} min`}</td><td className="num mono">{s.highMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="span-6" title="High-risk periods" note={`${periods.length} period${periods.length === 1 ? '' : 's'}`}>
            {periods.length === 0 ? <Empty>No periods at this risk level.</Empty> : (
              <div className="table-wrap"><table className="t"><thead><tr><th>Unit</th><th>From</th><th>To</th><th className="num">Duration</th><th className="num">Peak</th><th>Band</th></tr></thead>
                <tbody>{periods.map((p, i) => <tr key={i}><td className="mono">{p.unit}</td><td className="mono">{clock(p.a)}</td><td className="mono">{p.b === 0 ? 'now' : clock(p.b)}</td><td className="num mono">{p.b - p.a + 5} min</td><td className="num mono">{p.peak}%</td><td><RiskBadge cat={p.cat} /></td></tr>)}</tbody></table></div>
            )}
          </Panel>
          <Panel className="span-6" title="Event history" note="Door, cooling, excursion, warning and anomaly events">
            {shownEvents.length === 0 ? <Empty>No events of this type in the period.</Empty> : (
              <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}><table className="t"><thead><tr><th>Time</th><th>Unit</th><th>Type</th><th>Detail</th></tr></thead>
                <tbody>{shownEvents.map((e, i) => <tr key={i}><td className="mono">{clock(e.m)}</td><td className="mono">{e.unit}</td><td><Badge kind={{ excursion: 'high', warning: e.sev === 'High' ? 'high' : 'medium', door: 'medium', cooling: 'info', anomaly: 'neutral' }[e.type]}>{e.type}</Badge></td><td>{e.text}</td></tr>)}</tbody></table></div>
            )}
          </Panel>
          <Panel className="span-6" title="Alert acknowledgement & resolution history">
            {workflowLog.length === 0 ? <Empty>No alerts have been acknowledged or resolved yet.</Empty> : (
              <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}><table className="t"><thead><tr><th>When</th><th>Alert</th><th>Change</th><th>By</th></tr></thead>
                <tbody>{workflowLog.map((h) => <tr key={h.id}><td className="mono">{stamp(h.at)}</td><td className="mono">{h.alertId}</td><td>{h.kind === 'note' ? `Note: ${h.text}` : h.text}</td><td>{h.by}</td></tr>)}</tbody></table></div>
            )}
          </Panel>
          <Panel className="span-6" title="Imported observations" note="Real or uploaded data, kept apart from synthetic data">
            {imported.length === 0 ? <Empty>No data imported. Use Data Import to validate and load a CSV.</Empty> : (
              <div className="table-wrap"><table className="t"><thead><tr><th>Batch</th><th>File</th><th className="num">Rows</th><th>Units</th><th>Span</th></tr></thead>
                <tbody>{imported.map((b) => <tr key={b.id}><td className="mono">{b.id}</td><td>{b.filename}</td><td className="num mono">{b.valid}</td><td>{b.units.join(', ')}</td><td className="mono">{b.rows.length ? `${stamp(b.rows[0].ts)} → ${stamp(b.rows[b.rows.length - 1].ts)}` : '—'}</td></tr>)}</tbody></table></div>
            )}
          </Panel>
        </div>
      </>)}
    </>
  );
}
