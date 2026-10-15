from fastapi.testclient import TestClient

from app import engine as E
from app.main import app

client = TestClient(app)


def test_health_reports_untrained_model():
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["data"]["modelTrained"] is False


def test_seed_units_match_illustrative_ordering():
    data = {u["id"]: u for u in client.get("/api/units").json()["data"]}
    assert data["FR-02"]["category"] == "High"
    assert data["FR-03"]["category"] == "Medium"
    assert data["FR-01"]["category"] == "Low" and data["CR-04"]["category"] == "Low"


def test_risk_is_deterministic():
    a = client.get("/api/units/FR-02/risk").json()["data"]
    b = client.get("/api/units/FR-02/risk").json()["data"]
    assert a["probability"] == b["probability"] and a["explanation"] == b["explanation"]
    assert a["explanationType"].startswith("prototype")


def test_no_fabricated_crossing_for_low_risk_unit():
    fc = client.get("/api/units/FR-01/forecast").json()["data"]
    assert fc["crossing"] is None and fc["isPrediction"] is True


def test_features_do_not_use_future_rows():
    s = E.generate_series("FR-02")
    u = E.get_unit("FR-02")
    past = E.extract_features(s[:-30], u)
    # changing future rows must not change features computed at an earlier instant
    tampered = s[:-30] + [{**r, "temp": 99.0} for r in s[-30:]]
    assert E.extract_features(tampered[:-30], u) == past


def test_unknown_unit_404():
    r = client.get("/api/units/XX-99/risk")
    assert r.status_code == 404 and r.json()["error"]["code"] == "unit_not_found"


def test_invalid_thresholds_rejected():
    r = client.post("/api/predictions", json={"unit_id": "FR-01", "thresholds": {"lower": 9, "upper": 8}})
    assert r.status_code == 422


def test_alert_workflow_keeps_history():
    alerts = client.get("/api/alerts").json()["data"]
    active = next(a for a in alerts if a["condition"] == "active" and a["unitId"] == "FR-02")
    aid = active["id"]
    assert client.patch(f"/api/alerts/{aid}", json={"status": "acknowledged", "by": "Tester"}).status_code == 200
    assert client.post(f"/api/alerts/{aid}/actions", json={"action": "Inspect the cooling system"}).status_code == 201
    r = client.patch(f"/api/alerts/{aid}", json={"status": "resolved", "note": "Breaker reset"})
    hist = r.json()["data"]["workflow"]["history"]
    assert [h["kind"] for h in hist] == ["status", "action", "status", "note"]
    bad = client.patch(f"/api/alerts/{aid}", json={"status": "acknowledged"})
    assert bad.status_code == 409


SAMPLE = "timestamp,unit_id,temperature_c,ambient_c,door_state,cooling_state\n" \
         "2026-10-15T06:00:00Z,FR-03,4.1,24.6,closed,on\n" \
         "2026-10-15T06:01:00Z,FR-03,,24.6,closed,on\n" \
         "not-a-date,FR-03,4.2,24.6,closed,on\n" \
         "2026-10-15T06:00:00Z,FR-03,4.1,24.6,closed,on\n" \
         "2026-10-15T06:02:00Z,FR-03,94,24.6,closed,on\n" \
         "2026-10-15T06:03:00Z,FR-03,warm,24.6,ajar,on\n" \
         "2026-10-15T06:04:00Z,FR-99,4.3,24.6,closed,on\n"


def test_csv_validation_counts():
    r = client.post("/api/data/import?dry_run=true", files={"file": ("s.csv", SAMPLE, "text/csv")})
    c = r.json()["data"]["counts"]
    assert c == {"total": 7, "valid": 1, "missing": 1, "badTimestamp": 1, "duplicate": 1, "outOfRange": 1, "typeMismatch": 1, "unknownUnit": 1}


def test_failed_import_is_not_reported_as_success():
    bad = "timestamp,unit_id,temperature_c,ambient_c,door_state,cooling_state\nnope,FR-01,x,1,open,on\n"
    r = client.post("/api/data/import", files={"file": ("b.csv", bad, "text/csv")})
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_valid_rows"
    r = client.post("/api/data/import", files={"file": ("b.txt", bad, "text/plain")})
    assert r.status_code == 415


def test_scenarios_behave():
    run = lambda s: client.post("/api/scenarios/run", json={"scenario": s, "minutes": 90}).json()["data"]
    normal, failure, recovery = run("normal"), run("failure"), run("recovery")
    assert normal["final"]["category"] == "Low" and normal["firstCrossingMinute"] is None
    assert failure["final"]["category"] == "High"
    # warning precedes the crossing in the failure scenario
    assert failure["firstWarningMinute"] < failure["firstCrossingMinute"]
    assert recovery["final"]["category"] == "Low"


def test_report_has_no_fabricated_metrics():
    d = client.get("/api/reports/FR-02").json()["data"]
    assert d["modelPerformance"] == "not evaluated" and d["forecast"]["isPrediction"]
