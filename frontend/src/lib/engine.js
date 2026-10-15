/*
 * ColdGuard AI — demonstration engine (prototype, deterministic).
 *
 * This file is the "ML engine" stand-in. It is NOT a trained model.
 * Everything here is deterministic: the same data + configuration always
 * gives the same forecast, probability and explanation. Synthetic noise
 * comes from fixed seeds, never from Math.random().
 *
 * Pipeline mirrored here:
 *   synthetic sensor data -> validation/quality -> feature engineering ->
 *   forecast + demo excursion model -> anomaly score -> risk assessment ->
 *   explainable (rule-based) reasons
 *
 * The public surface (assessUnit / forecast / extractFeatures) matches the
 * FastAPI backend (backend/app/engine.py) so a trained scikit-learn/XGBoost
 * model can replace demoExcursionModel() without touching the UI.
 */
const CGEngine = (function () {
  // ---------- deterministic PRNG ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rng) {
    const u = Math.max(rng(), 1e-9), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const r2 = (x) => Math.round(x * 100) / 100;

  // ---------- simple thermal model used to synthesise data ----------
  // dT/dt = leak * (ambient - T) * (door ? doorMult : 1) - (cooling ? coolRate * capacity : 0)
  // Cooling follows a thermostat: switches on above cutIn, off below cutOut.
  function simulate(spec) {
    const rng = mulberry32(spec.seed);
    const out = [];
    let T = spec.start;
    let cooling = false;
    const leak = spec.leak ?? 0.0042;
    const doorMult = spec.doorMult ?? 7;
    const coolRate = spec.coolRate ?? 0.26;
    for (let i = 0; i < spec.minutes; i++) {
      const m = i - (spec.minutes - 1); // minutes relative to "now" (last sample = 0)
      const ev = spec.events ? spec.events(m) : {};
      const door = !!ev.door;
      const capacity = ev.capacity ?? 1;
      const available = ev.available !== false && capacity > 0;
      const amb = spec.ambient(m);
      if (!available) cooling = false;
      else if (T >= spec.cutIn) cooling = true;
      else if (T <= spec.cutOut) cooling = false;
      const dT = leak * (amb - T) * (door ? doorMult : 1) - (cooling ? coolRate * capacity : 0);
      T += dT;
      const missing = spec.missing ? spec.missing(m) : false;
      out.push({
        m,
        temp: missing ? null : r2(T + gauss(rng) * (spec.noise ?? 0.035)),
        ambient: r2(amb + gauss(rng) * 0.08),
        door,
        cooling,
        source: 'synthetic',
      });
    }
    return out;
  }

  // ---------- seed units (illustrative values from the presentation) ----------
  const UNITS = [
    { id: 'FR-01', name: 'Vaccine fridge', type: 'Vaccine refrigerator', location: 'Immunisation Clinic', facility: 'City General Hospital', lower: 2, upper: 8, cutIn: 5.0, cutOut: 3.4, scenario: 'Normal operation' },
    { id: 'FR-02', name: 'Pharmacy fridge', type: 'Pharmacy refrigerator', location: 'Inpatient Pharmacy', facility: 'City General Hospital', lower: 2, upper: 8, cutIn: 5.0, cutOut: 3.4, scenario: 'Sudden cooling failure' },
    { id: 'FR-03', name: 'Lab fridge', type: 'Laboratory refrigerator', location: 'Pathology Lab', facility: 'City General Hospital', lower: 2, upper: 8, cutIn: 5.0, cutOut: 3.4, scenario: 'Repeated door opening + slow degradation' },
    { id: 'CR-04', name: 'Cold room', type: 'Walk-in cold room', location: 'Central Store', facility: 'City General Hospital', lower: 2, upper: 8, cutIn: 4.4, cutOut: 3.2, scenario: 'Normal operation' },
  ];

  const inWin = (m, a, d) => m >= a && m < a + d;
  const SPECS = {
    'FR-01': {
      seed: 101, start: 4.2, leak: 0.0042,
      ambient: (m) => 24 + 1.2 * Math.sin((m / 1440) * 2 * Math.PI),
      events: (m) => ({ door: inWin(m, -300, 2) || inWin(m, -780, 1) }),
      missing: () => false,
    },
    'FR-02': {
      seed: 202, start: 4.3, leak: 0.0042,
      ambient: (m) => 26 + 1.0 * Math.sin((m / 1440) * 2 * Math.PI),
      events: (m) => ({
        door: inWin(m, -540, 5) || inWin(m, -48, 3),
        available: !(m >= -34),
      }),
      missing: () => false,
    },
    'FR-03': {
      seed: 303, start: 4.0, leak: 0.0042,
      ambient: (m) => 25 + 1.0 * Math.sin((m / 1440) * 2 * Math.PI),
      events: (m) => ({
        door: inWin(m, -840, 16) || inWin(m, -420, 3) || inWin(m, -200, 2) ||
          inWin(m, -52, 3) || inWin(m, -27, 3) || inWin(m, -9, 2),
        capacity: m < -240 ? 1 : 1 - 0.5 * clamp((m + 240) / 240, 0, 1),
      }),
      missing: (m) => m === -170 || m === -171 || m === -95,
    },
    'CR-04': {
      seed: 404, start: 3.8, leak: 0.0021, coolRate: 0.11, noise: 0.025,
      ambient: (m) => 23 + 0.8 * Math.sin((m / 1440) * 2 * Math.PI),
      events: (m) => ({ door: inWin(m, -610, 4) || inWin(m, -130, 2) }),
      missing: (m) => (m >= -905 && m < -898) || m === -33,
    },
  };

  function generateSeries(unitId, minutes = 1440) {
    const u = UNITS.find((x) => x.id === unitId);
    const s = SPECS[unitId];
    return simulate({ ...s, minutes, cutIn: u.cutIn, cutOut: u.cutOut });
  }

  // ---------- validation / data quality ----------
  function dataQuality(series, window = 60) {
    const w = series.slice(-window);
    const missing = w.filter((r) => r.temp == null).length;
    const vals = w.filter((r) => r.temp != null).map((r) => r.temp);
    let flat = false;
    if (vals.length >= 15) {
      const last = vals.slice(-15);
      flat = Math.max(...last) - Math.min(...last) < 0.005;
    }
    let jumps = 0;
    for (let i = 1; i < vals.length; i++) if (Math.abs(vals[i] - vals[i - 1]) > 1.5) jumps++;
    let lastIdx = series.length - 1;
    while (lastIdx >= 0 && series[lastIdx].temp == null) lastIdx--;
    const staleMin = lastIdx < 0 ? Infinity : series.length - 1 - lastIdx;
    const missingPct = (missing / Math.max(w.length, 1)) * 100;
    let level = 'Good';
    const issues = [];
    if (missingPct > 0) issues.push(`${missing} missing reading${missing > 1 ? 's' : ''} in last ${window} min`);
    if (staleMin >= 5) issues.push(`Last valid reading ${staleMin} min old`);
    if (flat) issues.push('Flat-lined values (possible stuck sensor)');
    if (jumps) issues.push(`${jumps} implausible jump${jumps > 1 ? 's' : ''} > 1.5°C/min`);
    if (missingPct > 2 || staleMin >= 2 || jumps) level = 'Fair';
    if (missingPct > 10 || staleMin >= 10 || flat) level = 'Poor';
    return { level, missing, missingPct: r2(missingPct), staleMin, flat, jumps, issues };
  }

  // ---------- feature engineering (only uses data up to the evaluated point) ----------
  function slopeOf(points) {
    // least squares slope, points = [[x,y]]
    const n = points.length;
    if (n < 3) return 0;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
    const d = n * sxx - sx * sx;
    return d === 0 ? 0 : (n * sxy - sx * sy) / d;
  }
  function valid(series, n) {
    const w = series.slice(-n);
    return w.map((r, i) => [i, r.temp]).filter((p) => p[1] != null);
  }
  function extractFeatures(series, cfg) {
    // series must end at the evaluated instant (no future rows -> no leakage)
    const lastValid = [...series].reverse().find((r) => r.temp != null) || series[series.length - 1];
    const last = series[series.length - 1];
    const T = lastValid.temp;
    const w30 = valid(series, 30).map((p) => p[1]);
    const mean30 = w30.reduce((a, b) => a + b, 0) / Math.max(w30.length, 1);
    const std30 = Math.sqrt(w30.reduce((a, b) => a + (b - mean30) ** 2, 0) / Math.max(w30.length, 1));
    const w360 = valid(series, 360).map((p) => p[1]);
    const mean6h = w360.reduce((a, b) => a + b, 0) / Math.max(w360.length, 1);
    const slope15 = slopeOf(valid(series, 15));
    const slope60 = slopeOf(valid(series, 60));
    // trailing cooling-off duration, and minutes the unit sat above cut-in with cooling off
    let coolingOffMin = 0, overdueMin = 0;
    for (let i = series.length - 1; i >= 0 && !series[i].cooling; i--) {
      coolingOffMin++;
      if (series[i].temp != null && series[i].temp > cfg.cutIn + 0.15) overdueMin++;
    }
    // cooling continuously on (for degradation detection)
    let coolingOnMin = 0;
    for (let i = series.length - 1; i >= 0 && series[i].cooling; i--) coolingOnMin++;
    let doorEvents60 = 0, minutesSinceDoor = Infinity;
    const w60 = series.slice(-60);
    for (let i = 0; i < w60.length; i++) if (w60[i].door && (i === 0 || !w60[i - 1].door)) doorEvents60++;
    for (let i = series.length - 1; i >= 0; i--) if (series[i].door) { minutesSinceDoor = series.length - 1 - i; break; }
    const w10 = valid(series, 10).map((p) => p[1]);
    const nearLimitMin = valid(series, 60).filter((p) => p[1] >= cfg.upper - 1).length;
    return {
      temp: T,
      ambient: last.ambient,
      doorOpen: last.door,
      coolingActive: last.cooling,
      mean30: r2(mean30), std30: Math.round(std30 * 1000) / 1000, mean6h: r2(mean6h),
      min30: w30.length ? Math.min(...w30) : T, max30: w30.length ? Math.max(...w30) : T,
      slope15: Math.round(slope15 * 10000) / 10000,
      slope60: Math.round(slope60 * 10000) / 10000,
      coolingOffMin, overdueMin, coolingOnMin,
      doorEvents60, minutesSinceDoor,
      marginUpper: r2(cfg.upper - T),
      marginLower: r2(T - cfg.lower),
      nearLimitMin,
      lastStep: w10.length >= 2 ? r2(w10[w10.length - 1] - w10[w10.length - 2]) : 0,
    };
  }

  // ---------- forecast (physics-informed extrapolation, not a trained model) ----------
  function forecast(f, cfg, horizon) {
    const pts = [];
    let T = f.temp;
    const amb = f.ambient;
    let mode;
    const failed = !f.coolingActive && (f.overdueMin >= 3 || f.coolingOffMin > 35);
    const degrading = f.coolingActive && f.coolingOnMin >= 20 && f.slope60 > 0.004 && f.slope15 > 0;
    if (failed) mode = 'cooling-inactive';
    else if (f.doorOpen) mode = 'door-open';
    else if (degrading) mode = 'degradation';
    else if (f.minutesSinceDoor <= 20 && T > f.mean6h + 0.4 && f.slope15 < 0) mode = 'recovery';
    else mode = 'normal';
    const k = clamp(f.slope15 / Math.max(amb - T, 1), 0.002, 0.02);
    for (let t = 1; t <= horizon; t++) {
      let s;
      if (mode === 'cooling-inactive') s = k * (amb - T);
      else if (mode === 'door-open') s = t <= 2 ? Math.max(f.slope15, 0.05) : (f.mean6h - T) / 10;
      else if (mode === 'degradation') s = f.slope15;
      else if (mode === 'recovery') s = (f.mean6h - T) / 9;
      else s = T < cfg.cutIn ? Math.min(f.slope15, 0.12) * Math.pow(0.9, t) + (f.mean6h - T) / 30 : (f.mean6h - T) / 8;
      T += s;
      const spread = 0.08 + f.std30 * 0.6 + 0.012 * t;
      pts.push({ m: t, temp: r2(T), lo: r2(T - spread), hi: r2(T + spread) });
    }
    const cross = pts.find((p) => p.temp >= cfg.upper) || pts.find((p) => p.temp <= cfg.lower);
    const peak = pts.reduce((a, p) => Math.max(a, p.temp), f.temp);
    return {
      mode, points: pts, peak: r2(peak),
      crossing: cross ? { m: cross.m, temp: cross.temp, limit: cross.temp >= cfg.upper ? 'upper' : 'lower' } : null,
    };
  }

  // ---------- demonstration excursion model ----------
  // A documented logistic score over engineered features. Weights were set by
  // hand so the four seed scenarios behave sensibly. It is a placeholder for a
  // scikit-learn / XGBoost classifier and has NOT been trained or evaluated.
  const FACTOR_LABELS = {
    forecast: 'Forecast approaching limit',
    trend: 'Rising temperature trend',
    rate: 'High rate of temperature increase',
    cooling: 'Cooling inactive too long',
    door: 'Door-open events',
    ambient: 'Ambient temperature',
    degradation: 'Gradual cooling degradation',
    margin: 'Close to upper limit',
  };
  function demoExcursionModel(f, fc, cfg) {
    const margin = Math.max(cfg.upper - f.temp, 0.05);
    const rise = (fc.peak - f.temp) / margin; // >= 1 means forecast reaches the limit
    const c = {
      forecast: 1.1 * clamp(rise, 0, 1.4),
      trend: 12 * clamp(f.slope60, 0, 0.1),
      rate: 9 * clamp(f.slope15, 0, 0.12),
      cooling: 0.03 * Math.min(f.overdueMin, 30) + (f.coolingOffMin > 35 ? 0.4 : 0),
      door: Math.min(0.25 * f.doorEvents60 + (f.doorOpen ? 0.4 : 0), 1.2),
      ambient: 0.12 * clamp(f.ambient - 24, 0, 6),
      degradation: f.coolingActive && f.coolingOnMin >= 15 ? 30 * clamp(f.slope60, 0, 0.05) : 0,
      margin: 1.0 * clamp(1 - margin / 4, 0, 1),
    };
    const bias = -2.95;
    const z = bias + Object.values(c).reduce((a, b) => a + b, 0);
    const p = 1 / (1 + Math.exp(-z));
    return { probability: p, logit: z, contributions: c };
  }

  // ---------- prototype anomaly score (stand-in for Isolation Forest) ----------
  function anomalyScore(f, q) {
    const z = Math.abs(f.temp - f.mean30) / Math.max(f.std30, 0.05);
    const parts = {
      spike: clamp((Math.abs(f.lastStep) - 0.4) / 1.2, 0, 1),
      deviation: clamp((z - 2) / 4, 0, 1) * (f.doorOpen ? 0.4 : 1),
      flatline: q.flat ? 1 : 0,
      combination: f.coolingActive && !f.doorOpen && f.slope15 > 0.012 && f.coolingOnMin >= 15 ? 0.75
        : !f.coolingActive && f.overdueMin >= 5 ? 0.8 : 0,
    };
    const score = Math.max(...Object.values(parts));
    const status = score >= 0.7 ? 'Anomalous' : score >= 0.4 ? 'Unusual' : 'Normal';
    const reasons = [];
    if (parts.spike >= 0.4) reasons.push('Sudden step change between consecutive readings');
    if (parts.deviation >= 0.4) reasons.push('Reading far from its 30-minute baseline');
    if (parts.flatline) reasons.push('Sensor output has not changed (possible stuck sensor)');
    if (parts.combination >= 0.7) reasons.push(f.coolingActive ? 'Temperature rising while cooling runs and door is closed' : 'Cooling off while temperature is above cut-in point');
    return { score: r2(score), status, parts, reasons };
  }

  // ---------- risk assessment ----------
  const DEFAULT_BANDS = { medium: 30, high: 60 };
  function category(pct, bands = DEFAULT_BANDS) {
    return pct >= bands.high ? 'High' : pct >= bands.medium ? 'Medium' : 'Low';
  }
  function explain(f, fc, model, cfg, sorted) {
    const parts = [];
    const top = sorted.filter((x) => x.value > 0.6).map((x) => x.key);
    if (fc.mode === 'cooling-inactive') parts.push('Cooling has remained inactive longer than expected while the temperature keeps rising.');
    else if (fc.mode === 'degradation') parts.push('Temperature is climbing even though cooling is running, which suggests reduced cooling performance.');
    else if (fc.mode === 'door-open') parts.push('The door is currently open and the temperature is rising.');
    else if (fc.mode === 'recovery') parts.push('Temperature rose after a door event and is now falling back toward its normal range.');
    if ((top.includes('rate') || top.includes('trend')) && fc.mode !== 'recovery') parts.unshift('The temperature is rising faster than expected.');
    if (top.includes('door') && fc.mode !== 'door-open' && f.doorEvents60 > 0) parts.push(`${f.doorEvents60} door-open event${f.doorEvents60 > 1 ? 's' : ''} in the last hour may be contributing.`);
    if (top.includes('ambient')) parts.push(`Ambient temperature is elevated (${f.ambient.toFixed(1)}°C).`);
    if (fc.crossing) parts.push(`The forecast reaches the ${fc.crossing.limit} limit in about ${fc.crossing.m} min.`);
    if (!parts.length) parts.push('Temperature is following its normal cooling cycle within the configured limits.');
    return parts.join(' ');
  }
  function suggestedAction(f, fc, cat) {
    if (fc.mode === 'cooling-inactive') return 'Inspect the cooling system and verify sensor readings.';
    if (fc.mode === 'degradation') return 'Schedule a cooling-system check (condenser, seals, refrigerant) and recheck in 15 minutes.';
    if (fc.mode === 'door-open') return 'Check that the door is fully closed, then recheck the temperature in 10 minutes.';
    if (fc.mode === 'recovery') return 'No action needed now. Keep monitoring until the temperature returns to its normal band.';
    if (cat === 'Medium') return 'Verify the temperature reading and limit door openings; recheck in 15 minutes.';
    return 'Continue routine monitoring.';
  }
  function operatingStatus(f, fc) {
    return { 'cooling-inactive': 'Cooling inactive', degradation: 'Cooling degraded', 'door-open': 'Door open', recovery: 'Recovering' }[fc.mode] || 'Normal';
  }

  function assess(series, cfg, opts = {}) {
    const horizon = opts.horizon ?? 30;
    const bands = opts.bands ?? DEFAULT_BANDS;
    const f = extractFeatures(series, cfg);
    const fc = forecast(f, cfg, horizon);
    const model = demoExcursionModel(f, fc, cfg);
    const q = dataQuality(series);
    const an = anomalyScore(f, q);
    const inExcursion = f.temp > cfg.upper || f.temp < cfg.lower;
    // already outside the limit: the excursion is happening, not predicted
    const pct = inExcursion ? 100 : Math.min(99, Math.round(model.probability * 100));
    const cat = inExcursion ? 'High' : category(pct, bands);
    const sorted = Object.entries(model.contributions)
      .map(([key, value]) => ({ key, label: FACTOR_LABELS[key], value: r2(value) }))
      .sort((a, b) => b.value - a.value);
    // presentation decision: "Temperature rises -> recovering as expected?"
    const disturbed = f.temp > f.mean6h + 0.6 || f.minutesSinceDoor <= 20 || fc.mode === 'cooling-inactive';
    const recovering = fc.mode === 'recovery';
    return {
      probability: pct,
      category: cat,
      horizon,
      features: f,
      forecast: fc,
      anomaly: an,
      quality: q,
      factors: sorted,
      explanation: explain(f, fc, model, cfg, sorted),
      action: suggestedAction(f, fc, cat),
      status: inExcursion ? 'Excursion in progress' : operatingStatus(f, fc),
      inExcursion,
      decision: inExcursion ? 'excursion' : !disturbed ? 'stable' : recovering ? 'recovering' : 'warning',
      model: 'demo-logistic-v0 (rule-weighted, untrained)',
    };
  }

  // evaluate risk every `step` minutes over history (for analytics + seeded alert history)
  function riskHistory(series, cfg, opts = {}) {
    const step = opts.step ?? 5;
    const out = [];
    for (let i = 60; i < series.length; i += step) {
      const sub = series.slice(0, i + 1);
      const a = assess(sub, cfg, opts);
      out.push({ m: series[i].m, probability: a.probability, category: a.category, anomaly: a.anomaly.score, temp: a.features.temp, mode: a.forecast.mode, factors: a.factors.slice(0, 3).map((x) => x.label), explanation: a.explanation, action: a.action, crossing: a.forecast.crossing });
    }
    // include the final instant
    const last = series.length - 1;
    if (out.length && out[out.length - 1].m !== series[last].m) {
      const a = assess(series, cfg, opts);
      out.push({ m: series[last].m, probability: a.probability, category: a.category, anomaly: a.anomaly.score, temp: a.features.temp, mode: a.forecast.mode, factors: a.factors.slice(0, 3).map((x) => x.label), explanation: a.explanation, action: a.action, crossing: a.forecast.crossing });
    }
    return out;
  }

  function excursions(series, cfg) {
    const ev = [];
    let cur = null;
    for (const r of series) {
      const out = r.temp != null && (r.temp > cfg.upper || r.temp < cfg.lower);
      if (out && !cur) cur = { start: r.m, end: r.m, peak: r.temp, limit: r.temp > cfg.upper ? 'upper' : 'lower' };
      else if (out && cur) { cur.end = r.m; cur.peak = cur.limit === 'upper' ? Math.max(cur.peak, r.temp) : Math.min(cur.peak, r.temp); }
      else if (!out && cur) { ev.push({ ...cur, minutes: cur.end - cur.start + 1 }); cur = null; }
    }
    if (cur) ev.push({ ...cur, minutes: cur.end - cur.start + 1, ongoing: true });
    return ev;
  }

  function doorEvents(series) {
    const ev = [];
    for (let i = 0; i < series.length; i++) {
      if (series[i].door && (i === 0 || !series[i - 1].door)) {
        let j = i; while (j < series.length && series[j].door) j++;
        ev.push({ m: series[i].m, minutes: j - i });
      }
    }
    return ev;
  }

  // ---------- what-if simulator (incremental, minute by minute) ----------
  const SCENARIOS = [
    { id: 'normal', name: 'Normal operation', short: 'Normal', desc: 'Temperature cycles within its normal band while the thermostat switches cooling on and off.' },
    { id: 'door', name: 'Door open', short: 'Door open', desc: 'The door is left open for the chosen duration, then closed. Does the temperature recover?' },
    { id: 'degradation', name: 'Slow degradation', short: 'Slow degradation', desc: 'Cooling capacity fades gradually, producing a sustained upward trend.' },
    { id: 'failure', name: 'Sudden cooling failure', short: 'Sudden failure', desc: 'The compressor stops unexpectedly and does not restart.' },
    { id: 'recovery', name: 'Failure then recovery', short: 'Recovery', desc: 'Cooling fails for the chosen duration, then restarts. Compare expected recovery with a worsening pattern.' },
  ];
  function scenarioEvents(id, t, duration) {
    switch (id) {
      case 'door': return { door: t >= 5 && t < 5 + duration };
      case 'degradation': return { capacity: 1 - 0.85 * clamp(t / 60, 0, 1) };
      case 'failure': return { available: t < 5 };
      case 'recovery': return { available: !(t >= 5 && t < 5 + duration) };
      default: return {};
    }
  }
  function createSim(p) {
    // 60 minutes of normal pre-history so features have context
    const pre = simulate({
      seed: 777, minutes: 60, start: p.initialTemp, cutIn: p.cutIn ?? 5, cutOut: p.cutOut ?? 3.4,
      ambient: () => p.ambient, events: () => ({}),
    }).map((r) => ({ ...r, m: r.m - 0 }));
    const last = pre[pre.length - 1];
    return { t: 0, T: last.temp, cooling: last.cooling, rngSeed: 991, series: pre.map((r, i) => ({ ...r, m: i - 59 })), params: p, overrides: {} };
  }
  function stepSim(sim) {
    const p = sim.params;
    const rng = mulberry32(sim.rngSeed + sim.t * 7919);
    const sched = scenarioEvents(p.scenario, sim.t, p.duration);
    const door = sim.overrides.door ?? !!sched.door;
    const forcedOff = sim.overrides.cooling === false;
    const forcedOn = sim.overrides.cooling === true;
    const capacity = sched.capacity ?? 1;
    const available = forcedOn ? true : !forcedOff && sched.available !== false;
    let cooling = sim.cooling;
    const cutIn = p.cutIn ?? 5, cutOut = p.cutOut ?? 3.4;
    if (!available) cooling = false;
    else if (forcedOn) cooling = true;
    else if (sim.T >= cutIn) cooling = true;
    else if (sim.T <= cutOut) cooling = false;
    const dT = 0.0042 * (p.ambient - sim.T) * (door ? 7 : 1) - (cooling ? 0.26 * capacity : 0);
    const T = sim.T + dT;
    const row = { m: sim.t + 1, temp: r2(T + gauss(rng) * 0.03), ambient: p.ambient, door, cooling, source: 'simulator' };
    return { ...sim, t: sim.t + 1, T, cooling, series: [...sim.series, row] };
  }

  return {
    UNITS, SCENARIOS, FACTOR_LABELS, DEFAULT_BANDS,
    generateSeries, extractFeatures, forecast, assess, riskHistory, excursions, doorEvents,
    dataQuality, category, createSim, stepSim, simulate,
  };
})();
export default CGEngine;
