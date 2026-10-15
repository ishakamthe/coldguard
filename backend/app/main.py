"""
ColdGuard AI · FastAPI backend.

Runs fully on synthetic demo data with no external services. Set DATABASE_URL
to persist alert workflow, actions and imports in PostgreSQL.
"""
from __future__ import annotations

import csv
import io
import logging
import math
import os
import uuid
from datetime import datetime, timedelta, timezone
from functools import lru_cache

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import engine as E
from .schemas import ActionIn, AlertPatch, PredictionRequest, ScenarioRun
from .store import make_store

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format='{"t":"%(asctime)s","lvl":"%(levelname)s","log":"%(name)s","msg":"%(message)s"}')
log = logging.getLogger("coldguard.api")

MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_BYTES", str(2 * 1024 * 1024)))
SNAPSHOT = datetime.now(timezone.utc).replace(second=0, microsecond=0)  # demo "now", fixed per process

app = FastAPI(title="ColdGuard AI API", version="0.1.0",
              description="Predictive cold-storage early-warning prototype. All unit data is synthetic; the model is an untrained demo.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_methods=["GET", "POST", "PATCH"],
    allow_headers=["*"],
)
store = make_store()


# ---------- consistent responses ----------
def ok(data, **meta):
    return {"data": data, "meta": {"demo": True, "dataSource": "synthetic", "model": E.MODEL_NAME, **meta}}


def fail(status: int, code: str, message: str, details=None):
    raise HTTPException(status_code=status, detail={"code": code, "message": message, "details": details})


@app.exception_handler(HTTPException)
async def http_error(_: Request, exc: HTTPException):
    body = exc.detail if isinstance(exc.detail, dict) else {"code": "error", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": body})


@app.exception_handler(RequestValidationError)
async def validation_error(_: Request, exc: RequestValidationError):
    errs = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"error": {"code": "validation_error", "message": "Request validation failed", "details": errs}})


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"error": {"code": "internal_error", "message": "Unexpected server error"}})


# ---------- helpers ----------
def unit_or_404(unit_id: str) -> dict:
    u = E.get_unit(unit_id.upper())
    if not u:
        fail(404, "unit_not_found", f"Unknown unit '{unit_id}'. Known units: {', '.join(x['id'] for x in E.UNITS)}")
    return {**u, **store.unit_config.get(u["id"], {})}


@lru_cache(maxsize=8)
def series_for(unit_id: str) -> tuple:
    return tuple(E.generate_series(unit_id))


def ts(m: int) -> str:
    return (SNAPSHOT + timedelta(minutes=m)).isoformat()


