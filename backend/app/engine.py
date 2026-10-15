"""
ColdGuard AI demonstration engine (Python port of frontend/src/lib/engine.js).

Deterministic and untrained. Same inputs + configuration -> same outputs.
Pipeline: synthetic data -> data quality -> features -> forecast ->
demo excursion model -> anomaly score -> risk assessment + explanation.

`demo_excursion_model()` is the single function to replace with a trained
scikit-learn / XGBoost classifier. Keep its return shape
({probability, logit, contributions}) and the API stays unchanged.
"""
from __future__ import annotations

import math
from typing import Any, Callable

MODEL_NAME = "demo-logistic-v0 (rule-weighted, untrained)"


# ---------- helpers matching JavaScript semantics ----------
def _js_round(x: float, scale: int) -> float:
    """Math.round(x * scale) / scale (rounds .5 up, unlike Python's round)."""
    return math.floor(x * scale + 0.5) / scale


def r2(x: float) -> float:
    return _js_round(x, 100)


def clamp(x: float, a: float, b: float) -> float:
    return max(a, min(b, x))


def _imul(a: int, b: int) -> int:
    return ((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF)) & 0xFFFFFFFF


def mulberry32(seed: int) -> Callable[[], float]:
    state = [seed & 0xFFFFFFFF]

    def rnd() -> float:
        state[0] = (state[0] + 0x6D2B79F5) & 0xFFFFFFFF
        a = state[0]
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return rnd


def gauss(rng: Callable[[], float]) -> float:
    u = max(rng(), 1e-9)
    v = rng()
    return math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * v)


# ---------- thermal model ----------
def simulate(spec: dict) -> list[dict]:
    rng = mulberry32(spec["seed"])
    out: list[dict] = []
    T = spec["start"]
    cooling = False
    leak = spec.get("leak", 0.0042)
    door_mult = spec.get("doorMult", 7)
    cool_rate = spec.get("coolRate", 0.26)
    minutes = spec["minutes"]
    events = spec.get("events") or (lambda m: {})
    missing = spec.get("missing") or (lambda m: False)
    for i in range(minutes):
        m = i - (minutes - 1)
        ev = events(m)
        door = bool(ev.get("door"))
        capacity = ev.get("capacity", 1)
        available = ev.get("available", True) is not False and capacity > 0
        amb = spec["ambient"](m)
        if not available:
            cooling = False
        elif T >= spec["cutIn"]:
            cooling = True
        elif T <= spec["cutOut"]:
            cooling = False
        dT = leak * (amb - T) * (door_mult if door else 1) - (cool_rate * capacity if cooling else 0)
        T += dT
        miss = missing(m)
        temp = None if miss else r2(T + gauss(rng) * spec.get("noise", 0.035))
        out.append({"m": m, "temp": temp, "ambient": r2(amb + gauss(rng) * 0.08), "door": door, "cooling": cooling, "source": "synthetic"})
    return out


UNITS: list[dict[str, Any]] = [
    {"id": "FR-01", "name": "Vaccine fridge", "type": "Vaccine refrigerator", "location": "Immunisation Clinic", "facility": "City General Hospital", "lower": 2.0, "upper": 8.0, "cutIn": 5.0, "cutOut": 3.4, "scenario": "Normal operation"},
    {"id": "FR-02", "name": "Pharmacy fridge", "type": "Pharmacy refrigerator", "location": "Inpatient Pharmacy", "facility": "City General Hospital", "lower": 2.0, "upper": 8.0, "cutIn": 5.0, "cutOut": 3.4, "scenario": "Sudden cooling failure"},
    {"id": "FR-03", "name": "Lab fridge", "type": "Laboratory refrigerator", "location": "Pathology Lab", "facility": "City General Hospital", "lower": 2.0, "upper": 8.0, "cutIn": 5.0, "cutOut": 3.4, "scenario": "Repeated door opening + slow degradation"},
    {"id": "CR-04", "name": "Cold room", "type": "Walk-in cold room", "location": "Central Store", "facility": "City General Hospital", "lower": 2.0, "upper": 8.0, "cutIn": 4.4, "cutOut": 3.2, "scenario": "Normal operation"},
]


def _in(m: int, a: int, d: int) -> bool:
    return a <= m < a + d


def _sin_day(m: int) -> float:
    return math.sin((m / 1440) * 2 * math.pi)


