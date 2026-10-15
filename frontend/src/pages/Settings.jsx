import React, { useState } from 'react';
import { Save, Undo2, RotateCcw, PlugZap } from 'lucide-react';
import { useStore, DEFAULT_SETTINGS, E } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { Head, Card, Field, Switch, Tabs, Tag, KV } from '../components/ui.jsx';

function errorsFor(d) {
  const e = {};
  if (!d.facility.trim()) e.facility = 'Enter a facility name.';
  E.UNITS.forEach((u) => {
    const c = { ...u, ...(d.units[u.id] || {}) };
    if (!String(c.name).trim()) e[`${u.id}.name`] = 'Name required.';
    if (!Number.isFinite(+c.lower) || !Number.isFinite(+c.upper)) e[`${u.id}.lim`] = 'Limits must be numbers.';
    else if (+c.lower >= +c.upper) e[`${u.id}.lim`] = 'Lower must be below upper.';
    else if (+c.upper - +c.lower < 1) e[`${u.id}.lim`] = 'Keep at least 1 °C between limits.';
    else if (+c.lower < -40 || +c.upper > 30) e[`${u.id}.lim`] = 'Use −40 to 30 °C.';
    else if (+c.upper <= c.cutIn) e[`${u.id}.lim`] = `Upper must be above the thermostat (${c.cutIn} °C).`;
  });
  const { medium, high } = d.bands;
  if (!(medium > 0 && high > medium && high < 100)) e.bands = 'Use 0 < Medium < High < 100.';
  return e;
}

