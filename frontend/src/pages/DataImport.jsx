import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileDown, Copy, Trash2, CircleCheck, CircleX, TriangleAlert, Wand2 } from 'lucide-react';
import { useStore, saveFile, copyText, stamp, NOW } from '../lib/store.jsx';
import { PageHead, Panel, Badge, Empty, DemoTag } from '../components/ui.jsx';

export const SCHEMA = [
  { key: 'timestamp', label: 'Timestamp', type: 'ISO 8601 date-time', aliases: ['timestamp', 'time', 'datetime', 'date_time', 'ts', 'recorded_at'] },
  { key: 'unit_id', label: 'Unit ID', type: 'text, e.g. FR-02', aliases: ['unit_id', 'unit', 'unitid', 'device', 'sensor_id', 'fridge'] },
  { key: 'temperature_c', label: 'Temperature (°C)', type: 'number', aliases: ['temperature_c', 'temperature', 'temp', 'temp_c', 'internal_temp'] },
  { key: 'ambient_c', label: 'Ambient (°C)', type: 'number', aliases: ['ambient_c', 'ambient', 'ambient_temp', 'room_temp'] },
  { key: 'door_state', label: 'Door state', type: 'open | closed', aliases: ['door_state', 'door', 'door_open'] },
  { key: 'cooling_state', label: 'Cooling state', type: 'on | off', aliases: ['cooling_state', 'cooling', 'compressor', 'cooling_active'] },
];
const MAX_BYTES = 2 * 1024 * 1024;

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

function autoMap(headers) {
  const m = {};
  SCHEMA.forEach((s) => { m[s.key] = headers.find((h) => s.aliases.includes(h.trim().toLowerCase())) || ''; });
  return m;
}