SPECS: dict[str, dict] = {
    "FR-01": {"seed": 101, "start": 4.2, "leak": 0.0042, "ambient": lambda m: 24 + 1.2 * _sin_day(m),
              "events": lambda m: {"door": _in(m, -300, 2) or _in(m, -780, 1)}},
    "FR-02": {"seed": 202, "start": 4.3, "leak": 0.0042, "ambient": lambda m: 26 + 1.0 * _sin_day(m),
              "events": lambda m: {"door": _in(m, -540, 5) or _in(m, -48, 3), "available": not (m >= -34)}},
    "FR-03": {"seed": 303, "start": 4.0, "leak": 0.0042, "ambient": lambda m: 25 + 1.0 * _sin_day(m),
              "events": lambda m: {
                  "door": _in(m, -840, 16) or _in(m, -420, 3) or _in(m, -200, 2) or _in(m, -52, 3) or _in(m, -27, 3) or _in(m, -9, 2),
                  "capacity": 1 if m < -240 else 1 - 0.5 * clamp((m + 240) / 240, 0, 1)},
              "missing": lambda m: m in (-170, -171, -95)},
    "CR-04": {"seed": 404, "start": 3.8, "leak": 0.0021, "coolRate": 0.11, "noise": 0.025, "ambient": lambda m: 23 + 0.8 * _sin_day(m),
              "events": lambda m: {"door": _in(m, -610, 4) or _in(m, -130, 2)},
              "missing": lambda m: (-905 <= m < -898) or m == -33},
}


def get_unit(unit_id: str) -> dict | None:
    return next((u for u in UNITS if u["id"] == unit_id), None)


def generate_series(unit_id: str, minutes: int = 1440) -> list[dict]:
    u = get_unit(unit_id)
    if u is None:
        raise KeyError(unit_id)
    return simulate({**SPECS[unit_id], "minutes": minutes, "cutIn": u["cutIn"], "cutOut": u["cutOut"]})


# ---------- data quality ----------
def data_quality(series: list[dict], window: int = 60) -> dict:
    w = series[-window:]
    missing = sum(1 for r in w if r["temp"] is None)
    vals = [r["temp"] for r in w if r["temp"] is not None]
    flat = False
    if len(vals) >= 15:
        last = vals[-15:]
        flat = max(last) - min(last) < 0.005
    jumps = sum(1 for i in range(1, len(vals)) if abs(vals[i] - vals[i - 1]) > 1.5)
    last_idx = len(series) - 1
    while last_idx >= 0 and series[last_idx]["temp"] is None:
        last_idx -= 1
    stale = math.inf if last_idx < 0 else len(series) - 1 - last_idx
    missing_pct = missing / max(len(w), 1) * 100
    issues = []
    if missing_pct > 0:
        issues.append(f"{missing} missing reading{'s' if missing > 1 else ''} in last {window} min")
    if stale >= 5:
        issues.append(f"Last valid reading {stale} min old")
    if flat:
        issues.append("Flat-lined values (possible stuck sensor)")
    if jumps:
        issues.append(f"{jumps} implausible jump{'s' if jumps > 1 else ''} > 1.5°C/min")
    level = "Good"
    if missing_pct > 2 or stale >= 2 or jumps:
        level = "Fair"
    if missing_pct > 10 or stale >= 10 or flat:
        level = "Poor"
    return {"level": level, "missing": missing, "missingPct": r2(missing_pct), "staleMin": stale, "flat": flat, "jumps": jumps, "issues": issues}


# ---------- feature engineering (no future rows: series ends at evaluated instant) ----------
def _slope(points: list[tuple[int, float]]) -> float:
    n = len(points)
    if n < 3:
        return 0.0
    sx = sum(p[0] for p in points)
    sy = sum(p[1] for p in points)
    sxx = sum(p[0] * p[0] for p in points)
    sxy = sum(p[0] * p[1] for p in points)
    d = n * sxx - sx * sx
    return 0.0 if d == 0 else (n * sxy - sx * sy) / d


def _valid(series: list[dict], n: int) -> list[tuple[int, float]]:
    return [(i, r["temp"]) for i, r in enumerate(series[-n:]) if r["temp"] is not None]