def json_safe(obj):
    if isinstance(obj, float) and math.isinf(obj):
        return None
    if isinstance(obj, dict):
        return {k: json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [json_safe(v) for v in obj]
    return obj


def check_horizon(h: int) -> int:
    if not 5 <= h <= 120:
        fail(422, "invalid_horizon", "horizon must be between 5 and 120 minutes")
    return h


@lru_cache(maxsize=64)
def _history(unit_id: str, upper: float, lower: float, horizon: int) -> tuple:
    u = {**E.get_unit(unit_id), "upper": upper, "lower": lower}
    return tuple(E.risk_history(list(series_for(unit_id)), u, horizon))


def unit_alerts(u: dict, horizon: int = 30) -> list[dict]:
    series = list(series_for(u["id"]))
    current = E.assess(series, u, horizon)
    alerts = E.derive_alerts(u, list(_history(u["id"], u["upper"], u["lower"], horizon)), current)
    for a in alerts:
        a["generatedAt"] = ts(a["minuteOffset"])
        a["workflow"] = store.get_alert_state(a["id"])
    return alerts


def all_alerts() -> list[dict]:
    return [a for u in E.UNITS for a in unit_alerts(unit_or_404(u["id"]))]


# ---------- endpoints ----------
@app.get("/api/health")
def health():
    return ok({"status": "ok", "model": E.MODEL_NAME, "modelTrained": False, "store": store.kind, "snapshot": SNAPSHOT.isoformat()})


@app.get("/api/units")
def list_units(horizon: int = Query(30)):
    check_horizon(horizon)
    out = []
    for base in E.UNITS:
        u = unit_or_404(base["id"])
        a = E.assess(list(series_for(u["id"])), u, horizon)
        out.append({**u, "temperature": a["features"]["temp"], "probability": a["probability"], "category": a["category"],
                    "status": a["status"], "anomaly": a["anomaly"]["status"], "dataQuality": a["quality"]["level"], "lastReading": ts(0)})
    return ok(out, horizonMin=horizon)


@app.get("/api/units/{unit_id}")
def get_unit(unit_id: str):
    u = unit_or_404(unit_id)
    s = list(series_for(u["id"]))
    return ok({**u, "latest": {**s[-1], "timestamp": ts(s[-1]["m"])}, "excursions24h": E.excursions(s, u)})


@app.get("/api/units/{unit_id}/readings")
def readings(unit_id: str, minutes: int = Query(60, ge=1, le=1440)):
    u = unit_or_404(unit_id)
    rows = [{**r, "timestamp": ts(r["m"])} for r in list(series_for(u["id"]))[-minutes:]]
    return ok(rows, count=len(rows), unitId=u["id"])


@app.get("/api/units/{unit_id}/forecast")
def unit_forecast(unit_id: str, horizon: int = Query(30)):
    check_horizon(horizon)
    u = unit_or_404(unit_id)
    a = E.assess(list(series_for(u["id"])), u, horizon)
    fc = a["forecast"]
    return ok({**fc, "points": [{**p, "timestamp": ts(p["m"])} for p in fc["points"]], "upper": u["upper"], "lower": u["lower"], "isPrediction": True}, unitId=u["id"])


@app.get("/api/units/{unit_id}/risk")
def unit_risk(unit_id: str, horizon: int = Query(30)):
    check_horizon(horizon)
    u = unit_or_404(unit_id)
    return ok(json_safe(E.assess(list(series_for(u["id"])), u, horizon)), unitId=u["id"])


@app.post("/api/predictions")
def predict(req: PredictionRequest):
    u = unit_or_404(req.unit_id)
    if req.thresholds:
        u = {**u, "lower": req.thresholds.lower, "upper": req.thresholds.upper}
    if req.readings:
        rows = sorted(req.readings, key=lambda r: r.timestamp)
        series = [{"m": i - (len(rows) - 1), "temp": r.temperature_c, "ambient": r.ambient_c, "door": r.door_state == "open",
                   "cooling": r.cooling_state == "on", "source": "request"} for i, r in enumerate(rows)]
        if all(r["temp"] is None for r in series):
            fail(422, "no_valid_readings", "All supplied readings are missing a temperature value")
        source = "request"
    else:
        series = list(series_for(u["id"]))
        source = "synthetic"
    a = json_safe(E.assess(series, u, req.horizon_min))
    return ok(a, unitId=u["id"], dataSource=source)


@app.get("/api/alerts")
def get_alerts(status: str | None = None, unit_id: str | None = None):
    items = all_alerts()
    if status:
        items = [a for a in items if a["workflow"]["status"] == status]
    if unit_id:
        items = [a for a in items if a["unitId"] == unit_id.upper()]
    return ok(items, count=len(items))


def alert_or_404(alert_id: str) -> dict:
    a = next((x for x in all_alerts() if x["id"] == alert_id), None)
    if not a:
        fail(404, "alert_not_found", f"Unknown alert '{alert_id}'")
    return a


@app.get("/api/alerts/{alert_id}")
def get_alert(alert_id: str):
    a = alert_or_404(alert_id)
    return ok({**a, "actions": store.list_actions(alert_id)})


ALLOWED = {"new": {"acknowledged", "in_progress", "resolved", "dismissed"}, "acknowledged": {"in_progress", "resolved", "dismissed"},
           "in_progress": {"resolved", "dismissed"}, "resolved": {"in_progress"}, "dismissed": {"in_progress"}}


@app.patch("/api/alerts/{alert_id}")
def patch_alert(alert_id: str, body: AlertPatch):
    a = alert_or_404(alert_id)
    cur = a["workflow"]["status"]
    if body.status not in ALLOWED[cur]:
        fail(409, "invalid_transition", f"Cannot change alert from '{cur}' to '{body.status}'")
    state = store.update_alert(alert_id, body.status, body.note, body.by)
    log.info("alert %s %s -> %s by %s", alert_id, cur, body.status, body.by)
    return ok({**a, "workflow": state})


@app.post("/api/alerts/{alert_id}/actions", status_code=201)
def add_action(alert_id: str, body: ActionIn):
    a = alert_or_404(alert_id)
    rec = store.add_action(alert_id, a["unitId"], body.action, body.note, body.by, body.status)
    return ok(rec, note="Records intent only; it does not confirm a physical intervention.")


# ---------- CSV import ----------
FIELDS = ["timestamp", "unit_id", "temperature_c", "ambient_c", "door_state", "cooling_state"]
TRUE_DOOR, FALSE_DOOR = {"open", "1", "true", "yes"}, {"closed", "0", "false", "no"}
TRUE_COOL, FALSE_COOL = {"on", "active", "1", "true", "yes"}, {"off", "inactive", "0", "false", "no"}


def validate_csv(text: str, known: set[str]) -> dict:
    reader = csv.reader(io.StringIO(text))
    rows = [r for r in reader if any(c.strip() for c in r)]
    if len(rows) < 2:
        fail(422, "empty_file", "The file needs a header row and at least one data row")
    headers = [h.strip().lower() for h in rows[0]]
    missing_cols = [f for f in FIELDS if f not in headers]
    if missing_cols:
        fail(422, "missing_columns", f"Missing required columns: {', '.join(missing_cols)}", {"expected": FIELDS, "found": headers})
    idx = {f: headers.index(f) for f in FIELDS}
    counts = {"total": len(rows) - 1, "valid": 0, "missing": 0, "badTimestamp": 0, "duplicate": 0, "outOfRange": 0, "typeMismatch": 0, "unknownUnit": 0}
    seen, records, rejected = set(), [], []
    for line, r in enumerate(rows[1:], start=2):
        v = {f: (r[idx[f]].strip() if idx[f] < len(r) else "") for f in FIELDS}
        errs = []
        if any(v[f] == "" for f in FIELDS):
            errs.append("missing value"); counts["missing"] += 1
        tstamp = None
        if v["timestamp"]:
            try:
                tstamp = datetime.fromisoformat(v["timestamp"].replace("Z", "+00:00"))
            except ValueError:
                errs.append("invalid timestamp"); counts["badTimestamp"] += 1
        temp = amb = None
        type_err = False
        try:
            temp = float(v["temperature_c"]) if v["temperature_c"] else None
            amb = float(v["ambient_c"]) if v["ambient_c"] else None
        except ValueError:
            type_err = True
        d, c = v["door_state"].lower(), v["cooling_state"].lower()
        if (d and d not in TRUE_DOOR | FALSE_DOOR) or (c and c not in TRUE_COOL | FALSE_COOL):
            type_err = True
        if type_err:
            errs.append("type mismatch"); counts["typeMismatch"] += 1
        if temp is not None and not -40 <= temp <= 50:
            errs.append("temperature out of range"); counts["outOfRange"] += 1
        elif amb is not None and not -20 <= amb <= 60:
            errs.append("ambient out of range"); counts["outOfRange"] += 1
        uid = v["unit_id"].upper()
        if uid and uid not in known:
            errs.append(f"unknown unit {uid}"); counts["unknownUnit"] += 1
        key = (uid, tstamp.isoformat() if tstamp else v["timestamp"])
        if not errs and key in seen:
            errs.append("duplicate record"); counts["duplicate"] += 1
        if errs:
            rejected.append({"line": line, "errors": errs})
            continue
        seen.add(key)
        counts["valid"] += 1
        records.append({"unit_id": uid, "timestamp": tstamp.isoformat(), "temperature_c": temp, "ambient_c": amb,
                        "door_open": d in TRUE_DOOR, "cooling_active": c in TRUE_COOL})
    return {"counts": counts, "unexpectedColumns": [h for h in headers if h not in FIELDS], "rejected": rejected[:200], "records": records}


@app.post("/api/data/import")
async def import_csv(file: UploadFile = File(...), dry_run: bool = Query(False)):
    name = os.path.basename(file.filename or "upload.csv")
    if not name.lower().endswith(".csv"):
        fail(415, "unsupported_file", "Only .csv files are accepted")
    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        fail(413, "file_too_large", f"File exceeds {MAX_UPLOAD_BYTES // 1024} KB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        fail(422, "invalid_encoding", "File must be UTF-8 encoded text")
    result = validate_csv(text, {u["id"] for u in E.UNITS})
    c = result["counts"]
    if dry_run:
        return ok({**{k: v for k, v in result.items() if k != "records"}, "preview": result["records"][:25], "imported": False})
    if c["valid"] == 0:
        fail(422, "no_valid_rows", "No valid rows to import; nothing was saved", result["rejected"][:20])
    batch = {"id": f"IMP-{uuid.uuid4().hex[:8].upper()}", "filename": name, "total": c["total"], "valid": c["valid"],
             "rejected": c["total"] - c["valid"], "counts": c, "importedAt": datetime.now(timezone.utc).isoformat(), "_records": result["records"]}
    store.add_import(batch)
    log.info("import %s: %d valid of %d", batch["id"], c["valid"], c["total"])
    public = {k: v for k, v in batch.items() if not k.startswith("_")}
    return ok({**public, "unexpectedColumns": result["unexpectedColumns"], "rejectedRows": result["rejected"][:50], "imported": True}, dataSource="imported")


# ---------- reports ----------
@app.get("/api/reports/{report_id}")
def report(report_id: str, period_min: int = Query(360, ge=60, le=1440), horizon: int = Query(30)):
    """report_id is the unit id (e.g. FR-02); reports are generated on request."""
    check_horizon(horizon)
    u = unit_or_404(report_id)
    s = list(series_for(u["id"]))
    window = s[-(period_min + 1):]
    vals = [r["temp"] for r in window if r["temp"] is not None]
    a = E.assess(s, u, horizon)
    alerts = [x for x in unit_alerts(u, horizon) if x["minuteOffset"] >= -period_min]
    return ok(json_safe({
        "reportId": f"RPT-{u['id']}-{SNAPSHOT:%Y%m%d%H%M}", "unit": u,
        "period": {"from": ts(-period_min), "to": ts(0), "minutes": period_min},
        "limits": {"lower": u["lower"], "upper": u["upper"]},
        "readingsSummary": {"count": len(window), "missing": len(window) - len(vals), "min": min(vals), "max": max(vals), "mean": round(sum(vals) / len(vals), 2)},
        "forecast": {**a["forecast"], "isPrediction": True},
        "risk": {"probability": a["probability"], "category": a["category"], "factors": a["factors"][:4], "explanation": a["explanation"], "action": a["action"]},
        "alerts": alerts, "excursions": [e for e in E.excursions(s, u) if e["end"] >= -period_min],
        "actions": [x for x in store.list_actions() if x["unitId"] == u["id"]],
        "dataSource": "synthetic", "modelPerformance": "not evaluated",
    }))


# ---------- scenarios ----------
@app.get("/api/scenarios")
def scenarios():
    return ok(E.SCENARIOS)


@app.post("/api/scenarios/run")
def run(req: ScenarioRun):
    res = E.run_scenario(req.scenario, req.minutes, req.ambient_c, req.initial_temp_c, req.upper, req.lower, req.event_duration_min, req.horizon_min)
    lead = (res["firstCrossingMinute"] - res["firstWarningMinute"]) if res["firstCrossingMinute"] and res["firstWarningMinute"] else None
    out = {"scenario": req.scenario, "parameters": req.model_dump(exclude={"include_series"}), "timeline": res["timeline"],
           "final": json_safe(res["final"]), "firstWarningMinute": res["firstWarningMinute"], "firstCrossingMinute": res["firstCrossingMinute"],
           "simulatedLeadTimeMin": lead}
    if req.include_series:
        out["series"] = res["series"]
    return ok(out, dataSource="simulator")
