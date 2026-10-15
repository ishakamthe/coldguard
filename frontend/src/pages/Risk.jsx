import React from 'react';
import { useStore, fmtT, riskClass } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, UnitPicker, RiskBadge, Badge, KV } from '../components/ui.jsx';
import { RiskSummary } from '../components/blocks.jsx';

export default function Risk() {
  const { unit, selectedUnit, setSelectedUnit } = useStore();
  const u = unit(selectedUnit);
  const a = u.assessment;
  const f = a.features;
  const an = a.anomaly;
  const trend = f.slope15 > 0.02 ? `Rising ${(f.slope15 * 60).toFixed(1)}°C/h` : f.slope15 < -0.02 ? `Falling ${(-f.slope15 * 60).toFixed(1)}°C/h` : 'Stable';

  return (
    <>
      <PageHead
        eyebrow="AI risk assessment"
        title={`Risk assessment · ${u.id} ${u.name}`}
        sub="Probability of a temperature excursion within the forecast window, kept separate from the anomaly score. Produced by a deterministic demo model; the same data always gives the same result."
        right={<><DemoTag>Prototype model</DemoTag><UnitPicker value={u.id} onChange={setSelectedUnit} /></>}
      />
      <div className="grid-12">
        <Panel className="span-5" title="Excursion probability">
          <RiskSummary u={u} />
        </Panel>
        <div className="span-7 flex flex-col gap-4">
          <div className={`alert-box ${riskClass(a.category)}`}>
            <div className="panel-title" style={{ marginBottom: 6 }}>Explanation</div>
            <p style={{ margin: '0 0 8px' }}>{a.explanation}</p>
            <p style={{ margin: 0 }}><b className="c-low">Suggested action:</b> {a.action}</p>
          </div>
          <Panel title="Assessment details">
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <KV items={[
                ['Current temperature', fmtT(f.temp)],
                ['Temperature limit', `${u.lower.toFixed(1)}–${u.upper.toFixed(1)}°C`],
                ['Forecast trend', trend],
                ['Forecast peak (window)', `${a.forecast.peak.toFixed(1)}°C`],
                ['Prediction window', `${a.horizon} min`],
              ]} />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="c-muted" style={{ fontSize: 12.5 }}>Anomaly status</span>
                  <Badge kind={an.status === 'Normal' ? 'low' : an.status === 'Unusual' ? 'medium' : 'high'}>{an.status}</Badge>
                  <span className="mono c-muted">score {an.score}</span>
                </div>
                <div className="c-muted" style={{ fontSize: 12.5 }}>{an.reasons.length ? an.reasons.join('. ') + '.' : 'No unusual pattern detected.'}</div>
                <div className="c-faint" style={{ fontSize: 11.5 }}>An anomaly is not a prediction that an excursion will happen. Prototype rules stand in for the planned Isolation Forest detector.</div>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <Panel title="How an alert is decided" note="Proposed logic from the presentation, evaluated on this unit now">
        <div className="decision">
          <div className={`dnode ${a.decision !== 'stable' ? 'on' : ''}`}>Temperature rises<br /><span className="c-muted">e.g. door opened, cooling stopped</span></div>
          <div className="diamond"><span>Recovering<br />as expected?</span></div>
          <div className="flex flex-col gap-3">
            <div className={`dnode ${a.decision === 'recovering' || a.decision === 'stable' ? 'on' : ''}`}><b className="c-low">Yes</b> · Normal recovery, keep monitoring</div>
            <div className={`dnode warn ${a.decision === 'warning' || a.decision === 'excursion' ? 'on' : ''}`}><b className="c-high">No</b> · Early warning + likely reasons</div>
          </div>
        </div>
        <p className="c-muted" style={{ fontSize: 12.5, marginTop: 12 }}>
          Current path: <b>{{ stable: 'No disturbance detected (stable cycling).', recovering: 'Disturbance detected, recovering as expected.', warning: 'Disturbance detected and not recovering: early warning raised.', excursion: 'Limit already crossed: excursion in progress.' }[a.decision]}</b>
        </p>
      </Panel>

      <div className="grid-12">
        <Panel className="span-6" title="Engineered features" note="Computed only from readings up to the snapshot">
          <div className="table-wrap">
            <table className="t">
              <tbody>
                {[
                  ['Rate of change (15 min)', `${(f.slope15 * 60).toFixed(2)} °C/h`],
                  ['Trend (60 min)', `${(f.slope60 * 60).toFixed(2)} °C/h`],
                  ['Rolling mean / std (30 min)', `${f.mean30.toFixed(2)} °C / ${f.std30.toFixed(3)}`],
                  ['Rolling min / max (30 min)', `${f.min30.toFixed(2)} / ${f.max30.toFixed(2)} °C`],
                  ['6-hour baseline', `${f.mean6h.toFixed(2)} °C`],
                  ['Margin to upper limit', `${f.marginUpper.toFixed(2)} °C`],
                  ['Minutes near limit (≥ limit−1°C, 60 min)', f.nearLimitMin],
                  ['Cooling inactive for', `${f.coolingOffMin} min (${f.overdueMin} above cut-in)`],
                  ['Cooling running for', `${f.coolingOnMin} min`],
                  ['Door openings (60 min)', f.doorEvents60],
                  ['Minutes since door opened', f.minutesSinceDoor === Infinity ? '> 24 h' : f.minutesSinceDoor],
                  ['Ambient temperature', `${f.ambient.toFixed(1)} °C`],
                ].map(([k, v]) => <tr key={k}><td className="c-muted">{k}</td><td className="num mono">{v}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel className="span-6" title="About this model" note={a.model}>
          <div className="flex flex-col gap-2 c-muted" style={{ fontSize: 13 }}>
            <p style={{ margin: 0 }}>The probability is a logistic function of hand-weighted feature contributions: <span className="mono">p = 1 / (1 + e^-(bias + Σ contributions))</span>. Each bar in the factor chart is one contribution, so the explanation is tied directly to the inputs.</p>
            <p style={{ margin: 0 }}>These weights were set by hand to behave sensibly on the synthetic scenarios. They have not been trained or evaluated on labelled data. The planned replacement is a scikit-learn or XGBoost classifier with SHAP explanations, served through the same <span className="mono">/api/units/&#123;id&#125;/risk</span> response shape.</p>
            <p style={{ margin: 0 }}>Risk bands are configurable in Settings. If a reading is already outside the limits, the page reports an excursion in progress instead of a prediction.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}