def extract_features(series: list[dict], cfg: dict) -> dict:
    last_valid = next((r for r in reversed(series) if r["temp"] is not None), series[-1])
    last = series[-1]
    T = last_valid["temp"]
    w30 = [p[1] for p in _valid(series, 30)]
    mean30 = sum(w30) / max(len(w30), 1)
    std30 = math.sqrt(sum((v - mean30) ** 2 for v in w30) / max(len(w30), 1))
    w360 = [p[1] for p in _valid(series, 360)]
    mean6h = sum(w360) / max(len(w360), 1)
    slope15 = _slope(_valid(series, 15))
    slope60 = _slope(_valid(series, 60))
    off = overdue = 0
    for r in reversed(series):
        if r["cooling"]:
            break
        off += 1
        if r["temp"] is not None and r["temp"] > cfg["cutIn"] + 0.15:
            overdue += 1
    on = 0
    for r in reversed(series):
        if not r["cooling"]:
            break
        on += 1
    w60 = series[-60:]
    door_events = sum(1 for i, r in enumerate(w60) if r["door"] and (i == 0 or not w60[i - 1]["door"]))
    since_door = math.inf
    for i in range(len(series) - 1, -1, -1):
        if series[i]["door"]:
            since_door = len(series) - 1 - i
            break
    w10 = [p[1] for p in _valid(series, 10)]
    near = sum(1 for p in _valid(series, 60) if p[1] >= cfg["upper"] - 1)
    return {
        "temp": T, "ambient": last["ambient"], "doorOpen": last["door"], "coolingActive": last["cooling"],
        "mean30": r2(mean30), "std30": _js_round(std30, 1000), "mean6h": r2(mean6h),
        "min30": min(w30) if w30 else T, "max30": max(w30) if w30 else T,
        "slope15": _js_round(slope15, 10000), "slope60": _js_round(slope60, 10000),
        "coolingOffMin": off, "overdueMin": overdue, "coolingOnMin": on,
        "doorEvents60": door_events, "minutesSinceDoor": since_door,
        "marginUpper": r2(cfg["upper"] - T), "marginLower": r2(T - cfg["lower"]),
        "nearLimitMin": near, "lastStep": r2(w10[-1] - w10[-2]) if len(w10) >= 2 else 0,
    }


# ---------- forecast (physics-informed extrapolation, not a trained model) ----------
def forecast(f: dict, cfg: dict, horizon: int) -> dict:
    T = f["temp"]
    amb = f["ambient"]
    failed = not f["coolingActive"] and (f["overdueMin"] >= 3 or f["coolingOffMin"] > 35)
    degrading = f["coolingActive"] and f["coolingOnMin"] >= 20 and f["slope60"] > 0.004 and f["slope15"] > 0
    if failed:
        mode = "cooling-inactive"
    elif f["doorOpen"]:
        mode = "door-open"
    elif degrading:
        mode = "degradation"
    elif f["minutesSinceDoor"] <= 20 and T > f["mean6h"] + 0.4 and f["slope15"] < 0:
        mode = "recovery"
    else:
        mode = "normal"
    k = clamp(f["slope15"] / max(amb - T, 1), 0.002, 0.02)
    pts = []
    for t in range(1, horizon + 1):
        if mode == "cooling-inactive":
            s = k * (amb - T)
        elif mode == "door-open":
            s = max(f["slope15"], 0.05) if t <= 2 else (f["mean6h"] - T) / 10
        elif mode == "degradation":
            s = f["slope15"]
        elif mode == "recovery":
            s = (f["mean6h"] - T) / 9
        else:
            s = (min(f["slope15"], 0.12) * 0.9 ** t + (f["mean6h"] - T) / 30) if T < cfg["cutIn"] else (f["mean6h"] - T) / 8
        T += s
        spread = 0.08 + f["std30"] * 0.6 + 0.012 * t
        pts.append({"m": t, "temp": r2(T), "lo": r2(T - spread), "hi": r2(T + spread)})
    cross = next((p for p in pts if p["temp"] >= cfg["upper"]), None) or next((p for p in pts if p["temp"] <= cfg["lower"]), None)
    peak = max([f["temp"]] + [p["temp"] for p in pts])
    return {
        "mode": mode, "points": pts, "peak": r2(peak),
        "crossing": {"m": cross["m"], "temp": cross["temp"], "limit": "upper" if cross["temp"] >= cfg["upper"] else "lower"} if cross else None,
    }


# ---------- demonstration excursion model ----------
FACTOR_LABELS = {
    "forecast": "Forecast approaching limit", "trend": "Rising temperature trend",
    "rate": "High rate of temperature increase", "cooling": "Cooling inactive too long",
    "door": "Door-open events", "ambient": "Ambient temperature",
    "degradation": "Gradual cooling degradation", "margin": "Close to upper limit",
}