function sampleCSV(withErrors) {
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

export default function DataImport() {
  const { units, state, dispatch, toast } = useStore();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [showSample, setShowSample] = useState(false);
  const inputRef = useRef(null);
  const known = units.map((u) => u.id);

  const loadText = (name, text) => {
    setError('');
    const rows = parseCSV(text);
    if (rows.length < 2) { setParsed(null); setError(`${name} has no data rows. The first line must be a header row followed by at least one reading.`); dispatch({ type: 'importFailed', filename: name, reason: 'no data rows' }); return; }
    const headers = rows[0].map((h) => h.trim());
    setFile({ name, size: text.length });
    setParsed({ headers, body: rows.slice(1), raw: text });
    setMapping(autoMap(headers));
  };
  const onFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError(`${f.name} is not a CSV file. Export your readings as .csv and try again.`); dispatch({ type: 'importFailed', filename: f.name, reason: 'not a CSV' }); return; }
    if (f.size > MAX_BYTES) { setError(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB. The prototype accepts files up to 2 MB.`); dispatch({ type: 'importFailed', filename: f.name, reason: 'too large' }); return; }
    const rd = new FileReader();
    rd.onload = () => loadText(f.name, String(rd.result));
    rd.onerror = () => { setError(`Could not read ${f.name}.`); };
    rd.readAsText(f);
  };

  const result = useMemo(() => (parsed ? validate(parsed.headers, parsed.body, mapping, known) : null), [parsed, mapping]);
  const doImport = () => {
    if (!result) return;
    if (result.missingCols.length) { toast(`Import blocked: map ${result.missingCols.join(', ')} first.`, 'error'); return; }
    const good = result.rows.filter((r) => r.rec).map((r) => r.rec).sort((a, b) => a.ts - b.ts);
    if (!good.length) { toast('Import failed: no valid rows. Fix the errors shown and try again.', 'error'); dispatch({ type: 'importFailed', filename: file.name, reason: 'no valid rows' }); return; }
    const batch = { id: `IMP-${Date.now().toString(36).toUpperCase()}`, at: Date.now(), filename: file.name, total: result.counts.total, valid: good.length, rejected: result.counts.total - good.length, units: [...new Set(good.map((g) => g.unit_id))], rows: good.slice(0, 5000), truncated: good.length > 5000 };
    dispatch({ type: 'import', batch });
    toast(`Imported ${good.length} valid rows from ${file.name}; ${batch.rejected} rejected.`);
    setParsed(null); setFile(null);
  };

  const c = result?.counts;
  return (
    <>
      <PageHead eyebrow="Data import & quality" title="Import sensor data" sub="Validate a CSV of historical readings before it enters the system. Invalid rows are rejected with a reason; missing values are never filled in silently." right={<DemoTag>Prototype import</DemoTag>} />
      <div className="grid-12">
        <Panel className="span-7" title="1 · Choose a file">
          <div
            className="empty" style={{ padding: 28, cursor: 'pointer' }} role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
          >
            <Upload size={22} style={{ margin: '0 auto 8px' }} aria-hidden="true" />
            <div style={{ color: 'var(--text)', fontWeight: 500 }}>Drop a .csv file here or click to choose</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Up to 2 MB · UTF-8 · header row required</div>
            <input ref={inputRef} id="csv-file" type="file" accept=".csv,text/csv" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
          </div>
          <div className="flex gap-2 flex-wrap" style={{ marginTop: 10 }}>
            <button className="btn sm" onClick={() => loadText('sample-clean.csv', sampleCSV(false))}><Wand2 size={14} aria-hidden="true" />Load clean sample</button>
            <button className="btn sm" onClick={() => loadText('sample-with-errors.csv', sampleCSV(true))}><Wand2 size={14} aria-hidden="true" />Load sample with errors</button>
            <button className="btn sm" onClick={async () => { const r = await saveFile('coldguard-sample.csv', sampleCSV(false), 'text/csv'); toast(r.msg, r.ok ? 'ok' : 'error'); }}><FileDown size={14} aria-hidden="true" />Download sample CSV</button>
            <button className="btn sm ghost" onClick={() => setShowSample(!showSample)}>{showSample ? 'Hide' : 'Show'} sample text</button>
          </div>
          {showSample && (
            <div style={{ marginTop: 10 }}>
              <textarea className="textarea mono" id="sample-text" readOnly rows={7} value={sampleCSV(false)} style={{ fontSize: 11.5 }} />
              <button className="btn sm" style={{ marginTop: 6 }} onClick={async () => toast((await copyText(sampleCSV(false))) ? 'Sample CSV copied' : 'Copy failed: select the text and copy it manually', 'ok')}><Copy size={14} aria-hidden="true" />Copy</button>
            </div>
          )}
          {error && <div className="alert-box high" role="alert" style={{ marginTop: 12 }}><CircleX size={16} className="c-high" style={{ display: 'inline', marginRight: 6 }} aria-hidden="true" />{error}</div>}
        </Panel>
        <Panel className="span-5" title="Expected columns" note="Other column names can be mapped below">
          <div className="table-wrap"><table className="t"><thead><tr><th>Column</th><th>Type</th></tr></thead>
            <tbody>{SCHEMA.map((s) => <tr key={s.key}><td className="mono">{s.key}</td><td className="c-muted">{s.type}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>

      {result && (<>
        <Panel title={`2 · Map columns · ${file.name}`} note={`${parsed.headers.length} columns found`}>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {SCHEMA.map((s) => (
              <label key={s.key} className="field"><span>{s.label}</span>
                <select className={`select ${!mapping[s.key] ? 'input invalid' : ''}`} id={`map-${s.key}`} value={mapping[s.key]} onChange={(e) => setMapping({ ...mapping, [s.key]: e.target.value })}>
                  <option value="">— not mapped —</option>
                  {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          {result.unexpected.length > 0 && <p className="c-medium" style={{ fontSize: 12.5, marginTop: 10 }}><TriangleAlert size={13} style={{ display: 'inline' }} aria-hidden="true" /> Unexpected columns (will be ignored): {result.unexpected.join(', ')}</p>}
          {result.missingCols.length > 0 && <p className="c-high" style={{ fontSize: 12.5 }}>Required columns not mapped: {result.missingCols.join(', ')}</p>}
        </Panel>

        <Panel title="3 · Validation results" right={<button className="btn primary" onClick={doImport} disabled={!c.valid || result.missingCols.length > 0}>Import {c.valid} valid row{c.valid === 1 ? '' : 's'}</button>}>
          <div className="stats" style={{ marginBottom: 12 }}>
            {[['Total rows', c.total, ''], ['Valid rows', c.valid, 'c-low'], ['Missing values', c.missing, c.missing ? 'c-high' : ''], ['Invalid timestamps', c.badTs, c.badTs ? 'c-high' : ''], ['Duplicates', c.dup, c.dup ? 'c-medium' : ''], ['Out of range', c.range, c.range ? 'c-high' : ''], ['Type mismatches', c.type, c.type ? 'c-high' : ''], ['Unknown units', c.unknownUnit, c.unknownUnit ? 'c-medium' : ''], ['Unexpected columns', result.unexpected.length, result.unexpected.length ? 'c-medium' : '']].map(([l, v, cls]) => (
              <div className="stat" key={l}><span className="stat-label">{l}</span><span className={`stat-value ${cls}`} style={{ fontSize: 22 }}>{v}</span></div>
            ))}
          </div>
          <div className="stat-label" style={{ marginBottom: 6 }}>Preview (first 25 rows)</div>
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Line</th><th>Status</th>{parsed.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {result.rows.slice(0, 25).map((r) => (
                  <tr key={r.line} className={r.errs.length ? 'bad' : ''}>
                    <td className="mono c-faint">{r.line}</td>
                    <td>{r.errs.length ? <span className="c-high" style={{ fontSize: 12 }}><CircleX size={12} style={{ display: 'inline' }} aria-hidden="true" /> {r.errs.join('; ')}</span> : <span className="c-low"><CircleCheck size={12} style={{ display: 'inline' }} aria-hidden="true" /> Valid</span>}</td>
                    {parsed.headers.map((h, i) => <td key={h} className="mono">{r.raw[i] ?? ''}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </>)}

      <div className="grid-12">
        <Panel className="span-6" title="Preprocessing rules" note="Applied explicitly; nothing is guessed">
          <ul className="c-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li>Rows with a missing required value are rejected, not imputed. Live series keep gaps as gaps.</li>
            <li>Timestamps are parsed as ISO 8601 and stored as UTC epoch milliseconds.</li>
            <li>Temperatures outside −40 to 50°C are treated as sensor faults and rejected.</li>
            <li>Duplicate unit + timestamp pairs keep the first occurrence.</li>
            <li>Door and cooling states accept open/closed, on/off, active/inactive, 1/0, true/false.</li>
            <li>Stale data: a unit with no valid reading for 5 minutes is flagged Fair, 10 minutes Poor.</li>
            <li>Noise and outliers: steps larger than 1.5°C/min are flagged as implausible jumps.</li>
            <li>The original file stays untouched; imported rows are a separate batch you can remove.</li>
          </ul>
        </Panel>
        <Panel className="span-6" title="Data quality by unit" note="Last 60 minutes">
          <div className="table-wrap"><table className="t"><thead><tr><th>Unit</th><th>Quality</th><th className="num">Missing</th><th className="num">Stale</th><th>Issues</th></tr></thead>
            <tbody>{units.map((u) => { const q = u.assessment.quality; return <tr key={u.id}><td className="mono">{u.id}</td><td><Badge kind={q.level === 'Good' ? 'low' : q.level === 'Fair' ? 'medium' : 'high'}>{q.level}</Badge></td><td className="num mono">{q.missingPct}%</td><td className="num mono">{q.staleMin} min</td><td className="c-muted">{q.issues.join('; ') || 'None'}</td></tr>; })}</tbody></table></div>
        </Panel>
      </div>

      <Panel title="Import history" note="Stored in this browser for the demo">
        {state.imports.length === 0 ? <Empty>No imports yet.</Empty> : (
          <div className="table-wrap"><table className="t"><thead><tr><th>Batch</th><th>When</th><th>File</th><th className="num">Total</th><th className="num">Imported</th><th className="num">Rejected</th><th>Units</th><th>Derived features</th><th /></tr></thead>
            <tbody>{state.imports.map((b) => {
              const per = b.units.map((id) => { const rs = b.rows.filter((r) => r.unit_id === id); const span = (rs[rs.length - 1].ts - rs[0].ts) / 60000; const rate = span > 0 ? ((rs[rs.length - 1].temperature - rs[0].temperature) / span) * 60 : 0; const gaps = rs.filter((r, i) => i && r.ts - rs[i - 1].ts > 5 * 60000).length; return `${id}: mean ${(rs.reduce((a, x) => a + x.temperature, 0) / rs.length).toFixed(2)}°C, Δ ${rate.toFixed(2)}°C/h, ${gaps} gap${gaps === 1 ? '' : 's'} > 5 min`; });
              return <tr key={b.id}><td className="mono">{b.id}</td><td className="mono">{stamp(b.at)}</td><td>{b.filename}</td><td className="num mono">{b.total}</td><td className="num mono c-low">{b.valid}</td><td className="num mono">{b.rejected}</td><td>{b.units.join(', ')}</td><td className="c-muted" style={{ fontSize: 12 }}>{per.join(' · ')}</td><td><button className="btn sm ghost" onClick={() => dispatch({ type: 'removeImport', id: b.id })} aria-label={`Remove batch ${b.id}`}><Trash2 size={14} /></button></td></tr>;
            })}</tbody></table></div>
        )}
      </Panel>
    </>
  );
}
