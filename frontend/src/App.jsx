import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Search, Settings as Gear, RotateCcw, Info, Thermometer, BellRing, CornerDownLeft } from 'lucide-react';
import { useStore, E, DEFAULT_SIM } from './lib/store.jsx';
import { Mark, Toasts, Sev } from './components/ui.jsx';
import { ActionSheet } from './components/blocks.jsx';
import Home from './pages/Home.jsx';
import Units from './pages/Units.jsx';
import Simulator from './pages/Simulator.jsx';
import Alerts from './pages/Alerts.jsx';
import Analytics from './pages/Analytics.jsx';
import DataImport from './pages/DataImport.jsx';
import Reports from './pages/Reports.jsx';
import About from './pages/About.jsx';
import Settings from './pages/Settings.jsx';

export const ROUTES = [
  { id: 'home', label: 'Home', el: Home },
  { id: 'units', label: 'Units', el: Units },
  { id: 'simulator', label: 'Simulator', el: Simulator },
  { id: 'alerts', label: 'Alerts', el: Alerts },
  { id: 'analytics', label: 'Analytics', el: Analytics },
  { id: 'data', label: 'Data', el: DataImport },
  { id: 'reports', label: 'Reports', el: Reports },
  { id: 'about', label: 'About', el: About },
  { id: 'settings', label: 'Settings', el: Settings, hidden: true },
];

