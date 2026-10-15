import React from 'react';
import { ArrowRight, Check, ClipboardCheck, DoorOpen, Database, TrendingUp, ListChecks, Undo2, Thermometer, FlaskConical } from 'lucide-react';
import { useStore, clock, stamp, alertTime, NOW } from '../lib/store.jsx';
import { Card, Tag, RiskTag, Sev, AgentIcon, Typewriter, CountUp, Empty, riskColor } from '../components/ui.jsx';
import { Constellation, UnitTile } from '../components/blocks.jsx';
import { attentionItems } from '../lib/derive.js';
import { go } from '../App.jsx';

const NUM = ['No', 'One', 'Two', 'Three', 'Four'];

export function summarize(u) {
  const a = u.assessment; const f = a.features;
  const lead = {
    'cooling-inactive': `cooling has been off for ${f.coolingOffMin} min`,
    degradation: 'the temperature keeps climbing while cooling runs',
    'door-open': 'the door is open and the temperature is rising',
    recovery: 'it is recovering after a door opening',
  }[a.forecast.mode] || (f.doorEvents60 >= 3 ? `${f.doorEvents60} door openings in the last hour are adding heat` : `it is ${f.temp.toFixed(1)} °C and steady`);
  const tail = a.forecast.crossing ? `, and the forecast reaches ${u.upper.toFixed(1)} °C in about ${a.forecast.crossing.m} min` : a.category !== 'Low' ? `, with a ${a.probability}% chance of an excursion in the next ${a.horizon} min` : '';
  return `${u.name}: ${lead}${tail}.`;
}

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const KIND_ICON = { excursion: Thermometer, risk: TrendingUp, door: DoorOpen, quality: Database, recovery: Undo2, task: ListChecks };

