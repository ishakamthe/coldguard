import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, Activity, TrendingUp, BrainCircuit, FlaskConical, Refrigerator, BellRing, BarChart3,
  DatabaseZap, FileText, Settings as SettingsIcon, Info, Menu, Snowflake, Bell, UserRound, CircleDot, X,
} from 'lucide-react';
import { useStore, clock, riskClass, NOW } from './lib/store.jsx';
import { Toasts, RiskBadge, DemoTag } from './components/ui.jsx';
import Overview from './pages/Overview.jsx';
import Monitoring from './pages/Monitoring.jsx';
import Forecast from './pages/Forecast.jsx';
import Risk from './pages/Risk.jsx';
import Simulator from './pages/Simulator.jsx';
import Units from './pages/Units.jsx';
import Alerts from './pages/Alerts.jsx';
import Analytics from './pages/Analytics.jsx';
import DataImport from './pages/DataImport.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import About from './pages/About.jsx';

export const ROUTES = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, el: Overview, group: 'Monitor' },
  { id: 'monitor', label: 'Live Monitoring', icon: Activity, el: Monitoring, group: 'Monitor' },
  { id: 'forecast', label: 'Temperature Forecast', icon: TrendingUp, el: Forecast, group: 'Monitor' },
  { id: 'risk', label: 'AI Risk Assessment', icon: BrainCircuit, el: Risk, group: 'Monitor' },
  { id: 'simulator', label: 'Scenario Simulator', icon: FlaskConical, el: Simulator, group: 'Monitor' },
  { id: 'units', label: 'Storage Units', icon: Refrigerator, el: Units, group: 'Operate' },
  { id: 'alerts', label: 'Alerts & Incidents', icon: BellRing, el: Alerts, group: 'Operate' },
  { id: 'analytics', label: 'Historical Analytics', icon: BarChart3, el: Analytics, group: 'Operate' },
  { id: 'import', label: 'Data Import & Quality', icon: DatabaseZap, el: DataImport, group: 'Data' },
  { id: 'reports', label: 'Reports', icon: FileText, el: Reports, group: 'Data' },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, el: Settings, group: 'System' },
  { id: 'about', label: 'About ColdGuard AI', icon: Info, el: About, group: 'System' },
];

