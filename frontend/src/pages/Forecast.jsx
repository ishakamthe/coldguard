import React, { useState } from 'react';
import { useStore, clock, fmtT, riskClass } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, UnitPicker, RiskBadge, KV } from '../components/ui.jsx';
import { ForecastChart } from '../components/charts.jsx';

const MODE_TEXT = {
  'cooling-inactive': 'Cooling looks stopped. The forecast assumes it stays off, so temperature drifts toward ambient at the rate observed in the last 15 minutes.',
  degradation: 'Temperature is rising while cooling runs. The forecast extends the recent upward slope.',
  'door-open': 'The door is open. The forecast assumes it closes soon and the unit pulls back toward its 6-hour average.',
  recovery: 'The unit is recovering from a disturbance. The forecast follows the pull back toward its normal band.',
  normal: 'Normal thermostat cycling. The forecast stays near the 6-hour average.',
};

export default function Forecast() {
  const { unit, selectedUnit, setSelectedUnit, settings } = useStore();
  const u = unit(selectedUnit);
  const [past, setPast] = useState(60);
  const a = u.assessment;
  const fc = a.forecast;
  const lead = fc.crossing && u.warningM != null ? fc.crossing.m - u.warningM : null;

  return (
    <>
      <PageHead
        eyebrow="Temperature forecast"
        title={`Forecast and trend · ${u.id}`}
        sub="Measured readings and a short-range prediction. The forecast is a physics-informed extrapolation used by the demo; it is not a trained model and it is never certain."
        right={<><DemoTag /><UnitPicker value={u.id} onChange={setSelectedUnit} /></>}
      />
      <Panel
        title={`${u.name} · last ${past} min + next ${settings.horizon} min`}
        right={<Seg label="History shown" options={[{ value: 30, label: '30 min' }, { value: 60, label: '60 min' }, { value: 120, label: '2 h' }]} value={past} onChange={setPast} />}
      >
        <ForecastChart unit={u} past={past} height={380} />
      </Panel>
      <div className="grid-12">
        <Panel className="span-4" title="Forecast summary">
          <KV items={[
            ['Current', fmtT(a.features.temp)],
            ['Forecast peak', `${fc.peak.toFixed(1)}°C`],
            ['At +' + settings.horizon + ' min', `${fc.points[fc.points.length - 1].temp.toFixed(1)}°C`],
            ['Upper limit', `${u.upper.toFixed(1)}°C`],
            ['Predicted crossing', fc.crossing ? `~${clock(fc.crossing.m)} (in ${fc.crossing.m} min)` : 'None in window'],
            ['Early warning raised', u.warningM != null ? clock(u.warningM) : 'No'],
            ['Warning lead time', lead != null ? `~${lead} min (estimate)` : '—'],
          ]} />
        </Panel>
        <Panel className="span-4" title="How this forecast was made">
          <p className="c-muted" style={{ margin: 0, fontSize: 13 }}>{MODE_TEXT[fc.mode]}</p>
          <p className="c-faint" style={{ fontSize: 12, marginTop: 8 }}>Mode: <span className="mono">{fc.mode}</span>. The shaded range widens with time to show growing uncertainty.</p>
        </Panel>
        <Panel className="span-4" title="Risk for this window">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={`big-temp c-${riskClass(a.category)}`}>{a.probability}%</span>
            <RiskBadge cat={a.category} />
          </div>
          <p className="c-muted" style={{ fontSize: 13 }}>{fc.crossing ? 'The forecast reaches a limit inside the window, which raises the excursion probability.' : 'The forecast stays inside the limits for this window. No crossing is shown because none is predicted.'}</p>
          <a className="btn sm" href={`#risk-${u.id}`}>Open risk assessment</a>
        </Panel>
      </div>
    </>
  );
}
