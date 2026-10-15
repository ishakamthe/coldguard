import React from 'react';
import { ShieldCheck, TriangleAlert, OctagonAlert, FlaskConical, Inbox } from 'lucide-react';
import { useStore, riskClass } from '../lib/store.jsx';

export function RiskBadge({ cat, label }) {
  const Icon = cat === 'High' ? OctagonAlert : cat === 'Medium' ? TriangleAlert : ShieldCheck;
  return (
    <span className={`badge ${riskClass(cat)}`}>
      <Icon size={12} aria-hidden="true" />
      {label || cat}
    </span>
  );
}

export function Badge({ kind = 'neutral', children, icon: Icon }) {
  return <span className={`badge ${kind}`}>{Icon && <Icon size={12} aria-hidden="true" />}{children}</span>;
}

export function DemoTag({ children = 'Simulated data' }) {
  return <span className="demo-pill" title="Synthetic demonstration data, not live sensor measurements"><FlaskConical size={12} aria-hidden="true" />{children}</span>;
}

export function Panel({ title, note, right, children, className = '', id }) {
  return (
    <section className={`panel ${className}`} id={id}>
      {(title || right) && (
        <div className="panel-head">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
            {note && <div className="panel-note">{note}</div>}
          </div>
          {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHead({ eyebrow, title, sub, right }) {
  return (
    <header className="page-head">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </header>
  );
}

export function Seg({ options, value, onChange, label }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return (
          <button key={v} type="button" className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onChange, label, id }) {
  return (
    <button type="button" id={id} className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ background: 'none', border: 0, padding: 0 }}>
      <span className="track" />
      <span>{label}</span>
    </button>
  );
}

export function UnitPicker({ value, onChange }) {
  const { units } = useStore();
  return (
    <div className="seg" role="group" aria-label="Storage unit">
      {units.map((u) => (
        <button key={u.id} type="button" className={value === u.id ? 'on' : ''} aria-pressed={value === u.id} onClick={() => onChange(u.id)} title={`${u.name} · ${u.assessment.category} risk`}>
          <span className="mono">{u.id}</span>
          <span className={`c-${riskClass(u.assessment.category)}`} style={{ marginLeft: 6 }} aria-label={`${u.assessment.category} risk`}>
            {u.assessment.category === 'High' ? '▲' : u.assessment.category === 'Medium' ? '◆' : '●'}
          </span>
        </button>
      ))}
    </div>
  );
}

const factorColor = (v) => (v >= 1 ? 'var(--amber)' : v >= 0.5 ? '#c9a646' : 'var(--neon-dim)');
export function FactorBars({ factors, limit = 6 }) {
  const shown = factors.slice(0, limit);
  const max = Math.max(1.5, ...shown.map((f) => f.value));
  return (
    <div className="flex flex-col gap-2">
      {shown.map((f) => (
        <div className="factor" key={f.key}>
          <span>{f.label}</span>
          <span className="bar" role="img" aria-label={`${f.label}: contribution ${f.value.toFixed(2)}`}>
            <i style={{ width: `${Math.max(2, (f.value / max) * 100)}%`, background: factorColor(f.value) }} />
          </span>
          <span className="num c-muted" style={{ textAlign: 'right' }}>+{f.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

export function Dial({ value, cat, size = 128 }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r * 0.75;
  const col = cat === 'High' ? 'var(--coral)' : cat === 'Medium' ? 'var(--amber)' : 'var(--neon)';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Excursion probability ${value} percent`}>
      <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth="10" strokeDasharray={`${c} ${2 * Math.PI * r}`} strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={col} strokeWidth="10" strokeDasharray={`${(c * value) / 100} ${2 * Math.PI * r}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .4s' }} />
      </g>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill={col} fontFamily="var(--font-mono)" fontWeight="600" fontSize={size * 0.24}>{value}%</text>
    </svg>
  );
}

export function Empty({ children, icon: Icon = Inbox }) {
  return <div className="empty"><Icon size={18} style={{ margin: '0 auto 6px', opacity: 0.6 }} aria-hidden="true" />{children}</div>;
}

export function Field({ label, children, hint, error }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <small className="c-high">{error}</small> : hint ? <small className="c-faint">{hint}</small> : null}
    </label>
  );
}

export function Toasts() {
  const { toasts } = useStore();
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast ${t.kind}`}>{t.msg}</div>)}
    </div>
  );
}

export function KV({ items }) {
  return (
    <dl className="kv">
      {items.map(([k, v]) => (
        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
      ))}
    </dl>
  );
}
