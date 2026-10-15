import React, { useState } from 'react';
import { FileText, Table2, FileDown, Printer } from 'lucide-react';
import { useStore, clock, stamp, fmtT, saveFile, toCSV, EMBEDDED, NOW } from '../lib/store.jsx';
import { Head, Card, Tag, RiskTag, Tabs, Empty, Sev, riskColor } from '../components/ui.jsx';
import { TempChart } from '../components/charts.jsx';

const STATUS = { new: 'Needs acknowledgement', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', dismissed: 'Dismissed' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function svgChart(u, period) {
  const s = u.series.slice(-(period + 1)).filter((r) => r.temp != null);
  const fc = u.assessment.forecast.points;
  const W = 720; const H = 220; const P = 36;
  const all = [...s.map((r) => r.temp), ...fc.map((p) => p.temp), u.upper, u.lower];
  const y0 = Math.floor(Math.min(...all) - 0.5); const y1 = Math.ceil(Math.max(...all) + 0.5);
  const X = (m) => P + ((m + period) / (period + fc.length)) * (W - 2 * P);
  const Y = (t) => H - P - ((t - y0) / (y1 - y0)) * (H - 2 * P);
  const line = (pts) => pts.map(([m, t], i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)},${Y(t).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="Arial" font-size="10">
<line x1="${P}" x2="${W - P}" y1="${Y(u.upper)}" y2="${Y(u.upper)}" stroke="#e2621b" stroke-dasharray="5 4"/><text x="${W - P - 70}" y="${Y(u.upper) - 4}" fill="#e2621b">${u.upper} °C limit</text>
<line x1="${P}" x2="${W - P}" y1="${Y(u.lower)}" y2="${Y(u.lower)}" stroke="#2c66de" stroke-dasharray="5 4" opacity=".6"/>
<line x1="${X(0)}" x2="${X(0)}" y1="${P}" y2="${H - P}" stroke="#b5bac3" stroke-dasharray="2 3"/><text x="${X(0) + 4}" y="${P - 6}" fill="#5d6470">Now ${clock(0)}</text>
<path d="${line(s.map((r) => [r.m, r.temp]))}" fill="none" stroke="#0d1117" stroke-width="1.6"/>
<path d="${line([[0, u.assessment.features.temp], ...fc.map((p) => [p.m, p.temp])])}" fill="none" stroke="#6b5cf6" stroke-width="1.6" stroke-dasharray="5 4"/>
<text x="${P}" y="${H - 12}" fill="#5d6470">${clock(-period)}</text><text x="${W - P - 80}" y="${H - 12}" fill="#5d6470">+${fc.length} min forecast</text>
<text x="4" y="${Y(y1) + 4}" fill="#5d6470">${y1} °C</text><text x="4" y="${Y(y0)}" fill="#5d6470">${y0} °C</text></svg>`;
}

export default function Reports() {
  const { units, unit, selectedUnit, setSelectedUnit, alerts, state, settings, toast } = useStore();
  const [period, setPeriod] = useState(360);
  const [g, setG] = useState(null);
  const u = unit(selectedUnit);
  const per = Math.min(period, u.series.length - 1);

  const build = () => {
    const a = u.assessment;
    const rows = u.series.slice(-(per + 1));
    const vals = rows.map((r) => r.temp).filter((v) => v != null);
    const unitAlerts = alerts.filter((x) => x.unitId === u.id && (x.at ? x.at >= NOW - per * 60000 : x.m >= -per));
    const open = unitAlerts.find((x) => x.condition === 'active' && !['resolved', 'dismissed'].includes(x.workflow.status));
    setG({
      id: `RPT-${u.id}-${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}`, at: Date.now(), unit: u, period: per, a, rows, unitAlerts,
      acts: state.actions.filter((x) => x.unitId === u.id),
      anomalies: u.history.filter((h) => h.m >= -per && h.anomaly >= 0.7),
      exc: u.excursions.filter((e) => e.end >= -per),
      stats: { n: rows.length, missing: rows.length - vals.length, min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((x, y) => x + y, 0) / vals.length },
      status: a.inExcursion ? 'Excursion in progress' : open ? `Open incident (${STATUS[open.workflow.status].toLowerCase()})` : unitAlerts.length ? 'No open incident; earlier alerts closed or eased' : 'No incident in this period',
    });
    toast(`Report ready for ${u.id}`, 'ok', `${u.name} · last ${per / 60} h`);
  };
  const save = async (name, text, mime) => { const r = await saveFile(name, text, mime); toast(r.ok ? r.msg : 'Download unavailable', r.ok ? 'ok' : 'error', r.ok ? undefined : r.msg); };
  const exportReadings = () => save(`${g.id}-readings.csv`, toCSV(g.rows, [
    { label: 'timestamp', get: (r) => new Date(NOW + r.m * 60000).toISOString() }, { label: 'unit_id', get: () => g.unit.id },
    { label: 'temperature_c', get: (r) => (r.temp == null ? '' : r.temp) }, { label: 'ambient_c', key: 'ambient' },
    { label: 'door_state', get: (r) => (r.door ? 'open' : 'closed') }, { label: 'cooling_state', get: (r) => (r.cooling ? 'on' : 'off') },
  ]), 'text/csv');
  const exportAlerts = () => save(`${g.id}-alerts.csv`, toCSV(g.unitAlerts, [
    { label: 'alert_id', key: 'id' }, { label: 'unit_id', key: 'unitId' }, { label: 'raised', get: (a) => new Date(a.at ?? NOW + a.m * 60000).toISOString() },
    { label: 'severity', key: 'severity' }, { label: 'probability_pct', key: 'probability' }, { label: 'temperature_c', key: 'temp' }, { label: 'upper_limit_c', key: 'upper' },
    { label: 'factors', get: (a) => a.factors.join('; ') }, { label: 'explanation', key: 'explanation' }, { label: 'recommended_action', key: 'action' }, { label: 'status', get: (a) => a.workflow.status },
  ]), 'text/csv');
  const exportHTML = () => {
    const a = g.a;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${g.id}</title><style>body{font-family:Arial,sans-serif;color:#0d1117;max-width:820px;margin:32px auto;padding:0 16px;font-size:13px;line-height:1.5}h1{font-size:22px;font-weight:400;margin:4px 0}h2{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#5d6470;margin:24px 0 6px;font-weight:600}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #e5e7eb;padding:6px 4px;text-align:left}th{color:#5d6470;font-weight:400;font-size:11px;text-transform:uppercase}.m{color:#5d6470}</style></head><body>
<div class="m">ColdGuard AI · Incident report · ${g.id}</div><h1>${esc(g.unit.name)} (${g.unit.id})</h1><div class="m">${esc(settings.facility)} · ${esc(g.unit.location)} · generated ${stamp(g.at)} by ${esc(settings.report.author)}, ${esc(settings.report.organisation)}</div>
<h2>Period and limits</h2><p>${clock(-g.period)} – ${clock(0)} (${g.period} min) · limits ${g.unit.lower}–${g.unit.upper} °C</p>
<h2>Temperature</h2>${svgChart(g.unit, Math.min(g.period, 360))}<p class="m">Solid line: measured. Dashed: forecast for the next ${a.horizon} min (a prediction, not a measurement).</p>
<table><tr><th>Readings</th><th>Missing</th><th>Min</th><th>Mean</th><th>Max</th><th>Excursions</th></tr><tr><td>${g.stats.n}</td><td>${g.stats.missing}</td><td>${g.stats.min.toFixed(2)} °C</td><td>${g.stats.mean.toFixed(2)} °C</td><td>${g.stats.max.toFixed(2)} °C</td><td>${g.exc.length}</td></tr></table>
<h2>Risk at time of report</h2><p>${a.probability}% estimated probability of an excursion in the next ${a.horizon} min (${a.category}). ${esc(a.explanation)}</p><p><b>Factors:</b> ${a.factors.slice(0, 4).map((f) => esc(f.label)).join(', ')}<br><b>Recommended:</b> ${esc(a.action)}</p>
<h2>Alerts</h2>${g.unitAlerts.length ? `<table><tr><th>Alert</th><th>Raised</th><th>Severity</th><th>Risk</th><th>Status</th></tr>${g.unitAlerts.map((x) => `<tr><td>${x.id}</td><td>${x.at ? stamp(x.at) : clock(x.m)}</td><td>${x.severity}</td><td>${x.probability}%</td><td>${STATUS[x.workflow.status]}</td></tr>`).join('')}</table>` : '<p>None in this period.</p>'}
<h2>Unusual patterns</h2><p>${g.anomalies.length ? `${g.anomalies.length} evaluation(s) flagged, first at ${clock(g.anomalies[0].m)}.` : 'None.'}</p>
<h2>Preventive actions</h2>${g.acts.length ? `<table><tr><th>Recorded</th><th>Action</th><th>Note</th><th>Status</th></tr>${g.acts.map((x) => `<tr><td>${stamp(x.at)}</td><td>${esc(x.action)}</td><td>${esc(x.note)}</td><td>${x.status}</td></tr>`).join('')}</table>` : '<p>None recorded.</p>'}
<h2>Status</h2><p>${esc(g.status)}</p>
<h2>Data source</h2><p class="m">${g.unit.simulated ? 'Scenario simulator' : 'ColdGuard simulated sensor feed'} · risk model: ${esc(a.model)}; not yet validated on operational data.</p></body></html>`;
    save(`${g.id}.html`, html, 'text/html');
  };

  return (
    <>
      <Head eyebrow="Reports" title="Incident reports" sub="Pick a unit and a period. The report pulls together readings, the forecast, alerts and the actions your team recorded."
        right={g && <>
          <button className="btn" onClick={exportReadings}><Table2 size={16} aria-hidden="true" />Readings CSV</button>
          <button className="btn" onClick={exportAlerts}><Table2 size={16} aria-hidden="true" />Alerts CSV</button>
          <button className="btn dark" onClick={exportHTML}><FileDown size={16} aria-hidden="true" />Printable report</button>
          {!EMBEDDED && <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden="true" />Print</button>}
        </>} />

      <section className="card no-print">
        <div className="flex gap-4 flex-wrap items-end justify-between">
          <div className="flex flex-col gap-2">
            <span className="label">Unit</span>
            <Tabs label="Unit" value={u.id} onChange={(id) => { setSelectedUnit(id); setG(null); }} options={units.map((x) => ({ value: x.id, label: `${x.id} ${x.name}` }))} />
          </div>
          <div className="flex gap-3 flex-wrap items-end">
            <div className="flex flex-col gap-2">
              <span className="label">Period</span>
              <Tabs label="Period" value={period} onChange={(v) => { setPeriod(v); setG(null); }} options={[{ value: 60, label: 'Last hour' }, { value: 360, label: '6 hours' }, { value: 1440, label: '24 hours' }]} />
            </div>
            <button className="btn dark" onClick={build}><FileText size={16} aria-hidden="true" />Generate report</button>
          </div>
        </div>
      </section>

      {!g ? <Empty>Choose a unit and period, then generate the report.</Empty> : (
        <article className="paper">
          <div className="flex justify-between gap-4 flex-wrap">
            <div>
              <div className="eyebrow">ColdGuard AI · Incident report</div>
              <h1 className="title" style={{ fontSize: 'clamp(26px, 3vw, 36px)' }}>{g.unit.name} <span className="c-faint">{g.unit.id}</span></h1>
              <div className="c-muted" style={{ marginTop: 6 }}>{settings.facility} · {g.unit.location} · {g.unit.type}</div>
            </div>
            <div style={{ textAlign: 'right' }} className="c-muted">
              <div className="num" style={{ color: 'var(--text)' }}>{g.id}</div>
              <div>{stamp(g.at)}</div>
              <div>{settings.report.author}, {settings.report.organisation}</div>
            </div>
          </div>

          <div className="stat-row" style={{ marginTop: 26 }}>
            <div className="stat"><div className="k">Period</div><div className="v" style={{ fontSize: 22 }}>{clock(-g.period)}–{clock(0)}</div></div>
            <div className="stat"><div className="k">Limits</div><div className="v" style={{ fontSize: 22 }}>{g.unit.lower.toFixed(1)}–{g.unit.upper.toFixed(1)} °C</div></div>
            <div className="stat"><div className="k">Risk now</div><div className="v" style={{ fontSize: 22, color: riskColor(g.a.category, g.a.inExcursion) }}>{g.a.probability}%</div></div>
            <div className="stat"><div className="k">Status</div><div style={{ marginTop: 10, fontSize: 14.5 }}>{g.status}</div></div>
          </div>

          <h2>Temperature</h2>
          <TempChart series={g.unit.series} assessment={g.a} upper={g.unit.upper} lower={g.unit.lower} past={Math.min(g.period, 360)} height={260} theme="light" showForecast={settings.report.includeForecast} warnAt={g.unit.warningM} />
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="t"><thead><tr><th className="r">Readings</th><th className="r">Missing</th><th className="r">Min</th><th className="r">Mean</th><th className="r">Max</th><th className="r">Excursions</th></tr></thead>
              <tbody><tr><td className="r num">{g.stats.n}</td><td className="r num">{g.stats.missing}</td><td className="r num">{fmtT(g.stats.min)}</td><td className="r num">{fmtT(g.stats.mean)}</td><td className="r num">{fmtT(g.stats.max)}</td><td className="r num">{g.exc.length}</td></tr></tbody></table>
          </div>

          {settings.report.includeForecast && (<>
            <h2>Forecast (prediction)</h2>
            <p style={{ margin: 0 }}>{g.a.probability}% chance of an excursion in the next {g.a.horizon} min · <RiskTag cat={g.a.category} inExcursion={g.a.inExcursion} /> · forecast peak {g.a.forecast.peak.toFixed(1)} °C · {g.a.forecast.crossing ? `may cross the limit in about ${g.a.forecast.crossing.m} min` : 'no crossing expected in this window'}.</p>
          </>)}
          <h2>Why</h2>
          <p style={{ margin: 0 }}>{g.a.explanation}</p>
          <p className="c-muted" style={{ margin: '6px 0 0' }}>Main factors: {g.a.factors.slice(0, 4).map((f) => f.label.toLowerCase()).join(', ')}.</p>

          {settings.report.includeReadings && (<>
            <h2>Latest readings</h2>
            <div className="table-wrap"><table className="t"><thead><tr><th>Time</th><th className="r">Temp</th><th className="r">Ambient</th><th>Door</th><th>Cooling</th></tr></thead>
              <tbody>{g.rows.slice(-8).reverse().map((r) => <tr key={r.m}><td className="num">{clock(r.m)}</td><td className="r num">{r.temp == null ? 'missing' : `${r.temp.toFixed(2)} °C`}</td><td className="r num">{r.ambient.toFixed(1)} °C</td><td>{r.door ? 'Open' : 'Closed'}</td><td>{r.cooling ? 'On' : 'Off'}</td></tr>)}</tbody></table></div>
          </>)}

          <h2>Alerts</h2>
          {g.unitAlerts.length === 0 ? <p style={{ margin: 0 }}>None in this period.</p> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Alert</th><th>Raised</th><th>Risk</th><th>Status</th></tr></thead>
              <tbody>{g.unitAlerts.map((x) => <tr key={x.id}><td className="num">{x.id}</td><td className="num">{x.at ? stamp(x.at) : clock(x.m)}</td><td><Sev cat={x.severity} value={`${x.probability}%`} /></td><td>{STATUS[x.workflow.status]}</td></tr>)}</tbody></table></div>
          )}
          <h2>Unusual patterns</h2>
          <p style={{ margin: 0 }}>{g.anomalies.length ? `${g.anomalies.length} evaluation${g.anomalies.length > 1 ? 's' : ''} flagged, first at ${clock(g.anomalies[0].m)}.` : 'None in this period.'}</p>
          <h2>Preventive actions</h2>
          {g.acts.length === 0 ? <p style={{ margin: 0 }}>None recorded for this unit.</p> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Recorded</th><th>Action</th><th>Note</th><th>By</th><th>Status</th></tr></thead>
              <tbody>{g.acts.map((x) => <tr key={x.id}><td className="num">{stamp(x.at)}</td><td>{x.action}</td><td className="c-muted">{x.note || '—'}</td><td>{x.by}</td><td>{x.status === 'done' ? <Tag kind="ok">Done</Tag> : <Tag kind="line">Planned</Tag>}</td></tr>)}</tbody></table></div>
          )}
          <h2>Data source</h2>
          <p className="c-muted" style={{ margin: 0 }}>{g.unit.simulated ? 'Scenario simulator.' : 'ColdGuard simulated sensor feed, one reading per minute.'} Risk from the rule-based model ({g.a.model}); not yet validated on operational data.</p>
        </article>
      )}
    </>
  );
}
