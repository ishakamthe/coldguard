import React, { useState } from 'react';
import { Save, Undo2, RotateCcw, PlugZap } from 'lucide-react';
import { useStore, DEFAULT_SETTINGS, E } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { PageHead, Panel, Field, Toggle, Seg, Badge } from '../components/ui.jsx';

function errorsFor(d) {
  const e = {};
  if (!d.facility.trim()) e.facility = 'Facility name is required.';
  E.UNITS.forEach((u) => {
    const c = { ...u, ...(d.units[u.id] || {}) };
    if (!String(c.name).trim()) e[`${u.id}.name`] = 'Name is required.';
    if (!Number.isFinite(+c.lower) || !Number.isFinite(+c.upper)) e[`${u.id}.lim`] = 'Limits must be numbers.';
    else if (+c.lower >= +c.upper) e[`${u.id}.lim`] = 'Lower limit must be below the upper limit.';
    else if (+c.upper - +c.lower < 1) e[`${u.id}.lim`] = 'Keep at least 1°C between limits.';
    else if (+c.lower < -40 || +c.upper > 30) e[`${u.id}.lim`] = 'Limits must be within −40 to 30°C.';
    else if (+c.upper <= c.cutIn) e[`${u.id}.lim`] = `Upper limit must be above the thermostat cut-in (${c.cutIn}°C).`;
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
  const save = () => {
    if (Object.keys(errs).length) { toast('Fix the highlighted fields before saving.', 'error'); return; }
    const units = Object.fromEntries(Object.entries(d.units).map(([id, c]) => [id, { ...c, ...(c.lower !== undefined ? { lower: +c.lower } : {}), ...(c.upper !== undefined ? { upper: +c.upper } : {}) }]));
    dispatch({ type: 'settings', settings: { ...d, units }, note: 'Settings saved; risk re-evaluated' });
    toast('Settings saved. Charts, risk and alerts were re-evaluated.');
  };
  const testBackend = async () => {
    if (!api.configured) { toast('No backend configured. Set VITE_API_URL when running the frontend locally.', 'error'); return; }
    setBackend({ status: 'checking' });
    try { const h = await api.health(); setBackend({ status: 'online', info: h }); toast(`Backend online · ${h.data?.model || 'ok'}`); }
    catch (e) { setBackend({ status: 'offline', error: e.message }); toast(`Backend unreachable: ${e.message}`, 'error'); }
  };

  return (
    <>
      <PageHead eyebrow="Settings" title="Configuration" sub="Changes apply when you save. Settings are stored in this browser for the demo; the backend keeps the same fields in the unit_configs table."
        right={<>
          <button className="btn sm" disabled={!dirty} onClick={() => setD(settings)}><Undo2 size={14} aria-hidden="true" />Discard changes</button>
          <button className="btn primary sm" disabled={!dirty} onClick={save}><Save size={14} aria-hidden="true" />Save settings</button>
        </>} />

      <div className="grid-12">
        <Panel className="span-6" title="Facility & forecasting">
          <div className="flex flex-col gap-3">
            <Field label="Facility name" error={errs.facility}><input className={`input ${errs.facility ? 'invalid' : ''}`} id="set-facility" value={d.facility} onChange={(e) => setD({ ...d, facility: e.target.value })} /></Field>
            <Field label="Forecast window" hint="Prediction horizon used for probability, forecast and alerts"><Seg label="Forecast window" options={[{ value: 15, label: '15 min' }, { value: 30, label: '30 min' }, { value: 60, label: '60 min' }]} value={d.horizon} onChange={(v) => setD({ ...d, horizon: v })} /></Field>
            <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <Field label="Medium risk from (%)"><input className={`input ${errs.bands ? 'invalid' : ''}`} id="set-med" type="number" min="1" max="98" value={d.bands.medium} onChange={(e) => setD({ ...d, bands: { ...d.bands, medium: +e.target.value } })} /></Field>
              <Field label="High risk from (%)" error={errs.bands}><input className={`input ${errs.bands ? 'invalid' : ''}`} id="set-high" type="number" min="2" max="99" value={d.bands.high} onChange={(e) => setD({ ...d, bands: { ...d.bands, high: +e.target.value } })} /></Field>
            </div>
          </div>
        </Panel>
        <Panel className="span-6" title="Monitoring & display preferences">
          <div className="flex flex-col gap-3">
            <Toggle id="pref-banner" on={d.prefs.alertBanner} onChange={(v) => setD({ ...d, prefs: { ...d.prefs, alertBanner: v } })} label="Show high-risk banner on Overview" />
            <Toggle id="pref-compact" on={d.prefs.compactCards} onChange={(v) => setD({ ...d, prefs: { ...d.prefs, compactCards: v } })} label="Compact unit cards" />
            <Toggle id="pref-dismissed" on={d.prefs.showDismissed} onChange={(v) => setD({ ...d, prefs: { ...d.prefs, showDismissed: v } })} label="Show dismissed alerts in the open list" />
            <Toggle id="pref-subsided" on={d.prefs.showSubsided} onChange={(v) => setD({ ...d, prefs: { ...d.prefs, showSubsided: v } })} label="Show unacknowledged alerts whose risk has subsided" />
            <Field label="Data refresh" hint="Demo data is a fixed snapshot; real refresh needs live sensor ingestion (Phase 3)">
              <select className="select" id="pref-refresh" value={d.prefs.refresh} onChange={(e) => setD({ ...d, prefs: { ...d.prefs, refresh: e.target.value } })}>
                <option value="manual">Manual (snapshot)</option><option value="60s" disabled>Every 60 s (needs live data)</option>
              </select>
            </Field>
          </div>
        </Panel>

        <Panel className="span-12" title="Storage units" note="Thermostat cut-in/out points are part of the seed data and shown for reference">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Location</th><th>Lower °C</th><th>Upper °C</th><th>Thermostat</th></tr></thead>
              <tbody>
                {E.UNITS.map((u) => {
                  const c = { ...u, ...(d.units[u.id] || {}) };
                  const le = errs[`${u.id}.lim`];
                  return (
                    <tr key={u.id}>
                      <td className="mono">{u.id}</td>
                      <td><input className={`input ${errs[`${u.id}.name`] ? 'invalid' : ''}`} id={`u-${u.id}-name`} value={c.name} onChange={(e) => setUnit(u.id, 'name', e.target.value)} aria-label={`${u.id} name`} /></td>
                      <td><select className="select" id={`u-${u.id}-type`} value={c.type} onChange={(e) => setUnit(u.id, 'type', e.target.value)} aria-label={`${u.id} type`}>{['Vaccine refrigerator', 'Pharmacy refrigerator', 'Laboratory refrigerator', 'Walk-in cold room', 'Food storage', 'Transport container'].map((t) => <option key={t}>{t}</option>)}</select></td>
                      <td><input className="input" id={`u-${u.id}-loc`} value={c.location} onChange={(e) => setUnit(u.id, 'location', e.target.value)} aria-label={`${u.id} location`} /></td>
                      <td><input className={`input ${le ? 'invalid' : ''}`} id={`u-${u.id}-lo`} type="number" step="0.5" value={c.lower} onChange={(e) => setUnit(u.id, 'lower', e.target.value)} aria-label={`${u.id} lower limit`} style={{ width: 80 }} /></td>
                      <td><input className={`input ${le ? 'invalid' : ''}`} id={`u-${u.id}-hi`} type="number" step="0.5" value={c.upper} onChange={(e) => setUnit(u.id, 'upper', e.target.value)} aria-label={`${u.id} upper limit`} style={{ width: 80 }} />{le && <div className="c-high" style={{ fontSize: 11.5 }}>{le}</div>}</td>
                      <td className="mono c-muted">{u.cutOut}–{u.cutIn}°C</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="span-6" title="Report settings">
          <div className="flex flex-col gap-3">
            <Field label="Prepared by"><input className="input" id="rep-author" value={d.report.author} onChange={(e) => setD({ ...d, report: { ...d.report, author: e.target.value } })} /></Field>
            <Field label="Organisation"><input className="input" id="rep-org" value={d.report.organisation} onChange={(e) => setD({ ...d, report: { ...d.report, organisation: e.target.value } })} /></Field>
            <Toggle id="rep-readings" on={d.report.includeReadings} onChange={(v) => setD({ ...d, report: { ...d.report, includeReadings: v } })} label="Include latest readings table" />
            <Toggle id="rep-forecast" on={d.report.includeForecast} onChange={(v) => setD({ ...d, report: { ...d.report, includeForecast: v } })} label="Include forecast (labelled as prediction)" />
          </div>
        </Panel>
        <Panel className="span-6" title="Data source & reset">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="c-muted">Prediction engine:</span><Badge kind="info">Built-in demo model</Badge>
              <span className="c-muted">Backend API:</span>
              <Badge kind={backend.status === 'online' ? 'low' : backend.status === 'offline' ? 'high' : 'neutral'}>{{ online: 'Online', offline: 'Unreachable', checking: 'Checking…', 'not-configured': 'Not configured' }[backend.status]}</Badge>
            </div>
            {backend.error && <div className="c-high" style={{ fontSize: 12.5 }}>{backend.error}</div>}
            <p className="c-muted" style={{ fontSize: 12.5, margin: 0 }}>Run the FastAPI backend and start the frontend with <span className="mono">VITE_API_URL=http://localhost:8000</span> to connect. The backend serves the same engine logic in Python.</p>
            <div className="flex gap-2 flex-wrap">
              <button className="btn sm" onClick={testBackend}><PlugZap size={14} aria-hidden="true" />Test backend connection</button>
              <button className="btn sm" onClick={() => setD(DEFAULT_SETTINGS)}>Load default settings</button>
              <button className="btn sm danger" onClick={() => { dispatch({ type: 'reset' }); setD(DEFAULT_SETTINGS); toast('Demo data reset: alerts workflow, actions, imports and settings cleared'); }}><RotateCcw size={14} aria-hidden="true" />Reset demo data</button>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
