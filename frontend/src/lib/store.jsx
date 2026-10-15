import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import E from './engine.js';
import { api } from './api.js';

/*
 * Application state.
 * Persistence: browser localStorage. The shapes below mirror the
 * PostgreSQL tables in backend/schema.sql (alert_events, preventive_actions,
 * import_batches, unit_configs) so they can move to the API later.
 */
const STORAGE_KEY = 'coldguard-v2';
export const NOW = Math.floor(Date.now() / 60000) * 60000; // simulated snapshot time, fixed per page load

export const DEFAULT_SETTINGS = {
  facility: 'City General Hospital',
  horizon: 30,
  bands: { medium: 30, high: 60 },
  units: {},
  prefs: { showDismissed: false, showSubsided: true, compactCards: false, refresh: 'manual', alertBanner: true },
  report: { author: 'Pranjal Kute', organisation: 'Team SkinAura', includeReadings: true, includeForecast: true },
};
const INITIAL = { settings: DEFAULT_SETTINGS, workflow: {}, actions: [], activity: [], imports: [], simAlerts: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL;
    const s = JSON.parse(raw);
    return { ...INITIAL, ...s, settings: { ...DEFAULT_SETTINGS, ...s.settings, prefs: { ...DEFAULT_SETTINGS.prefs, ...(s.settings?.prefs || {}) }, report: { ...DEFAULT_SETTINGS.report, ...(s.settings?.report || {}) } } };
  } catch { return INITIAL; }
}

let seq = 0;
const uid = (p) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

function reducer(state, a) {
  const log = (type, text, unitId) => [{ id: uid('EV'), at: Date.now(), type, text, unitId, source: 'user' }, ...state.activity].slice(0, 200);
  switch (a.type) {
    case 'settings':
      return { ...state, settings: a.settings, activity: log('settings', a.note || 'Settings updated') };
    case 'workflow': {
      const cur = state.workflow[a.alertId] || { status: 'new', history: [] };
      const entry = { id: uid('H'), at: Date.now(), kind: a.kind, text: a.text, by: state.settings.report.author || 'Operator', from: cur.status, to: a.status || cur.status };
      const next = { ...cur, status: a.status || cur.status, history: [...cur.history, entry] };
      return { ...state, workflow: { ...state.workflow, [a.alertId]: next }, activity: log(a.kind, a.log, a.unitId) };
    }
    case 'action': {
      const act = { id: uid('ACT'), at: Date.now(), status: 'planned', by: state.settings.report.author || 'Operator', ...a.action };
      let workflow = state.workflow;
      if (act.alertId) {
        const cur = workflow[act.alertId] || { status: 'new', history: [] };
        workflow = { ...workflow, [act.alertId]: { ...cur, history: [...cur.history, { id: uid('H'), at: act.at, kind: 'action', text: `Preventive action recorded: ${act.action}${act.note ? ` (${act.note})` : ''}`, by: act.by, from: cur.status, to: cur.status }] } };
      }
      return { ...state, workflow, actions: [act, ...state.actions], activity: log('action', `Preventive action recorded for ${act.unitId}: ${act.action}`, act.unitId) };
    }
    case 'actionStatus': {
      const actions = state.actions.map((x) => (x.id === a.id ? { ...x, status: a.status, doneAt: a.status === 'done' ? Date.now() : undefined } : x));
      const act = state.actions.find((x) => x.id === a.id);
      return { ...state, actions, activity: log('action', `Action "${act?.action}" on ${act?.unitId} marked ${a.status === 'done' ? 'complete' : 'planned'}`, act?.unitId) };
    }
    case 'import':
      return { ...state, imports: [a.batch, ...state.imports].slice(0, 10), activity: log('import', `Data import completed: ${a.batch.valid} valid rows from ${a.batch.filename}`) };
    case 'importFailed':
      return { ...state, activity: log('import-failed', `Import rejected: ${a.filename} (${a.reason})`) };
    case 'removeImport':
      return { ...state, imports: state.imports.filter((b) => b.id !== a.id), activity: log('import', `Removed imported batch ${a.id}`) };
    case 'simAlert':
      return { ...state, simAlerts: [a.alert, ...state.simAlerts].slice(0, 30), activity: log('warning', `Simulator generated a ${a.alert.severity.toLowerCase()} early warning for ${a.alert.unitId} (${a.alert.probability}%)`, a.alert.unitId) };
    case 'simAlertSubside':
      return { ...state, simAlerts: state.simAlerts.map((x) => (x.condition === 'active' ? { ...x, condition: 'subsided' } : x)) };
    case 'log':
      return { ...state, activity: log(a.kind, a.text, a.unitId) };
    case 'reset':
      return { ...INITIAL, activity: [{ id: uid('EV'), at: Date.now(), type: 'reset', text: 'Data reset to defaults', source: 'user' }] };
    default:
      return state;
  }
}

