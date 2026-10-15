import React from 'react';
import { Hospital, Syringe, Truck, FlaskConical, Apple, Check, CircleDashed } from 'lucide-react';
import { Card, Tag, AgentIcon, Typewriter } from '../components/ui.jsx';

/* Concept chart from the deck: an early warning arrives before the threshold alarm. */
function LeadTime() {
  return (
    <svg viewBox="0 0 520 300" width="100%" role="img" aria-label="Temperature rising toward a limit. ColdGuard warns before the limit is crossed; a threshold alarm fires only after. The gap is the lead time.">
      <defs>
        <linearGradient id="lt-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#edf0f5" stopOpacity=".14" /><stop offset="1" stopColor="#edf0f5" stopOpacity="0" /></linearGradient>
      </defs>
      {[60, 120, 180, 240].map((y) => <line key={y} x1="40" x2="500" y1={y} y2={y} stroke="#1d2738" />)}
      <line x1="40" x2="500" y1="92" y2="92" stroke="#ff8a4c" strokeDasharray="6 6" />
      <text x="496" y="84" textAnchor="end" fill="#ff8a4c" fontSize="12">limit</text>
      <path d="M40 222 C120 220 170 214 220 196 S320 128 360 92 S430 50 500 36 L500 260 L40 260 Z" fill="url(#lt-fill)" className="cdot" style={{ animationDelay: '600ms' }} />
      <path d="M40 222 C120 220 170 214 220 196 S320 128 360 92 S430 50 500 36" fill="none" stroke="#edf0f5" strokeWidth="2.4" strokeDasharray="600" style={{ animation: 'draw 1.8s cubic-bezier(.2,.7,.2,1) both' }} />
      <line x1="262" x2="262" y1="40" y2="260" stroke="#8f83ff" className="cdot" style={{ animationDelay: '1s' }} />
      <line x1="360" x2="360" y1="40" y2="260" stroke="#ff8a4c" className="cdot" style={{ animationDelay: '1.3s' }} />
      <g className="cdot" style={{ animationDelay: '1.1s' }}>
        <rect x="204" y="16" width="116" height="24" rx="12" fill="#8f83ff" />
        <text x="262" y="32" textAnchor="middle" fill="#fff" fontSize="12">Early warning</text>
      </g>
      <g className="cdot" style={{ animationDelay: '1.4s' }}>
        <rect x="324" y="16" width="72" height="24" rx="12" fill="#fff" />
        <text x="360" y="32" textAnchor="middle" fill="#0d1117" fontSize="12">Alarm</text>
      </g>
      <g className="cdot" style={{ animationDelay: '1.7s' }}>
        <path d="M266 236 H356" stroke="#8e98a8" strokeWidth="1.4" />
        <path d="M266 230 V242 M356 230 V242" stroke="#8e98a8" strokeWidth="1.4" />
        <text x="311" y="228" textAnchor="middle" fill="#edf0f5" fontSize="12">lead time</text>
      </g>
      <text x="40" y="284" fill="#8e98a8" fontSize="11.5">time →</text>
      <text x="24" y="66" fill="#8e98a8" fontSize="11.5" transform="rotate(-90 24 66)">°C</text>
    </svg>
  );
}

const PIPE = [
  ['Data', 'Collect historical or simulated sensor measurements', 'Temperature, ambient, door and cooling state, one reading a minute for four units over 24 hours.'],
  ['Features', 'Validate data and extract time-series features', 'Missing, stale and implausible readings are flagged; rolling statistics, rates of change and durations are computed from past readings only.'],
  ['Prediction', 'Estimate the probability of a future excursion', 'A forecast of the next window plus a weighted logistic score gives the probability for each unit.'],
  ['Risk', 'Detect unusual patterns and likely causes', 'Risk bands, an unusual-pattern check and the recovering-or-not decision from the deck.'],
  ['Alert', 'Explain the warning on the dashboard', 'Each alert lists its causes and a suggested action, and keeps a history of every response.'],
];

const PAGES = [
  ['Home', 'Morning briefing: which units need attention, the unit constellation, and recent activity.'],
  ['Units', 'One unit in depth: readings with forecast, why the risk is what it is, sensor state and what to do.'],
  ['Simulator', 'Replay normal operation, a door left open, slow degradation, sudden failure or recovery, and watch the warning appear.'],
  ['Alerts', 'Every early warning with its reasons. Acknowledge, investigate, resolve or dismiss, add notes and track actions.'],
  ['Analytics', '24 hours of history: hour-by-hour risk map, trends, time in each risk band, events and unit comparison.'],
  ['Data', 'Import readings from CSV with column mapping and row-by-row checks, and see sensor data quality per unit.'],
  ['Reports', 'Incident report for a unit and period, with CSV exports and a printable version.'],
  ['Settings', 'Facility name, unit limits, forecast window and risk thresholds.'],
];

