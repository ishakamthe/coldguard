import React from 'react';
import { Hospital, Syringe, Truck, FlaskConical, Apple, Snowflake, Building, Network, Check, Clock3, CircleDashed } from 'lucide-react';
import { PageHead, Panel, Badge } from '../components/ui.jsx';

const PIPE = [
  ['Sensor data', 'Synthetic, timestamped readings: temperature, ambient, door, cooling', 'demo'],
  ['Validation', 'Missing values, stale data, implausible jumps, CSV schema checks', 'built'],
  ['Feature engineering', 'Rolling stats, rate of change, cooling inactivity, door events, margins', 'built'],
  ['Excursion model', 'Deterministic demo logistic model; XGBoost / scikit-learn planned', 'demo'],
  ['Anomaly detection', 'Rule-based score; Isolation Forest planned', 'demo'],
  ['Explainability', 'Rule-weight contributions; SHAP planned once a model is trained', 'demo'],
  ['Explainable alert', 'Alerts with reasons, actions, workflow and history', 'built'],
];
const STATUS = { built: ['Built', 'low', Check], demo: ['Prototype stand-in', 'medium', Clock3], planned: ['Planned', 'neutral', CircleDashed] };

const METRICS = [
  ['Precision & recall', 'Of the warnings raised, how many preceded a real excursion; of real excursions, how many were warned.'],
  ['False-alarm rate', 'Warnings raised when no excursion followed within the window.'],
  ['Missed-excursion rate', 'Excursions that received no warning beforehand.'],
  ['PR-AUC', 'Ranking quality for rare excursion events, less flattering than ROC-AUC on imbalanced data.'],
  ['Warning lead time', 'Minutes between a valid early warning and the threshold crossing.'],
];

const ROADMAP = [
  { phase: 'Phase 1', title: 'Data & baseline model', scope: 'Hackathon scope', status: 'In progress', kind: 'medium', deliverable: 'Labelled dataset + baseline model', items: [['Generate synthetic dataset (thermal model, fixed seeds)', true], ['Simulate normal and abnormal conditions (5 scenarios)', true], ['Data validation and feature engineering', true], ['Train an initial excursion-prediction model', false]] },
  { phase: 'Phase 2', title: 'Working prototype', scope: 'Hackathon scope', status: 'Prototype built (demo model)', kind: 'medium', deliverable: 'End-to-end working demo', items: [['Prediction API (FastAPI, demo engine)', true], ['Monitoring dashboard', true], ['Risk assessment & anomaly detection (rule-based stand-ins)', true], ['Explainable warnings (prototype explanations, not SHAP)', true], ['Test the complete workflow with a trained model', false]] },
  { phase: 'Phase 3', title: 'Future development', scope: 'Beyond the hackathon', status: 'Future', kind: 'neutral', deliverable: 'Goal: pilot-ready, multi-site system', items: [['Integrate physical temperature sensors', false], ['Support multiple storage facilities', false], ['Add notification mechanisms', false], ['Validate models on real operational data', false], ['Improve reliability via ongoing evaluation', false]] },
];