def demo_excursion_model(f: dict, fc: dict, cfg: dict) -> dict:
    """Hand-weighted logistic score. NOT trained. Replace with a real classifier."""
    margin = max(cfg["upper"] - f["temp"], 0.05)
    rise = (fc["peak"] - f["temp"]) / margin
    c = {
        "forecast": 1.1 * clamp(rise, 0, 1.4),
        "trend": 12 * clamp(f["slope60"], 0, 0.1),
        "rate": 9 * clamp(f["slope15"], 0, 0.12),
        "cooling": 0.03 * min(f["overdueMin"], 30) + (0.4 if f["coolingOffMin"] > 35 else 0),
        "door": min(0.25 * f["doorEvents60"] + (0.4 if f["doorOpen"] else 0), 1.2),
        "ambient": 0.12 * clamp(f["ambient"] - 24, 0, 6),
        "degradation": 30 * clamp(f["slope60"], 0, 0.05) if f["coolingActive"] and f["coolingOnMin"] >= 15 else 0,
        "margin": 1.0 * clamp(1 - margin / 4, 0, 1),
    }
    z = -2.95 + sum(c.values())
    return {"probability": 1 / (1 + math.exp(-z)), "logit": z, "contributions": c}


def anomaly_score(f: dict, q: dict) -> dict:
    """Rule-based stand-in for the planned Isolation Forest detector."""
    z = abs(f["temp"] - f["mean30"]) / max(f["std30"], 0.05)
    if f["coolingActive"] and not f["doorOpen"] and f["slope15"] > 0.012 and f["coolingOnMin"] >= 15:
        combo = 0.75
    elif not f["coolingActive"] and f["overdueMin"] >= 5:
        combo = 0.8
    else:
        combo = 0
    parts = {
        "spike": clamp((abs(f["lastStep"]) - 0.4) / 1.2, 0, 1),
        "deviation": clamp((z - 2) / 4, 0, 1) * (0.4 if f["doorOpen"] else 1),
        "flatline": 1 if q["flat"] else 0,
        "combination": combo,
    }
    score = max(parts.values())
    status = "Anomalous" if score >= 0.7 else "Unusual" if score >= 0.4 else "Normal"
    reasons = []
    if parts["spike"] >= 0.4:
        reasons.append("Sudden step change between consecutive readings")
    if parts["deviation"] >= 0.4:
        reasons.append("Reading far from its 30-minute baseline")
    if parts["flatline"]:
        reasons.append("Sensor output has not changed (possible stuck sensor)")
    if parts["combination"] >= 0.7:
        reasons.append("Temperature rising while cooling runs and door is closed" if f["coolingActive"] else "Cooling off while temperature is above cut-in point")
    return {"score": r2(score), "status": status, "parts": parts, "reasons": reasons}


DEFAULT_BANDS = {"medium": 30, "high": 60}


def category(pct: int, bands: dict = DEFAULT_BANDS) -> str:
    return "High" if pct >= bands["high"] else "Medium" if pct >= bands["medium"] else "Low"


def _explain(f: dict, fc: dict, sorted_factors: list[dict]) -> str:
    parts: list[str] = []
    top = [x["key"] for x in sorted_factors if x["value"] > 0.6]
    mode = fc["mode"]
    if mode == "cooling-inactive":
        parts.append("Cooling has remained inactive longer than expected while the temperature keeps rising.")
    elif mode == "degradation":
        parts.append("Temperature is climbing even though cooling is running, which suggests reduced cooling performance.")
    elif mode == "door-open":
        parts.append("The door is currently open and the temperature is rising.")
    elif mode == "recovery":
        parts.append("Temperature rose after a door event and is now falling back toward its normal range.")
    if ("rate" in top or "trend" in top) and mode != "recovery":
        parts.insert(0, "The temperature is rising faster than expected.")
    if "door" in top and mode != "door-open" and f["doorEvents60"] > 0:
        n = f["doorEvents60"]
        parts.append(f"{n} door-open event{'s' if n > 1 else ''} in the last hour may be contributing.")
    if "ambient" in top:
        parts.append(f"Ambient temperature is elevated ({f['ambient']:.1f}°C).")
    if fc["crossing"]:
        parts.append(f"The forecast reaches the {fc['crossing']['limit']} limit in about {fc['crossing']['m']} min.")
    if not parts:
        parts.append("Temperature is following its normal cooling cycle within the configured limits.")
    return " ".join(parts)


