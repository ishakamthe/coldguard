import React, { useState } from 'react';
import { FileText, FileDown, Printer, Table2 } from 'lucide-react';
import { useStore, clock, stamp, fmtT, saveFile, toCSV, EMBEDDED, NOW } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, UnitPicker, RiskBadge, Empty } from '../components/ui.jsx';
import { ForecastChart } from '../components/charts.jsx';

const STATUS_LABEL = { new: 'Awaiting acknowledgement', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved', dismissed: 'Dismissed' };

function svgChart(u, period) {
  const s = u.series.slice(-(period + 1)).filter((r) => r.temp != null);
  const fc = u.assessment.forecast.points;
  const W = 720, H = 220, P = 34;
  const xs = [-period, fc.length];
  const all = [...s.map((r) => r.temp), ...fc.map((p) => p.temp), u.upper, u.lower];
  const y0 = Math.floor(Math.min(...all) - 0.5), y1 = Math.ceil(Math.max(...all) + 0.5);
  const X = (m) => P + ((m - xs[0]) / (xs[1] - xs[0])) * (W - 2 * P);
  const Y = (t) => H - P + -((t - y0) / (y1 - y0)) * (H - 2 * P);
  const line = (pts) => pts.map(([m, t], i) => `${i ? 'L' : 'M'}${X(m).toFixed(1)},${Y(t).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="10">
<rect width="${W}" height="${H}" fill="#fff"/>
<line x1="${P}" x2="${W - P}" y1="${Y(u.upper)}" y2="${Y(u.upper)}" stroke="#d64535" stroke-dasharray="5 4"/><text x="${P + 4}" y="${Y(u.upper) - 4}" fill="#d64535">Upper ${u.upper}°C</text>
<line x1="${P}" x2="${W - P}" y1="${Y(u.lower)}" y2="${Y(u.lower)}" stroke="#138a80" stroke-dasharray="5 4"/><text x="${P + 4}" y="${Y(u.lower) + 12}" fill="#138a80">Lower ${u.lower}°C</text>
<line x1="${X(0)}" x2="${X(0)}" y1="${P}" y2="${H - P}" stroke="#888" stroke-dasharray="2 3"/><text x="${X(0) + 3}" y="${P - 4}" fill="#555">Now ${clock(0)}</text>
<path d="${line(s.map((r) => [r.m, r.temp]))}" fill="none" stroke="#1d8a4a" stroke-width="1.6"/>
<path d="${line([[0, u.assessment.features.temp], ...fc.map((p) => [p.m, p.temp])])}" fill="none" stroke="#c98a10" stroke-width="1.6" stroke-dasharray="5 4"/>
<text x="${P}" y="${H - 10}" fill="#555">${clock(-period)}</text><text x="${W - P - 60}" y="${H - 10}" fill="#555">+${fc.length} min (forecast)</text>
<text x="4" y="${Y(y1) + 4}" fill="#555">${y1}°C</text><text x="4" y="${Y(y0)}" fill="#555">${y0}°C</text>
</svg>`;
}

export default function Reports() {
  const { unit, selectedUnit, setSelectedUnit, alerts, state, settings, toast } = useStore();
  const [period, setPeriod] = useState(360);
  const [generated, setGenerated] = useState(null);
  const u = unit(selectedUnit);
  const per = Math.min(period, u.series.length - 1);

  const build = () => {
    const a = u.assessment;
    const rows = u.series.slice(-(per + 1));
    const vals = rows.map((r) => r.temp).filter((v) => v != null);
    const unitAlerts = alerts.filter((x) => x.unitId === u.id && (x.at ? x.at >= NOW - per * 60000 : x.m >= -per));
    const acts = state.actions.filter((x) => x.unitId === u.id);
    const anomalies = u.history.filter((h) => h.m >= -per && h.anomaly >= 0.7);
    const exc = u.excursions.filter((e) => e.end >= -per);
    const open = unitAlerts.find((x) => x.condition === 'active' && !['resolved', 'dismissed'].includes(x.workflow.status));
    setGenerated({
      id: `RPT-${u.id}-${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}`, at: Date.now(), unit: u, period: per, a, rows, unitAlerts, acts, anomalies, exc,
      stats: { n: rows.length, missing: rows.length - vals.length, min: Math.min(...vals), max: Math.max(...vals), mean: vals.reduce((x, y) => x + y, 0) / vals.length },
      status: a.inExcursion ? 'Excursion in progress' : open ? `Open incident (${STATUS_LABEL[open.workflow.status]})` : unitAlerts.length ? 'No open incident (earlier alerts closed or subsided)' : 'No incident in period',
    });
    toast(`Report generated for ${u.id}`);
  };

  const exportReadings = async () => {
    if (!generated) return;
    const csv = toCSV(generated.rows, [
      { label: 'timestamp', get: (r) => new Date(NOW + r.m * 60000).toISOString() }, { label: 'unit_id', get: () => generated.unit.id },
      { label: 'temperature_c', get: (r) => (r.temp == null ? '' : r.temp) }, { label: 'ambient_c', key: 'ambient' },
      { label: 'door_state', get: (r) => (r.door ? 'open' : 'closed') }, { label: 'cooling_state', get: (r) => (r.cooling ? 'on' : 'off') },
      { label: 'data_source', get: (r) => (r.source === 'simulator' ? 'simulator' : 'synthetic') },
    ]);
    const res = await saveFile(`${generated.id}-readings.csv`, csv, 'text/csv'); toast(res.msg, res.ok ? 'ok' : 'error');
  };
  const exportAlerts = async () => {
    if (!generated) return;
    const csv = toCSV(generated.unitAlerts, [
      { label: 'alert_id', key: 'id' }, { label: 'unit_id', key: 'unitId' }, { label: 'generated', get: (a) => new Date(a.at ?? NOW + a.m * 60000).toISOString() },
      { label: 'severity', key: 'severity' }, { label: 'probability_pct', key: 'probability' }, { label: 'temperature_c', key: 'temp' }, { label: 'upper_limit_c', key: 'upper' },
      { label: 'factors', get: (a) => a.factors.join('; ') }, { label: 'explanation', key: 'explanation' }, { label: 'recommended_action', key: 'action' },
      { label: 'workflow_status', get: (a) => a.workflow.status }, { label: 'source', key: 'source' },
    ]);
    const res = await saveFile(`${generated.id}-alerts.csv`, csv, 'text/csv'); toast(res.msg, res.ok ? 'ok' : 'error');
  };
  const exportHTML = async () => {
    if (!generated) return;
    const g = generated; const a = g.a;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${g.id}</title><style>body{font-family:Inter,Arial,sans-serif;color:#0c1a12;max-width:820px;margin:24px auto;padding:0 16px;font-size:13px}h1{font-size:20px;margin:0}h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#1d6b3f;margin:20px 0 6px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d0ddd4;padding:4px 6px;text-align:left}th{background:#e6efe9}.note{color:#666;font-size:11px}.flag{border:1px dashed #c98a10;color:#8a5d00;padding:6px 8px;border-radius:6px}</style></head><body>
<p class="flag">Demonstration report. All readings are synthetic; forecasts and probabilities come from an untrained prototype model and are predictions, not measurements.</p>
<h1>ColdGuard AI incident report · ${g.unit.id} ${esc(g.unit.name)}</h1><p>${esc(settings.facility)} · ${esc(g.unit.location)} · Report ${g.id} · generated ${stamp(g.at)} by ${esc(settings.report.author)} (${esc(settings.report.organisation)})</p>
<h2>Reporting period</h2><p>${clock(-g.period)} – ${clock(0)} (${g.period} min) · limits ${g.unit.lower}–${g.unit.upper}°C</p>
<h2>Temperature</h2>${svgChart(g.unit, g.period)}<p class="note">Solid: measured (synthetic). Dashed: forecast for the next ${a.horizon} min (prediction).</p>
<table><tr><th>Readings</th><th>Missing</th><th>Min</th><th>Mean</th><th>Max</th><th>Excursions</th></tr><tr><td>${g.stats.n}</td><td>${g.stats.missing}</td><td>${g.stats.min.toFixed(2)}°C</td><td>${g.stats.mean.toFixed(2)}°C</td><td>${g.stats.max.toFixed(2)}°C</td><td>${g.exc.length}</td></tr></table>
<h2>Current risk (prediction)</h2><p>${a.probability}% probability of excursion in the next ${a.horizon} min · ${a.category} · ${esc(a.status)}. Forecast peak ${a.forecast.peak.toFixed(1)}°C${a.forecast.crossing ? `; possible crossing in ~${a.forecast.crossing.m} min` : '; no crossing predicted'}.</p>
<p><b>Contributing factors:</b> ${a.factors.slice(0, 4).map((f) => esc(f.label)).join(', ')}<br><b>Explanation:</b> ${esc(a.explanation)}<br><b>Recommended action:</b> ${esc(a.action)}</p>
<h2>Alert history</h2>${g.unitAlerts.length ? `<table><tr><th>Alert</th><th>Generated</th><th>Severity</th><th>Probability</th><th>Status</th></tr>${g.unitAlerts.map((x) => `<tr><td>${x.id}</td><td>${x.at ? stamp(x.at) : clock(x.m)}</td><td>${x.severity}</td><td>${x.probability}%</td><td>${STATUS_LABEL[x.workflow.status]}</td></tr>`).join('')}</table>` : '<p>No alerts in period.</p>'}
<h2>Anomaly events</h2><p>${g.anomalies.length ? `${g.anomalies.length} evaluation(s) flagged anomalous, first at ${clock(g.anomalies[0].m)}.` : 'None.'}</p>
<h2>Preventive actions recorded</h2>${g.acts.length ? `<table><tr><th>When</th><th>Action</th><th>Note</th><th>Status</th></tr>${g.acts.map((x) => `<tr><td>${stamp(x.at)}</td><td>${esc(x.action)}</td><td>${esc(x.note || '')}</td><td>${x.status}</td></tr>`).join('')}</table>` : '<p>None recorded.</p>'}
<h2>Incident status</h2><p>${esc(g.status)}</p>
<h2>Data source</h2><p>${g.unit.simulated ? 'Scenario simulator output' : 'Synthetic demonstration series'} · model ${esc(a.model)} · model performance not evaluated.</p>
</body></html>`;
    const res = await saveFile(`${g.id}.html`, html, 'text/html'); toast(res.ok ? `${res.msg}. Open it in a browser to print or save as PDF.` : res.msg, res.ok ? 'ok' : 'error');
  };

  const g = generated;
  return (
    <>
      <PageHead eyebrow="Reports" title="Incident reports" sub="Generate a report for one unit and period, then export the tables as CSV or the whole report as a printable HTML file." right={<DemoTag />} />
      <Panel title="Report options" className="no-print">
        <div className="flex gap-3 flex-wrap items-end">
          <label className="field"><span>Storage unit</span><UnitPicker value={u.id} onChange={(id) => { setSelectedUnit(id); setGenerated(null); }} /></label>
          <label className="field"><span>Reporting period</span><Seg label="Period" options={[{ value: 60, label: 'Last hour' }, { value: 360, label: 'Last 6 h' }, { value: 1440, label: 'Last 24 h' }]} value={period} onChange={(v) => { setPeriod(v); setGenerated(null); }} /></label>
          <button className="btn primary" onClick={build}><FileText size={15} aria-hidden="true" />Generate report</button>
          {g && <>
            <button className="btn" onClick={exportReadings}><Table2 size={15} aria-hidden="true" />Readings CSV</button>
            <button className="btn" onClick={exportAlerts}><Table2 size={15} aria-hidden="true" />Alerts CSV</button>
            <button className="btn" onClick={exportHTML}><FileDown size={15} aria-hidden="true" />Printable report (.html)</button>
            {!EMBEDDED && <button className="btn" onClick={() => window.print()}><Printer size={15} aria-hidden="true" />Print / PDF</button>}
          </>}
        </div>
      </Panel>
      {!g ? <Empty icon={FileText}>Choose a unit and period, then generate the report.</Empty> : (
        <article className="report-sheet">
          <div style={{ border: '1px dashed #c98a10', color: '#8a5d00', borderRadius: 8, padding: '6px 10px', fontSize: 12, marginBottom: 14 }}>Demonstration report. Readings are synthetic; forecasts and probabilities come from an untrained prototype model and are predictions, not measurements.</div>
          <div className="flex justify-between gap-3 flex-wrap">
            <div>
              <div style={{ fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', color: '#1d6b3f', fontWeight: 700 }}>ColdGuard AI · Incident report</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0' }}>{g.unit.id} · {g.unit.name}</h1>
              <div style={{ color: '#4b6355' }}>{settings.facility} · {g.unit.location} · {g.unit.type}</div>
            </div>
            <div style={{ textAlign: 'right', fontSize: 12, color: '#4b6355' }}>
              <div className="mono">{g.id}</div><div>Generated {stamp(g.at)}</div><div>{settings.report.author} · {settings.report.organisation}</div>
            </div>
          </div>
          <h2>Reporting period & limits</h2>
          <p style={{ margin: 0 }}>{clock(-g.period)} – {clock(0)} ({g.period} min). Configured limits {g.unit.lower.toFixed(1)}–{g.unit.upper.toFixed(1)}°C.</p>
          <h2>Temperature chart</h2>
          <div style={{ background: '#0b1710', borderRadius: 10, padding: 12 }}><ForecastChart unit={g.unit} past={Math.min(g.period, 360)} height={260} showForecast={settings.report.includeForecast} /></div>
          <h2>Readings summary (actual synthetic readings)</h2>
          <div className="table-wrap"><table className="t"><thead><tr><th className="num">Readings</th><th className="num">Missing</th><th className="num">Min</th><th className="num">Mean</th><th className="num">Max</th><th className="num">Excursions</th></tr></thead>
            <tbody><tr><td className="num mono">{g.stats.n}</td><td className="num mono">{g.stats.missing}</td><td className="num mono">{fmtT(g.stats.min)}</td><td className="num mono">{fmtT(g.stats.mean)}</td><td className="num mono">{fmtT(g.stats.max)}</td><td className="num mono">{g.exc.length}</td></tr></tbody></table></div>
          {settings.report.includeReadings && (<>
            <h2>Latest readings</h2>
            <div className="table-wrap"><table className="t"><thead><tr><th>Time</th><th className="num">Temp</th><th className="num">Ambient</th><th>Door</th><th>Cooling</th></tr></thead>
              <tbody>{g.rows.slice(-10).reverse().map((r) => <tr key={r.m}><td className="mono">{clock(r.m)}</td><td className="num mono">{r.temp == null ? 'missing' : `${r.temp.toFixed(2)}°C`}</td><td className="num mono">{r.ambient.toFixed(1)}°C</td><td>{r.door ? 'Open' : 'Closed'}</td><td>{r.cooling ? 'Active' : 'Inactive'}</td></tr>)}</tbody></table></div>
          </>)}
          {settings.report.includeForecast && (<>
            <h2>Forecast (prediction)</h2>
            <p style={{ margin: 0 }}>{g.a.probability}% estimated probability of an excursion in the next {g.a.horizon} min · <RiskBadge cat={g.a.category} /> · forecast peak {g.a.forecast.peak.toFixed(1)}°C · {g.a.forecast.crossing ? `possible crossing in ~${g.a.forecast.crossing.m} min` : 'no crossing predicted in the window'}.</p>
          </>)}
          <h2>Contributing factors</h2>
          <p style={{ margin: 0 }}>{g.a.factors.slice(0, 4).map((f) => `${f.label} (+${f.value.toFixed(2)})`).join(' · ')}</p>
          <p style={{ margin: '6px 0 0' }}>{g.a.explanation}</p>
          <h2>Alert history</h2>
          {g.unitAlerts.length === 0 ? <p style={{ margin: 0 }}>No alerts in this period.</p> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>Alert</th><th>Generated</th><th>Severity</th><th className="num">Probability</th><th>Status</th><th>Source</th></tr></thead>
              <tbody>{g.unitAlerts.map((x) => <tr key={x.id}><td className="mono">{x.id}</td><td className="mono">{x.at ? stamp(x.at) : clock(x.m)}</td><td>{x.severity}</td><td className="num mono">{x.probability}%</td><td>{STATUS_LABEL[x.workflow.status]}</td><td>{x.source}</td></tr>)}</tbody></table></div>
          )}
          <h2>Anomaly events</h2>
          <p style={{ margin: 0 }}>{g.anomalies.length ? `${g.anomalies.length} evaluation${g.anomalies.length > 1 ? 's' : ''} flagged anomalous (score ≥ 0.7), first at ${clock(g.anomalies[0].m)}.` : 'No anomalous evaluations in this period.'}</p>
          <h2>Preventive actions</h2>
          {g.acts.length === 0 ? <p style={{ margin: 0 }}>No actions recorded for this unit.</p> : (
            <div className="table-wrap"><table className="t"><thead><tr><th>When</th><th>Action</th><th>Note</th><th>By</th><th>Status</th></tr></thead>
              <tbody>{g.acts.map((x) => <tr key={x.id}><td className="mono">{stamp(x.at)}</td><td>{x.action}</td><td>{x.note || '—'}</td><td>{x.by}</td><td>{x.status}</td></tr>)}</tbody></table></div>
          )}
          <h2>Incident status</h2>
          <p style={{ margin: 0 }}>{g.status}</p>
          <h2>Data source & simulation status</h2>
          <p style={{ margin: 0 }}>{g.unit.simulated ? 'Scenario simulator output.' : 'Synthetic demonstration series generated from a thermal model with fixed seeds.'} Model: {g.a.model}. Model performance has not been evaluated, so no accuracy figures are reported.</p>
        </article>
      )}
      {EMBEDDED && g && <p className="c-faint no-print" style={{ fontSize: 12 }}>Printing is not available inside this preview. Download the printable report and open it in a browser, or run the project locally to use Print / PDF.</p>}
    </>
  );
}