export default function Home() {
  const { units, alerts, state, settings, setActionFor, dispatch, toast } = useStore();
  const ranked = [...units].sort((a, b) => b.assessment.probability - a.assessment.probability);
  const top = ranked[0];
  const elevated = ranked.filter((u) => u.assessment.category !== 'Low');
  const counts = { High: 0, Medium: 0, Low: 0 };
  units.forEach((u) => counts[u.assessment.category]++);
  const headline = elevated.length === 0 ? `All ${NUM[units.length]?.toLowerCase() || units.length} units are holding steady`
    : elevated.length === 1 ? (elevated[0].assessment.category === 'High' ? `The ${elevated[0].name.toLowerCase()} needs you now` : `Keep an eye on the ${elevated[0].name.toLowerCase()}`)
      : `${NUM[elevated.length] || elevated.length} units need your attention`;
  const lede = elevated.length ? elevated.slice(0, 2).map(summarize).join(' ') : 'Temperatures are cycling normally inside their limits. ColdGuard will flag any unit whose trend starts heading for a limit.';
  const { items, unacked } = attentionItems(units, alerts, state.actions);
  const first = items[0];
  const rest = items.slice(1, 4);
  const firstAlert = first?.alertId ? alerts.find((x) => x.id === first.alertId) : null;
  const name = (settings.report.author || '').split(' ')[0];
  const lastRead = Math.max(...units.map((u) => u.lastReadingM));
  const openAlerts = alerts.filter((a) => a.condition === 'active' && !['resolved', 'dismissed'].includes(a.workflow.status)).length;
  const todayActions = state.actions.filter((x) => new Date(x.at).toDateString() === new Date().toDateString()).length;

  const events = [
    ...state.activity.filter((e) => e.type !== 'settings').map((e) => ({ at: e.at, text: e.text, who: settings.report.author || 'You', tone: 'var(--accent)' })),
    ...alerts.map((a) => ({ at: alertTime(a), text: `Early warning for ${a.unitId} ${a.unitName}: ${a.severity.toLowerCase()} risk, ${a.probability}%`, who: a.source, tone: a.severity === 'High' ? 'var(--high)' : 'var(--warn)' })),
  ].sort((a, b) => b.at - a.at).slice(0, 8);

  return (
    <>
      <header className="head">
        <div className="min-w-0">
          <div className="eyebrow">{settings.facility} · {new Date(NOW).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="title">{greeting()}{name ? `, ${name}` : ''}</h1>
        </div>
        <div className="head-actions">
          <span className="chip"><span className="live" aria-hidden="true" /><b>{units.length} units</b> monitored · last reading {clock(lastRead)}</span>
          <a className="btn dark" href="#simulator"><FlaskConical size={16} aria-hidden="true" />Run a scenario</a>
        </div>
      </header>

      <div className="grid">
        <section className="night s8">
          <div className="night-grid">
            <div className="flex flex-col" style={{ gap: 0, minHeight: 380 }}>
              <div className="agent"><AgentIcon />ColdGuard model · briefing at {clock(0)}</div>
              <h2 className="headline"><Typewriter text={headline} /></h2>
              <p className="lede">{lede}</p>
              <div style={{ marginTop: 'auto', paddingTop: 28 }}>
                <div className="flex items-end gap-4 flex-wrap">
                  <div className="big"><CountUp value={top.assessment.probability} /><span style={{ fontSize: '0.45em', color: 'var(--night-muted)' }}>%</span></div>
                  <div style={{ paddingBottom: 8 }}>
                    {top.assessment.forecast.crossing
                      ? <Tag kind="high">Crosses {top.upper.toFixed(1)} °C in ~{top.assessment.forecast.crossing.m} min</Tag>
                      : <Tag kind={top.assessment.category === 'Low' ? 'ok' : 'warn'}>{top.assessment.category === 'Low' ? 'Within limits' : 'Trending up'}</Tag>}
                    <div className="muted" style={{ marginTop: 8, fontSize: 14 }}>Highest excursion risk · {top.id} {top.name.toLowerCase()}, next {top.assessment.horizon} min</div>
                  </div>
                </div>
                <div className="legend" style={{ marginTop: 18 }}>
                  <span><i className="dot" style={{ background: 'var(--high)' }} /><b>{counts.High}</b>High</span>
                  <span><i className="dot" style={{ background: '#f0b429' }} /><b>{counts.Medium}</b>Medium</span>
                  <span><i className="ring-dot" /><b>{counts.Low}</b>Low</span>
                </div>
              </div>
            </div>
            <Constellation units={units} onPick={(id) => go('units', id)} />
          </div>
        </section>

        <section className="card s4 flex flex-col">
          <div className="card-head" style={{ marginBottom: 14 }}>
            <div>
              <h2 className="card-title">Needs attention</h2>
              <div className="card-sub">{items.length ? `${items.length} item${items.length > 1 ? 's' : ''}, most urgent first` : 'Nothing waiting'}{unacked ? ` · ${unacked} alert${unacked > 1 ? 's' : ''} not yet acknowledged` : ''}</div>
            </div>
          </div>
          {!first ? <Empty>All clear. Nothing needs you right now.</Empty> : (
            <div className="note" style={{ background: 'var(--card-2)', padding: 20 }}>
              <div className="flex justify-between gap-2" style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                <span>{first.urgency === 'High' ? 'Act now' : first.urgency === 'Medium' ? 'Today' : 'When you can'} · {first.unit.id}</span>
                {firstAlert && <span className="num" style={{ letterSpacing: 0 }}>{firstAlert.id}</span>}
              </div>
              <div style={{ fontSize: 19, letterSpacing: '-0.02em', margin: '10px 0 6px', lineHeight: 1.25 }}>{first.title}</div>
              <div className="c-muted" style={{ fontSize: 14 }}>{first.why}</div>
              <div className="flex items-center gap-2 flex-wrap" style={{ marginTop: 12 }}>
                <Tag kind="dark">{first.unit.id}</Tag>
                <Sev cat={first.unit.assessment.category} value={first.unit.assessment.probability} inExcursion={first.unit.assessment.inExcursion} />
              </div>
              {first.kind === 'risk' && (
                <div className="steps">
                  <div><b>Warning</b><span>{first.unit.warningM != null ? clock(first.unit.warningM) : 'Now'}</span></div>
                  <div className={first.unit.assessment.forecast.crossing ? '' : 'off'}><b>Forecast</b><span>{first.unit.assessment.forecast.crossing ? `Limit ~${clock(first.unit.assessment.forecast.crossing.m)}` : 'No crossing'}</span></div>
                  <div className={state.actions.some((x) => x.unitId === first.unit.id) ? '' : 'off'}><b>Action</b><span>{state.actions.some((x) => x.unitId === first.unit.id) ? 'Recorded' : 'Not yet'}</span></div>
                </div>
              )}
              <div className="flex items-center gap-2 c-muted" style={{ fontSize: 14, margin: '12px 0 14px' }}><AgentIcon /><span>{first.action}</span></div>
              <div className="flex gap-2 flex-wrap">
                {firstAlert && firstAlert.workflow.status === 'new'
                  ? <button className="btn dark" onClick={() => { dispatch({ type: 'workflow', alertId: firstAlert.id, unitId: firstAlert.unitId, status: 'acknowledged', kind: 'ack', text: 'Alert acknowledged', log: `${firstAlert.id} acknowledged` }); toast(`${firstAlert.id} acknowledged`, 'ok', `${firstAlert.unitId} ${firstAlert.unitName}`); }}><Check size={16} aria-hidden="true" />Acknowledge</button>
                  : <button className="btn dark" onClick={() => go('units', first.unit.id)}>Open unit<ArrowRight size={16} aria-hidden="true" /></button>}
                <button className="btn" onClick={() => setActionFor({ unitId: first.unit.id, alertId: first.alertId })}><ClipboardCheck size={16} aria-hidden="true" />Record action</button>
              </div>
            </div>
          )}
          <div className="rows" style={{ marginTop: 10 }}>
            {rest.map((i) => {
              const Ico = KIND_ICON[i.kind] || TrendingUp;
              return (
                <button key={i.key} type="button" className="row click" onClick={() => (i.alertId ? go('alerts', i.alertId) : go('units', i.unit.id))}>
                  <span className="ico"><Ico size={17} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="row-title block">{i.title}</span>
                    <span className="row-sub block">{i.unit.id} {i.unit.name}</span>
                  </span>
                  {i.urgency === 'Info' ? <Tag kind="info">Info</Tag> : <Tag kind={i.urgency === 'High' ? 'high' : i.urgency === 'Medium' ? 'warn' : 'line'}>{i.urgency}</Tag>}
                </button>
              );
            })}
          </div>
          <div className="stat-row" style={{ marginTop: 'auto', paddingTop: 16 }}>
            <a className="stat" href="#alerts"><div className="k">Open alerts</div><div className="v"><CountUp value={openAlerts} /></div></a>
            <div className="stat"><div className="k">Actions today</div><div className="v"><CountUp value={todayActions} /></div></div>
          </div>
        </section>

        <Card className="s12" title="Storage units" sub="Last 60 minutes, ordered by risk" right={<a className="link" href="#units">Unit detail<ArrowRight size={15} aria-hidden="true" /></a>}>
          <div className="unit-grid">
            {ranked.map((u) => <UnitTile key={u.id} u={u} onOpen={() => go('units', u.id)} />)}
          </div>
        </Card>

        <Card className="s12" title="Recent activity" sub="Warnings raised and what the team has done">
          {events.length === 0 ? <Empty>No activity yet.</Empty> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: '0 40px' }}>
              {[events.slice(0, 4), events.slice(4, 8)].map((col, ci) => (
                <div key={ci} className="timeline">
                  {col.map((e, i) => (
                    <div className="tl" key={i}>
                      <span className="d" style={{ background: e.tone }} aria-hidden="true" />
                      <span>{e.text} <span className="c-faint">· {e.who}</span></span>
                      <span className="when">{new Date(e.at).toDateString() === new Date().toDateString() ? new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : stamp(e.at)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

