import React, { useState } from 'react';
import { Thermometer, ClipboardCheck, FileText } from 'lucide-react';
import { useStore, clock, fmtT } from '../lib/store.jsx';
import { Card, Tag, RiskTag, Sev, AgentIcon, Typewriter, CountUp, Tabs, KV, Note, FactorBars, Why, riskColor } from '../components/ui.jsx';
import { TempChart } from '../components/charts.jsx';
import { go } from '../App.jsx';

function headlineFor(u) {
  const a = u.assessment; const f = a.features;
  if (a.inExcursion) return `Outside its limits at ${f.temp.toFixed(1)}\u00a0°C`;
  if (a.forecast.crossing) return `Likely to cross ${u.upper.toFixed(1)}\u00a0°C in about ${a.forecast.crossing.m} minutes`;
  if (a.forecast.mode === 'degradation') return 'Warming up even with cooling running';
  if (a.forecast.mode === 'door-open') return 'Door open, temperature rising';
  if (a.forecast.mode === 'recovery') return 'Recovering after a door opening';
  if (a.forecast.mode === 'cooling-inactive') return 'Cooling has stopped';
  if (a.category !== 'Low') return 'Trending toward its upper limit';
  return 'Holding steady inside its limits';
}

const RANGES = [{ value: 60, label: '1 h' }, { value: 360, label: '6 h' }, { value: 1440, label: '24 h' }];