// ---------- formatting ----------
export const clock = (m) => new Date(NOW + m * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const stamp = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
export const fmtT = (t) => (t == null ? '—' : `${t.toFixed(1)}°C`);
export const relMin = (m) => (m === 0 ? 'now' : m < 0 ? `${-m} min ago` : `in ${m} min`);
export const alertTime = (a) => a.at ?? NOW + a.m * 60000;
export const riskClass =(c) => (c || 'Low').toLowerCase();

// ---------- alert derivation ----------
// An alert opens when the evaluated risk rises from Low to Medium/High and
// stays open (condition "active") while it remains elevated.
function deriveAlerts(unit, history, assessment, simulated) {
  const alerts = [];
  let cur = null;
  history.forEach((h, i) => {
    const elevated = h.category !== 'Low';
    if (elevated && !cur) {
      cur = { start: h.m, snap: h, peak: h.probability, severity: h.category, end: h.m };
    } else if (elevated && cur) {
      cur.end = h.m;
      if (h.probability > cur.peak) { cur.peak = h.probability; }
      if (h.category === 'High') cur.severity = 'High';
    }
    if ((!elevated || i === history.length - 1) && cur) {
      const isLast = elevated && i === history.length - 1;
      const id = `AL-${unit.id.replace('-', '')}-${clock(cur.start).replace(':', '')}${simulated ? '-SIM' : ''}`;
      alerts.push({
        id, unitId: unit.id, unitName: unit.name, m: cur.start, endM: cur.end,
        severity: isLast ? assessment.category === 'Low' ? cur.severity : (assessment.category === 'High' ? 'High' : cur.severity) : cur.severity,
        probability: isLast ? assessment.probability : cur.snap.probability,
        peakProbability: Math.max(cur.peak, isLast ? assessment.probability : 0),
        temp: isLast ? assessment.features.temp : cur.snap.temp,
        upper: unit.upper, lower: unit.lower,
        factors: isLast ? assessment.factors.slice(0, 4).map((f) => f.label) : cur.snap.factors,
        explanation: isLast ? assessment.explanation : cur.snap.explanation,
        action: isLast ? assessment.action : cur.snap.action,
        crossing: isLast ? assessment.forecast.crossing : cur.snap.crossing,
        condition: isLast ? 'active' : 'subsided',
        source: simulated ? 'Simulator' : 'Monitoring',
        detail: isLast ? assessment : null,
      });
      cur = null;
    }
  });
  return alerts;
}

// ---------- download helper (artifact viewers use the downloads capability) ----------
export const EMBEDDED = (() => { try { return window.self !== window.top; } catch { return true; } })();
export async function saveFile(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  if (window.claude?.use) {
    try {
      const d = await window.claude.use('downloads');
      if (d) { await d.save({ filename, data: blob }); return { ok: true, msg: `Saved ${filename}` }; }
      return { ok: false, msg: 'Downloads are not available in this view. Use Copy instead.' };
    } catch (e) {
      return { ok: false, msg: e?.code === 'declined' ? 'Download cancelled.' : 'Download could not be completed here. Use Copy instead.' };
    }
  }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return { ok: true, msg: `Downloaded ${filename}` };
  } catch { return { ok: false, msg: 'Download unavailable in this browser.' }; }
}
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
export function toCSV(rows, cols) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.map((c) => c.label).join(','), ...rows.map((r) => cols.map((c) => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))].join('\n');
}

// ---------- simulator ----------
export const SIM_LIMIT = 120;
export const DEFAULT_SIM = { scenario: 'failure', ambient: 26, initialTemp: 4.2, upper: 8, lower: 2, duration: 8 };
const RANK = { Low: 0, Medium: 1, High: 2 };
export const simCfg = (p) => ({ id: 'SIM', upper: p.upper, lower: p.lower, cutIn: 5, cutOut: 3.4 });
export function simAlert(unit, st, a) {
  return {
    id: `AL-${unit.id.replace('-', '')}-SIM${String(st.t).padStart(3, '0')}-${Date.now().toString(36).slice(-3)}`,
    unitId: unit.id, unitName: unit.name, at: Date.now(), m: 0, simMinute: st.t,
    scenario: E.SCENARIOS.find((x) => x.id === st.params.scenario)?.name,
    severity: a.category, probability: a.probability, peakProbability: a.probability, temp: a.features.temp,
    upper: st.params.upper, lower: st.params.lower,
    factors: a.factors.slice(0, 4).map((f) => f.label), explanation: a.explanation, action: a.action,
    crossing: a.forecast.crossing, condition: 'active', source: 'Simulator', horizon: a.horizon,
  };
}

