import React, { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { useStore, clock, stamp, riskClass, alertTime } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, Seg, UnitPicker, RiskBadge, Empty, Badge } from '../components/ui.jsx';
import { UnitCard, RiskSummary, WarningBanner, ActionForm } from '../components/blocks.jsx';
import { ForecastChart } from '../components/charts.jsx';
import { attentionItems } from '../lib/derive.js';

const RISK_ORDER = { High: 0, Medium: 1, Low: 2 };

export default function Overview() {
  const { units, alerts, state, dispatch, toast, selectedUnit, setSelectedUnit, sim, setSim, settings } = useStore();
  const [sort, setSort] = useState('risk');
  const [riskFilter, setRiskFilter] = useState('All');
  const [q, setQ] = useState('');
  const [recordFor, setRecordFor] = useState(null);
  const u = units.find((x) => x.id === selectedUnit) || units[0];

  const counts = { Low: 0, Medium: 0, High: 0 };
  units.forEach((x) => counts[x.assessment.category]++);
  const activeWarnings = alerts.filter((a) => a.condition === 'active' && !['resolved', 'dismissed'].includes(a.workflow.status)).length;
  const excursions24 = units.reduce((n, x) => n + x.excursions.length, 0);

  const shown = useMemo(() => {
    let list = units.filter((x) => riskFilter === 'All' || x.assessment.category === riskFilter);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((x) => `${x.id} ${x.name} ${x.location} ${x.type}`.toLowerCase().includes(s));
    const by = {
      risk: (a, b) => RISK_ORDER[a.assessment.category] - RISK_ORDER[b.assessment.category] || b.assessment.probability - a.assessment.probability,
      temp: (a, b) => b.assessment.features.temp - a.assessment.features.temp,
      location: (a, b) => a.location.localeCompare(b.location),
      type: (a, b) => a.type.localeCompare(b.type),
    }[sort];
    return [...list].sort(by);
  }, [units, sort, riskFilter, q]);

  const items = attentionItems(units, alerts, state.actions).filter((i) => i.kind !== 'task' && i.kind !== 'ack').slice(0, 7);
  const top = [...units].sort((a, b) => b.assessment.probability - a.assessment.probability)[0];

  // timeline: user actions + explicitly simulated events (alerts from synthetic history, latest readings)
  const events = [
    ...state.activity.map((e) => ({ at: e.at, text: e.text, kind: e.type, src: 'You' })),
    ...alerts.map((a) => ({ at: alertTime(a), text: `Early warning generated for ${a.unitId} (${a.severity}, ${a.probability}%)`, kind: 'warning', src: a.source === 'Simulator' ? 'Simulator' : 'Simulated' })),
    ...units.map((x) => ({ at: Date.now() - 1, sortAt: alertTime({ m: x.lastReadingM }), text: `Reading received from ${x.id}: ${x.assessment.features.temp.toFixed(1)}°C`, kind: 'reading', src: x.simulated ? 'Simulator' : 'Simulated' })),
  ].map((e) => ({ ...e, sortAt: e.sortAt ?? e.at })).sort((a, b) => b.sortAt - a.sortAt).slice(0, 12);

  return (
    <>
      <PageHead
        eyebrow="Command center"
        title="Cold-storage overview"
        sub={`${settings.facility} · ${units.length} storage units · risk evaluated for the next ${settings.horizon} minutes. All readings on this page are synthetic demonstration data.`}
        right={<>
          <DemoTag />
          <button className="btn sm" onClick={() => { dispatch({ type: 'reset' }); setSim({ ...sim, attached: false, running: false, state: null }); toast('Demo data and simulation reset to seed values'); }}><RotateCcw size={14} aria-hidden="true" />Reset demo data</button>
        </>}
      />

      <div className="stats">
        <Stat label="Units monitored" value={units.length} foot="1 facility" />
        <Stat label="Low risk" value={counts.Low} cls="c-low" foot={`< ${settings.bands.medium}% probability`} />
        <Stat label="Medium risk" value={counts.Medium} cls="c-medium" foot={`${settings.bands.medium}–${settings.bands.high - 1}%`} />
        <Stat label="High risk" value={counts.High} cls="c-high" foot={`≥ ${settings.bands.high}%`} />
        <Stat label="Active early warnings" value={activeWarnings} cls={activeWarnings ? 'c-high' : ''} foot="open, not resolved" />
        <Stat label="Excursions (24 h)" value={excursions24} foot="simulated history" />
      </div>

      {settings.prefs.alertBanner && top && top.assessment.category === 'High' && <WarningBanner u={top} onRecord={() => setRecordFor(top.id)} />}
      {recordFor && (
        <Panel title={`Record preventive action · ${recordFor}`} right={<button className="btn ghost sm" onClick={() => setRecordFor(null)}>Close</button>}>
          <ActionForm unitId={recordFor} alertId={alerts.find((a) => a.unitId === recordFor && a.condition === 'active')?.id} onDone={() => setRecordFor(null)} />
        </Panel>
      )}

      <Panel
        title="Storage units"
        note="Illustrative starting values from the presentation, recomputed by the demo model"
        right={<>
          <label className="flex items-center gap-2 raised" style={{ padding: '3px 8px' }}>
            <Search size={14} className="c-muted" aria-hidden="true" />
            <input id="unit-search" className="input" style={{ border: 0, padding: '3px 0', background: 'transparent', width: 130 }} placeholder="Search units" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search units" />
          </label>
          <Seg label="Risk filter" options={['All', 'High', 'Medium', 'Low']} value={riskFilter} onChange={setRiskFilter} />
          <select className="select" id="unit-sort" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort units">
            <option value="risk">Sort: risk</option><option value="temp">Sort: temperature</option><option value="location">Sort: location</option><option value="type">Sort: unit type</option>
          </select>
        </>}
      >
        {shown.length ? <div className="unit-grid">{shown.map((x) => <UnitCard key={x.id} u={x} />)}</div> : <Empty>No units match these filters.</Empty>}
      </Panel>

      <div className="grid-12">
        <Panel className="span-7" title={`Temperature trend · ${u.id}`} note={`Last 60 min measured + ${settings.horizon}-min forecast`} right={<UnitPicker value={u.id} onChange={setSelectedUnit} />}>
          <ForecastChart unit={u} />
        </Panel>
        <Panel className="span-5" title={`AI risk assessment · ${u.id}`} right={<a className="btn sm" href={`#risk-${u.id}`}>Full assessment</a>}>
          <RiskSummary u={u} compact />
        </Panel>

        <Panel className="span-7" title="Needs attention" note="Ranked by urgency" right={<a className="btn sm" href="#alerts">Action queue</a>}>
          {items.length === 0 ? <Empty>Nothing needs attention right now.</Empty> : (
            <div className="flex flex-col gap-2">
              {items.map((i) => (
                <div key={i.key} className="raised flex gap-3" style={{ padding: '10px 12px' }}>
                  <span className="sev" style={{ background: i.urgency === 'High' ? 'var(--coral)' : i.urgency === 'Medium' ? 'var(--amber)' : i.urgency === 'Info' ? 'var(--teal)' : 'var(--neon-dim)' }} aria-hidden="true" />
                  <div className="min-w-0" style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="mono">{i.unitId}</b>
                      <span style={{ fontWeight: 600 }}>{i.title}</span>
                      {i.urgency === 'Info' ? <Badge kind="info">Info</Badge> : <RiskBadge cat={i.urgency === 'Low' ? 'Low' : i.urgency} label={`${i.urgency} urgency`} />}
                    </div>
                    <div className="c-muted" style={{ fontSize: 12.5, marginTop: 3 }}>{i.why}</div>
                    <div style={{ fontSize: 12.5, marginTop: 3 }}><span className="c-low">Recommended:</span> {i.action}</div>
                  </div>
                  <a className="btn sm" href={`#monitor-${i.unitId}`} style={{ alignSelf: 'center' }}>View</a>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel className="span-5" title="System activity" note="Your actions and simulated events">
          <div className="timeline">
            {events.map((e, i) => (
              <div className="tl-item" key={i}>
                <span className="mono c-faint" style={{ fontSize: 11.5 }}>{new Date(e.sortAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                <span className="tl-dot" style={{ borderColor: e.kind === 'warning' ? 'var(--amber)' : e.src === 'You' ? 'var(--teal)' : 'var(--neon-dim)' }} aria-hidden="true" />
                <span>{e.text} <span className="c-faint">· {e.src}</span></span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

function Stat({ label, value, foot, cls = '' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${cls}`}>{value}</span>
      {foot && <span className="stat-foot">{foot}</span>}
    </div>
  );
}
