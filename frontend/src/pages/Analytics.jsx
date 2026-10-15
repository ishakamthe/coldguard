import React, { useMemo, useState } from 'react';
import { useStore, clock } from '../lib/store.jsx';
import { Head, Card, Tag, Tabs, AgentIcon, Typewriter, CountUp, Empty, RiskTag } from '../components/ui.jsx';
import { TrendLines, RiskBars, UNIT_COLORS } from '../components/charts.jsx';

function recoveries(u, range) {
  const s = u.series; const idx = (m) => s.length - 1 + m;
  return u.doorEvents.filter((d) => d.m >= -range).map((d) => {
    const before = s[Math.max(0, idx(d.m) - 1)]?.temp ?? s[idx(d.m)].temp;
    let peak = -Infinity; let back = null;
    for (let i = idx(d.m); i < s.length; i++) {
      const t = s[i].temp; if (t == null) continue;
      peak = Math.max(peak, t);
      if (i > idx(d.m) + d.minutes && t <= before + 0.3) { back = i - (idx(d.m) + d.minutes); break; }
    }
    return { ...d, before, peak, recoveryMin: back };
  });
}
const CELL = (h) => (h == null ? '#141c2b' : h.inExc ? '#d93a3a' : h.p >= 60 ? '#e2621b' : h.p >= 30 ? '#c79a3a' : h.p >= 15 ? '#2c4a3d' : '#1d3a2e');