export default function Units() {
  const { units, unit, selectedUnit, setSelectedUnit, state, setActionFor } = useStore();
  const u = unit(selectedUnit);
  const a = u.assessment;
  const f = a.features;
  const [range, setRange] = useState(60);
  const r = Math.min(range, u.series.length - 1);
  const last = u.series[u.series.length - 1];
  const imported = state.imports.flatMap((b) => b.rows.filter((x) => x.unit_id === u.id).map((x) => ({ m: Math.round((x.ts - Date.now()) / 60000), temp: x.temperature })));
  const unitActions = state.actions.filter((x) => x.unitId === u.id);
  const activeAlert = u.alerts.find((x) => x.condition === 'active');
  const trendH = f.slope15 * 60;
  const pick = (id) => { setSelectedUnit(id); window.history.replaceState(null, '', `#units-${id}`); };

  return (
    <>
      <section className="card" style={{ paddingBottom: 16 }}>
        <div className="flex gap-4 items-start flex-wrap justify-between">
          <div className="flex gap-4 items-start min-w-0">
            <span className="ico" style={{ width: 52, height: 52, borderRadius: 16 }}><Thermometer size={24} aria-hidden="true" /></span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="title" style={{ fontSize: 'clamp(26px, 3vw, 34px)', margin: 0 }}>{u.name}</h1>
                <Tag kind="dark">{u.id}</Tag>
                <Tag kind="line">{u.type}</Tag>
                <RiskTag cat={a.category} inExcursion={a.inExcursion} />
              </div>
              <div className="c-muted" style={{ marginTop: 6 }}>{u.location} · {u.facility} · limits {u.lower.toFixed(1)}–{u.upper.toFixed(1)} °C · updated {clock(u.lastReadingM)}{u.simulated ? ' · scenario running' : ''}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className="btn accent" onClick={() => setActionFor({ unitId: u.id, alertId: activeAlert?.id })}><ClipboardCheck size={16} aria-hidden="true" />Record action</button>
            <button className="btn" onClick={() => go('reports', u.id)}><FileText size={16} aria-hidden="true" />Report</button>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <Tabs label="Storage unit" value={u.id} onChange={pick}
            options={units.map((x) => ({ value: x.id, label: <><i className="dot" style={{ background: riskColor(x.assessment.category, x.assessment.inExcursion), margin: 0 }} />{x.id} {x.name}</>, count: `${x.assessment.probability}%` }))} />
        </div>
      </section>

      <section className="night">
        <div className="night-grid">
          <div className="flex flex-col">
            <div className="agent"><AgentIcon />ColdGuard model · updated {clock(u.lastReadingM)}</div>
            <h2 className="headline"><Typewriter key={u.id} text={headlineFor(u)} /></h2>
            <p className="lede">{a.explanation}</p>
            <div className="bigs" style={{ marginTop: 'auto', paddingTop: 30 }}>
              <div><div className="n"><CountUp value={f.temp} decimals={1} />°</div><div className="l">Now</div></div>
              <div><div className="n" style={{ color: a.category === 'Low' ? undefined : riskColor(a.category, a.inExcursion) }}><CountUp value={a.probability} />%</div><div className="l">Risk, next {a.horizon} min</div></div>
              <div><div className="n"><CountUp value={a.forecast.peak} decimals={1} />°</div><div className="l">Forecast peak</div></div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex justify-between items-center gap-3 flex-wrap" style={{ marginBottom: 6 }}>
              <span className="label">Temperature · last {RANGES.find((x) => x.value === range)?.label} and next {a.horizon} min</span>
              <Tabs label="Time range" value={range} onChange={setRange} options={RANGES} />
            </div>
            <TempChart key={`${u.id}-${range}`} series={u.series} assessment={a} upper={u.upper} lower={u.lower} past={r} height={320} warnAt={u.warningM} imported={imported} />
            <div className="chart-legend muted" style={{ marginTop: 4 }}>
              <span><i style={{ borderColor: '#edf0f5' }} />Measured</span>
              <span><i style={{ borderColor: '#8f83ff', borderTopStyle: 'dashed' }} />Forecast</span>
              <span><i style={{ borderColor: '#ff8a4c', borderTopStyle: 'dashed' }} />Limit</span>
              <span><i style={{ borderColor: 'rgba(245,196,81,.5)', borderTopWidth: 8 }} />Door open</span>
              {imported.length > 0 && <span><i style={{ borderColor: '#14a3a0', borderTopStyle: 'dotted', borderTopWidth: 3 }} />Imported</span>}
            </div>
          </div>
        </div>
      </section>

      <div className="grid enter">
        <Card className="s4" title="Why this risk" sub={`${a.probability}% chance of leaving ${u.lower.toFixed(0)}–${u.upper.toFixed(0)} °C in ${a.horizon} min`}>
          <FactorBars factors={a.factors} limit={5} />
          <div className="flex items-center justify-between gap-2" style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <span className="c-muted">Pattern check</span>
            <Tag kind={a.anomaly.status === 'Normal' ? 'ok' : a.anomaly.status === 'Unusual' ? 'warn' : 'high'}>{a.anomaly.status} · {a.anomaly.score.toFixed(2)}</Tag>
          </div>
          {a.anomaly.reasons.length > 0 && <div className="c-muted" style={{ fontSize: 13.5, marginTop: 6 }}>{a.anomaly.reasons.join('. ')}.</div>}
        </Card>

        <Card className="s4" title="Sensor state" sub={`Last reading ${clock(u.lastReadingM)}`}>
          <KV items={[
            ['Temperature', <span className="num" key="t">{fmtT(f.temp)}</span>],
            ['Trend', <span key="tr" style={{ color: trendH > 1 ? 'var(--high)' : undefined }}>{Math.abs(trendH) < 0.3 ? 'Stable' : `${trendH > 0 ? 'Rising' : 'Falling'} ${Math.abs(trendH).toFixed(1)} °C/h`}</span>],
            ['Ambient', <span className="num" key="a">{fmtT(last.ambient)}</span>],
            ['Door', last.door ? <span className="c-warn" key="d">Open now</span> : f.minutesSinceDoor === Infinity ? 'Closed, no openings today' : `Closed · opened ${f.minutesSinceDoor} min ago`],
            ['Cooling', last.cooling ? `Running ${f.coolingOnMin} min` : <span key="c" style={{ color: f.overdueMin > 2 ? 'var(--high)' : undefined }}>Off for {f.coolingOffMin} min</span>],
            ['Data quality', <Tag key="q" kind={a.quality.level === 'Good' ? 'ok' : a.quality.level === 'Fair' ? 'warn' : 'crit'}>{a.quality.level}</Tag>],
          ]} />
          {a.quality.issues.length > 0 && <div className="c-muted" style={{ fontSize: 13.5, marginTop: 8 }}>{a.quality.issues.join(' · ')}</div>}
        </Card>

        <Card className="s4" title="What to do" sub={a.decision === 'stable' ? 'Routine monitoring' : a.decision === 'recovering' ? 'Recovering as expected' : 'Not recovering on its own'}>
          <Note label="Recommendation" time={clock(u.lastReadingM)}>{a.action}</Note>
          <div className="steps" style={{ marginTop: 22 }}>
            <div className={a.decision === 'stable' ? 'off' : ''}><b>Temperature rose</b><span>{a.decision === 'stable' ? 'No' : 'Yes'}</span></div>
            <div className={a.decision === 'stable' ? 'off' : ''}><b>Recovering?</b><span>{a.decision === 'recovering' ? 'Yes' : a.decision === 'stable' ? '—' : 'No'}</span></div>
            <div className={a.decision === 'warning' || a.decision === 'excursion' ? '' : 'off'}><b>Early warning</b><span>{a.decision === 'warning' || a.decision === 'excursion' ? `Since ${u.warningM != null ? clock(u.warningM) : 'now'}` : 'Not needed'}</span></div>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap" style={{ marginTop: 18 }}>
            <span className="c-muted" style={{ fontSize: 14 }}>{unitActions.length ? `${unitActions.length} action${unitActions.length > 1 ? 's' : ''} recorded` : 'No actions recorded'}</span>
            <button className="btn dark sm" onClick={() => setActionFor({ unitId: u.id, alertId: activeAlert?.id })}>Record action</button>
          </div>
        </Card>

        <Card className="s7" title="Recent readings" sub="One per minute, newest first">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Time</th><th className="r">Temp</th><th className="r">Ambient</th><th>Door</th><th>Cooling</th></tr></thead>
              <tbody>
                {u.series.slice(-10).reverse().map((x) => (
                  <tr key={x.m} className={x.temp != null && (x.temp > u.upper || x.temp < u.lower) ? 'bad' : ''}>
                    <td className="num">{clock(x.m)}</td>
                    <td className="r num">{x.temp == null ? <span className="c-crit">missing</span> : `${x.temp.toFixed(2)} °C`}</td>
                    <td className="r num c-muted">{x.ambient.toFixed(1)} °C</td>
                    <td>{x.door ? <span className="c-warn">Open</span> : <span className="c-muted">Closed</span>}</td>
                    <td>{x.cooling ? 'On' : <span className="c-muted">Off</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="s5" title="Model inputs" sub="Computed from readings up to now only">
          <KV items={[
            ['Rate of change, 15 min', <span className="num" key="1">{(f.slope15 * 60).toFixed(2)} °C/h</span>],
            ['Trend, 60 min', <span className="num" key="2">{(f.slope60 * 60).toFixed(2)} °C/h</span>],
            ['30-min mean / spread', <span className="num" key="3">{f.mean30.toFixed(2)} / {f.std30.toFixed(2)}</span>],
            ['6-hour baseline', <span className="num" key="4">{f.mean6h.toFixed(2)} °C</span>],
            ['Margin to limit', <span className="num" key="5">{f.marginUpper.toFixed(2)} °C</span>],
            ['Door openings, 60 min', <span className="num" key="6">{f.doorEvents60}</span>],
          ]} />
          <Why summary="How the risk is calculated">
            <p className="c-muted" style={{ margin: 0, fontSize: 14 }}>Each input adds a weighted contribution; the total passes through a logistic curve to give the probability. The bars under “Why this risk” are those contributions, so every warning can be traced back to the readings that caused it.</p>
          </Why>
        </Card>
      </div>
    </>
  );
}

