import React, { useMemo } from 'react';
import { Play, Pause, RotateCcw, StepForward } from 'lucide-react';
import { useStore, E, simCfg, simAlert, SIM_LIMIT, fmtT } from '../lib/store.jsx';
import { Head, Card, Tag, AgentIcon, Typewriter, CountUp, Tabs, Field, Switch, FactorBars, Empty, Sev, riskColor } from '../components/ui.jsx';
import { TempChart } from '../components/charts.jsx';
import { go } from '../App.jsx';

const SHAPES = {
  normal: 'M2 22 Q12 10 22 22 T42 22 T62 22 T82 22',
  door: 'M2 26 L26 26 Q36 4 46 14 Q56 26 82 26',
  degradation: 'M2 28 Q50 26 82 6',
  failure: 'M2 26 L30 26 L56 6 L82 6',
  recovery: 'M2 26 L22 26 L40 6 Q52 2 60 18 L82 26',
};
const R = { Low: 0, Medium: 1, High: 2 };

function storyFor(a, t, p) {
  if (t === 0) return 'Ready when you are';
  if (a.inExcursion) return `Limit crossed at t+${t} min`;
  if (a.forecast.crossing) return `Heading for ${p.upper.toFixed(1)}\u00a0°C in about ${a.forecast.crossing.m} min`;
  if (a.forecast.mode === 'recovery') return 'Recovering, no warning needed';
  if (a.category !== 'Low') return 'Early warning raised';
  return 'Behaving normally';
}

