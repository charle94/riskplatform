"""
Feature Analysis Background Worker
====================================
Polls the `analysis_jobs` table for pending jobs every 30 seconds.
For each pending job it:
  1. Loads sample_users as a Polars DataFrame (fast columnar I/O)
  2. Evaluates each feature's definition to produce a value series
  3. Computes IV / KS / PSI / AUC and descriptive statistics
  4. UPSERTs results into `feature_stats_cache`
  5. INSERTs a historical snapshot into `feature_eval_snapshots`
  6. Updates the job status to 'completed' (or 'failed' on error)

Usage:
    python server/analysis_worker.py
"""
from __future__ import annotations

import json
import logging
import math
import re
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import polars as pl

    POLARS_AVAILABLE = True
except ImportError:  # pragma: no cover
    POLARS_AVAILABLE = False
    logging.warning("polars not installed – falling back to pure-Python computation")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "risk_control.db"
POLL_INTERVAL_SECONDS = 30

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [worker] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("analysis_worker")

# ---------------------------------------------------------------------------
# Shared constants (mirrors main.py)
# ---------------------------------------------------------------------------

FIELD_ALIAS_MAP: Dict[str, str] = {
    "多头借贷申请次数": "multi_apply_3m",
    "近30日硬查询": "query_6m",
    "征信硬查询次数": "query_6m",
    "近30日逾期天数": "overdue_days_30d",
    "夜间交易占比": "night_txn_ratio",
    "夜间交易金额占比": "night_txn_ratio",
    "设备指纹风险评分": "device_risk_score",
    "设备风险评分": "device_risk_score",
}

SAFE_EVAL_FUNCTIONS: Dict[str, Any] = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "sqrt": math.sqrt,
    "log1p": math.log1p,
}

# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _next_id(conn: sqlite3.Connection, table: str, id_col: str, prefix: str, width: int = 5) -> str:
    rows = conn.execute(f"SELECT {id_col} FROM {table} WHERE {id_col} LIKE ?", (f"{prefix}%",)).fetchall()
    nums: List[int] = []
    for r in rows:
        tail = r[0][len(prefix):]
        if tail.isdigit():
            nums.append(int(tail))
    next_num = (max(nums) + 1) if nums else 1
    return f"{prefix}{str(next_num).zfill(width)}"


# ---------------------------------------------------------------------------
# Expression evaluation helpers
# ---------------------------------------------------------------------------


def _normalize_expression(definition: str) -> str:
    expr = str(definition or "").strip()
    for alias, field in sorted(FIELD_ALIAS_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        expr = expr.replace(alias, field)
    return expr


def _eval_expr_python(expr: str, row: Dict[str, Any], allowed_fields: set) -> Optional[float]:
    """Evaluate a feature expression against a single row dict."""
    if not expr:
        return None
    if expr in allowed_fields:
        v = row.get(expr)
        return float(v) if v is not None else None

    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expr))
    allowed_names = allowed_fields | set(SAFE_EVAL_FUNCTIONS.keys())
    if any(t not in allowed_names for t in tokens):
        return None

    ctx: Dict[str, Any] = {k: float(v) for k, v in row.items() if k in allowed_fields and v is not None}
    ctx.update(SAFE_EVAL_FUNCTIONS)
    try:
        result = eval(expr, {"__builtins__": {}}, ctx)  # noqa: S307
        return float(result) if result is not None else None
    except Exception:
        return None


def _eval_feature_polars(definition: str, df: "pl.DataFrame") -> Optional["pl.Series"]:
    """
    Try to evaluate a feature definition using Polars arithmetic on Series.
    Returns a nullable Float64 Series, or None if evaluation is not possible.
    """
    if not POLARS_AVAILABLE:
        return None
    normalized = _normalize_expression(definition)
    if not normalized:
        return None

    # Fast path: direct column reference
    if normalized in df.columns:
        return df[normalized].cast(pl.Float64, strict=False)

    # Arithmetic expression path: build a context of float Series
    try:
        ctx: Dict[str, Any] = {
            col: df[col].cast(pl.Float64, strict=False)
            for col in df.columns
            if col not in ("user_id", "label")
        }
        tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", normalized))
        if any(t not in ctx for t in tokens):
            return None
        result = eval(normalized, {"__builtins__": {}}, ctx)  # noqa: S307
        if isinstance(result, pl.Series):
            return result.cast(pl.Float64, strict=False)
    except Exception:
        pass
    return None


