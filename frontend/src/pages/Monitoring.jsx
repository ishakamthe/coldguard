import React, { useState } from 'react';
import { DoorOpen, DoorClosed, Fan, Power, Thermometer, Sun, Clock, ShieldAlert, Database } from 'lucide-react';
import { useStore, clock, fmtT, riskClass } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, UnitPicker, RiskBadge, Badge } from '../components/ui.jsx';
import { ReadingsChart } from '../components/charts.jsx';
import { ActionForm } from '../components/blocks.jsx';

export default function Monitoring() {
  const { unit, selectedUnit, setSelectedUnit, state } = useStore();
  const u = unit(selectedUnit);
  const [range, setRange] = useState(60);
  const a = u.assessment;
  const last = u.series[u.series.length - 1];
  const maxRange = u.series.length - 1;
  const ranges = [15, 60, 360, 1440].filter((r) => r <= maxRange);
  const r = Math.min(range, maxRange);
  const imported = state.imports.flatMap((b) => b.rows.filter((x) => x.unit_id === u.id).map((x) => ({ m: Math.round((x.ts - Date.now()) / 60000), temp: x.temperature })));
  const recent = u.series.slice(-15).reverse();
  const qCls = a.quality.level === 'Good' ? 'low' : a.quality.level === 'Fair' ? 'medium' : 'high';

  return (
    <>
      <PageHead
        eyebrow="Live monitoring"
        title={`${u.id} · ${u.name}`}
        sub={`${u.type} · ${u.location}. Readings are synthetic, one per minute${u.simulated ? ', currently driven by the scenario simulator' : ''}.`}
        right={<><DemoTag>{u.simulated ? 'Simulator data' : 'Simulated readings'}</DemoTag><UnitPicker value={u.id} onChange={(id) => { setSelectedUnit(id); window.location.hash = `monitor-${id}`; }} /></>}
      />

      <div className="stats">
        <Tile icon={Thermometer} label="Current temperature" value={fmtT(a.features.temp)} cls={`c-${riskClass(a.category)}`} foot={`Limits ${u.lower.toFixed(1)}–${u.upper.toFixed(1)}°C`} />
        <Tile icon={Sun} label="Ambient" value={fmtT(last.ambient)} foot="Room around the unit" />
        <Tile icon={last.door ? DoorOpen : DoorClosed} label="Door" value={last.door ? 'Open' : 'Closed'} cls={last.door ? 'c-medium' : ''} foot={a.features.minutesSinceDoor === Infinity ? 'No openings in 24 h' : `Last opened ${a.features.minutesSinceDoor} min ago`} />
        <Tile icon={last.cooling ? Fan : Power} label="Cooling" value={last.cooling ? 'Active' : 'Inactive'} cls={!last.cooling && a.features.overdueMin > 2 ? 'c-high' : ''} foot={last.cooling ? `Running ${a.features.coolingOnMin} min` : `Off ${a.features.coolingOffMin} min`} />
        <Tile icon={Clock} label="Last reading" value={clock(u.lastReadingM)} foot={u.lastReadingM === 0 ? 'At snapshot time' : `${-u.lastReadingM} min before snapshot`} />
        <Tile icon={ShieldAlert} label="Early warning" value={a.category === 'Low' ? 'None' : a.category} cls={`c-${riskClass(a.category)}`} foot={`${a.probability}% · next ${a.horizon} min`} />
      </div>

      <div className="grid-12">
        <Panel className="span-8" title="Recent readings" note="Shaded spans = door open" right={<Seg label="Time range" options={ranges.map((x) => ({ value: x, label: x < 60 ? `${x} min` : `${x / 60} h` }))} value={r} onChange={setRange} />}>
          <ReadingsChart unit={u} range={r} imported={imported} />
          {imported.length > 0 && <div className="c-teal" style={{ fontSize: 12 }}>Teal dots: imported observations for {u.id} (kept separate from synthetic data).</div>}
          {u.series.slice(-r).some((x) => x.temp == null) && <div className="c-faint" style={{ fontSize: 12 }}>Gaps in the line are missing readings; they are not filled in.</div>}
        </Panel>
        <div className="span-4 flex flex-col gap-4">
          <Panel title="Operating status">
            <div className="flex flex-col gap-3">
              <Row label="Status"><RiskBadge cat={a.category} label={a.status} /></Row>
              <Row label="Excursion risk"><span className="mono">{a.probability}% · {a.category}</span></Row>
              <Row label="Anomaly"><Badge kind={a.anomaly.status === 'Normal' ? 'low' : a.anomaly.status === 'Unusual' ? 'medium' : 'high'}>{a.anomaly.status} · {a.anomaly.score}</Badge></Row>
              <Row label="Data quality"><Badge kind={qCls} icon={Database}>{a.quality.level}</Badge></Row>
              {a.quality.issues.length > 0 && <div className="c-muted" style={{ fontSize: 12 }}>{a.quality.issues.join(' · ')}</div>}
              <Row label="Forecast mode"><span className="mono c-muted">{a.forecast.mode}</span></Row>
              <div className="flex gap-2 flex-wrap">
                <a className="btn sm" href={`#forecast-${u.id}`}>Forecast</a>
                <a className="btn sm" href={`#risk-${u.id}`}>Risk details</a>
              </div>
            </div>
          </Panel>
          <Panel title="Record preventive action">
            <ActionForm unitId={u.id} alertId={u.alerts.find((x) => x.condition === 'active')?.id} compact />
          </Panel>
        </div>
      </div>

      <Panel title="Last 15 readings" note="Newest first">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Time</th><th className="num">Temperature</th><th className="num">Ambient</th><th>Door</th><th>Cooling</th><th>Source</th></tr></thead>
            <tbody>
              {recent.map((x) => (
                <tr key={x.m} className={x.temp != null && (x.temp > u.upper || x.temp < u.lower) ? 'bad' : ''}>
                  <td className="mono">{clock(x.m)}</td>
                  <td className="num mono">{x.temp == null ? <span className="c-high">missing</span> : `${x.temp.toFixed(2)}°C`}</td>
                  <td className="num mono">{x.ambient.toFixed(1)}°C</td>
                  <td>{x.door ? <span className="c-medium">Open</span> : 'Closed'}</td>
                  <td>{x.cooling ? 'Active' : <span className="c-muted">Inactive</span>}</td>
                  <td className="c-faint">{x.source === 'simulator' ? 'Simulator' : 'Synthetic'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function Tile({ icon: Icon, label, value, foot, cls = '' }) {
  return (
    <div className="stat">
      <span className="stat-label flex items-center gap-1"><Icon size={13} aria-hidden="true" />{label}</span>
      <span className={`stat-value ${cls}`} style={{ fontSize: 22 }}>{value}</span>
      <span className="stat-foot">{foot}</span>
    </div>
  );
}
function Row({ label, children }) {
  return <div className="flex items-center justify-between gap-2"><span className="c-muted" style={{ fontSize: 12.5 }}>{label}</span>{children}</div>;
}