def _action(fc: dict, cat: str) -> str:
    return {
        "cooling-inactive": "Inspect the cooling system and verify sensor readings.",
        "degradation": "Schedule a cooling-system check (condenser, seals, refrigerant) and recheck in 15 minutes.",
        "door-open": "Check that the door is fully closed, then recheck the temperature in 10 minutes.",
        "recovery": "No action needed now. Keep monitoring until the temperature returns to its normal band.",
    }.get(fc["mode"], "Verify the temperature reading and limit door openings; recheck in 15 minutes." if cat == "Medium" else "Continue routine monitoring.")


def assess(series: list[dict], cfg: dict, horizon: int = 30, bands: dict = DEFAULT_BANDS) -> dict:
    f = extract_features(series, cfg)
    fc = forecast(f, cfg, horizon)
    model = demo_excursion_model(f, fc, cfg)
    q = data_quality(series)
    an = anomaly_score(f, q)
    in_exc = f["temp"] > cfg["upper"] or f["temp"] < cfg["lower"]
    pct = 100 if in_exc else min(99, int(math.floor(model["probability"] * 100 + 0.5)))
    cat = "High" if in_exc else category(pct, bands)
    factors = sorted(
        ({"key": k, "label": FACTOR_LABELS[k], "value": r2(v)} for k, v in model["contributions"].items()),
        key=lambda x: -x["value"],
    )
    disturbed = f["temp"] > f["mean6h"] + 0.6 or f["minutesSinceDoor"] <= 20 or fc["mode"] == "cooling-inactive"
    status_map = {"cooling-inactive": "Cooling inactive", "degradation": "Cooling degraded", "door-open": "Door open", "recovery": "Recovering"}
    decision = "excursion" if in_exc else "stable" if not disturbed else "recovering" if fc["mode"] == "recovery" else "warning"
    return {
        "probability": pct, "category": cat, "horizon": horizon, "features": f, "forecast": fc,
        "anomaly": an, "quality": q, "factors": factors,
        "explanation": _explain(f, fc, factors), "action": _action(fc, cat),
        "status": "Excursion in progress" if in_exc else status_map.get(fc["mode"], "Normal"),
        "inExcursion": in_exc, "decision": decision, "model": MODEL_NAME,
        "explanationType": "prototype-rule-weights (not SHAP)",
    }


def risk_history(series: list[dict], cfg: dict, horizon: int = 30, bands: dict = DEFAULT_BANDS, step: int = 5) -> list[dict]:
    idxs = list(range(60, len(series), step))
    if idxs and idxs[-1] != len(series) - 1:
        idxs.append(len(series) - 1)
    out = []
    for i in idxs:
        a = assess(series[: i + 1], cfg, horizon, bands)
        out.append({"m": series[i]["m"], "probability": a["probability"], "category": a["category"], "anomaly": a["anomaly"]["score"],
                    "temp": a["features"]["temp"], "mode": a["forecast"]["mode"], "factors": [x["label"] for x in a["factors"][:3]],
                    "explanation": a["explanation"], "action": a["action"], "crossing": a["forecast"]["crossing"]})
    return out


def excursions(series: list[dict], cfg: dict) -> list[dict]:
    ev, cur = [], None
    for r in series:
        out = r["temp"] is not None and (r["temp"] > cfg["upper"] or r["temp"] < cfg["lower"])
        if out and cur is None:
            cur = {"start": r["m"], "end": r["m"], "peak": r["temp"], "limit": "upper" if r["temp"] > cfg["upper"] else "lower"}
        elif out:
            cur["end"] = r["m"]
            cur["peak"] = max(cur["peak"], r["temp"]) if cur["limit"] == "upper" else min(cur["peak"], r["temp"])
        elif cur is not None:
            ev.append({**cur, "minutes": cur["end"] - cur["start"] + 1})
            cur = None
    if cur is not None:
        ev.append({**cur, "minutes": cur["end"] - cur["start"] + 1, "ongoing": True})
    return ev


