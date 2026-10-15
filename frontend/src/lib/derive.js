// Prioritised attention / task items derived from the current assessments.
const RANK = { High: 0, Medium: 1, Low: 2, Info: 3 };

export function attentionItems(units, alerts, actions) {
  const items = [];
  for (const u of units) {
    const a = u.assessment;
    const f = a.features;
    if (a.inExcursion) {
      items.push({ key: `${u.id}-exc`, unitId: u.id, urgency: 'High', kind: 'excursion', title: 'Outside configured limits', why: `Reading ${f.temp.toFixed(1)}°C vs limits ${u.lower}–${u.upper}°C.`, action: 'Verify the reading, protect stock and follow the excursion procedure.' });
    } else if (a.category !== 'Low') {
      items.push({ key: `${u.id}-risk`, unitId: u.id, urgency: a.category, kind: 'risk', title: `${u.name}: ${a.probability}% excursion risk`, why: a.explanation, action: a.action });
    }
    if (a.forecast.crossing && !a.inExcursion) items.push({ key: `${u.id}-cross`, unitId: u.id, urgency: 'High', kind: 'forecast', title: `Forecast reaches ${a.forecast.crossing.limit} limit in ~${a.forecast.crossing.m} min`, why: `Predicted ${a.forecast.crossing.temp.toFixed(1)}°C against a ${u.upper.toFixed(1)}°C limit (prediction, not certain).`, action: 'Investigate now while there is lead time.' });
    if (f.overdueMin >= 3 && !f.coolingActive) items.push({ key: `${u.id}-cool`, unitId: u.id, urgency: 'High', kind: 'cooling', title: 'Cooling inactive longer than expected', why: `Cooling off for ${f.coolingOffMin} min; ${f.overdueMin} min of that above the cut-in point.`, action: 'Inspect the cooling system and power supply.' });
    if (f.slope60 > 0.008 && a.forecast.mode !== 'cooling-inactive') items.push({ key: `${u.id}-trend`, unitId: u.id, urgency: 'Medium', kind: 'trend', title: 'Steadily rising temperature trend', why: `Average rise of ${(f.slope60 * 60).toFixed(1)}°C per hour over the last hour.`, action: 'Check door seals and cooling performance.' });
    if (f.doorEvents60 >= 3) items.push({ key: `${u.id}-door`, unitId: u.id, urgency: 'Medium', kind: 'door', title: `Repeated door openings (${f.doorEvents60} in 60 min)`, why: 'Frequent openings add heat faster than the unit can recover.', action: 'Check whether the door is fully closed; limit openings.' });
    if (a.quality.level !== 'Good') items.push({ key: `${u.id}-q`, unitId: u.id, urgency: a.quality.level === 'Poor' ? 'High' : 'Low', kind: 'quality', title: `Data quality ${a.quality.level.toLowerCase()}`, why: a.quality.issues.join('; '), action: 'Verify the sensor and its connection.' });
    if (a.anomaly.status !== 'Normal' && a.category === 'Low') items.push({ key: `${u.id}-an`, unitId: u.id, urgency: 'Low', kind: 'anomaly', title: `Unusual sensor pattern (score ${a.anomaly.score})`, why: a.anomaly.reasons.join('; ') || 'Pattern differs from recent baseline.', action: 'Verify the temperature reading.' });
    if (a.forecast.mode === 'recovery') items.push({ key: `${u.id}-rec`, unitId: u.id, urgency: 'Info', kind: 'recovery', title: 'Recovering as expected after a door event', why: 'Temperature is falling back toward its normal band.', action: 'Keep monitoring; no action needed now.' });
  }
  for (const al of alerts) {
    if (al.condition === 'active' && al.workflow.status === 'new') items.push({ key: `${al.id}-ack`, unitId: al.unitId, alertId: al.id, urgency: al.severity, kind: 'ack', title: `Alert ${al.id} awaiting acknowledgement`, why: `Raised ${al.source === 'Simulator' ? 'by the simulator' : 'from simulated data'}; nobody has acknowledged it yet.`, action: 'Open the alert and acknowledge it.' });
  }
  for (const act of actions.filter((x) => x.status !== 'done')) {
    items.push({ key: act.id, unitId: act.unitId, alertId: act.alertId, urgency: 'Low', kind: 'task', title: `Incomplete action: ${act.action}`, why: `Recorded ${new Date(act.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} by ${act.by}.`, action: 'Mark complete once done.', actionId: act.id });
  }
  return items.sort((x, y) => RANK[x.urgency] - RANK[y.urgency]);
}

export const ACTION_PRESETS = [
  'Verify the temperature reading',
  'Inspect the cooling system',
  'Check whether the door is fully closed',
  'Confirm the condition of stored items',
  'Recheck the unit in 15 minutes',
  'Move stock to a backup unit',
];
