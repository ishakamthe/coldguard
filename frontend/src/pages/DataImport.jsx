import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileDown, Trash2, CircleCheck, CircleX, TriangleAlert, FileSpreadsheet } from 'lucide-react';
import { useStore, saveFile, stamp } from '../lib/store.jsx';
import { SCHEMA, MAX_BYTES, parseCSV, validate, autoMap, sampleCSV } from '../lib/csv.js';
import { Head, Card, Tag, AgentIcon, Empty } from '../components/ui.jsx';

export default function DataImport() {
  const { units, state, dispatch, toast } = useStore();
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const inputRef = useRef(null);
  const known = units.map((u) => u.id);

  const loadText = (name, text) => {
    setError('');
    const rows = parseCSV(text);
    if (rows.length < 2) { setParsed(null); setError(`${name} has no data rows. The first line should be the column names, followed by readings.`); dispatch({ type: 'importFailed', filename: name, reason: 'no data rows' }); return; }
    const headers = rows[0].map((h) => h.trim());
    setFile({ name, size: text.length });
    setParsed({ headers, body: rows.slice(1) });
    setMapping(autoMap(headers));
  };
  const onFile = (f) => {
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setError(`${f.name} isn't a CSV file. Export your readings as .csv and try again.`); dispatch({ type: 'importFailed', filename: f.name, reason: 'not a CSV' }); return; }
    if (f.size > MAX_BYTES) { setError(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB. Files up to 2 MB are accepted.`); dispatch({ type: 'importFailed', filename: f.name, reason: 'too large' }); return; }
    const rd = new FileReader();
    rd.onload = () => loadText(f.name, String(rd.result));
    rd.onerror = () => setError(`Couldn't read ${f.name}.`);
    rd.readAsText(f);
  };
  const result = useMemo(() => (parsed ? validate(parsed.headers, parsed.body, mapping, known) : null), [parsed, mapping]);
  const doImport = () => {
    if (!result) return;
    if (result.missingCols.length) { toast(`Map ${result.missingCols.join(', ')} first`, 'error'); return; }
    const good = result.rows.filter((r) => r.rec).map((r) => r.rec).sort((a, b) => a.ts - b.ts);
    if (!good.length) { toast('Nothing imported', 'error', 'No row passed validation. Fix the errors shown and try again.'); dispatch({ type: 'importFailed', filename: file.name, reason: 'no valid rows' }); return; }
    const batch = { id: `IMP-${Date.now().toString(36).toUpperCase()}`, at: Date.now(), filename: file.name, total: result.counts.total, valid: good.length, rejected: result.counts.total - good.length, units: [...new Set(good.map((g) => g.unit_id))], rows: good.slice(0, 5000) };
    dispatch({ type: 'import', batch });
    toast(`Imported ${good.length} readings`, 'ok', `${file.name} · ${batch.rejected} rejected`);
    setParsed(null); setFile(null);
  };
  const c = result?.counts;
  const issues = c ? [['Missing values', c.missing], ['Bad timestamps', c.badTs], ['Duplicates', c.dup], ['Out of range', c.range], ['Wrong type', c.type], ['Unknown unit', c.unknownUnit]] : [];

  return (
    <>
      <Head eyebrow="Data" title="Import and data quality" sub="Bring in historical readings from a CSV file. Every row is checked before anything is saved, and nothing is filled in or guessed." />

      <section className="night">
        <div className="night-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
          <div className="flex flex-col">
            <div className="agent"><AgentIcon />CSV import</div>
            <h2 className="headline">Check readings before they reach the model</h2>
            <p className="lede">Upload one file of minute-by-minute readings. ColdGuard maps the columns, flags missing values, bad timestamps, duplicates and impossible temperatures, and shows you a preview before importing.</p>
            <div className="flex gap-2 flex-wrap" style={{ marginTop: 'auto', paddingTop: 24 }}>
              <button className="btn light" onClick={() => loadText('sample-readings.csv', sampleCSV(false))}><FileSpreadsheet size={16} aria-hidden="true" />Try a clean sample</button>
              <button className="btn" onClick={() => loadText('sample-with-problems.csv', sampleCSV(true))}>Try one with problems</button>
              <button className="btn" onClick={async () => { const r = await saveFile('coldguard-sample.csv', sampleCSV(false), 'text/csv'); toast(r.msg, r.ok ? 'ok' : 'error'); }}><FileDown size={16} aria-hidden="true" />Download template</button>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className={`drop ${over ? 'over' : ''}`} role="button" tabIndex={0}
              onClick={() => inputRef.current?.click()} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}>
              <Upload size={26} style={{ margin: '0 auto 10px', color: 'var(--accent-2)' }} aria-hidden="true" />
              <div style={{ color: 'var(--night-text)', fontSize: 16 }}>Drop a .csv file or click to choose</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Up to 2 MB · first row must be column names</div>
              <input ref={inputRef} id="csv-file" type="file" accept=".csv,text/csv" hidden onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
            </div>
            <div className="flex gap-2 flex-wrap">{SCHEMA.map((s) => <span key={s.key} className="tag line num" style={{ textTransform: 'none', letterSpacing: 0 }}>{s.key}</span>)}</div>
            {error && <div className="tag crit" role="alert" style={{ whiteSpace: 'normal', textTransform: 'none', letterSpacing: 0, fontSize: 14, padding: '10px 12px', borderRadius: 12 }}><CircleX size={16} aria-hidden="true" />{error}</div>}
          </div>
        </div>
      </section>

      {result && (
        <div className="grid enter">
          <Card className="s12" title={`Map columns · ${file.name}`} sub={`${parsed.headers.length} columns found. Columns were matched automatically where the names were recognised.`}>
            <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {SCHEMA.map((s) => (
                <label key={s.key} className="field"><span>{s.label}</span>
                  <select className={`select ${!mapping[s.key] ? 'invalid' : ''}`} id={`map-${s.key}`} value={mapping[s.key]} onChange={(e) => setMapping({ ...mapping, [s.key]: e.target.value })}>
                    <option value="">Not mapped</option>
                    {parsed.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {result.unexpected.length > 0 && <p className="c-warn" style={{ fontSize: 14, margin: '12px 0 0' }}><TriangleAlert size={14} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> Extra columns will be ignored: {result.unexpected.join(', ')}</p>}
            {result.missingCols.length > 0 && <p className="c-crit" style={{ fontSize: 14, margin: '8px 0 0' }}>Still to map: {result.missingCols.join(', ')}</p>}
          </Card>

          <Card className="s12" title="Check results" sub={`${c.valid} of ${c.total} rows are ready to import`}
            right={<button className="btn dark" onClick={doImport} disabled={!c.valid || result.missingCols.length > 0}>Import {c.valid} row{c.valid === 1 ? '' : 's'}</button>}>
            <div className="stat-row" style={{ marginBottom: 18 }}>
              <div className="stat"><div className="k">Total rows</div><div className="v">{c.total}</div></div>
              <div className="stat"><div className="k">Valid</div><div className="v c-ok">{c.valid}</div></div>
              {issues.map(([l, v]) => <div className="stat" key={l}><div className="k">{l}</div><div className={`v ${v ? 'c-crit' : ''}`}>{v}</div></div>)}
            </div>
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table className="t">
                <thead><tr><th>Line</th><th>Check</th>{parsed.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {result.rows.slice(0, 40).map((r) => (
                    <tr key={r.line} className={r.errs.length ? 'bad' : ''}>
                      <td className="num c-faint">{r.line}</td>
                      <td>{r.errs.length ? <span className="c-crit" style={{ fontSize: 13.5 }}><CircleX size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> {r.errs.join('; ')}</span> : <span className="c-ok"><CircleCheck size={13} style={{ display: 'inline', verticalAlign: '-2px' }} aria-hidden="true" /> OK</span>}</td>
                      {parsed.headers.map((h, i) => <td key={h} className="num">{r.raw[i] ?? ''}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      <div className="grid enter">
        <Card className="s7" title="Sensor data quality" sub="Each unit, last 60 minutes">
          <div className="rows">
            {units.map((u) => {
              const q = u.assessment.quality;
              return (
                <div className="row" key={u.id}>
                  <Tag kind="dark">{u.id}</Tag>
                  <span className="min-w-0"><span className="row-title block">{u.name}</span><span className="row-sub block">{q.issues.join(' · ') || 'Complete and current'}</span></span>
                  <span className="flex items-center gap-3"><span className="num c-muted" style={{ fontSize: 13 }}>{(100 - q.missingPct).toFixed(0)}%</span><Tag kind={q.level === 'Good' ? 'ok' : q.level === 'Fair' ? 'warn' : 'crit'}>{q.level}</Tag></span>
                </div>
              );
            })}
          </div>
        </Card>
        <Card className="s5" title="How readings are checked">
          <div className="rows">
            {[
              ['Missing values', 'Rejected, never filled in. Gaps stay visible on charts.'],
              ['Timestamps', 'ISO 8601, stored in UTC.'],
              ['Impossible values', 'Below −40 °C or above 50 °C counts as a sensor fault.'],
              ['Duplicates', 'Same unit and time: the first row is kept.'],
              ['Stale sensors', 'No reading for 5 min is Fair, 10 min is Poor.'],
              ['Spikes', 'Jumps over 1.5 °C in a minute are flagged.'],
            ].map(([k, v]) => (
              <div className="row" key={k} style={{ gridTemplateColumns: 'minmax(110px, 0.6fr) minmax(0, 1.4fr)' }}>
                <span>{k}</span><span className="c-muted" style={{ fontSize: 14 }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="s12" title="Import history" sub="Imported readings appear as teal dots on the unit charts">
          {state.imports.length === 0 ? <Empty>No files imported yet.</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Batch</th><th>Imported</th><th>File</th><th className="r">Rows</th><th className="r">Rejected</th><th>Units</th><th>Summary</th><th /></tr></thead>
                <tbody>
                  {state.imports.map((b) => {
                    const per = b.units.map((id) => { const rs = b.rows.filter((r) => r.unit_id === id); const gaps = rs.filter((r, i) => i && r.ts - rs[i - 1].ts > 5 * 60000).length; return `${id}: mean ${(rs.reduce((a, x) => a + x.temperature, 0) / rs.length).toFixed(2)} °C, ${gaps} gap${gaps === 1 ? '' : 's'}`; });
                    return (
                      <tr key={b.id}>
                        <td className="num">{b.id}</td><td className="num c-muted">{stamp(b.at)}</td><td>{b.filename}</td>
                        <td className="r num c-ok">{b.valid}</td><td className="r num">{b.rejected}</td><td>{b.units.join(', ')}</td>
                        <td className="c-muted" style={{ fontSize: 13.5 }}>{per.join(' · ')}</td>
                        <td className="r"><button className="btn sm ghost" onClick={() => dispatch({ type: 'removeImport', id: b.id })} aria-label={`Remove ${b.id}`}><Trash2 size={15} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