const ROADMAP = [
  { phase: 'Phase 1', scope: 'Hackathon scope', title: 'Data and baseline model', goal: 'Labelled dataset and baseline model', items: [['Generate the dataset', true], ['Simulate normal and abnormal conditions', true], ['Data validation and feature engineering', true], ['Train an initial excursion-prediction model', false]] },
  { phase: 'Phase 2', scope: 'Hackathon scope', title: 'Working prototype', goal: 'End-to-end working demo', items: [['Prediction API', true], ['Monitoring dashboard', true], ['Risk assessment and unusual-pattern detection', true], ['Explainable warnings', true], ['Test the full workflow with a trained model', false]] },
  { phase: 'Phase 3', scope: 'Beyond the hackathon', title: 'Future development', goal: 'Pilot-ready, multi-site system', items: [['Integrate physical temperature sensors', false], ['Support multiple facilities', false], ['Add notifications', false], ['Validate models on real operational data', false], ['Improve reliability through ongoing evaluation', false]] },
];

const SLIDES = [
  ['Title', 'ColdGuard AI: AI-based predictive cold-storage excursion and early-warning system. Team SkinAura, led by Pranjal Kute.'],
  ['Problem and opportunity', 'Who stores temperature-sensitive goods, why threshold alarms come too late, threshold monitoring versus ColdGuard, the lead-time concept and the four SDGs.'],
  ['Proposed solution', 'What ColdGuard predicts, how an alert is decided (recovering as expected, or not), the five-step pipeline and the four synthetic scenarios.'],
  ['Architecture and tech stack', 'Sensor data through validation, features, the ML engine (classifier, anomaly detector, SHAP explainer), FastAPI, PostgreSQL and the React dashboard.'],
  ['Dashboard mockup', 'Four sample units (FR-01 to CR-04), a 60-minute trend with 30-minute forecast for FR-02, its risk assessment and an example high-risk warning.'],
  ['Roadmap', 'Phase 1 data and baseline model, Phase 2 working prototype, Phase 3 sensors, multiple facilities and real-data validation.'],
  ['Impact and evaluation', 'Who benefits, expected impact, how it scales, and the evaluation plan: precision and recall, false-alarm rate, missed excursions, PR-AUC and lead time.'],
  ['Closing', 'Predict before the temperature crosses the line.'],
];

