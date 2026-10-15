// CSV parsing, schema mapping and validation for data imports.
import { NOW } from './store.jsx';

export const SCHEMA = [
  { key: 'timestamp', label: 'Timestamp', type: 'ISO 8601 date-time', aliases: ['timestamp', 'time', 'datetime', 'date_time', 'ts', 'recorded_at'] },
  { key: 'unit_id', label: 'Unit ID', type: 'text, e.g. FR-02', aliases: ['unit_id', 'unit', 'unitid', 'device', 'sensor_id', 'fridge'] },
  { key: 'temperature_c', label: 'Temperature (°C)', type: 'number', aliases: ['temperature_c', 'temperature', 'temp', 'temp_c', 'internal_temp'] },
  { key: 'ambient_c', label: 'Ambient (°C)', type: 'number', aliases: ['ambient_c', 'ambient', 'ambient_temp', 'room_temp'] },
  { key: 'door_state', label: 'Door state', type: 'open | closed', aliases: ['door_state', 'door', 'door_open'] },
  { key: 'cooling_state', label: 'Cooling state', type: 'on | off', aliases: ['cooling_state', 'cooling', 'compressor', 'cooling_active'] },
];
export const MAX_BYTES = 2 * 1024 * 1024;

export function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
const parseBool = (v, t, f) => { const s = String(v).trim().toLowerCase(); if (t.includes(s)) return true; if (f.includes(s)) return false; return null; };

export function validate(headers, body, mapping, knownUnits) {
  const idx = Object.fromEntries(SCHEMA.map((s) => [s.key, headers.indexOf(mapping[s.key])]));
  const mapped = new Set(Object.values(mapping).filter(Boolean));
  const unexpected = headers.filter((h) => !mapped.has(h));
  const missingCols = SCHEMA.filter((s) => idx[s.key] < 0).map((s) => s.label);
  const c = { total: body.length, valid: 0, missing: 0, badTs: 0, dup: 0, range: 0, type: 0, unknownUnit: 0 };
  const seen = new Set();
  const out = body.map((r, i) => {
    const errs = [];
    const get = (k) => (idx[k] >= 0 ? (r[idx[k]] ?? '').trim() : '');
    const vals = Object.fromEntries(SCHEMA.map((s) => [s.key, get(s.key)]));
    if (SCHEMA.some((s) => vals[s.key] === '')) { errs.push('Missing value'); c.missing++; }
    const ts = Date.parse(vals.timestamp);
    if (vals.timestamp && Number.isNaN(ts)) { errs.push('Invalid timestamp'); c.badTs++; }
    const temp = Number(vals.temperature_c), amb = Number(vals.ambient_c);
    let typeErr = false;
    if (vals.temperature_c && !Number.isFinite(temp)) typeErr = true;
    if (vals.ambient_c && !Number.isFinite(amb)) typeErr = true;
    const door = parseBool(vals.door_state, ['open', '1', 'true', 'yes'], ['closed', '0', 'false', 'no']);
    const cooling = parseBool(vals.cooling_state, ['on', 'active', '1', 'true', 'yes'], ['off', 'inactive', '0', 'false', 'no']);
    if (vals.door_state && door == null) typeErr = true;
    if (vals.cooling_state && cooling == null) typeErr = true;
    if (typeErr) { errs.push('Type mismatch'); c.type++; }
    if (Number.isFinite(temp) && vals.temperature_c && (temp < -40 || temp > 50)) { errs.push('Temperature out of plausible range (−40 to 50°C)'); c.range++; }
    else if (Number.isFinite(amb) && vals.ambient_c && (amb < -20 || amb > 60)) { errs.push('Ambient out of plausible range (−20 to 60°C)'); c.range++; }
    if (vals.unit_id && !knownUnits.includes(vals.unit_id.toUpperCase())) { errs.push(`Unknown unit ${vals.unit_id}`); c.unknownUnit++; }
    const key = `${vals.unit_id.toUpperCase()}|${Number.isNaN(ts) ? vals.timestamp : ts}`;
    if (!errs.length && seen.has(key)) { errs.push('Duplicate record'); c.dup++; }
    if (!errs.length) seen.add(key);
    if (!errs.length) c.valid++;
    return { line: i + 2, raw: r, errs, rec: errs.length ? null : { ts, unit_id: vals.unit_id.toUpperCase(), temperature: Math.round(temp * 100) / 100, ambient: Math.round(amb * 100) / 100, door, cooling } };
  });
  return { counts: c, rows: out, unexpected, missingCols };
}

export function autoMap(headers) {
  const m = {};
  SCHEMA.forEach((s) => { m[s.key] = headers.find((h) => s.aliases.includes(h.trim().toLowerCase())) || ''; });
  return m;
}

export function sampleCSV(withErrors) {
  const lines = ['timestamp,unit_id,temperature_c,ambient_c,door_state,cooling_state'];
  const base = NOW - 30 * 60000;
  let t = 4.1;
  for (let i = 0; i < 30; i++) {
    const door = i >= 10 && i < 13;
    t += door ? 0.28 : i < 18 ? 0.02 : -0.06;
    lines.push(`${new Date(base + i * 60000).toISOString()},FR-03,${t.toFixed(2)},24.6,${door ? 'open' : 'closed'},${i >= 14 ? 'on' : 'off'}`);
  }
  if (withErrors) {
    lines.push(`${new Date(base + 30 * 60000).toISOString()},FR-03,,24.6,closed,on`);
    lines.push(`not-a-date,FR-03,4.20,24.6,closed,on`);
    lines.push(lines[5]);
    lines.push(`${new Date(base + 31 * 60000).toISOString()},FR-03,94.0,24.6,closed,on`);
    lines.push(`${new Date(base + 32 * 60000).toISOString()},FR-03,warm,24.6,ajar,on`);
    lines.push(`${new Date(base + 33 * 60000).toISOString()},FR-99,4.30,24.6,closed,on`);
  }
  return lines.join('\n');
}
