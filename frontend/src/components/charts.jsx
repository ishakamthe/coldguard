import React from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ReferenceDot, BarChart, Bar, Legend,
} from 'recharts';
import { clock } from '../lib/store.jsx';

const C = { neon: '#55f58b', amber: '#f5b83d', coral: '#ff6b5e', teal: '#2dd4bf', grid: '#173322', muted: '#8fa89a' };
export const UNIT_COLORS = { 'FR-01': '#55f58b', 'FR-02': '#ff6b5e', 'FR-03': '#f5b83d', 'CR-04': '#2dd4bf' };

function Tip({ active, payload, label, timeOf = clock }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="chart-tip">
      <div className="mono c-muted" style={{ marginBottom: 4 }}>{timeOf(label)} {label > 0 ? '· prediction' : label === 0 ? '· now' : ''}</div>
      {row.temp != null && <div><span className="c-low">●</span> Measured (simulated): <b className="mono">{row.temp.toFixed(2)}°C</b></div>}
      {row.fc != null && label > 0 && <div><span className="c-medium">●</span> Forecast: <b className="mono">{row.fc.toFixed(2)}°C</b> <span className="c-faint">({row.band[0].toFixed(1)}–{row.band[1].toFixed(1)})</span></div>}
      {row.imported != null && <div><span className="c-teal">●</span> Imported observation: <b className="mono">{row.imported.toFixed(2)}°C</b></div>}
      {row.door && <div className="c-medium">Door open</div>}
      {row.cooling === false && <div className="c-faint">Cooling inactive</div>}
    </div>
  );
}

/* Measured history + forecast with uncertainty band, limits, now line,
   early-warning marker and predicted crossing (only if the forecast crosses). */