// Hash routing with bare tokens (#alerts, #monitor-FR-02) so links work everywhere.
function parseHash() {
  const h = (window.location.hash || '').replace(/^#/, '');
  const m = h.match(/^([a-z]+)(?:-([A-Z]{2}-\d{2}))?(?:-(AL[A-Za-z0-9-]+))?$/);
  const route = m && ROUTES.some((r) => r.id === m[1]) ? m[1] : 'overview';
  return { route, unit: m?.[2] || null };
}
export function go(route, unit) {
  window.location.hash = unit ? `${route}-${unit}` : route;
}

export default function App() {
  const store = useStore();
  const [loc, setLoc] = useState(parseHash);
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => {
    const on = () => { const p = parseHash(); setLoc(p); setNavOpen(false); if (p.unit) store.setSelectedUnit(p.unit); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    const p = parseHash(); if (p.unit) store.setSelectedUnit(p.unit);
    return () => window.removeEventListener('hashchange', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const Route = ROUTES.find((r) => r.id === loc.route) || ROUTES[0];
  const openAlerts = store.alerts.filter((a) => a.condition === 'active' && !['resolved', 'dismissed'].includes(a.workflow.status));
  let lastGroup = null;

  return (
    <div className="shell">
      <aside className={`rail ${navOpen ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark"><Snowflake size={18} aria-hidden="true" /></div>
          <div>
            <div className="brand-name">COLDGUARD <b>AI</b></div>
            <div className="brand-tag">Predict before the temperature crosses the line.</div>
          </div>
          <button className="icon-btn menu-btn" style={{ marginLeft: 'auto' }} onClick={() => setNavOpen(false)} aria-label="Close navigation"><X size={16} /></button>
        </div>
        {ROUTES.map((r) => {
          const head = r.group !== lastGroup ? <div className="nav-group" key={`g-${r.group}`}>{r.group}</div> : null;
          lastGroup = r.group;
          const Icon = r.icon;
          return (
            <React.Fragment key={r.id}>
              {head}
              <a href={`#${r.id}`} className={`nav-item ${loc.route === r.id ? 'active' : ''}`} aria-current={loc.route === r.id ? 'page' : undefined}>
                <Icon size={16} aria-hidden="true" /> {r.label}
                {r.id === 'alerts' && openAlerts.length > 0 && <span className="count" aria-label={`${openAlerts.length} open alerts`}>{openAlerts.length}</span>}
              </a>
            </React.Fragment>
          );
        })}
        <div style={{ marginTop: 'auto', padding: '18px 10px 0', fontSize: 11, color: 'var(--faint)', lineHeight: 1.5 }}>
          Team SkinAura · Code Apex<br />Technology for Social Cause
        </div>
      </aside>
      <div className={`scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main" ref={mainRef}>
        <TopBar onMenu={() => setNavOpen(true)} openAlerts={openAlerts} />
        <main className="content" id="main">
          <Route.el loc={loc} />
        </main>
      </div>
      <Toasts />
    </div>
  );
}

function TopBar({ onMenu, openAlerts }) {
  const { units, sim, settings, dispatch, toast, backend } = useStore();
  const [panel, setPanel] = useState(null);
  const wrap = useRef(null);
  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setPanel(null); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const high = units.filter((u) => u.assessment.category === 'High').length;
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={onMenu} aria-label="Open navigation"><Menu size={18} /></button>
      <div className="flex items-center gap-2 min-w-0">
        <span className="brand-name hide-sm" style={{ fontSize: 13 }}>{settings.facility}</span>
        <DemoTag>Demo mode · simulated data</DemoTag>
      </div>
      <div className="flex items-center gap-3 hide-sm" style={{ marginLeft: 16, fontSize: 12, color: 'var(--muted)' }}>
        <span className="flex items-center gap-1"><CircleDot size={12} className={high ? 'c-high' : 'c-low'} aria-hidden="true" /> Engine: demo model{backend.status === 'online' ? ' · API online' : ''}</span>
        <span className="mono">Snapshot {clock(0)}</span>
        {sim.attached && sim.state?.t > 0 && <span className="badge info">Simulator → {sim.target}</span>}
      </div>
      <div ref={wrap} className="flex items-center gap-2" style={{ marginLeft: 'auto', position: 'relative' }}>
        <button className="icon-btn" aria-label={`Notifications, ${openAlerts.length} open early warnings`} onClick={() => setPanel(panel === 'bell' ? null : 'bell')}>
          <Bell size={16} />
          {openAlerts.length > 0 && <span className="dot">{openAlerts.length}</span>}
        </button>
        <button className="icon-btn" aria-label="Profile menu" onClick={() => setPanel(panel === 'me' ? null : 'me')}><UserRound size={16} /></button>
        {panel === 'bell' && (
          <div className="popover" role="dialog" aria-label="Open early warnings">
            <div className="panel-title" style={{ padding: '6px 8px' }}>Open early warnings</div>
            {openAlerts.length === 0 && <div className="c-muted" style={{ padding: 8, fontSize: 13 }}>No open warnings. All units are within expected behaviour.</div>}
            {openAlerts.map((a) => (
              <a key={a.id} href="#alerts" onClick={() => { setPanel(null); sessionStorageSet('cg-focus-alert', a.id); }} className="nav-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 4 }}>
                <span className="flex items-center gap-2"><RiskBadge cat={a.severity} /> <b className="mono" style={{ color: 'var(--text)' }}>{a.unitId}</b> <span className="mono">{a.probability}%</span></span>
                <span style={{ fontSize: 12 }}>{a.explanation.split('. ')[0]}.</span>
              </a>
            ))}
          </div>
        )}
        {panel === 'me' && (
          <div className="popover" role="menu" style={{ width: 260 }}>
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontWeight: 600 }}>{settings.report.author || 'Demo user'}</div>
              <div className="c-muted" style={{ fontSize: 12 }}>{settings.report.organisation} · Team leader</div>
            </div>
            <a className="nav-item" href="#settings" onClick={() => setPanel(null)}>Settings</a>
            <a className="nav-item" href="#about" onClick={() => setPanel(null)}>About ColdGuard AI</a>
            <button className="nav-item" style={{ width: '100%', background: 'none', textAlign: 'left', cursor: 'pointer' }} onClick={() => { dispatch({ type: 'reset' }); setPanel(null); toast('Demo data reset to seed values'); }}>Reset demo data</button>
          </div>
        )}
      </div>
    </header>
  );
}
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
