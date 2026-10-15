import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { useStore, clock, fmtT, stamp } from '../lib/store.jsx';
import { PageHead, Panel, DemoTag, RiskBadge, Badge, Seg, Empty } from '../components/ui.jsx';
import { UnitCard } from '../components/blocks.jsx';

export default function Units() {
  const { units, settings, state, dispatch } = useStore();
  const [view, setView] = useState('table');
  const [type, setType] = useState('All');
  const types = ['All', ...new Set(units.map((u) => u.type))];
  const list = units.filter((u) => type === 'All' || u.type === type);

  return (
    <>
      <PageHead eyebrow="Storage units" title="Storage units" sub={`Configured units at ${settings.facility}. Limits and names can be changed in Settings; the model re-evaluates immediately.`} right={<><DemoTag /><a className="btn sm" href="#settings">Edit configuration</a></>} />
      <Panel
        title={<span className="flex items-center gap-2"><Building2 size={14} aria-hidden="true" />{settings.facility}</span>}
        note="Single facility in this prototype; the data model supports multiple facilities"
        right={<>
          <select className="select" id="unit-type" style={{ width: 'auto' }} value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by unit type">{types.map((t) => <option key={t}>{t}</option>)}</select>
          <Seg label="View" options={[{ value: 'table', label: 'Table' }, { value: 'cards', label: 'Cards' }]} value={view} onChange={setView} />
        </>}
      >
        {view === 'cards' ? <div className="unit-grid">{list.map((u) => <UnitCard key={u.id} u={u} />)}</div> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Unit</th><th>Type</th><th>Location</th><th className="num">Limits</th><th className="num">Temp</th><th className="num">Risk</th><th>Status</th><th>Anomaly</th><th>Data</th><th>Updated</th><th>Scenario (seed)</th></tr></thead>
              <tbody>
                {list.map((u) => {
                  const a = u.assessment;
                  return (
                    <tr key={u.id} className="clickable" onClick={() => { window.location.hash = `monitor-${u.id}`; }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') window.location.hash = `monitor-${u.id}`; }}>
                      <td><b className="mono">{u.id}</b><div className="c-muted">{u.name}</div></td>
                      <td>{u.type}</td>
                      <td>{u.location}</td>
                      <td className="num mono">{u.lower.toFixed(1)}–{u.upper.toFixed(1)}°C</td>
                      <td className="num mono">{fmtT(a.features.temp)}</td>
                      <td className="num"><span className="mono" style={{ marginRight: 6 }}>{a.probability}%</span><RiskBadge cat={a.category} /></td>
                      <td>{a.status}</td>
                      <td><Badge kind={a.anomaly.status === 'Normal' ? 'low' : a.anomaly.status === 'Unusual' ? 'medium' : 'high'}>{a.anomaly.status}</Badge></td>
                      <td><Badge kind={a.quality.level === 'Good' ? 'low' : a.quality.level === 'Fair' ? 'medium' : 'high'}>{a.quality.level}</Badge></td>
                      <td className="mono">{clock(u.lastReadingM)}</td>
                      <td className="c-muted">{u.simulated ? 'Simulator run' : u.scenario}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
      <Panel title="Preventive actions by unit" note="Recorded in this browser (demo storage)">
        {state.actions.length === 0 ? <Empty>No actions recorded yet. Record one from a unit's monitoring page or an alert.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>When</th><th>Unit</th><th>Action</th><th>Note</th><th>Alert</th><th>By</th><th>Status</th></tr></thead>
              <tbody>
                {state.actions.map((x) => (
                  <tr key={x.id}>
                    <td className="mono">{stamp(x.at)}</td><td className="mono">{x.unitId}</td><td>{x.action}</td><td className="c-muted">{x.note || '—'}</td><td className="mono c-muted">{x.alertId || '—'}</td><td>{x.by}</td>
                    <td><button className={`btn sm ${x.status === 'done' ? '' : 'primary'}`} onClick={() => dispatch({ type: 'actionStatus', id: x.id, status: x.status === 'done' ? 'planned' : 'done' })}>{x.status === 'done' ? 'Done ✓' : 'Mark done'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