// ---------- context ----------
const Ctx = createContext(null);
const BASE = Object.fromEntries(E.UNITS.map((u) => [u.id, E.generateSeries(u.id)]));
const historyCache = new Map();

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  const [sim, setSim] = useState(() => ({ target: 'FR-02', attached: true, running: false, speed: 2, lastCat: 'Low', params: DEFAULT_SIM, state: E.createSim(DEFAULT_SIM) }));
  const [toasts, setToasts] = useState([]);
  const [selectedUnit, setSelectedUnit] = useState('FR-02');
  const [actionFor, setActionFor] = useState(null); // { unitId, alertId } opens the record-action sheet
  const [backend, setBackend] = useState({ status: api.configured ? 'checking' : 'not-configured' });

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* storage unavailable: state stays in memory */ } }, [state]);
  useEffect(() => {
    if (!api.configured) return;
    api.health().then(() => setBackend({ status: 'online' })).catch((e) => setBackend({ status: 'offline', error: e.message }));
  }, []);

  const dismissToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((msg, kind = 'ok', sub) => {
    const id = uid('T');
    setToasts((t) => [...t.slice(-2), { id, msg, kind, sub }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4600);
  }, []);

  // simulator playback runs here so every page reflects it while it plays
  const simRef = useRef(sim);
  simRef.current = sim;
  const { settings } = state;
  const optsRef = useRef(null);
  useEffect(() => {
    if (!sim.running) return undefined;
    const id = setInterval(() => {
      const s = simRef.current;
      if (!s.state) return;
      let st = s.state;
      for (let k = 0; k < s.speed; k++) st = E.stepSim(st);
      const a = E.assess(st.series, simCfg(st.params), optsRef.current);
      const prev = s.lastCat || 'Low';
      const target = E.UNITS.find((x) => x.id === s.target);
      if (RANK[a.category] > RANK[prev]) dispatch({ type: 'simAlert', alert: simAlert(target, st, a) });
      if (a.category === 'Low' && prev !== 'Low') dispatch({ type: 'simAlertSubside' });
      const done = st.t >= SIM_LIMIT;
      setSim({ ...s, state: st, lastCat: a.category, running: !done });
    }, 450);
    return () => clearInterval(id);
  }, [sim.running]);

  const opts = useMemo(() => ({ horizon: settings.horizon, bands: settings.bands }), [settings.horizon, settings.bands]);
  optsRef.current = opts;

  const units = useMemo(() => E.UNITS.map((u) => {
    let cfg = { ...u, ...(settings.units[u.id] || {}) };
    const simActive = sim.attached && sim.target === u.id && sim.state && sim.state.t > 0;
    if (simActive) cfg = { ...cfg, upper: sim.state.params.upper, lower: sim.state.params.lower };
    let series = BASE[u.id];
    if (simActive) {
      const s = sim.state.series;
      const lastM = s[s.length - 1].m;
      series = s.map((r) => ({ ...r, m: r.m - lastM }));
    }
    const assessment = E.assess(series, cfg, opts);
    const key = `${u.id}|${cfg.upper}|${cfg.lower}|${opts.horizon}|${opts.bands.medium}|${opts.bands.high}|${simActive ? `sim${series.length}${sim.state.params.scenario}` : 'base'}`;
    let history = historyCache.get(key);
    if (!history) { history = E.riskHistory(series, cfg, { ...opts, step: simActive ? 2 : 5 }); if (!simActive) historyCache.set(key, history); }
    // simulator alerts are recorded separately (state.simAlerts) to avoid duplicates
    const alerts = simActive ? [] : deriveAlerts(cfg, history, assessment, false);
    let warningM = null;
    if (assessment.category !== 'Low') {
      warningM = history.length ? history[history.length - 1].m : 0;
      for (let i = history.length - 1; i >= 0 && history[i].category !== 'Low'; i--) warningM = history[i].m;
    }
    return {
      ...cfg, series, assessment, history, alerts,
      simulated: !!simActive,
      excursions: E.excursions(series, cfg),
      doorEvents: E.doorEvents(series),
      warningM,
      lastReadingM: [...series].reverse().find((r) => r.temp != null)?.m ?? 0,
    };
  }), [settings.units, opts, sim.attached, sim.target, sim.state]);

  const alerts = useMemo(() => {
    const all = [...units.flatMap((u) => u.alerts), ...state.simAlerts];
    return all
      .map((a) => ({ ...a, workflow: state.workflow[a.id] || { status: 'new', history: [] } }))
      .sort((a, b) => ((b.condition === 'active') - (a.condition === 'active')) || (alertTime(b) - alertTime(a)));
  }, [units, state.simAlerts, state.workflow]);

  const value = {
    state, dispatch, settings, units, alerts, sim, setSim, toast, toasts, dismissToast, selectedUnit, setSelectedUnit, backend, setBackend, actionFor, setActionFor,
    unit: (id) => units.find((u) => u.id === id) || units[0],
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useStore = () => useContext(Ctx);
export { E };