export default function Analytics() {
  const { units } = useStore();
  const [range, setRange] = useState(1440);
  const [unitF, setUnitF] = useState('All');
  const [riskF, setRiskF] = useState('All');
  const [evF, setEvF] = useState('all');
  const sel = units.filter((u) => unitF === 'All' || u.id === unitF);
  const r = Math.min(range, ...units.map((u) => u.series.length - 1));

  const stats = useMemo(() => sel.map((u) => {
    const w = u.series.slice(-(r + 1));
    const v = w.map((x) => x.temp).filter((x) => x != null);
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const hist = u.history.filter((h) => h.m >= -r);
    const dist = { Low: 0, Medium: 0, High: 0 };
    hist.forEach((h) => dist[h.category]++);
    const n = Math.max(hist.length, 1);
    const rec = recoveries(u, r);
    const recDone = rec.filter((x) => x.recoveryMin != null);
    const lastHour = u.series.slice(-61).map((x) => x.temp).filter((x) => x != null);
    return {
      u, mean, min: Math.min(...v), max: Math.max(...v), missing: w.length - v.length,
      dist: { id: u.id, Low: (dist.Low / n) * 100, Medium: (dist.Medium / n) * 100, High: (dist.High / n) * 100 },
      highMin: dist.High * (u.simulated ? 2 : 5), rec, avgRec: recDone.length ? recDone.reduce((a, b) => a + b.recoveryMin, 0) / recDone.length : null,
      exc: u.excursions.filter((e) => e.end >= -r), warn: u.alerts.filter((a) => a.m >= -r),
      nearMin: w.filter((x) => x.temp != null && x.temp >= u.upper - 1).length,
      hourRise: lastHour.length > 1 ? lastHour[lastHour.length - 1] - lastHour[0] : 0,
    };
  }), [sel, r]);

  // hour-by-hour risk map: highest risk evaluated in each hour, per unit
  const hours = Math.ceil(r / 60);
  const heat = units.map((u) => {
    const cells = Array.from({ length: hours }, (_, i) => {
      const a = -r + i * 60; const b = a + 60;
      const hs = u.history.filter((h) => h.m >= a && h.m < b + (i === hours - 1 ? 1 : 0));
      const ex = u.excursions.some((e) => e.start < b && e.end >= a);
      return hs.length ? { p: Math.max(...hs.map((h) => h.probability)), inExc: ex, a } : null;
    });
    return { u, cells };
  });

  const insights = [];
  stats.forEach((s) => {
    const f = s.u.assessment.features;
    if (f.slope60 > 0.01 && s.hourRise > 1) insights.push(`${s.u.name} warmed ${s.hourRise.toFixed(1)} °C in the last hour.`);
    if (s.exc.length) insights.push(`${s.u.name} left its limits ${s.exc.length === 1 ? 'once' : `${s.exc.length} times`}, for up to ${Math.max(...s.exc.map((e) => e.minutes))} min (peak ${Math.max(...s.exc.map((e) => e.peak)).toFixed(1)} °C).`);
    if (s.rec.length >= 3 && s.avgRec != null) insights.push(`${s.u.name} recovered from door openings in ${s.avgRec.toFixed(0)} min on average.`);
    if (s.dist.Low === 100 && s.rec.length < 3) insights.push(`${s.u.name} stayed low-risk the whole time.`);
  });

  const events = [];
  stats.forEach((s) => {
    s.rec.forEach((d) => events.push({ type: 'door', m: d.m, u: s.u, text: `Door open ${d.minutes} min, peak ${d.peak.toFixed(1)} °C, ${d.recoveryMin == null ? 'not yet recovered' : `back to normal ${d.recoveryMin} min after closing`}` }));
    s.exc.forEach((e) => events.push({ type: 'excursion', m: e.start, u: s.u, text: `Above the ${e.limit} limit for ${e.minutes} min, peak ${e.peak.toFixed(1)} °C${e.ongoing ? ', ongoing' : ''}` }));
    s.warn.forEach((a) => events.push({ type: 'warning', m: a.m, u: s.u, text: `Early warning, ${a.severity.toLowerCase()} risk ${a.probability}%${a.condition === 'active' ? ', still open' : ''}` }));
    let start = null;
    const w = s.u.series.slice(-(r + 1));
    w.forEach((x, i) => {
      if (!x.cooling && start == null) start = x.m;
      if ((x.cooling || i === w.length - 1) && start != null) { const len = x.m - start; if (len > 25) events.push({ type: 'cooling', m: start, u: s.u, text: `Cooling off for ${len} min${x.cooling ? '' : ', still off'}` }); start = null; }
    });
  });
  const shownEvents = events.filter((e) => evF === 'all' || e.type === evF).sort((a, b) => b.m - a.m);

  const periods = [];
  stats.forEach((s) => {
    let cur = null;
    const hs = s.u.history.filter((h) => h.m >= -r);
    hs.forEach((h, i) => {
      const match = riskF === 'All' ? h.category !== 'Low' : h.category === riskF;
      if (match && !cur) cur = { u: s.u, a: h.m, b: h.m, peak: h.probability, cat: h.category };
      else if (match) { cur.b = h.m; cur.peak = Math.max(cur.peak, h.probability); if (h.category === 'High') cur.cat = 'High'; }
      if ((!match || i === hs.length - 1) && cur) { periods.push(cur); cur = null; }
    });
  });
  periods.sort((a, b) => b.a - a.a);

  const tot = { exc: stats.reduce((n, s) => n + s.exc.length, 0), warn: stats.reduce((n, s) => n + s.warn.length, 0), high: stats.reduce((n, s) => n + s.highMin, 0) };
  const label = { 360: '6 hours', 720: '12 hours', 1440: '24 hours' }[range];

  return (
    <>
      <Head eyebrow="History" title="Analytics" sub="How each unit behaved over time: temperatures, risk, door openings, cooling and excursions."
        right={<>
          <select className="select" id="an-unit" style={{ width: 'auto', background: 'var(--card)' }} value={unitF} onChange={(e) => setUnitF(e.target.value)} aria-label="Unit"><option value="All">All units</option>{units.map((u) => <option key={u.id} value={u.id}>{u.id} {u.name}</option>)}</select>
          <Tabs boxed label="Date range" value={range} onChange={setRange} options={[{ value: 360, label: '6 h' }, { value: 720, label: '12 h' }, { value: 1440, label: '24 h' }]} />
        </>} />

      <section className="night">
        <div className="night-grid" style={{ gridTemplateColumns: 'minmax(0, 0.75fr) minmax(0, 1.6fr)' }}>
          <div className="flex flex-col">
            <div className="agent"><AgentIcon />Last {label}</div>
            <h2 className="headline"><Typewriter key={`${range}-${unitF}`} text={insights[0] || 'A quiet period across the selected units.'} /></h2>
            <ul className="lede" style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {insights.slice(1, 5).map((t) => <li key={t}>{t}</li>)}
            </ul>
            <div className="bigs" style={{ marginTop: 'auto', paddingTop: 26 }}>
              <div><div className="n"><CountUp value={tot.exc} /></div><div className="l">Excursions</div></div>
              <div><div className="n"><CountUp value={tot.warn} /></div><div className="l">Early warnings</div></div>
              <div><div className="n"><CountUp value={tot.high} /></div><div className="l">High-risk minutes</div></div>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex justify-between gap-3 flex-wrap" style={{ marginBottom: 12 }}>
              <span className="label">Highest risk in each hour</span>
              <span className="legend" style={{ fontSize: 12.5, gap: 14 }}>
                <span><i className="dot" style={{ background: '#1d3a2e' }} />Low</span>
                <span><i className="dot" style={{ background: '#c79a3a' }} />Medium</span>
                <span><i className="dot" style={{ background: '#e2621b' }} />High</span>
                <span><i className="dot" style={{ background: '#d93a3a' }} />Excursion</span>
              </span>
            </div>
            <div className="table-wrap">
              <div className="heat" style={{ gridTemplateColumns: `auto repeat(${hours}, minmax(14px, 1fr))`, minWidth: hours * 16 + 60 }}>
                {heat.map(({ u, cells }, ri) => (
                  <React.Fragment key={u.id}>
                    <span className="lbl" style={{ opacity: unitF === 'All' || unitF === u.id ? 1 : 0.35 }}>{u.id}</span>
                    {cells.map((c, i) => (
                      <span key={i} className="cell" title={c ? `${u.id} · ${clock(c.a)}–${clock(c.a + 60)} · peak risk ${c.p}%${c.inExc ? ' · excursion' : ''}` : 'No data'}
                        style={{ background: CELL(c), opacity: unitF === 'All' || unitF === u.id ? 1 : 0.35, animationDelay: `${i * 18 + ri * 60}ms` }} />
                    ))}
                  </React.Fragment>
                ))}
                <span />
                {Array.from({ length: hours }, (_, i) => <span key={i} className="hr">{i % Math.max(1, Math.round(hours / 6)) === 0 ? clock(-r + i * 60).slice(0, 2) : ''}</span>)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {sel.length === 0 ? <Empty>No units selected.</Empty> : (
        <div className="grid enter">
          <Card className="s7" title="Temperature" sub={`All selected units, last ${label}`}
            right={<span className="flex gap-3 flex-wrap" style={{ fontSize: 13 }}>{sel.map((u) => <span key={u.id}><i className="dot" style={{ background: UNIT_COLORS[u.id] }} />{u.id}</span>)}</span>}>
            <TrendLines units={sel} range={r} />
          </Card>
          <Card className="s5" title="Time in each risk band" sub="Share of 5-minute evaluations">
            <RiskBars data={stats.map((s) => s.dist)} />
          </Card>

          <Card className="s12" title="Unit comparison" sub={`Last ${label}`}>
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Unit</th><th className="r">Mean</th><th className="r">Range</th><th className="r">Min near limit</th><th className="r">Door openings</th><th className="r">Avg recovery</th><th className="r">Warnings</th><th className="r">Excursions</th><th className="r">High-risk min</th></tr></thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.u.id}>
                      <td><span className="flex items-center gap-2"><i className="dot" style={{ background: UNIT_COLORS[s.u.id], margin: 0 }} />{s.u.id} <span className="c-muted">{s.u.name}</span></span></td>
                      <td className="r num">{s.mean.toFixed(2)} °C</td><td className="r num">{s.min.toFixed(1)}–{s.max.toFixed(1)}</td>
                      <td className="r num">{s.nearMin}</td><td className="r num">{s.rec.length}</td>
                      <td className="r num">{s.avgRec == null ? '—' : `${s.avgRec.toFixed(0)} min`}</td>
                      <td className="r num">{s.warn.length}</td><td className="r num" style={{ color: s.exc.length ? 'var(--crit)' : undefined }}>{s.exc.length}</td><td className="r num">{s.highMin}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="s6" title="Elevated-risk periods" sub={`${periods.length} period${periods.length === 1 ? '' : 's'}`}
            right={<Tabs label="Risk level" value={riskF} onChange={setRiskF} options={[{ value: 'All', label: 'Both' }, 'High', 'Medium']} />}>
            {periods.length === 0 ? <Empty>None at this level.</Empty> : (
              <div className="rows" style={{ maxHeight: 360, overflowY: 'auto' }}>
                {periods.map((p, i) => (
                  <div className="row" key={i}>
                    <Tag kind="dark">{p.u.id}</Tag>
                    <span><span className="num">{clock(p.a)} – {p.b === 0 ? 'now' : clock(p.b)}</span><span className="row-sub block">{p.b - p.a + 5} min · peak {p.peak}%</span></span>
                    <RiskTag cat={p.cat}>{p.cat}</RiskTag>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="s6" title="Events" sub="Door, cooling, warnings and excursions"
            right={<select className="select" id="an-ev" style={{ width: 'auto' }} value={evF} onChange={(e) => setEvF(e.target.value)} aria-label="Event type"><option value="all">All events</option><option value="door">Door openings</option><option value="cooling">Cooling off</option><option value="warning">Early warnings</option><option value="excursion">Excursions</option></select>}>
            {shownEvents.length === 0 ? <Empty>No events of this type.</Empty> : (
              <div className="rows" style={{ maxHeight: 360, overflowY: 'auto' }}>
                {shownEvents.map((e, i) => (
                  <div className="row" key={i}>
                    <span className="num c-muted" style={{ fontSize: 13 }}>{clock(e.m)}</span>
                    <span><span className="row-title block">{e.u.id} {e.u.name}</span><span className="row-sub block">{e.text}</span></span>
                    <Tag kind={{ excursion: 'crit', warning: 'high', door: 'warn', cooling: 'info' }[e.type]}>{e.type}</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

