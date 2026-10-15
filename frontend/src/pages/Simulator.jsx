import React, { useMemo } from 'react';
import { Play, Pause, RotateCcw, StepForward, DoorOpen, Fan } from 'lucide-react';
import { useStore, E, simCfg, simAlert, SIM_LIMIT, fmtT, riskClass } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, RiskBadge, Field, Toggle, Badge, Dial, FactorBars } from '../components/ui.jsx';
import { SimChart } from '../components/charts.jsx';

const SHAPES = {
  normal: 'M2 20 Q12 10 22 20 T42 20 T62 20 T82 20',
  door: 'M2 24 L26 24 Q36 4 46 14 Q56 24 82 24',
  degradation: 'M2 26 Q50 24 82 6',
  failure: 'M2 24 L30 24 L56 6 L82 6',
  recovery: 'M2 24 L22 24 L40 6 Q52 2 60 18 L82 24',
};

export default function Simulator() {
  const { sim, setSim, settings, alerts, units, dispatch } = useStore();
  const p = sim.params;
  const st = sim.state;
  const a = useMemo(() => E.assess(st.series, simCfg(p), { horizon: settings.horizon, bands: settings.bands }), [st, p, settings.horizon, settings.bands]);
  const last = st.series[st.series.length - 1];
  const target = units.find((u) => u.id === sim.target);
  const simAlerts = alerts.filter((x) => x.source === 'Simulator').slice(0, 4);

  const reset = (params = p, extra = {}) => {
    const next = E.createSim(params);
    setSim({ ...sim, params, state: next, running: false, lastCat: 'Low', ...extra });
    dispatch({ type: 'simAlertSubside' });
  };
  const setParam = (k, v) => reset({ ...p, [k]: v });
  const step = (n) => {
    let s = st;
    for (let i = 0; i < n && s.t < SIM_LIMIT; i++) s = E.stepSim(s);
    const na = E.assess(s.series, simCfg(s.params), { horizon: settings.horizon, bands: settings.bands });
    const R = { Low: 0, Medium: 1, High: 2 };
    const prev = sim.lastCat || 'Low';
    if (R[na.category] > R[prev]) dispatch({ type: 'simAlert', alert: simAlert(E.UNITS.find((u) => u.id === sim.target), s, na) });
    if (na.category === 'Low' && prev !== 'Low') dispatch({ type: 'simAlertSubside' });
    setSim({ ...sim, state: s, running: false, lastCat: na.category });
  };
  const override = (k, v) => setSim({ ...sim, state: { ...st, overrides: { ...st.overrides, [k]: v } } });
  const started = st.t > 0;
  const finished = st.t >= SIM_LIMIT;

  return (
    <>
      <PageHead
        eyebrow="Scenario simulator"
        title="What-if temperature simulator"
        sub="Replay synthetic operating conditions minute by minute. The readings, forecast, risk, contributing factors and alerts all update together from the same simulated data."
        right={<DemoTag>Simulation</DemoTag>}
      />

      <Panel title="1 · Choose a scenario" note="Schematic shapes from the presentation">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {E.SCENARIOS.map((s) => (
            <button key={s.id} type="button" onClick={() => setParam('scenario', s.id)} aria-pressed={p.scenario === s.id}
              className="raised" style={{ padding: 12, textAlign: 'left', cursor: 'pointer', borderColor: p.scenario === s.id ? 'var(--neon)' : undefined, boxShadow: p.scenario === s.id ? '0 0 0 1px var(--neon)' : undefined }}>
              <svg viewBox="0 0 84 30" width="100%" height="30" aria-hidden="true"><path d={SHAPES[s.id]} fill="none" stroke={s.id === 'normal' ? '#55f58b' : s.id === 'failure' ? '#ff6b5e' : s.id === 'recovery' ? '#2dd4bf' : '#f5b83d'} strokeWidth="2" /></svg>
              <div style={{ fontWeight: 600, marginTop: 6 }}>{s.name}</div>
              <div className="c-muted" style={{ fontSize: 12 }}>{s.desc}</div>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid-12">
        <Panel className="span-4" title="2 · Conditions" note="Changing a condition restarts the run">
          <div className="flex flex-col gap-3">
            <Field label={`Ambient temperature: ${p.ambient}°C`}><input id="sim-amb" type="range" min="15" max="35" step="1" value={p.ambient} onChange={(e) => setParam('ambient', +e.target.value)} /></Field>
            <Field label={`Initial temperature: ${p.initialTemp.toFixed(1)}°C`}><input id="sim-init" type="range" min="2.5" max="6.5" step="0.1" value={p.initialTemp} onChange={(e) => setParam('initialTemp', +e.target.value)} /></Field>
            <Field label={`Upper limit: ${p.upper.toFixed(1)}°C`}><input id="sim-upper" type="range" min="5.5" max="12" step="0.5" value={p.upper} onChange={(e) => setParam('upper', +e.target.value)} /></Field>
            <Field label={`Event duration: ${p.duration} min`} hint={p.scenario === 'door' ? 'How long the door stays open' : p.scenario === 'recovery' ? 'How long cooling is off before it restarts' : 'Used by Door open and Recovery'}>
              <input id="sim-dur" type="range" min="1" max="40" step="1" value={p.duration} onChange={(e) => setParam('duration', +e.target.value)} />
            </Field>
            <Field label="Drive storage unit">
              <select className="select" id="sim-target" value={sim.target} onChange={(e) => { const u = units.find((x) => x.id === e.target.value); reset({ ...p, upper: u.upper, lower: u.lower }, { target: e.target.value }); }}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
              </select>
            </Field>
            <Toggle id="sim-attach" on={sim.attached} onChange={(v) => setSim({ ...sim, attached: v })} label={`Show simulation on ${sim.target} across the dashboard`} />
          </div>
        </Panel>

        <Panel className="span-8" title="3 · Playback"
          right={<>
            <span className="mono c-muted">t = {st.t} / {SIM_LIMIT} min</span>
            <Seg label="Playback speed" options={[1, 2, 5, 10].map((v) => ({ value: v, label: `${v}×` }))} value={sim.speed} onChange={(v) => setSim({ ...sim, speed: v })} />
          </>}>
          <div className="flex gap-2 flex-wrap" style={{ marginBottom: 10 }}>
            {!sim.running
              ? <button className="btn primary sm" disabled={finished} onClick={() => setSim({ ...sim, running: true })}><Play size={14} aria-hidden="true" />{started ? 'Resume' : 'Start'}</button>
              : <button className="btn sm" onClick={() => setSim({ ...sim, running: false })}><Pause size={14} aria-hidden="true" />Pause</button>}
            <button className="btn sm" disabled={finished} onClick={() => step(1)}><StepForward size={14} aria-hidden="true" />+1 min</button>
            <button className="btn sm" disabled={finished} onClick={() => step(10)}><StepForward size={14} aria-hidden="true" />+10 min</button>
            <button className="btn sm" onClick={() => reset()}><RotateCcw size={14} aria-hidden="true" />Reset simulation</button>
            <span style={{ flex: 1 }} />
            <OverrideSeg icon={DoorOpen} label="Door" value={st.overrides.door} options={[[undefined, 'Auto'], [true, 'Open'], [false, 'Closed']]} onChange={(v) => override('door', v)} />
            <OverrideSeg icon={Fan} label="Cooling" value={st.overrides.cooling} options={[[undefined, 'Auto'], [true, 'Force on'], [false, 'Force off']]} onChange={(v) => override('cooling', v)} />
          </div>
          <SimChart series={st.series} assessment={a} upper={p.upper} lower={p.lower} />
          <div className="flex gap-3 flex-wrap c-muted" style={{ fontSize: 12.5 }}>
            <span>Reading <b className="mono" style={{ color: 'var(--text)' }}>{fmtT(last.temp)}</b></span>
            <span>Door <b style={{ color: last.door ? 'var(--amber)' : 'var(--text)' }}>{last.door ? 'open' : 'closed'}</b></span>
            <span>Cooling <b style={{ color: last.cooling ? 'var(--neon)' : 'var(--text)' }}>{last.cooling ? 'active' : 'inactive'}</b></span>
            <span>Ambient <b className="mono" style={{ color: 'var(--text)' }}>{p.ambient}°C</b></span>
            {!started && <span className="c-medium">Press Start: the first 60 minutes are normal pre-history.</span>}
            {finished && <span className="c-medium">Run complete. Reset to replay.</span>}
          </div>
        </Panel>

        <Panel className="span-4" title="Predicted risk">
          <div className="flex items-center gap-3 flex-wrap">
            <Dial value={a.probability} cat={a.category} size={112} />
            <div className="flex flex-col gap-1">
              <RiskBadge cat={a.category} label={a.status} />
              <span className="c-muted" style={{ fontSize: 12.5 }}>Next {a.horizon} min · anomaly {a.anomaly.status.toLowerCase()} ({a.anomaly.score})</span>
              <span className="c-muted" style={{ fontSize: 12.5 }}>{a.forecast.crossing ? `Forecast crosses ${a.forecast.crossing.limit} limit in ~${a.forecast.crossing.m} min` : 'No crossing in forecast window'}</span>
            </div>
          </div>
        </Panel>
        <Panel className="span-4" title="Contributing factors" note="Prototype rule weights">
          <FactorBars factors={a.factors} limit={5} />
        </Panel>
        <Panel className="span-4" title="Explanation">
          <p style={{ margin: '0 0 8px', fontSize: 13 }}>{a.explanation}</p>
          <p style={{ margin: 0, fontSize: 13 }}><b className="c-low">Suggested action:</b> {a.action}</p>
        </Panel>

        <Panel className="span-12" title="Generated alerts" note="Raised when risk rises into Medium or High during playback" right={<a className="btn sm" href="#alerts">Open alerts</a>}>
          {simAlerts.length === 0 ? <div className="empty">No alert yet. {a.category === 'Low' ? 'Risk is low under these conditions.' : ''}</div> : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {simAlerts.map((x) => (
                <div key={x.id} className={`alert-box ${riskClass(x.severity)}`}>
                  <div className="flex items-center gap-2 flex-wrap"><RiskBadge cat={x.severity} /><b className="mono">{x.unitId}</b><span className="mono c-muted">{x.probability}% · sim t+{x.simMinute}m</span>{x.condition === 'subsided' && <Badge>Subsided</Badge>}</div>
                  <div style={{ fontSize: 12.5, marginTop: 6 }}>{x.explanation}</div>
                  <div className="c-faint" style={{ fontSize: 11.5, marginTop: 4 }}>{x.scenario} · {x.id}</div>
                </div>
              ))}
            </div>
          )}
          {target && sim.attached && <p className="c-faint" style={{ fontSize: 12, marginTop: 10 }}>While the run has started, {target.id} on the Overview, Monitoring, Forecast and Risk pages shows this simulation (tagged "sim"). Turn the switch off to return it to its seeded data.</p>}
        </Panel>
      </div>
    </>
  );
}

function OverrideSeg({ icon: Icon, label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-1">
      <Icon size={14} className="c-muted" aria-hidden="true" />
      <div className="seg" role="group" aria-label={`${label} override`}>
        {options.map(([v, l]) => <button key={l} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}