// Bare-token hash routing (#units-FR-02, #alerts-AL…) so deep links work anywhere.
function parseHash() {
  const h = decodeURIComponent((window.location.hash || '').replace(/^#/, ''));
  const [route, ...rest] = h.split('-');
  const r = ROUTES.some((x) => x.id === route) ? route : 'home';
  const tail = rest.join('-');
  return { route: r, unit: /^[A-Z]{2}-\d{2}$/.test(tail) ? tail : null, alert: /^AL/.test(tail) ? tail : null };
}
export const go = (route, tail) => { window.location.hash = tail ? `${route}-${tail}` : route; };

export default function App() {
  const { setSelectedUnit } = useStore();
  const [loc, setLoc] = useState(parseHash);
  useEffect(() => {
    const on = () => { const p = parseHash(); setLoc(p); if (p.unit) setSelectedUnit(p.unit); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('hashchange', on);
    const p = parseHash(); if (p.unit) setSelectedUnit(p.unit);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const R = ROUTES.find((r) => r.id === loc.route) || ROUTES[0];
  return (
    <>
      <TopBar route={loc.route} />
      <main className="page enter" key={loc.route} id="main">
        <R.el loc={loc} />
      </main>
      <ActionSheet />
      <Toasts />
    </>
  );
}

function useOutside(ref, cb) {
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) cb(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, cb]);
}

function TopBar({ route }) {
  const { alerts, settings, dispatch, toast, sim, setSim } = useStore();
  const [panel, setPanel] = useState(null);
  const wrap = useRef(null);
  useOutside(wrap, () => setPanel((p) => (p === 'search' ? p : null)));
  const open = alerts.filter((a) => a.condition === 'active' && !['resolved', 'dismissed'].includes(a.workflow.status));
  const initials = (settings.report.author || 'Operator').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="topbar">
      <a href="#home" className="brand" aria-label="ColdGuard AI home"><Mark />ColdGuard</a>
      <nav className="pillnav" aria-label="Main">
        {ROUTES.filter((r) => !r.hidden).map((r) => (
          <a key={r.id} href={`#${r.id}`} className={route === r.id ? 'on' : ''} aria-current={route === r.id ? 'page' : undefined}>
            {r.label}
            {r.id === 'alerts' && open.length > 0 && <span className="count">{open.length}</span>}
          </a>
        ))}
      </nav>
      <div className="top-right" ref={wrap}>
        <QuickSearch />
        <button className="round-btn" aria-label={`Notifications, ${open.length} open`} onClick={() => setPanel(panel === 'bell' ? null : 'bell')}>
          <Bell size={18} />
          {open.length > 0 && <span className="badge-dot">{open.length}</span>}
        </button>
        <button className="avatar" aria-label="Account menu" onClick={() => setPanel(panel === 'me' ? null : 'me')}>{initials}</button>
        {panel === 'bell' && (
          <div className="popover" role="dialog" aria-label="Open alerts">
            <div className="pop-label">Open alerts</div>
            {open.length === 0 && <div className="c-muted" style={{ padding: '6px 12px 12px', fontSize: 14 }}>Nothing open. Every unit is behaving as expected.</div>}
            {open.map((a) => (
              <button key={a.id} className="pop-item" onClick={() => { setPanel(null); go('alerts', a.id); }}>
                <span className="ico" style={{ width: 34, height: 34 }}><BellRing size={16} /></span>
                <span className="min-w-0" style={{ flex: 1 }}>
                  <span className="flex justify-between gap-2"><span>{a.unitId} {a.unitName}</span><Sev cat={a.severity} value={a.probability} /></span>
                  <span className="block c-muted" style={{ fontSize: 13 }}>{a.explanation.split('. ')[0]}.</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {panel === 'me' && (
          <div className="popover" role="menu" style={{ width: 270 }}>
            <div style={{ padding: '10px 12px 12px' }}>
              <div style={{ fontSize: 15 }}>{settings.report.author || 'Operator'}</div>
              <div className="c-muted" style={{ fontSize: 13 }}>{settings.report.organisation} · {settings.facility}</div>
            </div>
            <a className="pop-item" href="#settings" onClick={() => setPanel(null)}><Gear size={17} />Settings</a>
            <a className="pop-item" href="#about" onClick={() => setPanel(null)}><Info size={17} />About ColdGuard AI</a>
            <button className="pop-item" onClick={() => { dispatch({ type: 'reset' }); setSim({ ...sim, running: false, attached: true, lastCat: 'Low', params: DEFAULT_SIM, state: E.createSim(DEFAULT_SIM) }); setPanel(null); toast('Data reset to defaults', 'ok', 'Alerts, actions, imports and settings were cleared'); }}><RotateCcw size={17} />Reset all data</button>
          </div>
        )}
      </div>
    </header>
  );
}

function QuickSearch() {
  const { units, alerts } = useStore();
  const [q, setQ] = useState('');
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const box = useRef(null);
  useOutside(box, () => setFocus(false));
  useEffect(() => {
    const k = (e) => { if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName)) { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const out = [];
    units.filter((u) => `${u.id} ${u.name} ${u.location} ${u.type}`.toLowerCase().includes(s)).forEach((u) => out.push({ key: u.id, icon: Thermometer, title: `${u.id} ${u.name}`, sub: `${u.location} · ${u.assessment.probability}% risk`, go: () => go('units', u.id) }));
    alerts.filter((a) => `${a.id} ${a.unitId} ${a.unitName} ${a.explanation}`.toLowerCase().includes(s)).slice(0, 5).forEach((a) => out.push({ key: a.id, icon: BellRing, title: a.id, sub: `${a.unitId} · ${a.severity} · ${a.explanation.split('. ')[0]}`, go: () => go('alerts', a.id) }));
    ROUTES.filter((r) => r.label.toLowerCase().includes(s)).forEach((r) => out.push({ key: r.id, icon: CornerDownLeft, title: r.label, sub: 'Page', go: () => go(r.id) }));
    return out.slice(0, 8);
  }, [q, units, alerts]);
  const pick = (r) => { r.go(); setQ(''); setFocus(false); input.current?.blur(); };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <label className={`search ${focus ? 'open' : ''}`}>
        <button type="button" onClick={() => { setFocus(true); setTimeout(() => input.current?.focus(), 0); }} aria-label="Search"><Search size={17} /></button>
        <input ref={input} id="quick-search" value={q} placeholder="Search units, alerts" onFocus={() => setFocus(true)} onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSel((x) => Math.min(x + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSel((x) => Math.max(x - 1, 0)); }
            if (e.key === 'Enter' && results[sel]) pick(results[sel]);
            if (e.key === 'Escape') { setQ(''); input.current?.blur(); setFocus(false); }
          }} aria-label="Search units and alerts" />
        <span className="kbd">/</span>
      </label>
      {focus && q && (
        <div className="popover" style={{ width: 340 }}>
          {results.length === 0 ? <div className="c-muted" style={{ padding: 12, fontSize: 14 }}>No matches for “{q}”.</div> : results.map((r, i) => (
            <button key={r.key} className={`pop-item ${i === sel ? 'sel' : ''}`} onMouseEnter={() => setSel(i)} onClick={() => pick(r)}>
              <span className="ico" style={{ width: 32, height: 32 }}><r.icon size={15} /></span>
              <span className="min-w-0"><span className="block">{r.title}</span><span className="block c-muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 240 }}>{r.sub}</span></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