export default function About() {
  return (
    <>
      <PageHead eyebrow="About · Technology for Social Cause" title="ColdGuard AI" sub="Predict before the temperature crosses the line. An AI-based predictive cold-storage excursion and early-warning system, built software-first by Team SkinAura (team leader Pranjal Kute) for Code Apex." />

      <div className="grid-12">
        <Panel className="span-7" title="The problem">
          <div className="flex flex-col gap-2" style={{ fontSize: 13.5 }}>
            <p style={{ margin: 0 }}>Threshold-based monitors alarm only after a limit is crossed. By then vaccines, medicines, reagents or food may already be compromised. Gradual cooling degradation can go unnoticed, and short fluctuations such as a door opening can trigger alarms that staff learn to ignore.</p>
            <p style={{ margin: 0 }}>ColdGuard AI looks at the trend and operating context (door, cooling, ambient) to estimate the chance of an excursion in the next window, separates normal recovery from a worsening pattern, and explains each warning so staff know what to check.</p>
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', marginTop: 14 }}>
            <div className="raised" style={{ padding: 12 }}><div className="stat-label">Threshold-based monitoring</div><div style={{ marginTop: 6 }}>Temperature limit crossed → alarm generated</div></div>
            <div className="raised" style={{ padding: 12, borderColor: 'var(--neon-dim)' }}><div className="stat-label c-low">ColdGuard AI (proposed)</div><div style={{ marginTop: 6 }}>Historical patterns analysed → upcoming excursion risk predicted → early warning for preventive action</div></div>
          </div>
        </Panel>
        <Panel className="span-5" title="Who benefits">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
            {[[Hospital, 'Hospitals & pharmacies'], [Syringe, 'Vaccine storage & distribution'], [Truck, 'Cold-chain transport'], [FlaskConical, 'Laboratories'], [Apple, 'Food storage & distribution']].map(([I, t]) => (
              <div key={t} className="raised flex items-center gap-2" style={{ padding: 10, fontSize: 12.5 }}><I size={18} className="c-low" aria-hidden="true" />{t}</div>
            ))}
          </div>
          <div className="stat-label" style={{ margin: '14px 0 6px' }}>Scales from</div>
          <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 12.5 }}>
            <span className="badge low"><Snowflake size={12} />1 unit</span>→<span className="badge neutral"><Building size={12} />Multi-unit site</span>→<span className="badge neutral"><Network size={12} />Multi-facility</span>
          </div>
        </Panel>
      </div>

      <Panel title="Pipeline" note="What this prototype actually implements at each stage">
        <div className="pipeline">
          {PIPE.map(([t, d, s], i) => {
            const [label, kind, Icon] = STATUS[s];
            return (
              <div className="pipe-step" key={t}>
                <span className="mono c-faint" style={{ fontSize: 11 }}>{i + 1}</span>
                <b>{t}</b>
                <span className="c-muted">{d}</span>
                <span><Badge kind={kind} icon={Icon}>{label}</Badge></span>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid-12">
        <Panel className="span-7" title="Architecture">
          <div className="flex flex-col gap-2" style={{ fontSize: 12.5 }}>
            {[
              ['Historical / simulated sensor data', 'Temperature · ambient · door state · cooling state · timestamps'],
              ['Validation & preprocessing → Feature engineering', 'Missing values · noise · outliers → rolling stats · rate of change · durations'],
              ['ML engine (Python)', 'Excursion classifier (XGBoost / scikit-learn) · anomaly detector (Isolation Forest) · explainer (SHAP: explains, does not predict). Demo stand-ins today.'],
              ['FastAPI backend ⇄ PostgreSQL', 'REST endpoints expose predictions, risk levels and alerts; schema for facilities, units, readings, predictions, alerts, actions, imports'],
              ['React monitoring dashboard', 'Trend charts · risk cards · explainable alerts (this app)'],
            ].map(([t, d], i, arr) => (
              <React.Fragment key={t}>
                <div className="raised" style={{ padding: '8px 12px' }}><b>{t}</b><div className="c-muted">{d}</div></div>
                {i < arr.length - 1 && <div className="c-faint" style={{ textAlign: 'center', lineHeight: 1 }} aria-hidden="true">↓</div>}
              </React.Fragment>
            ))}
          </div>
        </Panel>
        <Panel className="span-5" title="Tech stack">
          <div className="table-wrap"><table className="t"><tbody>
            {[['Frontend', 'React · Vite · Tailwind CSS · Recharts · Lucide icons'], ['Backend', 'Python · FastAPI · Pydantic · REST'], ['Database', 'PostgreSQL (schema provided)'], ['AI / ML', 'Pandas · NumPy · scikit-learn · XGBoost · Isolation Forest · SHAP (planned)'], ['Hosting / DevOps', 'GitHub · Docker (for suitable hosting) · host TBD']].map(([k, v]) => <tr key={k}><td style={{ fontWeight: 600 }}>{k}</td><td className="c-muted">{v}</td></tr>)}
          </tbody></table></div>
        </Panel>
      </div>

      <Panel title="Model evaluation" note="Planned metrics; they need labelled data and a held-out, time-ordered test set">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          {METRICS.map(([t, d]) => (
            <div key={t} className="raised" style={{ padding: 12 }}>
              <div style={{ fontWeight: 600 }}>{t}</div>
              <div className="mono c-medium" style={{ fontSize: 15, margin: '6px 0' }}>Not evaluated yet</div>
              <div className="c-muted" style={{ fontSize: 12 }}>{d}</div>
            </div>
          ))}
        </div>
        <div className="raised" style={{ padding: 12, marginTop: 12, fontSize: 12.5 }}>
          <div className="stat-label" style={{ marginBottom: 4 }}>Experiment record (placeholder)</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'minmax(140px, auto) 1fr' }}>
            <span className="c-muted">Label definition</span><span>Excursion = any reading outside the unit's limits within the next N minutes (N = forecast window).</span>
            <span className="c-muted">Split</span><span>Chronological train / validation / test by time and unit; features computed from past readings only.</span>
            <span className="c-muted">Model</span><span>— none trained —</span>
            <span className="c-muted">Results</span><span>— none —</span>
          </div>
        </div>
      </Panel>

      <Panel title="Implementation roadmap" note="Item-level status reflects what this prototype actually contains">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {ROADMAP.map((p) => (
            <div key={p.phase} className="raised flex flex-col gap-2" style={{ padding: 14, borderStyle: p.phase === 'Phase 3' ? 'dashed' : 'solid' }}>
              <div className="flex justify-between items-center gap-2"><span className="eyebrow" style={{ color: 'var(--muted)' }}>{p.phase} · {p.scope}</span></div>
              <div style={{ fontWeight: 700, fontSize: 16 }} className={p.phase === 'Phase 3' ? '' : 'c-low'}>{p.title}</div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                {p.items.map(([t, done]) => <li key={t} className="flex gap-2">{done ? <Check size={14} className="c-low" style={{ flex: 'none', marginTop: 2 }} aria-label="done" /> : <CircleDashed size={14} className="c-faint" style={{ flex: 'none', marginTop: 2 }} aria-label="not done" />}<span className={done ? '' : 'c-muted'}>{t}</span></li>)}
              </ul>
              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, fontSize: 12.5 }}><b className="c-low">{p.deliverable.startsWith('Goal') ? '' : 'Deliverable: '}</b>{p.deliverable}</div>
              <div><Badge kind={p.kind}>Status: {p.status}</Badge></div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="UN Sustainable Development Goals" note="Intended contributions, not measured outcomes">
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {[['3', 'Good health & well-being', 'Earlier warnings for temperature-sensitive medicines and vaccines.', '#4c9f38'], ['2', 'Zero hunger', 'Supporting efforts to reduce avoidable food loss in storage.', '#dda63a'], ['9', 'Industry, innovation & infrastructure', 'Applying predictive analytics to storage monitoring.', '#fd6925'], ['12', 'Responsible consumption & production', 'Helping reduce potentially avoidable losses of stored products.', '#bf8b2e']].map(([n, t, d, c]) => (
            <div key={n} className="raised flex gap-3" style={{ padding: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: c, color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700, flex: 'none', lineHeight: 1, textAlign: 'center', fontSize: 10 }}>SDG<br /><span style={{ fontSize: 18 }}>{n}</span></div>
              <div><div style={{ fontWeight: 600 }}>{t}</div><div className="c-muted" style={{ fontSize: 12.5 }}>{d}</div></div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Limitations of this prototype">
        <ul className="c-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>All unit data is synthetic and generated from a simple thermal model with fixed seeds. Nothing on screen is a live sensor reading.</li>
          <li>The excursion probability comes from hand-set weights, not a trained or validated model. Do not use it for real storage decisions.</li>
          <li>Explanations are rule-weight contributions, not SHAP values. The anomaly score is rule-based, not Isolation Forest.</li>
          <li>Recording a preventive action logs intent only; it does not confirm a physical intervention.</li>
          <li>Demo state lives in this browser. No regulatory or security compliance is claimed.</li>
        </ul>
      </Panel>
    </>
  );
}
