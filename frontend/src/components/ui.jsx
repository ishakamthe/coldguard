import React, { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, X, ChevronDown } from 'lucide-react';
import { useStore } from '../lib/store.jsx';

/* ---------- risk helpers ---------- */
export const riskKind = (cat, inExcursion) => (inExcursion ? 'crit' : cat === 'High' ? 'high' : cat === 'Medium' ? 'warn' : 'ok');
export const riskColor = (cat, inExcursion) => ({ crit: 'var(--crit)', high: 'var(--high)', warn: 'var(--warn)', ok: 'var(--ok)' }[riskKind(cat, inExcursion)]);
export const riskHex = (cat, inExcursion) => ({ crit: '#d93a3a', high: '#e2621b', warn: '#b97d00', ok: '#1a8f52' }[riskKind(cat, inExcursion)]);

export function Tag({ kind = 'line', children, className = '' }) {
  return <span className={`tag ${kind} ${className}`}>{children}</span>;
}
export function RiskTag({ cat, inExcursion, children }) {
  return <Tag kind={riskKind(cat, inExcursion)}>{children || (inExcursion ? 'Excursion' : `${cat} risk`)}</Tag>;
}
export function Sev({ cat, value, inExcursion }) {
  return (
    <span className="sev">
      <i style={{ background: riskColor(cat, inExcursion) }} aria-hidden="true" />
      {value != null && <b className="num" style={{ fontWeight: 500 }}>{value}</b>}
      <span className="c-muted">{inExcursion ? 'Excursion' : cat}</span>
    </span>
  );
}

/* brand mark: a sensor ring with a live dot */
export function Mark({ size = 26 }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <path d="M8 4.5a10 10 0 0 0 0 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 4.5a10 10 0 0 1 0 17" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="13" cy="13" r="3.6" fill="var(--accent)" />
    </svg>
  );
}
export function AgentIcon() {
  return (
    <span className="agent-ico" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 26 26"><path d="M8 5a9 9 0 0 0 0 16M18 5a9 9 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /><circle cx="13" cy="13" r="3.4" fill="currentColor" /></svg>
    </span>
  );
}

export function Head({ eyebrow, title, sub, right }) {
  return (
    <header className="head">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="title">{title}</h1>
        {sub && <p className="subtitle">{sub}</p>}
      </div>
      {right && <div className="head-actions">{right}</div>}
    </header>
  );
}

export function Card({ title, sub, right, children, className = '', id }) {
  return (
    <section className={`card ${className}`} id={id}>
      {(title || right) && (
        <div className="card-head">
          <div className="min-w-0">
            {title && <h2 className="card-title">{title}</h2>}
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tabs({ options, value, onChange, label, boxed }) {
  return (
    <div className={`tabs ${boxed ? 'boxed' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        return (
          <button key={String(v)} type="button" role="tab" aria-selected={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>
            {typeof o === 'object' ? o.label : o}
            {typeof o === 'object' && o.count != null && <span className="count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ on, onChange, label, id }) {
  return (
    <button type="button" id={id} className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="track" />
      <span>{label}</span>
    </button>
  );
}

export function Field({ label, children, hint, error }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="c-crit">{error}</small> : hint ? <small className="c-faint">{hint}</small> : null}
    </label>
  );
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
    </dl>
  );
}

export function Note({ label, time, children }) {
  return (
    <div className="note">
      <div className="note-head"><AgentIcon />{label}{time && <span className="t">{time}</span>}</div>
      <div style={{ fontSize: 14.5 }}>{children}</div>
    </div>
  );
}

const fColor = (v) => (v >= 1 ? 'var(--high)' : v >= 0.5 ? 'var(--warn)' : 'var(--accent)');
export function FactorBars({ factors, limit = 5 }) {
  const shown = factors.slice(0, limit);
  const max = Math.max(1.5, ...shown.map((f) => f.value));
  return (
    <div>
      {shown.map((f, i) => (
        <div className="factor" key={f.key}>
          <span>{f.label}</span>
          <span className="bar" role="img" aria-label={`${f.label}: weight ${f.value.toFixed(2)}`}>
            <i style={{ width: `${Math.max(2, (f.value / max) * 100)}%`, background: fColor(f.value), animationDelay: `${i * 80}ms` }} />
          </span>
          <span className="num c-muted" style={{ textAlign: 'right', fontSize: 13 }}>+{f.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Toasts() {
  const { toasts, dismissToast } = useStore();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.kind === 'error' ? <CircleAlert size={20} className="c-crit" aria-hidden="true" /> : <CircleCheck size={20} className="c-ok" aria-hidden="true" />}
          <div>
            <div>{t.msg}</div>
            {t.sub && <div className="c-muted" style={{ fontSize: 13, marginTop: 2 }}>{t.sub}</div>}
          </div>
          <button className="x" onClick={() => dismissToast(t.id)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* types the text once whenever it changes; a caret blinks while typing */
export function Typewriter({ text, speed = 22 }) {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (reducedMotion()) { setN(text.length); return undefined; }
    setN(0);
    let i = 0;
    const id = setInterval(() => { i += 1; setN(i); if (i >= text.length) clearInterval(id); }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  const done = n >= text.length;
  return (
    <span className={done ? '' : 'caret'} aria-label={text}>
      <span aria-hidden="true">{text.slice(0, n)}</span>
    </span>
  );
}

/* animates a number from its previous value to the new one */
export function CountUp({ value, decimals = 0, suffix = '', duration = 800 }) {
  const [v, setV] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion() || !Number.isFinite(value)) { setV(value); from.current = value; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      setV(a + (value - a) * e);
      if (t < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); from.current = value; };
  }, [value, duration]);
  return <span className="tnum">{Number.isFinite(v) ? v.toFixed(decimals) : '—'}{suffix}</span>;
}

export function Sheet({ open, onClose, title, sub, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <aside className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="card-title">{title}</h2>
            {sub && <div className="card-sub">{sub}</div>}
          </div>
          <button className="round-btn" style={{ background: 'var(--card-2)', width: 36, height: 36 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </aside>
    </>
  );
}

export function Why({ summary = 'Why was this flagged?', children, open }) {
  return (
    <details className="why" open={open}>
      <summary>{summary}<ChevronDown size={15} aria-hidden="true" /></summary>
      <div style={{ marginTop: 12 }}>{children}</div>
    </details>
  );
}

export function Sparkline({ values, color = 'var(--text)', upper, height = 44 }) {
  const v = values.filter((x) => x != null);
  if (v.length < 2) return null;
  const min = Math.min(...v) - 0.3;
  const max = Math.max(...v, upper ?? -Infinity) + 0.2;
  const W = 200; const H = height;
  const x = (i) => (i / (values.length - 1)) * W;
  const y = (t) => H - 3 - ((t - min) / (max - min || 1)) * (H - 6);
  let d = ''; let pen = false;
  values.forEach((t, i) => { if (t == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(t).toFixed(1)}`; pen = true; });
  const lastI = values.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">
      {upper != null && <line x1="0" x2={W} y1={y(upper)} y2={y(upper)} stroke="var(--high)" strokeDasharray="3 4" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.7" />}
      <path className="l" d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {values[lastI] != null && <circle cx={x(lastI)} cy={y(values[lastI])} r="2.6" fill={color} />}
    </svg>
  );
}