export function ForecastChart({ unit, past = 60, height = 300, showForecast = true }) {
  const a = unit.assessment;
  const fc = a.forecast;
  const rows = unit.series.slice(-(past + 1)).map((r) => ({ m: r.m, temp: r.temp, door: r.door, cooling: r.cooling }));
  const nowRow = rows[rows.length - 1];
  if (showForecast) {
    nowRow.fc = a.features.temp; nowRow.band = [a.features.temp, a.features.temp];
    fc.points.forEach((p) => rows.push({ m: p.m, fc: p.temp, band: [p.lo, p.hi] }));
  }
  const vals = rows.flatMap((r) => [r.temp, r.fc, r.band?.[1]]).filter((v) => v != null);
  const yMin = Math.floor(Math.min(unit.lower - 0.5, ...vals));
  const yMax = Math.ceil(Math.max(unit.upper + 1, ...vals));
  const maxM = showForecast ? fc.points.length : 0;
  const warn = unit.warningM != null && unit.warningM >= -past ? unit.warningM : null;
  const cross = showForecast ? fc.crossing : null;
  return (
    <div>
      <div className="chart-legend" style={{ marginBottom: 8 }}>
        <span><i style={{ borderColor: C.neon }} />Measured (simulated)</span>
        {showForecast && <span><i style={{ borderColor: C.amber, borderTopStyle: 'dashed' }} />Forecast (prediction, not certain)</span>}
        {showForecast && <span><i style={{ borderColor: 'rgba(245,184,61,.35)', borderTopWidth: 8 }} />Forecast range</span>}
        <span><i style={{ borderColor: C.coral, borderTopStyle: 'dashed' }} />Limits {unit.lower.toFixed(1)}–{unit.upper.toFixed(1)}°C</span>
        {warn != null && <span><i style={{ borderColor: C.amber }} />Early warning</span>}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 22, right: 18, bottom: 4, left: -8 }}>
            <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="m" type="number" domain={[-past, maxM]} tickFormatter={(m) => (m === 0 ? 'now' : `${m > 0 ? '+' : ''}${m}m`)} ticks={ticksFor(-past, maxM)} stroke={C.grid} />
            <YAxis domain={[yMin, yMax]} tickFormatter={(v) => `${v}°`} stroke={C.grid} width={44} allowDecimals={false} />
            <Tooltip content={<Tip />} />
            {showForecast && <ReferenceArea x1={0} x2={maxM} fill={C.amber} fillOpacity={0.04} label={{ value: `next ${maxM} min`, position: 'insideTopRight', fill: C.muted, fontSize: 11 }} />}
            <ReferenceLine y={unit.upper} stroke={C.coral} strokeDasharray="5 4" label={{ value: `Upper ${unit.upper.toFixed(1)}°C`, position: 'insideTopLeft', fill: C.coral, fontSize: 11 }} />
            <ReferenceLine y={unit.lower} stroke={C.teal} strokeDasharray="5 4" label={{ value: `Lower ${unit.lower.toFixed(1)}°C`, position: 'insideBottomLeft', fill: C.teal, fontSize: 11 }} />
            <ReferenceLine x={0} stroke={C.muted} strokeDasharray="2 3" label={{ value: `Now ${clock(0)}`, position: 'top', fill: C.muted, fontSize: 11 }} />
            {warn != null && <ReferenceLine x={warn} stroke={C.amber} label={{ value: `Early warning ${clock(warn)}`, position: 'insideTopLeft', fill: C.amber, fontSize: 11 }} />}
            {showForecast && <Area dataKey="band" stroke="none" fill={C.amber} fillOpacity={0.14} isAnimationActive={false} connectNulls />}
            <Line dataKey="temp" stroke={C.neon} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            {showForecast && <Line dataKey="fc" stroke={C.amber} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />}
            {cross && (
              <ReferenceDot x={cross.m} y={cross.limit === 'upper' ? unit.upper : unit.lower} r={6} fill={C.coral} stroke="#1b0605"
                label={{ value: `Possible crossing ~${clock(cross.m)}`, position: 'top', fill: C.coral, fontSize: 11 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ticksFor(a, b) {
  const span = b - a;
  const step = span <= 30 ? 5 : span <= 120 ? 15 : span <= 400 ? 60 : 180;
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b; t += step) out.push(t);
  if (!out.includes(0) && a <= 0 && b >= 0) out.push(0);
  return out.sort((x, y) => x - y);
}

/* Recent readings over a selectable window, door-open spans shaded. */
export function ReadingsChart({ unit, range, height = 280, imported }) {
  const step = range <= 60 ? 1 : range <= 360 ? 2 : 5;
  const series = unit.series.slice(-(range + 1));
  const rows = series.filter((r, i) => i % step === 0 || i === series.length - 1).map((r) => ({ m: r.m, temp: r.temp, door: r.door, cooling: r.cooling }));
  if (imported?.length) imported.forEach((p) => { if (p.m >= -range && p.m <= 0) rows.push({ m: p.m, imported: p.temp }); });
  rows.sort((x, y) => x.m - y.m);
  const doors = unit.doorEvents.filter((d) => d.m + d.minutes >= -range);
  const vals = rows.flatMap((r) => [r.temp, r.imported]).filter((v) => v != null);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="m" type="number" domain={[-range, 0]} ticks={ticksFor(-range, 0)} tickFormatter={(m) => clock(m)} stroke={C.grid} />
          <YAxis domain={[Math.floor(Math.min(unit.lower - 0.5, ...vals)), Math.ceil(Math.max(unit.upper + 0.5, ...vals))]} tickFormatter={(v) => `${v}°`} stroke={C.grid} width={44} />
          <Tooltip content={<Tip />} />
          {doors.map((d) => <ReferenceArea key={d.m} x1={Math.max(d.m, -range)} x2={d.m + d.minutes} fill={C.amber} fillOpacity={0.16} />)}
          <ReferenceLine y={unit.upper} stroke={C.coral} strokeDasharray="5 4" />
          <ReferenceLine y={unit.lower} stroke={C.teal} strokeDasharray="5 4" />
          <Line dataKey="temp" stroke={C.neon} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} />
          {imported?.length ? <Line dataKey="imported" stroke={C.teal} strokeWidth={0} dot={{ r: 2, fill: C.teal }} isAnimationActive={false} /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MultiTrend({ units, range, height = 280, valueKey = 'temp', fromHistory = false, yLabel = '°C' }) {
  const map = new Map();
  units.forEach((u) => {
    const src = fromHistory ? u.history : u.series;
    const step = fromHistory ? 1 : range <= 360 ? 2 : 5;
    src.forEach((r, i) => {
      if (r.m < -range || (!fromHistory && i % step !== 0)) return;
      const row = map.get(r.m) || { m: r.m };
      row[u.id] = fromHistory ? r[valueKey] : r.temp;
      map.set(r.m, row);
    });
  });
  const rows = [...map.values()].sort((a, b) => a.m - b.m);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="m" type="number" domain={[-range, 0]} ticks={ticksFor(-range, 0)} tickFormatter={(m) => clock(m)} stroke={C.grid} />
          <YAxis stroke={C.grid} width={44} tickFormatter={(v) => `${v}${yLabel === '%' ? '%' : '°'}`} domain={yLabel === '%' ? [0, 100] : ['auto', 'auto']} />
          <Tooltip contentStyle={{ background: '#050907', border: '1px solid #2a5a3e', borderRadius: 8, fontSize: 12 }} labelFormatter={(m) => clock(m)} formatter={(v, n) => [v == null ? '—' : `${v.toFixed?.(yLabel === '%' ? 0 : 2) ?? v}${yLabel}`, n]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {units.map((u) => <Line key={u.id} dataKey={u.id} stroke={UNIT_COLORS[u.id]} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls={fromHistory} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskDistribution({ data, height = 240 }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: -16 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="id" stroke={C.grid} />
          <YAxis stroke={C.grid} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <Tooltip contentStyle={{ background: '#050907', border: '1px solid #2a5a3e', borderRadius: 8, fontSize: 12 }} formatter={(v, n) => [`${v.toFixed(1)}% of time`, n]} cursor={{ fill: 'rgba(85,245,139,.05)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Low" stackId="a" fill={C.neon} fillOpacity={0.75} />
          <Bar dataKey="Medium" stackId="a" fill={C.amber} />
          <Bar dataKey="High" stackId="a" fill={C.coral} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* Simulator chart: x = simulated minutes since start */
export function SimChart({ series, assessment, upper, lower, height = 320 }) {
  const lastM = series[series.length - 1].m;
  const rows = series.filter((r) => r.m >= lastM - 90).map((r) => ({ m: r.m, temp: r.temp, door: r.door, cooling: r.cooling }));
  const now = rows[rows.length - 1];
  now.fc = assessment.features.temp; now.band = [now.fc, now.fc];
  assessment.forecast.points.forEach((p) => rows.push({ m: lastM + p.m, fc: p.temp, band: [p.lo, p.hi] }));
  const vals = rows.flatMap((r) => [r.temp, r.band?.[1]]).filter((v) => v != null);
  const cross = assessment.forecast.crossing;
  const doorSpans = [];
  rows.forEach((r, i) => { if (r.door && !(rows[i - 1]?.door)) doorSpans.push({ a: r.m, b: r.m }); if (r.door) doorSpans[doorSpans.length - 1].b = r.m; });
  const timeOf = (m) => `t ${m >= 0 ? '+' : ''}${m} min`;
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 22, right: 18, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="m" type="number" domain={[rows[0].m, rows[rows.length - 1].m]} ticks={ticksFor(rows[0].m, rows[rows.length - 1].m)} tickFormatter={(m) => `${m}m`} stroke={C.grid} />
          <YAxis domain={[Math.floor(Math.min(lower - 0.5, ...vals)), Math.ceil(Math.max(upper + 1, ...vals))]} tickFormatter={(v) => `${v}°`} stroke={C.grid} width={44} />
          <Tooltip content={<Tip timeOf={timeOf} />} />
          {doorSpans.map((d) => <ReferenceArea key={d.a} x1={d.a} x2={d.b + 1} fill={C.amber} fillOpacity={0.16} />)}
          <ReferenceArea x1={lastM} x2={lastM + assessment.forecast.points.length} fill={C.amber} fillOpacity={0.04} />
          <ReferenceLine y={upper} stroke={C.coral} strokeDasharray="5 4" label={{ value: `Upper ${upper.toFixed(1)}°C`, position: 'insideTopLeft', fill: C.coral, fontSize: 11 }} />
          <ReferenceLine y={lower} stroke={C.teal} strokeDasharray="5 4" />
          <ReferenceLine x={lastM} stroke={C.muted} strokeDasharray="2 3" label={{ value: 'sim now', position: 'top', fill: C.muted, fontSize: 11 }} />
          <ReferenceLine x={0} stroke="#2a5a3e" label={{ value: 'start', position: 'insideBottomRight', fill: C.muted, fontSize: 10 }} />
          <Area dataKey="band" stroke="none" fill={C.amber} fillOpacity={0.14} isAnimationActive={false} connectNulls />
          <Line dataKey="temp" stroke={C.neon} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="fc" stroke={C.amber} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} connectNulls />
          {cross && <ReferenceDot x={lastM + cross.m} y={cross.limit === 'upper' ? upper : lower} r={6} fill={C.coral} stroke="#1b0605" label={{ value: `crossing in ~${cross.m} min`, position: 'top', fill: C.coral, fontSize: 11 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
