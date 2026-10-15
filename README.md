# ColdGuard AI

**Predict before the temperature crosses the line.**

ColdGuard AI is a prototype of an AI-based predictive cold-storage excursion and early-warning system (Technology for Social Cause). Team SkinAura · team leader Pranjal Kute · Code Apex.

Most cold-storage monitors raise an alarm only after a temperature limit has been crossed. ColdGuard AI looks at the trend and operating context (door state, cooling activity, ambient temperature) to estimate the probability of an excursion in the next window. It separates normal recovery from a worsening pattern and explains each warning, so staff have time to act.

> **Prototype status.** All unit data is synthetic, and the excursion model is a deterministic, hand-weighted demonstration model. It has not been trained or evaluated. Explanations are rule-weight contributions, not SHAP values, and the anomaly score is rule-based, not Isolation Forest. Do not use this prototype for real storage decisions.

---

## What's in the repository

```
coldguard/
├── frontend/                 React + Vite + Tailwind + Recharts + Lucide
│   ├── src/lib/engine.js     Demo engine: synthetic data, features, forecast, risk, anomaly, simulator
│   ├── src/lib/store.jsx     App state, alert derivation, simulator playback, persistence (localStorage)
│   ├── src/lib/api.js        REST client (used when VITE_API_URL is set)
│   ├── src/pages/            12 sections (Overview … About)
│   ├── src/components/       Charts, unit cards, risk panels, alert/action forms
│   └── scripts/              build-single.mjs (one-file HTML build), engine-check.mjs
├── backend/                  Python + FastAPI + Pydantic
│   ├── app/engine.py         Python port of the engine (output matches the JS engine exactly)
│   ├── app/main.py           REST API
│   ├── app/schemas.py        Request validation
│   ├── app/store.py          In-memory store, or PostgreSQL when DATABASE_URL is set
│   ├── schema.sql            PostgreSQL schema
│   ├── ml/build_dataset.py   Phase 1: builds a labelled, leakage-safe training table from simulator runs
│   └── tests/test_api.py     12 API and engine tests
├── docker-compose.yml        PostgreSQL + API + frontend
└── .env.example
```

## Quick start

### Frontend only (no backend needed)

```bash
cd frontend
npm install
npm run dev            # http://localhost:5173
```

The dashboard runs entirely on the built-in demo engine. Alert workflow, actions, imports and settings are saved in the browser's localStorage. Use **Reset demo data** to clear them.

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload            # http://localhost:8000/docs
pytest -q                                # 12 tests
```

To connect the frontend, run `VITE_API_URL=http://localhost:8000 npm run dev`, then use **Settings → Test backend connection**. The client in `src/lib/api.js` is set up for every endpoint. The pages still compute locally with the same engine, which keeps the demo working offline. Moving each page to the API means swapping its `useStore()` reads for API calls.

### Full stack with PostgreSQL (Docker)

```bash
cp .env.example .env      # set POSTGRES_PASSWORD
docker compose up --build # web http://localhost:8080 · api http://localhost:8000
```

The API applies `schema.sql` on startup. If the database can't be reached, it logs an error and falls back to the in-memory store.

