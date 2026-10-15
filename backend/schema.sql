-- ColdGuard AI · PostgreSQL schema
-- Extensible to multiple facilities and units. Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS facilities (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    timezone      TEXT NOT NULL DEFAULT 'UTC',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage_units (
    id            TEXT PRIMARY KEY,                 -- e.g. FR-02
    facility_id   TEXT NOT NULL REFERENCES facilities(id),
    name          TEXT NOT NULL,
    unit_type     TEXT NOT NULL,
    location      TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versioned configuration: a new row per change keeps history for audits.
CREATE TABLE IF NOT EXISTS unit_configs (
    id              BIGSERIAL PRIMARY KEY,
    unit_id         TEXT NOT NULL REFERENCES storage_units(id),
    lower_limit_c   NUMERIC(5,2) NOT NULL,
    upper_limit_c   NUMERIC(5,2) NOT NULL,
    forecast_window_min INTEGER NOT NULL DEFAULT 30,
    medium_risk_pct INTEGER NOT NULL DEFAULT 30,
    high_risk_pct   INTEGER NOT NULL DEFAULT 60,
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (lower_limit_c < upper_limit_c),
    CHECK (medium_risk_pct > 0 AND medium_risk_pct < high_risk_pct AND high_risk_pct < 100)
);

CREATE TABLE IF NOT EXISTS import_batches (
    id             TEXT PRIMARY KEY,
    filename       TEXT NOT NULL,
    total_rows     INTEGER NOT NULL,
    valid_rows     INTEGER NOT NULL,
    rejected_rows  INTEGER NOT NULL,
    summary        JSONB,
    imported_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- source separates synthetic demo data, simulator output, imports and (future) live sensors.
CREATE TABLE IF NOT EXISTS sensor_readings (
    id              BIGSERIAL PRIMARY KEY,
    unit_id         TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL,
    temperature_c   NUMERIC(6,2),                    -- NULL = missing reading, never imputed
    ambient_c       NUMERIC(6,2),
    door_open       BOOLEAN,
    cooling_active  BOOLEAN,
    source          TEXT NOT NULL CHECK (source IN ('synthetic','simulator','imported','sensor')),
    import_batch_id TEXT REFERENCES import_batches(id) ON DELETE CASCADE,
    UNIQUE (unit_id, recorded_at, source)
);
CREATE INDEX IF NOT EXISTS idx_readings_unit_time ON sensor_readings (unit_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS predictions (
    id               BIGSERIAL PRIMARY KEY,
    unit_id          TEXT NOT NULL,
    evaluated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    horizon_min      INTEGER NOT NULL,
    probability_pct  INTEGER NOT NULL CHECK (probability_pct BETWEEN 0 AND 100),
    risk_category    TEXT NOT NULL CHECK (risk_category IN ('Low','Medium','High')),
    forecast         JSONB,
    features         JSONB,
    contributions    JSONB,                          -- rule weights today; SHAP values once a model exists
    explanation_type TEXT NOT NULL,                  -- 'prototype-rule-weights' | 'shap'
    model_version    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_predictions_unit_time ON predictions (unit_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS anomaly_results (
    id            BIGSERIAL PRIMARY KEY,
    unit_id       TEXT NOT NULL,
    evaluated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    score         NUMERIC(4,2) NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('Normal','Unusual','Anomalous')),
    reasons       JSONB,
    detector      TEXT NOT NULL                      -- 'rules-v0' | 'isolation-forest-vN'
);

CREATE TABLE IF NOT EXISTS alerts (
    id               TEXT PRIMARY KEY,
    unit_id          TEXT NOT NULL,
    generated_at     TIMESTAMPTZ NOT NULL,
    severity         TEXT NOT NULL CHECK (severity IN ('Medium','High')),
    probability_pct  INTEGER NOT NULL,
    temperature_c    NUMERIC(6,2),
    upper_limit_c    NUMERIC(5,2),
    factors          JSONB,
    explanation      TEXT,
    recommended_action TEXT,
    source           TEXT NOT NULL,                  -- 'synthetic-history' | 'simulator' | 'sensor'
    prediction_id    BIGINT REFERENCES predictions(id)
);

-- Current workflow state + full history (append-only JSON list; never rewritten).
CREATE TABLE IF NOT EXISTS alert_state (
    alert_id    TEXT PRIMARY KEY,
    status      TEXT NOT NULL CHECK (status IN ('new','acknowledged','in_progress','resolved','dismissed')),
    history     JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preventive_actions (
    id          TEXT PRIMARY KEY,
    alert_id    TEXT,
    unit_id     TEXT NOT NULL,
    action      TEXT NOT NULL,
    note        TEXT,
    created_by  TEXT NOT NULL,
    status      TEXT NOT NULL CHECK (status IN ('planned','done')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scenario_simulations (
    id            BIGSERIAL PRIMARY KEY,
    scenario      TEXT NOT NULL,
    parameters    JSONB NOT NULL,
    summary       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