export default function About() {
  return (
    <>
      <section className="night">
        <div className="night-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)', alignItems: 'center' }}>
          <div>
            <div className="agent"><AgentIcon />Technology for Social Cause · Team SkinAura</div>
            <h1 className="big" style={{ fontSize: 'clamp(46px, 6vw, 80px)', margin: '22px 0 12px' }}>ColdGuard AI</h1>
            <h2 className="headline" style={{ margin: '0 0 16px' }}><Typewriter text="Predict before the temperature crosses the line." speed={30} /></h2>
            <p className="lede">Vaccines, medicines, lab samples and food spoil when a fridge drifts out of range. Most monitors only sound an alarm once the limit is already crossed. ColdGuard reads the trend and the conditions around it (door, cooling, room temperature) and warns staff while there is still time to act.</p>
          </div>
          <LeadTime />
        </div>
      </section>

      <div className="grid enter">
        <Card className="s6" title="The problem">
          <div className="rows">
            {['Threshold alarms alert staff only after limits are exceeded.', 'Gradual cooling degradation can go unnoticed for hours.', 'Short fluctuations, like a door opening, trigger misleading alarms when context is ignored.', 'Excursions damage sensitive products and cause avoidable losses.'].map((t) => (
              <div className="row" key={t} style={{ gridTemplateColumns: 'auto 1fr' }}><i className="dot" style={{ background: 'var(--high)', margin: 0 }} /><span>{t}</span></div>
            ))}
          </div>
        </Card>
        <Card className="s6" title="What ColdGuard does">
          <div className="rows">
            {['Predicts excursions before temperature limits are crossed.', 'Uses trends and operating context, not just the current reading.', 'Tells a temporary change apart from a dangerous pattern.', 'Gives an explainable risk score and a clear next step.'].map((t) => (
              <div className="row" key={t} style={{ gridTemplateColumns: 'auto 1fr' }}><Check size={16} className="c-accent" aria-hidden="true" /><span>{t}</span></div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <div className="note"><div className="label" style={{ marginBottom: 6 }}>Threshold monitoring</div>Limit crossed → alarm</div>
            <div className="note" style={{ background: 'var(--accent-soft)' }}><div className="label c-accent" style={{ marginBottom: 6 }}>ColdGuard</div>Patterns analysed → risk predicted → early warning</div>
          </div>
        </Card>

        <Card className="s12" title="How it works" sub="The five steps from the proposal, and how this website carries them out">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {PIPE.map(([t, d, how], i) => (
              <div key={t} className="note flex flex-col gap-2">
                <span className="num c-faint" style={{ fontSize: 13 }}>{i + 1}</span>
                <span style={{ fontSize: 17 }}>{t}</span>
                <span className="c-muted" style={{ fontSize: 14 }}>{d}</span>
                <span style={{ fontSize: 14, borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 'auto' }}>{how}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="s7" title="Inside the website" sub="Each page has one job">
          <div className="rows">
            {PAGES.map(([p, d]) => (
              <a key={p} href={`#${p.toLowerCase()}`} className="row click" style={{ gridTemplateColumns: 'minmax(90px, 0.25fr) minmax(0, 1fr) auto' }}>
                <span style={{ fontSize: 15 }}>{p}</span><span className="c-muted" style={{ fontSize: 14 }}>{d}</span><span className="c-faint">→</span>
              </a>
            ))}
          </div>
        </Card>
        <Card className="s5" title="Architecture">
          <div className="flex flex-col gap-2">
            {[
              ['Sensor data', 'Temperature · ambient · door · cooling · time'],
              ['Validation and preprocessing', 'Missing values · noise · outliers'],
              ['Feature engineering', 'Rolling stats · rate of change · durations'],
              ['ML engine (Python)', 'Excursion classifier · anomaly detector · SHAP explainer'],
              ['FastAPI backend + PostgreSQL', 'REST endpoints for predictions, risk and alerts'],
              ['React dashboard', 'Trend charts · risk cards · explainable alerts'],
            ].map(([t, d], i, arr) => (
              <React.Fragment key={t}>
                <div className="note" style={{ padding: '12px 16px' }}><div style={{ fontSize: 15 }}>{t}</div><div className="c-muted" style={{ fontSize: 13.5 }}>{d}</div></div>
                {i < arr.length - 1 && <div className="c-faint" style={{ textAlign: 'center', lineHeight: 0.6 }} aria-hidden="true">↓</div>}
              </React.Fragment>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 16 }}>
            {['React', 'Vite', 'Tailwind CSS', 'Recharts', 'Python', 'FastAPI', 'PostgreSQL', 'Pandas', 'NumPy', 'scikit-learn', 'XGBoost', 'Isolation Forest', 'SHAP', 'GitHub', 'Docker'].map((t) => <Tag key={t} kind="line">{t}</Tag>)}
          </div>
        </Card>

        <Card className="s12" title="The model and how it will be judged">
          <div className="grid" style={{ gap: 24 }}>
            <div className="s5" style={{ fontSize: 15 }}>
              <p style={{ marginTop: 0 }}>This version runs on readings from a simulated sensor feed: a physical model of each fridge with a door, a thermostat and room temperature, so every scenario behaves realistically and repeatably.</p>
              <p>Risk comes from a rule-weighted logistic model over the engineered features. It is built to be swapped for a trained XGBoost or scikit-learn classifier with SHAP explanations without changing the website. It has not yet been trained or validated on real operational data.</p>
            </div>
            <div className="s7">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                {[['Precision and recall', 'Quality of excursion warnings'], ['False-alarm rate', 'Warnings with no excursion'], ['Missed-excursion rate', 'Excursions with no warning'], ['PR-AUC', 'Ranking quality on rare events'], ['Warning lead time', 'Notice before the limit is crossed']].map(([t, d]) => (
                  <div key={t} className="stat"><div style={{ fontSize: 15 }}>{t}</div><div className="c-muted" style={{ fontSize: 13.5, margin: '4px 0 10px' }}>{d}</div><Tag kind="line">Not evaluated yet</Tag></div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card className="s12" title="Roadmap">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {ROADMAP.map((p) => {
              const done = p.items.filter((x) => x[1]).length;
              return (
                <div key={p.phase} className="note flex flex-col gap-3" style={{ padding: 20 }}>
                  <div className="flex justify-between gap-2"><span className="label">{p.phase} · {p.scope}</span><Tag kind={done === p.items.length ? 'ok' : done ? 'warn' : 'line'}>{done === p.items.length ? 'Done' : done ? `${done} of ${p.items.length}` : 'Future'}</Tag></div>
                  <div style={{ fontSize: 20, letterSpacing: '-0.02em' }}>{p.title}</div>
                  <div className="flex flex-col gap-2" style={{ fontSize: 14 }}>
                    {p.items.map(([t, ok]) => <div key={t} className="flex gap-2">{ok ? <Check size={16} className="c-ok" style={{ flex: 'none', marginTop: 2 }} aria-label="done" /> : <CircleDashed size={16} className="c-faint" style={{ flex: 'none', marginTop: 2 }} aria-label="to do" />}<span className={ok ? '' : 'c-muted'}>{t}</span></div>)}
                  </div>
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, fontSize: 14 }}><span className="c-muted">{p.phase === 'Phase 3' ? 'Goal' : 'Deliverable'}: </span>{p.goal}</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="s6" title="Who benefits">
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
            {[[Hospital, 'Hospitals and pharmacies'], [Syringe, 'Vaccine storage and distribution'], [Truck, 'Cold-chain transport'], [FlaskConical, 'Laboratories'], [Apple, 'Food storage and distribution']].map(([I, t]) => (
              <div key={t} className="note flex flex-col gap-2" style={{ padding: 14 }}><I size={20} className="c-accent" aria-hidden="true" /><span style={{ fontSize: 14 }}>{t}</span></div>
            ))}
          </div>
          <div className="label" style={{ margin: '20px 0 8px' }}>Expected impact</div>
          <ul className="c-muted" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Earlier warnings and more time for preventive action</li>
            <li>Better visibility of storage conditions and abnormal patterns</li>
            <li>Fewer unnecessary alarms, and fewer avoidable losses</li>
          </ul>
        </Card>
        <Card className="s6" title="UN Sustainable Development Goals" sub="Intended contribution">
          <div className="rows">
            {[['3', 'Good health and well-being', 'Earlier warnings protect medicines and vaccines.', '#4c9f38'], ['2', 'Zero hunger', 'Less food lost in cold storage.', '#dda63a'], ['9', 'Industry, innovation and infrastructure', 'Predictive analytics for storage monitoring.', '#fd6925'], ['12', 'Responsible consumption and production', 'Fewer avoidable product losses.', '#bf8b2e']].map(([n, t, d, c]) => (
              <div className="row" key={n}>
                <span style={{ width: 44, height: 44, borderRadius: 12, background: c, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 500 }}>{n}</span>
                <span><span className="row-title block">SDG {n} · {t}</span><span className="row-sub block">{d}</span></span>
                <span />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <section className="night" id="presentation">
        <div className="night-grid" style={{ gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1.4fr)' }}>
          <div className="flex flex-col">
            <div className="agent"><AgentIcon />About the presentation</div>
            <h2 className="headline">The ColdGuard AI pitch deck</h2>
            <p className="lede">This website was built from the team’s eight-slide proposal for the hackathon. The deck sets out the problem, the proposed solution, the architecture, a dashboard mockup, the roadmap and how impact will be measured.</p>
            <div className="flex flex-col gap-3" style={{ marginTop: 24, fontSize: 14.5 }}>
              <div><span className="muted">Team</span><div>SkinAura · team leader Pranjal Kute</div></div>
              <div><span className="muted">Theme</span><div>Technology for Social Cause</div></div>
              <div><span className="muted">Format</span><div>8 slides, software-only prototype proposal</div></div>
            </div>
            <p className="lede" style={{ marginTop: 'auto', paddingTop: 24, fontSize: 14 }}>The deck’s dashboard slide used illustrative sample values (for example FR-02 at 6.8 °C with an 81% risk). Here the same four units are calculated live from their readings, so the numbers differ slightly.</p>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
            {SLIDES.map(([t, d], i) => (
              <li key={t} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr)', gap: 12, padding: '14px 0', borderTop: i ? '1px solid var(--night-line)' : 0 }}>
                <span className="num muted" style={{ fontSize: 13, paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</span>
                <span><span style={{ fontSize: 16 }}>{t}</span><span className="block muted" style={{ fontSize: 14, marginTop: 2 }}>{d}</span></span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
