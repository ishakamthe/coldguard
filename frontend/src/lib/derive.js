// Prioritised "needs attention" items derived from the current assessments.
// This list lives only on Home; the Alerts page holds the full alert workflow.
const RANK = { High: 0, Medium: 1, Low: 2, Info: 3 };

export function attentionItems(units, alerts, actions) {
  const items = [];
  for (const u of units) {
    const a = u.assessment;
    const f = a.features;
    const active = u.alerts.find((x) => x.condition === 'active') || alerts.find((x) => x.unitId === u.id && x.condition === 'active');
    if (a.inExcursion) {
      items.push({ key: `${u.id}-exc`, unit: u, urgency: 'High', kind: 'excursion', title: `${u.name} is outside its limits`, why: `Reading ${f.temp.toFixed(1)} °C against ${u.lower}–${u.upper} °C.`, action: 'Verify the reading, protect stock and follow the excursion procedure.', alertId: active?.id });
    } else if (a.category !== 'Low') {
      items.push({ key: `${u.id}-risk`, unit: u, urgency: a.category, kind: 'risk', title: a.forecast.crossing ? `${u.name} may cross ${u.upper.toFixed(1)} °C in ~${a.forecast.crossing.m} min` : `${u.name} is trending toward its limit`, why: a.explanation, action: a.action, alertId: active?.id });
    }
    if (a.category === 'Low' && f.doorEvents60 >= 3) items.push({ key: `${u.id}-door`, unit: u, urgency: 'Medium', kind: 'door', title: `${f.doorEvents60} door openings in the last hour`, why: 'Frequent openings add heat faster than the unit can recover.', action: 'Check the door closes fully and limit openings.' });
    if (a.quality.level !== 'Good') items.push({ key: `${u.id}-q`, unit: u, urgency: a.quality.level === 'Poor' ? 'High' : 'Low', kind: 'quality', title: `Sensor data is ${a.quality.level.toLowerCase()}`, why: a.quality.issues.join('; '), action: 'Check the sensor and its connection.' });
    if (a.forecast.mode === 'recovery') items.push({ key: `${u.id}-rec`, unit: u, urgency: 'Info', kind: 'recovery', title: 'Recovering after a door opening', why: 'Temperature is falling back toward its normal band.', action: 'No action needed. Keep watching.' });
  }
  const unacked = alerts.filter((x) => x.condition === 'active' && x.workflow.status === 'new');
  for (const act of actions.filter((x) => x.status !== 'done').slice(0, 3)) {
    const u = units.find((x) => x.id === act.unitId);
    if (u) items.push({ key: act.id, unit: u, urgency: 'Low', kind: 'task', title: `Follow up: ${act.action}`, why: `Recorded by ${act.by}${act.note ? ` · ${act.note}` : ''}`, action: 'Mark it done on the Alerts page once complete.', actionId: act.id });
  }
  return { items: items.sort((x, y) => RANK[x.urgency] - RANK[y.urgency]), unacked: unacked.length };
}

export const ACTION_PRESETS = [
  'Verify the temperature reading',
  'Inspect the cooling system',
  'Check the door is fully closed',
  'Confirm the condition of stored items',
  'Recheck the unit in 15 minutes',
  'Move stock to a backup unit',
];
