import React from 'react';
import {
  ResponsiveContainer, ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ReferenceArea, ReferenceDot, BarChart, Bar,
} from 'recharts';
import { clock } from '../lib/store.jsx';

const THEMES = {
  dark: { line: '#edf0f5', area: '#edf0f5', grid: '#1d2738', fc: '#8f83ff', upper: '#ff8a4c', lower: '#5f8fe8', now: '#56627a', door: '#f5c451', pillBg: '#ffffff', pillText: '#0d1117' },
  light: { line: '#0d1117', area: '#0d1117', grid: '#eceef1', fc: '#6b5cf6', upper: '#e2621b', lower: '#2c66de', now: '#b5bac3', door: '#b97d00', pillBg: '#0b1220', pillText: '#ffffff' },
};
export const UNIT_COLORS = { 'FR-01': '#6b5cf6', 'FR-02': '#0d1117', 'FR-03': '#2c66de', 'CR-04': '#14a3a0' };

function ticksFor(a, b) {
  const span = b - a;
  const step = span <= 45 ? 10 : span <= 120 ? 20 : span <= 420 ? 60 : 240;
  const out = [];
  for (let t = Math.ceil(a / step) * step; t <= b; t += step) out.push(t);
  if (a <= 0 && b >= 0 && !out.includes(0)) out.push(0);
  return out.sort((x, y) => x - y);
}

/* pill label used for event markers, drawn inside the SVG */
const Pill = (text, bg, fg, place = 'top') => function PillLabel({ viewBox }) {
  if (!viewBox) return null;
  const w = text.length * 6.6 + 20;
  const cx = viewBox.x + (viewBox.width || 0) / 2;
  const left = Math.max(2, cx - w / 2);
  const y = place === 'top' ? (viewBox.y ?? 0) + 4 : (viewBox.y ?? 0) - 28;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect x={left} y={y} width={w} height={22} rx={11} fill={bg} />
      <text x={left + w / 2} y={y + 15} textAnchor="middle" fill={fg} fontSize="11.5" fontFamily="Geist, Inter, sans-serif">{text}</text>
    </g>
  );
};

function TempTip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  return (
    <div className="tip">
      <div className="h">{fmt(label)}{label > 0 ? ' · forecast' : label === 0 ? ' · now' : ''}</div>
      {r.temp != null && <div className="r"><span className="c-muted">Measured</span><b className="num" style={{ fontWeight: 500 }}>{r.temp.toFixed(2)} °C</b></div>}
      {r.fc != null && label > 0 && <div className="r"><span className="c-muted">Forecast</span><b className="num" style={{ fontWeight: 500 }}>{r.fc.toFixed(2)} °C</b></div>}
      {r.band && label > 0 && <div className="r"><span className="c-muted">Range</span><span className="num">{r.band[0].toFixed(1)}–{r.band[1].toFixed(1)}</span></div>}
      {r.imported != null && <div className="r"><span className="c-muted">Imported</span><b className="num">{r.imported.toFixed(2)} °C</b></div>}
      {r.door && <div className="r"><span className="c-warn">Door open</span></div>}
      {r.cooling === false && label <= 0 && <div className="r"><span className="c-muted">Cooling off</span></div>}
    </div>
  );
}

/*
 * Measured history + forecast for one unit.
 * series: rows with m (minutes relative to now), temp, door, cooling
 * assessment: engine output (forecast + features)
 */