## Environment variables

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `VITE_API_URL` | frontend (build time) | empty | Backend base URL. Empty means use the browser demo engine |
| `DATABASE_URL` | backend | empty | PostgreSQL DSN. Empty means use the in-memory store |
| `CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated allowed origins |
| `MAX_UPLOAD_BYTES` | backend | `2097152` | CSV upload size limit |
| `LOG_LEVEL` | backend | `INFO` | Structured JSON log level |
| `POSTGRES_PASSWORD` | docker compose | (required) | Database password |

Secrets belong in `.env`, which is git-ignored and must never be committed.

## Demo mode and seed data

There are four units at "City General Hospital", each with 24 hours of one-minute synthetic readings. The readings come from a simple thermal model (heat leak toward ambient, door-open multiplier, thermostat with cut-in and cut-out) with fixed random seeds, so every load produces identical data.

| Unit | Scenario in its history | Demo model at snapshot |
|---|---|---|
| FR-01 Vaccine fridge | Normal cycling, two short door openings | Low (~5%) |
| FR-02 Pharmacy fridge | Door opening, then cooling stops 34 min before the snapshot | High (~85%), forecast crosses 8 °C in ~18 min |
| FR-03 Lab fridge | Repeated door openings and fading cooling capacity; one past excursion | Medium (~36%) |
| CR-04 Cold room | Normal cycling, a few missing readings | Low (~7%) |

The presentation's illustrative figures (FR-02 at 6.8 °C / 81%, FR-03 at 38%, and so on) were the target. The engine *computes* its values from the synthetic readings, so they land close to those figures but not exactly on them. Nothing is hardcoded.

**Scenario simulator.** It offers five scenarios: Normal, Door open, Slow degradation, Sudden cooling failure, and Failure then recovery. You can set ambient temperature, initial temperature, upper limit and event duration, override the door or cooling state, and choose 1×–10× playback. The run drives one chosen unit across the whole dashboard. Alerts are raised when risk rises into Medium or High.

## How the demo model works

Pipeline: **data → validation/quality → features → forecast → excursion probability → anomaly score → risk + explanation → alert**

- **Features** are computed only from readings up to the evaluated minute (a test checks this). They include rolling mean, std, min and max, the 15- and 60-minute slope, cooling-off duration (and the part of it spent above cut-in), cooling-on duration, door events in the last 60 minutes, minutes since the door was last opened, margin to the limit, minutes near the limit, and ambient temperature.
- **Forecast**: a physics-informed extrapolation chosen by operating mode (cooling-inactive, door-open, degradation, recovery, normal), shown with a widening uncertainty band. A crossing is shown only if the forecast actually reaches a limit.
- **Excursion probability**: `p = 1 / (1 + e^-(−2.95 + Σ contributions))`. The contributions are hand-set weights on eight factors. The factor bars on screen are exactly these contributions.
- **Anomaly score** (kept separate from probability): rules for step changes, deviation from the 30-minute baseline, flat-lined sensors, and implausible combinations such as temperature rising while cooling runs.
- **Risk bands**: Low < 30% ≤ Medium < 60% ≤ High (configurable). A reading already outside the limits is reported as *excursion in progress*, not as a prediction.

**Replacing it with a trained model.** Implement `demo_excursion_model(features, forecast, cfg)` in `backend/app/engine.py` with a scikit-learn or XGBoost classifier, keeping the `{probability, logit, contributions}` return shape. Put SHAP values in `contributions` and set `explanationType` to `"shap"`. The API response shape and the frontend stay as they are.

**Building training data.** `python -m ml.build_dataset --out data/train.csv` produces one row per evaluated minute from 120 simulator runs, about 6,100 rows with ~10% positives. The label is any reading outside the limits within the next N minutes. Split by `run_id` or by time when evaluating. This script builds data only; no model has been trained.

## Model evaluation

No metrics are reported because no model has been trained or evaluated. The planned metrics are precision and recall, false-alarm rate, missed-excursion rate, PR-AUC, and warning lead time. The About page shows each one as "Not evaluated yet". `POST /api/scenarios/run` returns a `simulatedLeadTimeMin` for a single simulator run. That number illustrates the mechanism and is not an evaluation result.

## API

All responses use `{"data": …, "meta": {…}}`. Errors use `{"error": {"code", "message", "details"}}`. Interactive docs are at `/docs`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Status, model name, `modelTrained: false`, store type |
| GET | `/api/units` | All units with current risk (`?horizon=30`) |
| GET | `/api/units/{unit_id}` | Unit details, latest reading, 24 h excursions |
| GET | `/api/units/{unit_id}/readings` | `?minutes=60` (1–1440) |
| GET | `/api/units/{unit_id}/forecast` | Forecast points, crossing (or null), `isPrediction: true` |
| GET | `/api/units/{unit_id}/risk` | Full assessment: probability, category, factors, anomaly, quality, explanation |
| POST | `/api/predictions` | Score the stored series or ≥15 supplied readings, with optional thresholds |
| GET | `/api/alerts` | `?status=` `?unit_id=` |
| GET | `/api/alerts/{alert_id}` | Includes recorded actions |
| PATCH | `/api/alerts/{alert_id}` | `{status, note?, by}`; invalid transitions return 409 |
| POST | `/api/alerts/{alert_id}/actions` | Record a preventive action (intent only) |
| POST | `/api/data/import` | Multipart CSV; `?dry_run=true` validates without saving; no valid rows returns 422 |
| GET | `/api/reports/{unit_id}` | Incident report data (`?period_min=360`) |
| GET | `/api/scenarios` | Scenario list |
| POST | `/api/scenarios/run` | Deterministic batch simulation with a risk timeline |

Errors handled include unknown unit (404), invalid thresholds or horizon (422), wrong file type (415), file too large (413), bad encoding, missing columns, no valid rows (422), and invalid status transitions (409).

### CSV format

```
timestamp,unit_id,temperature_c,ambient_c,door_state,cooling_state
2026-10-15T06:00:00Z,FR-03,4.10,24.6,closed,on
```

Timestamps are ISO 8601. Door state is `open|closed`. Cooling state is `on|off` (`active|inactive`, `1|0` and `true|false` are also accepted). The frontend lets you map other column names onto these fields. Rows with missing values, invalid timestamps, implausible temperatures (outside −40 to 50 °C), type mismatches, unknown units or duplicates are rejected with a reason, and nothing is imputed.

## Database schema

See `backend/schema.sql`. The tables are `facilities`, `storage_units`, `unit_configs` (versioned, with check constraints), `sensor_readings` (with `source` set to synthetic, simulator, imported or sensor; NULL temperature means missing), `predictions`, `anomaly_results`, `alerts`, `alert_state` (append-only history), `preventive_actions`, `scenario_simulations` and `import_batches`. The schema is built so more facilities and units can be added.

Currently persisted to PostgreSQL: alert workflow state and history, preventive actions, import batches and imported readings. Predictions, alerts and simulations are computed on request. Their tables are in place for when scheduled scoring of live data is added.

## Deployment

The frontend and backend deploy separately:

- **Frontend**: a static site (`npm run build` outputs `dist/`). Any static host works: GitHub Pages, Netlify, Vercel, Cloudflare Pages. Set `VITE_API_URL` at build time if a backend is used. `node scripts/build-single.mjs` also produces a single self-contained HTML file.
- **Backend**: a container (`backend/Dockerfile`) on any host that runs Docker images, such as Render, Railway, Fly.io or Cloud Run. Set `DATABASE_URL` to a managed PostgreSQL instance and `CORS_ORIGINS` to the frontend URL.
- Hosting is still to be decided; check each platform's free-tier limits (sleeping containers, database size) before a demo.

## Security and reliability notes

- Pydantic validation is applied to every request. Uploads are limited in size, checked for extension and encoding, and never executed or written to disk.
- No secrets are in source. Configuration comes from environment variables.
- Demo data and real data are kept separate (the `source` column, labelled UI badges, imported points drawn in a different color).
- Logs are structured JSON. A failed import or prediction returns an error, never an empty "success".
- There is no authentication in this prototype. Add it before exposing real data.
- No regulatory or security compliance is claimed.

## Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1 · Data & baseline model | Synthetic dataset ✓, normal and abnormal scenarios ✓, validation and features ✓, labelled dataset builder ✓, train a baseline model ✗ | In progress |
| 2 · Working prototype | API ✓, dashboard ✓, risk and anomaly (rule stand-ins) ✓, explainable warnings (prototype) ✓, end-to-end test with a trained model ✗ | Prototype built on the demo model |
| 3 · Future development | Physical sensors, multi-facility, notifications, validation on real data, ongoing evaluation | Future |

## UN SDGs (intended contribution)

SDG 3 Good health & well-being · SDG 2 Zero hunger · SDG 9 Industry, innovation & infrastructure · SDG 12 Responsible consumption & production. These describe the intended impact, not measured outcomes.