def derive_alerts(unit: dict, history: list[dict], current: dict) -> list[dict]:
    """An alert opens when risk rises from Low into Medium/High and stays open while elevated."""
    alerts, cur = [], None
    for i, h in enumerate(history):
        elevated = h["category"] != "Low"
        if elevated and cur is None:
            cur = {"start": h["m"], "snap": h, "peak": h["probability"], "severity": h["category"]}
        elif elevated:
            cur["peak"] = max(cur["peak"], h["probability"])
            if h["category"] == "High":
                cur["severity"] = "High"
        last = i == len(history) - 1
        if (not elevated or last) and cur is not None:
            active = elevated and last
            snap = cur["snap"]
            alerts.append({
                "id": f"AL-{unit['id'].replace('-', '')}-{cur['start']:+d}",
                "unitId": unit["id"], "minuteOffset": cur["start"],
                "severity": current["category"] if active and current["category"] != "Low" else cur["severity"],
                "probability": current["probability"] if active else snap["probability"],
                "peakProbability": max(cur["peak"], current["probability"] if active else 0),
                "temperature": current["features"]["temp"] if active else snap["temp"],
                "upper": unit["upper"], "lower": unit["lower"],
                "factors": [x["label"] for x in current["factors"][:4]] if active else snap["factors"],
                "explanation": current["explanation"] if active else snap["explanation"],
                "action": current["action"] if active else snap["action"],
                "condition": "active" if active else "subsided",
                "source": "synthetic-history",
            })
            cur = None
    return alerts


# ---------- scenarios ----------
SCENARIOS = [
    {"id": "normal", "name": "Normal operation", "desc": "Temperature cycles within its normal band while the thermostat switches cooling on and off."},
    {"id": "door", "name": "Door open", "desc": "The door is left open for the chosen duration, then closed."},
    {"id": "degradation", "name": "Slow degradation", "desc": "Cooling capacity fades gradually, producing a sustained upward trend."},
    {"id": "failure", "name": "Sudden cooling failure", "desc": "The compressor stops unexpectedly and does not restart."},
    {"id": "recovery", "name": "Failure then recovery", "desc": "Cooling fails for the chosen duration, then restarts."},
]


def _scenario_events(sid: str, t: int, duration: int) -> dict:
    if sid == "door":
        return {"door": 5 <= t < 5 + duration}
    if sid == "degradation":
        return {"capacity": 1 - 0.85 * clamp(t / 60, 0, 1)}
    if sid == "failure":
        return {"available": t < 5}
    if sid == "recovery":
        return {"available": not (5 <= t < 5 + duration)}
    return {}


def run_scenario(scenario: str, minutes: int, ambient: float, initial_temp: float, upper: float, lower: float, duration: int,
                 horizon: int = 30, bands: dict = DEFAULT_BANDS, cut_in: float = 5.0, cut_out: float = 3.4) -> dict:
    """Deterministic batch run: 60 min of normal pre-history, then `minutes` of the scenario."""
    pre = simulate({"seed": 777, "minutes": 60, "start": initial_temp, "cutIn": cut_in, "cutOut": cut_out, "ambient": lambda m: ambient})
    series = [{**r, "m": i - 59} for i, r in enumerate(pre)]
    T = pre[-1]["temp"]
    cooling = pre[-1]["cooling"]
    cfg = {"upper": upper, "lower": lower, "cutIn": cut_in, "cutOut": cut_out}
    timeline = []
    for t in range(minutes):
        rng = mulberry32(991 + t * 7919)
        ev = _scenario_events(scenario, t, duration)
        door = bool(ev.get("door"))
        capacity = ev.get("capacity", 1)
        available = ev.get("available", True) is not False
        if not available:
            cooling = False
        elif T >= cut_in:
            cooling = True
        elif T <= cut_out:
            cooling = False
        T = T + 0.0042 * (ambient - T) * (7 if door else 1) - (0.26 * capacity if cooling else 0)
        series.append({"m": t + 1, "temp": r2(T + gauss(rng) * 0.03), "ambient": ambient, "door": door, "cooling": cooling, "source": "simulator"})
        if (t + 1) % 5 == 0 or t == minutes - 1:
            a = assess(series, cfg, horizon, bands)
            timeline.append({"minute": t + 1, "temp": a["features"]["temp"], "probability": a["probability"], "category": a["category"],
                             "anomaly": a["anomaly"]["score"], "mode": a["forecast"]["mode"]})
    final = assess(series, cfg, horizon, bands)
    first_alert = next((x for x in timeline if x["category"] != "Low"), None)
    crossing = next((r for r in series if r["m"] > 0 and r["temp"] is not None and r["temp"] > upper), None)
    return {
        "scenario": scenario, "series": series, "timeline": timeline, "final": final,
        "firstWarningMinute": first_alert["minute"] if first_alert else None,
        "firstCrossingMinute": crossing["m"] if crossing else None,
    }