export function TempChart({ series, assessment, upper, lower, past = 60, height = 300, theme = 'dark', warnAt = null, showForecast = true, fmt = clock, imported, nowLabel = 'Now', animate = true }) {
  const T = THEMES[theme];
  const fc = assessment.forecast;
  const step = past <= 120 ? 1 : past <= 400 ? 3 : 6;
  const src = series.slice(-(past + 1));
  const rows = src.filter((r, i) => i % step === 0 || i === src.length - 1).map((r) => ({ m: r.m, temp: r.temp, door: r.door, cooling: r.cooling }));
  const lastM = rows[rows.length - 1].m;
  if (showForecast) {
    rows[rows.length - 1].fc = assessment.features.temp;
    rows[rows.length - 1].band = [assessment.features.temp, assessment.features.temp];
    fc.points.forEach((p) => rows.push({ m: lastM + p.m, fc: p.temp, band: [p.lo, p.hi] }));
  }
  if (imported?.length) imported.forEach((p) => { if (p.m >= lastM - past && p.m <= lastM) rows.push({ m: p.m, imported: p.temp }); });
  rows.sort((a, b) => a.m - b.m);
  const vals = rows.flatMap((r) => [r.temp, r.fc, r.band?.[1], r.imported]).filter((v) => v != null);
  const yMin = Math.floor(Math.min(lower - 0.5, ...vals));
  const yMax = Math.ceil(Math.max(upper + 1, ...vals));
  const x0 = lastM - past;
  const x1 = lastM + (showForecast ? fc.points.length : 0);
  const doors = [];
  src.forEach((r, i) => { if (r.door && !src[i - 1]?.door) doors.push({ a: r.m, b: r.m + 1 }); else if (r.door) doors[doors.length - 1].b = r.m + 1; });
  const cross = showForecast ? fc.crossing : null;
  const gid = `g-${theme}-${Math.round(upper * 10)}`;
  return (
    <div style={{ width: '100%', height }} className={theme === 'light' ? 'lightchart' : ''}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 34, right: 12, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.area} stopOpacity={theme === 'dark' ? 0.16 : 0.08} />
              <stop offset="100%" stopColor={T.area} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={T.grid} vertical={false} />
          <XAxis dataKey="m" type="number" domain={[x0, x1]} ticks={ticksFor(x0, x1)} tickFormatter={(m) => (m === lastM ? nowLabel : fmt(m))} stroke="transparent" tickMargin={8} />
          <YAxis domain={[yMin, yMax]} allowDecimals={false} tickFormatter={(v) => `${v}°`} stroke="transparent" width={44} />
          <Tooltip content={<TempTip fmt={fmt} />} cursor={{ stroke: T.now, strokeDasharray: '3 3' }} />
          {doors.map((d) => <ReferenceArea key={d.a} x1={Math.max(d.a, x0)} x2={d.b} fill={T.door} fillOpacity={0.12} />)}
          {showForecast && <ReferenceArea x1={lastM} x2={x1} fill={T.fc} fillOpacity={theme === 'dark' ? 0.06 : 0.04} />}
          <ReferenceLine y={upper} stroke={T.upper} strokeDasharray="5 5" label={{ value: `${upper.toFixed(1)} °C limit`, position: 'insideTopRight', fill: T.upper, fontSize: 11.5 }} />
          <ReferenceLine y={lower} stroke={T.lower} strokeDasharray="5 5" strokeOpacity={0.6} />
          <ReferenceLine x={lastM} stroke={T.now} strokeDasharray="3 3" />
          {warnAt != null && warnAt >= x0 && <ReferenceLine x={warnAt} stroke={T.upper} label={Pill(`Early warning ${fmt(warnAt)}`, '#e2621b', '#fff')} />}
          <Area dataKey="temp" stroke="none" fill={`url(#${gid})`} isAnimationActive={animate} animationDuration={900} connectNulls={false} />
          {showForecast && <Area dataKey="band" stroke="none" fill={T.fc} fillOpacity={0.18} isAnimationActive={animate} animationBegin={600} animationDuration={700} connectNulls />}
          <Line dataKey="temp" stroke={T.line} strokeWidth={2} dot={false} isAnimationActive={animate} animationDuration={900} connectNulls={false} />
          {showForecast && <Line dataKey="fc" stroke={T.fc} strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={animate} animationBegin={600} animationDuration={700} connectNulls />}
          {imported?.length ? <Line dataKey="imported" stroke="none" dot={{ r: 2.5, fill: '#14a3a0', stroke: 'none' }} isAnimationActive={false} /> : null}
          <ReferenceDot x={lastM} y={assessment.features.temp} r={4.5} fill={T.line} stroke={theme === 'dark' ? '#0b1220' : '#fff'} strokeWidth={2} />
          {cross && <ReferenceDot x={lastM + cross.m} y={cross.limit === 'upper' ? upper : lower} r={6} fill="#e2621b" stroke={theme === 'dark' ? '#0b1220' : '#fff'} strokeWidth={2} label={Pill(`Crosses ~${fmt(lastM + cross.m)}`, T.pillBg, T.pillText, 'above')} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLines({ units, range, height = 280, fromHistory = false, unit = '°C' }) {
  const map = new Map();
  units.forEach((u) => {
    const src = fromHistory ? u.history : u.series;
    const step = fromHistory ? 1 : range <= 360 ? 3 : 6;
    src.forEach((r, i) => {
      if (r.m < -range || (!fromHistory && i % step !== 0)) return;
      const row = map.get(r.m) || { m: r.m };
      row[u.id] = fromHistory ? r.probability : r.temp;
      map.set(r.m, row);
    });
  });
  const rows = [...map.values()].sort((a, b) => a.m - b.m);
  const pct = unit === '%';
  return (
    <div style={{ width: '100%', height }} className="lightchart">
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="#eceef1" vertical={false} />
          <XAxis dataKey="m" type="number" domain={[-range, 0]} ticks={ticksFor(-range, 0)} tickFormatter={(m) => (m === 0 ? 'Now' : clock(m))} stroke="transparent" tickMargin={8} />
          <YAxis stroke="transparent" width={44} tickFormatter={(v) => `${v}${pct ? '%' : '°'}`} domain={pct ? [0, 100] : ['auto', 'auto']} />
          <Tooltip
            content={({ active, payload, label }) => (active && payload?.length ? (
              <div className="tip"><div className="h">{clock(label)}</div>{payload.map((p) => <div className="r" key={p.dataKey}><span><i className="dot" style={{ background: p.color }} />{p.dataKey}</span><b className="num" style={{ fontWeight: 500 }}>{p.value == null ? '—' : `${p.value.toFixed(pct ? 0 : 2)}${pct ? '%' : ' °C'}`}</b></div>)}</div>
            ) : null)}
          />
          {units.map((u) => <Line key={u.id} dataKey={u.id} stroke={UNIT_COLORS[u.id]} dot={false} strokeWidth={1.7} isAnimationActive animationDuration={900} connectNulls={fromHistory} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RiskBars({ data, height = 250 }) {
  return (
    <div style={{ width: '100%', height }} className="lightchart">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }} barCategoryGap="28%">
          <CartesianGrid stroke="#eceef1" vertical={false} />
          <XAxis dataKey="id" stroke="transparent" tickMargin={8} />
          <YAxis stroke="transparent" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
          <Tooltip cursor={{ fill: 'rgba(13,17,23,0.04)' }} content={({ active, payload, label }) => (active && payload?.length ? (
            <div className="tip"><div className="h">{label}</div>{payload.slice().reverse().map((p) => <div className="r" key={p.dataKey}><span><i className="dot" style={{ background: p.fill }} />{p.dataKey}</span><span className="num">{p.value.toFixed(0)}% of time</span></div>)}</div>
          ) : null)} />
          <Bar dataKey="Low" stackId="a" fill="#d6dae1" isAnimationActive animationDuration={800} />
          <Bar dataKey="Medium" stackId="a" fill="#f0b429" isAnimationActive animationDuration={800} />
          <Bar dataKey="High" stackId="a" fill="#e2621b" radius={[6, 6, 0, 0]} isAnimationActive animationDuration={800} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
