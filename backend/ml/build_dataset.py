"""
Phase 1 helper: build a labelled, leakage-safe training table from simulator runs.

Each row = engineered features at minute t (computed from readings up to t only)
label     = 1 if any reading in (t, t + horizon] is outside the limits, else 0.
Rows where the unit is already in excursion at t are dropped (nothing to predict).

Usage:  python -m ml.build_dataset --out data/train.csv --horizon 30
This writes a dataset only. It does not train or evaluate a model.
"""
from __future__ import annotations

import argparse
import csv
import itertools
from pathlib import Path

from app import engine as E

FEATURES = ["temp", "ambient", "doorOpen", "coolingActive", "mean30", "std30", "mean6h", "min30", "max30", "slope15", "slope60",
            "coolingOffMin", "overdueMin", "coolingOnMin", "doorEvents60", "minutesSinceDoor", "marginUpper", "nearLimitMin", "lastStep"]


def rows_for_run(run_id: str, series: list[dict], cfg: dict, horizon: int, step: int):
    for i in range(60, len(series) - horizon, step):
        now = series[i]
        if now["temp"] is not None and (now["temp"] > cfg["upper"] or now["temp"] < cfg["lower"]):
            continue
        f = E.extract_features(series[: i + 1], cfg)
        future = [r["temp"] for r in series[i + 1: i + 1 + horizon] if r["temp"] is not None]
        label = int(any(t > cfg["upper"] or t < cfg["lower"] for t in future))
        row = {"run_id": run_id, "minute": now["m"]}
        for k in FEATURES:
            v = f[k]
            row[k] = 9999 if v == float("inf") else int(v) if isinstance(v, bool) else v
        row["label"] = label
        yield row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/train.csv")
    ap.add_argument("--horizon", type=int, default=30)
    ap.add_argument("--step", type=int, default=2)
    args = ap.parse_args()
    cfg = {"upper": 8.0, "lower": 2.0, "cutIn": 5.0, "cutOut": 3.4}
    grid = itertools.product([s["id"] for s in E.SCENARIOS], [20, 24, 28, 32], [3.6, 4.4], [4, 12, 25])
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    n = pos = 0
    with out.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["run_id", "minute", *FEATURES, "label"])
        w.writeheader()
        for scen, amb, init, dur in grid:
            run = E.run_scenario(scen, 150, amb, init, cfg["upper"], cfg["lower"], dur, args.horizon)
            for row in rows_for_run(f"{scen}-a{amb}-i{init}-d{dur}", run["series"], cfg, args.horizon, args.step):
                w.writerow(row); n += 1; pos += row["label"]
    print(f"wrote {n} rows ({pos} positive, {pos / max(n, 1):.1%}) to {out}")
    print("Split by run_id (or by time) for evaluation; never shuffle rows from one run across train and test.")


if __name__ == "__main__":
    main()