def get_feature_values(
    definition: str,
    df: "pl.DataFrame",
    fallback_rows: List[sqlite3.Row],
    allowed_fields: set,
) -> Tuple[List[Optional[float]], List[int]]:
    """Return (values, labels) for a feature definition."""
    labels: List[int] = df["label"].cast(pl.Int32, strict=False).to_list() if POLARS_AVAILABLE else [
        int(r["label"]) for r in fallback_rows
    ]

    # Try Polars fast path
    if POLARS_AVAILABLE:
        series = _eval_feature_polars(definition, df)
        if series is not None:
            return series.to_list(), labels

    # Row-by-row Python fallback
    normalized = _normalize_expression(definition)
    values: List[Optional[float]] = []
    if POLARS_AVAILABLE:
        for row_dict in df.iter_rows(named=True):
            values.append(_eval_expr_python(normalized, row_dict, allowed_fields))
    else:
        for row in fallback_rows:
            row_dict = dict(row)
            values.append(_eval_expr_python(normalized, row_dict, allowed_fields))
    return values, labels


# ---------------------------------------------------------------------------
# Statistical computation helpers (self-contained, mirrors main.py)
# ---------------------------------------------------------------------------


def _iv_stat(pairs: List[Tuple[float, int]], bins: int = 10) -> float:
    clean = [(v, y) for v, y in pairs if v is not None]
    if len(clean) < 10:
        return 0.0
    ordered = sorted(clean, key=lambda x: x[0])
    total_bad = sum(1 for _, y in ordered if y == 1)
    total_good = len(ordered) - total_bad
    if total_bad == 0 or total_good == 0:
        return 0.0
    size = max(1, len(ordered) // bins)
    chunks = [ordered[i: i + size] for i in range(0, len(ordered), size)]
    iv = 0.0
    eps = 1e-6
    for bucket in chunks:
        bad = sum(1 for _, y in bucket if y == 1)
        good = len(bucket) - bad
        bad_pct = max(eps, bad / total_bad)
        good_pct = max(eps, good / total_good)
        iv += (bad_pct - good_pct) * math.log(bad_pct / good_pct)
    return iv


def _ks_stat(pairs: List[Tuple[float, int]]) -> float:
    if not pairs:
        return 0.0
    ordered = sorted(pairs, key=lambda x: x[0])
    total_bad = sum(1 for _, y in ordered if y == 1)
    total_good = len(ordered) - total_bad
    if total_bad == 0 or total_good == 0:
        return 0.0
    bad_cum = good_cum = 0
    ks = 0.0
    for _, y in ordered:
        if y == 1:
            bad_cum += 1
        else:
            good_cum += 1
        ks = max(ks, abs(bad_cum / total_bad - good_cum / total_good))
    return ks


def _psi_stat(base: List[float], cur: List[float], bins: int = 10) -> float:
    b = [x for x in base if x is not None]
    c = [x for x in cur if x is not None]
    if len(b) < 20 or len(c) < 20:
        return 0.0
    lo = min(min(b), min(c))
    hi = max(max(b), max(c))
    if abs(hi - lo) < 1e-9:
        return 0.0
    step = (hi - lo) / bins
    boundaries = [lo + i * step for i in range(1, bins)]

    def hist(data: List[float]) -> List[float]:
        h = [0] * bins
        for v in data:
            idx = 0
            while idx < bins - 1 and v > boundaries[idx]:
                idx += 1
            h[idx] += 1
        total = len(data)
        return [x / total for x in h]

    bh, ch = hist(b), hist(c)
    eps = 1e-6
    psi = 0.0
    for bp, cp in zip(bh, ch):
        bp = max(bp, eps)
        cp = max(cp, eps)
        psi += (cp - bp) * math.log(cp / bp)
    return psi


def _auc_stat(pairs: List[Tuple[float, int]]) -> float:
    if not pairs:
        return 0.5
    positives = sum(1 for _, y in pairs if y == 1)
    negatives = len(pairs) - positives
    if positives == 0 or negatives == 0:
        return 0.5
    ranked = sorted(pairs, key=lambda x: x[0])
    rank_sum = sum(idx for idx, (_, label) in enumerate(ranked, start=1) if label == 1)
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def _compute_distribution(pairs: List[Tuple[float, int]], bin_count: int = 9) -> List[Dict[str, Any]]:
    if not pairs:
        return []
    arr = sorted(pairs, key=lambda x: x[0])
    min_v, max_v = arr[0][0], arr[-1][0]
    if abs(max_v - min_v) < 1e-9:
        bad_rate = sum(y for _, y in arr) / len(arr)
        return [{"bin": "single", "count": len(arr), "badRate": round(bad_rate, 4)}]
    step = (max_v - min_v) / bin_count
    result = []
    for i in range(bin_count):
        low = min_v + i * step
        high = min_v + (i + 1) * step
        part = [p for p in arr if (low <= p[0] < high)] if i < bin_count - 1 else [p for p in arr if low <= p[0] <= high]
        if not part:
            continue
        result.append({
            "bin": f"{i * 10}-{(i + 1) * 10}%",
            "count": len(part),
            "badRate": round(sum(y for _, y in part) / len(part), 4),
        })
    return result


def _compute_psi_trend(clean_vals: List[float], window_count: int = 6) -> List[float]:
    """Return PSI of each window vs. baseline window."""
    if len(clean_vals) < 20:
        return [0.0] * window_count
    step = max(1, math.ceil(len(clean_vals) / window_count))
    windows = [clean_vals[i * step: (i + 1) * step] for i in range(window_count)]
    baseline = windows[0] or clean_vals
    return [round(_psi_stat(baseline, w or baseline), 3) for w in windows]


def _descriptive_stats_polars(clean_vals: List[float]) -> Dict[str, float]:
    """Compute descriptive statistics using Polars if available."""
    if POLARS_AVAILABLE and clean_vals:
        s = pl.Series("v", clean_vals, dtype=pl.Float64)
        return {
            "mean": s.mean() or 0.0,
            "std": s.std() or 0.0,
            "min_val": s.min() or 0.0,
            "max_val": s.max() or 0.0,
            "p25": s.quantile(0.25, interpolation="nearest") or 0.0,
            "p75": s.quantile(0.75, interpolation="nearest") or 0.0,
            "skewness": s.skew() or 0.0,
            "kurtosis": s.kurtosis() or 0.0,
        }
    # Pure Python fallback
    if not clean_vals:
        return {"mean": 0.0, "std": 0.0, "min_val": 0.0, "max_val": 0.0,
                "p25": 0.0, "p75": 0.0, "skewness": 0.0, "kurtosis": 0.0}
    n = len(clean_vals)
    mu = sum(clean_vals) / n
    var = sum((x - mu) ** 2 for x in clean_vals) / n
    std = var ** 0.5
    s_sorted = sorted(clean_vals)
    p25 = s_sorted[int(0.25 * (n - 1))]
    p75 = s_sorted[int(0.75 * (n - 1))]
    skew = (sum((x - mu) ** 3 for x in clean_vals) / n) / (std ** 3) if std > 0 else 0.0
    kurt = (sum((x - mu) ** 4 for x in clean_vals) / n) / (var ** 2) - 3 if var > 0 else 0.0
    return {
        "mean": mu, "std": std, "min_val": min(clean_vals), "max_val": max(clean_vals),
        "p25": p25, "p75": p75, "skewness": skew, "kurtosis": kurt,
    }


# ---------------------------------------------------------------------------
# Core worker class
# ---------------------------------------------------------------------------


class FeatureAnalysisWorker:
    """Polls for pending analysis jobs and processes them with Polars."""

    def load_sample_data(self) -> Tuple[Optional["pl.DataFrame"], List[sqlite3.Row]]:
        """Load sample_users table.  Returns (polars_df, sqlite_rows)."""
        conn = get_conn()
        rows: List[sqlite3.Row] = conn.execute("SELECT * FROM sample_users").fetchall()
        conn.close()
        if not rows:
            return None, rows
        if POLARS_AVAILABLE:
            data = [dict(r) for r in rows]
            df = pl.from_dicts(data)
            return df, rows
        return None, rows

    def analyze_feature(
        self,
        feature_id: str,
        feature_name: str,
        definition: str,
        df: Optional["pl.DataFrame"],
        fallback_rows: List[sqlite3.Row],
        allowed_fields: set,
    ) -> Optional[Dict[str, Any]]:
        """Compute all statistics for one feature. Returns a cache row dict or None."""
        try:
            values, labels = get_feature_values(definition, df, fallback_rows, allowed_fields)
        except Exception as exc:
            logger.warning("Failed to evaluate feature %s (%s): %s", feature_id, definition, exc)
            return None

        total = len(values)
        if total == 0:
            return None

        missing = sum(1 for v in values if v is None)
        clean_pairs: List[Tuple[float, int]] = [
            (float(v), int(l)) for v, l in zip(values, labels) if v is not None
        ]
        clean_vals = [p[0] for p in clean_pairs]

        if not clean_vals:
            return None

        # Descriptive stats (Polars-accelerated when available)
        desc = _descriptive_stats_polars(clean_vals)

        # Statistical metrics
        iv = _iv_stat(clean_pairs)
        ks = _ks_stat(clean_pairs)
        auc = _auc_stat(clean_pairs)
        half = len(clean_vals) // 2
        psi = _psi_stat(clean_vals[:half], clean_vals[half:])
        crossing = 1 if iv > 0.5 else 0

        # Distribution bins
        dist = _compute_distribution(clean_pairs)

        # PSI trend (6 windows)
        psi_trend = _compute_psi_trend(clean_vals)

        # Stability label
        if psi < 0.1:
            stability_status = "稳定"
        elif psi <= 0.2:
            stability_status = "波动"
        else:
            stability_status = "漂移"

        return {
            "feature_id": feature_id,
            "feature_name": feature_name,
            "iv": round(iv, 4),
            "ks": round(ks, 4),
            "psi": round(psi, 4),
            "auc": round(auc, 4),
            "crossing": crossing,
            "missing_rate": round(missing / total, 4),
            "mean": round(desc["mean"], 4),
            "std": round(desc["std"], 4),
            "min_val": round(desc["min_val"], 4),
            "max_val": round(desc["max_val"], 4),
            "p25": round(desc["p25"], 4),
            "p75": round(desc["p75"], 4),
            "skewness": round(desc["skewness"], 3),
            "kurtosis": round(desc["kurtosis"], 3),
            "distribution_json": json.dumps(dist, ensure_ascii=False),
            "psi_trend_json": json.dumps(psi_trend, ensure_ascii=False),
            "stability_status": stability_status,
        }

    def run_job(self, job_id: str) -> None:
        """Execute one analysis job end-to-end."""
        logger.info("Starting analysis job %s", job_id)
        conn = get_conn()
        conn.execute(
            "UPDATE analysis_jobs SET status='running' WHERE id=?", (job_id,)
        )
        conn.commit()

        try:
            # Load data
            df, fallback_rows = self.load_sample_data()
            if POLARS_AVAILABLE and df is not None:
                allowed_fields = set(df.columns)
            else:
                if fallback_rows:
                    allowed_fields = set(fallback_rows[0].keys())
                else:
                    allowed_fields = set()

            feature_rows = conn.execute(
                "SELECT id, name, definition FROM features"
            ).fetchall()

            success_count = 0
            cache_upserts: List[Tuple] = []
            snapshot_inserts: List[Tuple] = []
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # Pre-compute snapshot ID base using MAX to avoid scanning all records
            max_snap_row = conn.execute(
                "SELECT MAX(CAST(SUBSTR(id, 3) AS INTEGER)) AS max_num "
                "FROM feature_eval_snapshots WHERE id LIKE 'EV%'"
            ).fetchone()
            next_snap_num = (max_snap_row["max_num"] or 0) + 1

            for fr in feature_rows:
                result = self.analyze_feature(
                    feature_id=fr["id"],
                    feature_name=fr["name"],
                    definition=fr["definition"],
                    df=df,
                    fallback_rows=fallback_rows,
                    allowed_fields=allowed_fields,
                )
                if result is None:
                    continue

                # Prepare cache upsert
                cache_upserts.append((
                    result["feature_id"],
                    result["feature_name"],
                    result["iv"],
                    result["ks"],
                    result["psi"],
                    result["auc"],
                    result["crossing"],
                    result["missing_rate"],
                    result["mean"],
                    result["std"],
                    result["min_val"],
                    result["max_val"],
                    result["p25"],
                    result["p75"],
                    result["skewness"],
                    result["kurtosis"],
                    result["distribution_json"],
                    result["psi_trend_json"],
                    result["stability_status"],
                    job_id,
                    now_str,
                ))

                # Prepare snapshot insert with pre-computed ID
                snap_id = f"EV{str(next_snap_num).zfill(5)}"
                next_snap_num += 1
                snapshot_inserts.append((
                    snap_id,
                    result["feature_id"],
                    result["feature_name"],
                    result["iv"],
                    result["ks"],
                    result["psi"],
                    result["auc"],
                    result["crossing"],
                    result["missing_rate"],
                    now_str,
                ))
                success_count += 1

            # Batch write cache
            conn.executemany(
                """
                INSERT OR REPLACE INTO feature_stats_cache (
                    feature_id, feature_name, iv, ks, psi, auc, crossing, missing_rate,
                    mean, std, min_val, max_val, p25, p75, skewness, kurtosis,
                    distribution_json, psi_trend_json, stability_status, job_id, computed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                cache_upserts,
            )

            # Batch write snapshots
            conn.executemany(
                """
                INSERT INTO feature_eval_snapshots
                (id, feature_id, feature_name, iv, ks, psi, auc, crossing, missing_rate, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                snapshot_inserts,
            )

            end_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            conn.execute(
                """
                UPDATE analysis_jobs
                SET status='completed', ended_at=?, total_features=?, success_features=?
                WHERE id=?
                """,
                (end_str, len(feature_rows), success_count, job_id),
            )
            conn.commit()
            logger.info("Job %s completed: %d/%d features", job_id, success_count, len(feature_rows))

        except Exception as exc:
            logger.exception("Job %s failed: %s", job_id, exc)
            try:
                conn.execute(
                    "UPDATE analysis_jobs SET status='failed', ended_at=?, error_msg=? WHERE id=?",
                    (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), str(exc)[:500], job_id),
                )
                conn.commit()
            except Exception:
                pass
        finally:
            conn.close()

    def run_loop(self) -> None:
        """Main polling loop – runs forever until interrupted."""
        logger.info(
            "Worker started. DB=%s  Polars=%s  Poll interval=%ds",
            DB_PATH,
            POLARS_AVAILABLE,
            POLL_INTERVAL_SECONDS,
        )

        # On startup: mark any stale 'running' jobs as failed (crashed mid-job)
        try:
            conn = get_conn()
            stale = conn.execute(
                "SELECT id FROM analysis_jobs WHERE status='running'"
            ).fetchall()
            for row in stale:
                conn.execute(
                    "UPDATE analysis_jobs SET status='failed', error_msg='Worker restarted during execution' WHERE id=?",
                    (row["id"],),
                )
            if stale:
                logger.warning("Marked %d stale running job(s) as failed", len(stale))
            conn.commit()
            conn.close()
        except Exception as exc:
            logger.warning("Could not clean up stale jobs: %s", exc)

        while True:
            try:
                conn = get_conn()
                job_row = conn.execute(
                    "SELECT id FROM analysis_jobs WHERE status='pending' ORDER BY started_at ASC LIMIT 1"
                ).fetchone()
                conn.close()

                if job_row:
                    self.run_job(job_row["id"])
                else:
                    time.sleep(POLL_INTERVAL_SECONDS)

            except KeyboardInterrupt:
                logger.info("Worker stopped by user")
                break
            except Exception as exc:
                logger.exception("Unexpected error in worker loop: %s", exc)
                time.sleep(POLL_INTERVAL_SECONDS)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    worker = FeatureAnalysisWorker()
    worker.run_loop()