export default function Settings() {
  const { settings, dispatch, toast, backend, setBackend } = useStore();
  const [d, setD] = useState(settings);
  const errs = errorsFor(d);
  const dirty = JSON.stringify(d) !== JSON.stringify(settings);
  const setUnit = (id, k, v) => setD({ ...d, units: { ...d.units, [id]: { ...(d.units[id] || {}), [k]: v } } });
  const pref = (k, v) => setD({ ...d, prefs: { ...d.prefs, [k]: v } });
  const save = () => {
    if (Object.keys(errs).length) { toast('Check the highlighted fields', 'error'); return; }
    const units = Object.fromEntries(Object.entries(d.units).map(([id, c]) => [id, { ...c, ...(c.lower !== undefined ? { lower: +c.lower } : {}), ...(c.upper !== undefined ? { upper: +c.upper } : {}) }]));
    dispatch({ type: 'settings', settings: { ...d, units } });
    toast('Settings saved', 'ok', 'Risk, charts and alerts were recalculated');
  };
  const test = async () => {
    if (!api.configured) { toast('No server configured', 'error', 'Set VITE_API_URL when building the app to connect the FastAPI service.'); return; }
    setBackend({ status: 'checking' });
    try { await api.health(); setBackend({ status: 'online' }); toast('Server connected'); } catch (e) { setBackend({ status: 'offline', error: e.message }); toast('Server unreachable', 'error', e.message); }
  };

  return (
    <>
      <Head eyebrow="Settings" title="Configuration" sub="Limits and risk thresholds apply as soon as you save."
        right={<>
          <button className="btn ghost" disabled={!dirty} onClick={() => setD(settings)}><Undo2 size={16} aria-hidden="true" />Discard</button>
          <button className="btn dark" disabled={!dirty} onClick={save}><Save size={16} aria-hidden="true" />Save changes</button>
        </>} />
      <div className="grid enter">
        <Card className="s6" title="Facility and forecasting">
          <div className="flex flex-col gap-4">
            <Field label="Facility name" error={errs.facility}><input className={`input ${errs.facility ? 'invalid' : ''}`} id="set-facility" value={d.facility} onChange={(e) => setD({ ...d, facility: e.target.value })} /></Field>
            <Field label="Forecast window" hint="How far ahead risk is estimated"><Tabs label="Forecast window" value={d.horizon} onChange={(v) => setD({ ...d, horizon: v })} options={[{ value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '60 min' }]} /></Field>
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Medium risk from (%)"><input className={`input ${errs.bands ? 'invalid' : ''}`} id="set-med" type="number" min="1" max="98" value={d.bands.medium} onChange={(e) => setD({ ...d, bands: { ...d.bands, medium: +e.target.value } })} /></Field>
              <Field label="High risk from (%)" error={errs.bands}><input className={`input ${errs.bands ? 'invalid' : ''}`} id="set-high" type="number" min="2" max="99" value={d.bands.high} onChange={(e) => setD({ ...d, bands: { ...d.bands, high: +e.target.value } })} /></Field>
            </div>
          </div>
        </Card>
        <Card className="s6" title="Alerts and reports">
          <div className="flex flex-col gap-4">
            <Switch id="pref-subsided" on={d.prefs.showSubsided} onChange={(v) => pref('showSubsided', v)} label="Keep unacknowledged alerts in the open list after risk eases" />
            <Switch id="rep-readings" on={d.report.includeReadings} onChange={(v) => setD({ ...d, report: { ...d.report, includeReadings: v } })} label="Include latest readings in reports" />
            <Switch id="rep-forecast" on={d.report.includeForecast} onChange={(v) => setD({ ...d, report: { ...d.report, includeForecast: v } })} label="Include the forecast in reports" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Your name"><input className="input" id="rep-author" value={d.report.author} onChange={(e) => setD({ ...d, report: { ...d.report, author: e.target.value } })} /></Field>
              <Field label="Team or organisation"><input className="input" id="rep-org" value={d.report.organisation} onChange={(e) => setD({ ...d, report: { ...d.report, organisation: e.target.value } })} /></Field>
            </div>
          </div>
        </Card>

        <Card className="s12" title="Storage units" sub="Thermostat points are fixed by each unit and shown for reference">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Unit</th><th>Name</th><th>Type</th><th>Location</th><th>Lower °C</th><th>Upper °C</th><th>Thermostat</th></tr></thead>
              <tbody>
                {E.UNITS.map((u) => {
                  const c = { ...u, ...(d.units[u.id] || {}) };
                  const le = errs[`${u.id}.lim`];
                  return (
                    <tr key={u.id}>
                      <td style={{ paddingTop: 20 }}><Tag kind="dark">{u.id}</Tag></td>
                      <td><input className={`input ${errs[`${u.id}.name`] ? 'invalid' : ''}`} id={`u-${u.id}-name`} value={c.name} onChange={(e) => setUnit(u.id, 'name', e.target.value)} aria-label={`${u.id} name`} /></td>
                      <td><select className="select" id={`u-${u.id}-type`} value={c.type} onChange={(e) => setUnit(u.id, 'type', e.target.value)} aria-label={`${u.id} type`}>{['Vaccine refrigerator', 'Pharmacy refrigerator', 'Laboratory refrigerator', 'Walk-in cold room', 'Food storage', 'Transport container'].map((t) => <option key={t}>{t}</option>)}</select></td>
                      <td><input className="input" id={`u-${u.id}-loc`} value={c.location} onChange={(e) => setUnit(u.id, 'location', e.target.value)} aria-label={`${u.id} location`} /></td>
                      <td><input className={`input ${le ? 'invalid' : ''}`} id={`u-${u.id}-lo`} type="number" step="0.5" value={c.lower} onChange={(e) => setUnit(u.id, 'lower', e.target.value)} aria-label={`${u.id} lower limit`} style={{ width: 90 }} /></td>
                      <td><input className={`input ${le ? 'invalid' : ''}`} id={`u-${u.id}-hi`} type="number" step="0.5" value={c.upper} onChange={(e) => setUnit(u.id, 'upper', e.target.value)} aria-label={`${u.id} upper limit`} style={{ width: 90 }} />{le && <div className="c-crit" style={{ fontSize: 12.5, marginTop: 4 }}>{le}</div>}</td>
                      <td className="num c-muted" style={{ paddingTop: 20 }}>{u.cutOut}–{u.cutIn} °C</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="s6" title="Data source">
          <KV items={[
            ['Readings', 'Simulated sensor feed, 1 per minute'],
            ['Risk model', 'Rule-weighted logistic model'],
            ['Server', <Tag key="s" kind={backend.status === 'online' ? 'ok' : backend.status === 'offline' ? 'crit' : 'line'}>{{ online: 'Connected', offline: 'Unreachable', checking: 'Checking', 'not-configured': 'Running in browser' }[backend.status]}</Tag>],
          ]} />
          <button className="btn" style={{ marginTop: 14 }} onClick={test}><PlugZap size={16} aria-hidden="true" />Test server connection</button>
        </Card>
        <Card className="s6" title="Reset">
          <p className="c-muted" style={{ margin: '0 0 14px' }}>Clears alert progress, recorded actions, imported files and settings on this device, and restores the default units.</p>
          <div className="flex gap-2 flex-wrap">
            <button className="btn" onClick={() => setD(DEFAULT_SETTINGS)}>Load default settings</button>
            <button className="btn danger" onClick={() => { dispatch({ type: 'reset' }); setD(DEFAULT_SETTINGS); toast('Data reset to defaults'); }}><RotateCcw size={16} aria-hidden="true" />Reset all data</button>
          </div>
        </Card>
      </div>
    </>
  );
}