export default function Simulator() {
  const { sim, setSim, settings, alerts, units, dispatch } = useStore();
  const p = sim.params;
  const st = sim.state || E.createSim(p);
  const a = useMemo(() => E.assess(st.series, simCfg(p), { horizon: settings.horizon, bands: settings.bands }), [st, p, settings.horizon, settings.bands]);
  const last = st.series[st.series.length - 1];
  const target = units.find((u) => u.id === sim.target);
  const simAlerts = alerts.filter((x) => x.source === 'Simulator');
  const firstWarn = simAlerts.filter((x) => x.condition === 'active').map((x) => x.simMinute).sort((x, y) => x - y)[0];
  const started = st.t > 0;
  const finished = st.t >= SIM_LIMIT;
  const scen = E.SCENARIOS.find((s) => s.id === p.scenario);

  const reset = (params = p, extra = {}) => {
    setSim({ ...sim, params, state: E.createSim(params), running: false, lastCat: 'Low', ...extra });
    dispatch({ type: 'simAlertSubside' });
  };
  const setParam = (k, v) => reset({ ...p, [k]: v });
  const step = (n) => {
    let s = st;
    for (let i = 0; i < n && s.t < SIM_LIMIT; i++) s = E.stepSim(s);
    const na = E.assess(s.series, simCfg(s.params), { horizon: settings.horizon, bands: settings.bands });
    const prev = sim.lastCat || 'Low';
    if (R[na.category] > R[prev]) dispatch({ type: 'simAlert', alert: simAlert(E.UNITS.find((u) => u.id === sim.target), s, na) });
    if (na.category === 'Low' && prev !== 'Low') dispatch({ type: 'simAlertSubside' });
    setSim({ ...sim, state: s, running: false, lastCat: na.category });
  };
  const override = (k, v) => setSim({ ...sim, state: { ...st, overrides: { ...st.overrides, [k]: v } } });

  return (
    <>
      <Head eyebrow="What-if" title="Scenario simulator" sub="Replay a failure minute by minute and watch when ColdGuard raises its warning, compared with when the limit is actually crossed."
        right={<Switch id="sim-attach" on={sim.attached} onChange={(v) => setSim({ ...sim, attached: v })} label={`Show on ${sim.target} across the app`} />} />

      <div className="scenarios enter">
        {E.SCENARIOS.map((s) => (
          <button key={s.id} type="button" className={`scenario ${p.scenario === s.id ? 'on' : ''}`} onClick={() => setParam('scenario', s.id)} aria-pressed={p.scenario === s.id}>
            <svg viewBox="0 0 84 32" width="100%" height="32" aria-hidden="true"><path d={SHAPES[s.id]} fill="none" stroke={p.scenario === s.id ? '#8f83ff' : '#0d1117'} strokeWidth="2" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 15.5, marginTop: 4 }}>{s.name}</span>
            <span className="c-muted" style={{ fontSize: 13 }}>{s.desc}</span>
          </button>
        ))}
      </div>

      <section className="night">
        <div className="flex justify-between items-center gap-3 flex-wrap" style={{ marginBottom: 6 }}>
          <div className="agent"><AgentIcon />{scen.name} · t+{st.t} of {SIM_LIMIT} min</div>
          <div className="flex gap-2 flex-wrap items-center">
            {!sim.running
              ? <button className="btn light" disabled={finished} onClick={() => setSim({ ...sim, running: true })}><Play size={16} aria-hidden="true" />{started ? 'Resume' : 'Start'}</button>
              : <button className="btn light" onClick={() => setSim({ ...sim, running: false })}><Pause size={16} aria-hidden="true" />Pause</button>}
            <button className="btn" disabled={finished} onClick={() => step(5)}><StepForward size={16} aria-hidden="true" />5 min</button>
            <button className="btn" onClick={() => reset()}><RotateCcw size={16} aria-hidden="true" />Reset</button>
            <Tabs label="Playback speed" value={sim.speed} onChange={(v) => setSim({ ...sim, speed: v })} options={[1, 2, 5, 10].map((v) => ({ value: v, label: `${v}×` }))} />
          </div>
        </div>
        <div className="night-grid">
          <div className="flex flex-col">
            <h2 className="headline"><Typewriter text={storyFor(a, st.t, p)} /></h2>
            <p className="lede">{started ? a.explanation : `The first hour is normal operation. Press Start to play the ${scen.name.toLowerCase()} scenario at ${sim.speed}× speed.`}</p>
            <div className="bigs" style={{ marginTop: 'auto', paddingTop: 28 }}>
              <div><div className="n"><CountUp value={a.features.temp} decimals={1} duration={300} />°</div><div className="l">Reading</div></div>
              <div><div className="n" style={{ color: a.category === 'Low' ? undefined : riskColor(a.category, a.inExcursion) }}><CountUp value={a.probability} duration={300} />%</div><div className="l">Risk, next {a.horizon} min</div></div>
              <div><div className="n">{firstWarn != null ? `t+${firstWarn}` : '—'}</div><div className="l">Warning raised</div></div>
            </div>
            <div className="legend" style={{ marginTop: 18 }}>
              <span>Door <b style={{ marginLeft: 6, color: last.door ? '#f5c451' : undefined }}>{last.door ? 'open' : 'closed'}</b></span>
              <span>Cooling <b style={{ marginLeft: 6 }}>{last.cooling ? 'on' : 'off'}</b></span>
              <span>Ambient <b className="num" style={{ marginLeft: 6 }}>{p.ambient} °C</b></span>
            </div>
          </div>
          <div className="min-w-0">
            <span className="label">Temperature · simulated minutes</span>
            <TempChart series={st.series} assessment={a} upper={p.upper} lower={p.lower} past={Math.min(90, st.series.length - 1)} height={330} warnAt={firstWarn ?? null} fmt={(m) => `${m >= 0 ? '+' : ''}${m}m`} nowLabel={`t+${st.t}`} animate={false} />
          </div>
        </div>
      </section>

      <div className="grid enter">
        <Card className="s4" title="Conditions" sub="Changing one restarts the run">
          <div className="flex flex-col gap-4">
            <Field label={`Room temperature · ${p.ambient} °C`}><input id="sim-amb" type="range" min="15" max="35" step="1" value={p.ambient} onChange={(e) => setParam('ambient', +e.target.value)} /></Field>
            <Field label={`Starting temperature · ${p.initialTemp.toFixed(1)} °C`}><input id="sim-init" type="range" min="2.5" max="6.5" step="0.1" value={p.initialTemp} onChange={(e) => setParam('initialTemp', +e.target.value)} /></Field>
            <Field label={`Upper limit · ${p.upper.toFixed(1)} °C`}><input id="sim-upper" type="range" min="5.5" max="12" step="0.5" value={p.upper} onChange={(e) => setParam('upper', +e.target.value)} /></Field>
            <Field label={`Event length · ${p.duration} min`} hint={p.scenario === 'door' ? 'How long the door stays open' : p.scenario === 'recovery' ? 'How long cooling stays off before restarting' : 'Used by Door open and Failure then recovery'}>
              <input id="sim-dur" type="range" min="1" max="40" step="1" value={p.duration} onChange={(e) => setParam('duration', +e.target.value)} />
            </Field>
            <Field label="Unit to drive">
              <select className="select" id="sim-target" value={sim.target} onChange={(e) => { const u = units.find((x) => x.id === e.target.value); reset({ ...p, upper: u.upper, lower: u.lower }, { target: e.target.value }); }}>
                {units.map((u) => <option key={u.id} value={u.id}>{u.id} · {u.name}</option>)}
              </select>
            </Field>
            <div className="flex flex-col gap-2">
              <span className="c-muted" style={{ fontSize: 13 }}>Manual override</span>
              <Tabs label="Door override" value={st.overrides.door ?? 'auto'} onChange={(v) => override('door', v === 'auto' ? undefined : v)} options={[{ value: 'auto', label: 'Door: scenario' }, { value: true, label: 'Open' }, { value: false, label: 'Closed' }]} />
              <Tabs label="Cooling override" value={st.overrides.cooling ?? 'auto'} onChange={(v) => override('cooling', v === 'auto' ? undefined : v)} options={[{ value: 'auto', label: 'Cooling: scenario' }, { value: true, label: 'On' }, { value: false, label: 'Off' }]} />
            </div>
          </div>
        </Card>

        <Card className="s4" title="What is driving the risk" sub={`${a.status} · pattern ${a.anomaly.status.toLowerCase()}`}>
          <FactorBars factors={a.factors} limit={6} />
          <div className="note" style={{ marginTop: 16 }}><div className="note-head"><AgentIcon />Suggested action</div>{a.action}</div>
        </Card>

        <Card className="s4" title="Warnings raised" sub="Each time risk rises into Medium or High" right={simAlerts.length > 0 && <button className="link" onClick={() => go('alerts')}>Open alerts</button>}>
          {simAlerts.length === 0 ? <Empty>No warning yet{started ? '. Risk is low under these conditions.' : '.'}</Empty> : (
            <div className="rows">
              {simAlerts.slice(0, 5).map((x) => (
                <button key={x.id} type="button" className="row click" onClick={() => go('alerts', x.id)}>
                  <span className="idchip">t+{x.simMinute}</span>
                  <span className="min-w-0"><span className="row-title block">{x.scenario}</span><span className="row-sub block">{x.unitId} · {fmtT(x.temp)} {x.condition === 'subsided' ? '· subsided' : ''}</span></span>
                  <Sev cat={x.severity} value={x.probability} />
                </button>
              ))}
            </div>
          )}
          {target && sim.attached && started && <p className="c-muted" style={{ fontSize: 13.5, marginTop: 14 }}>{target.id} shows this run on Home and Units until you reset or switch it off.</p>}
        </Card>
      </div>
    </>
  );
}

