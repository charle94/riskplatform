from __future__ import annotations

import math
import random
import sqlite3
import json
import re
from collections import defaultdict
from datetime import datetime
from itertools import combinations
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Optional, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "risk_control.db"
SAFE_EVAL_FUNCTIONS = {
    "abs": abs,
    "min": min,
    "max": max,
    "round": round,
    "sqrt": math.sqrt,
    "log1p": math.log1p,
}
FIELD_ALIAS_MAP = {
    "多头借贷申请次数": "multi_apply_3m",
    "近30日硬查询": "query_6m",
    "征信硬查询次数": "query_6m",
    "近30日逾期天数": "overdue_days_30d",
    "夜间交易占比": "night_txn_ratio",
    "夜间交易金额占比": "night_txn_ratio",
    "设备指纹风险评分": "device_risk_score",
    "设备风险评分": "device_risk_score",
}


app = FastAPI(title="Risk Control Feature Platform API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exc_handler(_, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_exc_handler(_, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"error": str(exc)})


def now_date() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def now_clock() -> str:
    return datetime.now().strftime("%H:%M:%S")


def normalize_scene(scene: str) -> str:
    text = str(scene or "").strip()
    if "反欺诈" in text:
        return "反欺诈"
    if "贷中" in text:
        return "贷中"
    if "贷后" in text:
        return "贷后"
    if "贷前" in text:
        return "贷前"
    return text or "贷前"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _next_numeric_id(existing_ids: List[str], prefix: str, width: int = 3) -> str:
    nums: List[int] = []
    for item in existing_ids:
        if item.startswith(prefix):
            tail = item[len(prefix) :]
            if tail.isdigit():
                nums.append(int(tail))
    next_num = (max(nums) + 1) if nums else 1
    return f"{prefix}{str(next_num).zfill(width)}"


def generate_feature_id(conn: sqlite3.Connection, category: str) -> str:
    prefix_map = {
        "信用历史": "FT_CREDIT",
        "行为特征": "FT_BEH",
        "设备特征": "FT_DEVICE",
        "多头行为": "FT_MULTI",
    }
    prefix = prefix_map.get(category, "FT_CUSTOM")
    rows = conn.execute("SELECT id FROM features WHERE id LIKE ?", (f"{prefix}_%",)).fetchall()
    ids = [r["id"] for r in rows]
    n = len(ids) + 1
    return f"{prefix}_{str(n).zfill(3)}"


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS features (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            scene TEXT NOT NULL,
            source TEXT NOT NULL,
            status TEXT NOT NULL,
            version TEXT NOT NULL,
            iv REAL NOT NULL,
            psi REAL NOT NULL,
            usedBy TEXT NOT NULL,
            creator TEXT NOT NULL,
            createTime TEXT NOT NULL,
            updateTime TEXT NOT NULL,
            desc TEXT NOT NULL,
            definition TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS datasources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            tables INTEGER NOT NULL,
            status TEXT NOT NULL,
            latency TEXT NOT NULL,
            lastSync TEXT NOT NULL,
            coverage INTEGER NOT NULL,
            host TEXT,
            port INTEGER,
            database TEXT
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            features INTEGER NOT NULL,
            mode TEXT NOT NULL,
            cron TEXT NOT NULL,
            status TEXT NOT NULL,
            lastRun TEXT NOT NULL,
            duration TEXT NOT NULL,
            success INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rules (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            logic TEXT NOT NULL,
            action TEXT NOT NULL,
            priority INTEGER NOT NULL,
            status TEXT NOT NULL,
            hitRate REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS alerts (
            id TEXT PRIMARY KEY,
            level TEXT NOT NULL,
            feature TEXT NOT NULL,
            type TEXT NOT NULL,
            detail TEXT NOT NULL,
            time TEXT NOT NULL,
            status TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sample_users (
            user_id TEXT PRIMARY KEY,
            label INTEGER NOT NULL,
            query_6m INTEGER,
            overdue_days_30d INTEGER,
            night_txn_ratio REAL,
            device_risk_score INTEGER,
            multi_apply_3m INTEGER,
            login_7d INTEGER,
            apply_amount_ratio REAL,
            register_days INTEGER,
            third_party_score REAL,
            income_pred_score REAL
        );

        CREATE TABLE IF NOT EXISTS feature_values (
            run_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            feature_id TEXT NOT NULL,
            value REAL,
            PRIMARY KEY (run_id, user_id, feature_id)
        );

        CREATE TABLE IF NOT EXISTS feature_runs (
            id TEXT PRIMARY KEY,
            task_name TEXT NOT NULL,
            scene TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT NOT NULL,
            duration_ms INTEGER NOT NULL,
            total_features INTEGER NOT NULL,
            success_features INTEGER NOT NULL,
            log TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feature_eval_snapshots (
            id TEXT PRIMARY KEY,
            feature_id TEXT NOT NULL,
            feature_name TEXT NOT NULL,
            iv REAL NOT NULL,
            ks REAL NOT NULL,
            psi REAL NOT NULL,
            auc REAL NOT NULL,
            crossing INTEGER NOT NULL,
            missing_rate REAL NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS feature_versions (
            id TEXT PRIMARY KEY,
            feature_id TEXT NOT NULL,
            version TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            author TEXT NOT NULL,
            change_desc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS rule_versions (
            id TEXT PRIMARY KEY,
            rule_id TEXT NOT NULL,
            version TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL,
            author TEXT NOT NULL,
            change_desc TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            text TEXT NOT NULL,
            actor TEXT NOT NULL,
            time TEXT NOT NULL,
            module TEXT NOT NULL,
            detail TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS strategy_experiments (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            champion_rule_ids TEXT NOT NULL,
            challenger_rule_ids TEXT NOT NULL,
            sample_rate REAL NOT NULL,
            status TEXT NOT NULL,
            champion_bad_rate REAL NOT NULL,
            challenger_bad_rate REAL NOT NULL,
            winner TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS optimization_runs (
            id TEXT PRIMARY KEY,
            objective TEXT NOT NULL,
            max_pass_impact REAL NOT NULL,
            min_bad_rate REAL NOT NULL,
            selected_rule_ids TEXT NOT NULL,
            metrics TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recommendation_snapshots (
            id TEXT PRIMARY KEY,
            rec_type TEXT NOT NULL,
            payload TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS analysis_jobs (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL,
            triggered_by TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT NOT NULL DEFAULT '',
            total_features INTEGER NOT NULL DEFAULT 0,
            success_features INTEGER NOT NULL DEFAULT 0,
            error_msg TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS feature_stats_cache (
            feature_id TEXT PRIMARY KEY,
            feature_name TEXT NOT NULL DEFAULT '',
            iv REAL NOT NULL DEFAULT 0,
            ks REAL NOT NULL DEFAULT 0,
            psi REAL NOT NULL DEFAULT 0,
            auc REAL NOT NULL DEFAULT 0,
            crossing INTEGER NOT NULL DEFAULT 0,
            missing_rate REAL NOT NULL DEFAULT 0,
            mean REAL NOT NULL DEFAULT 0,
            std REAL NOT NULL DEFAULT 0,
            min_val REAL NOT NULL DEFAULT 0,
            max_val REAL NOT NULL DEFAULT 0,
            p25 REAL NOT NULL DEFAULT 0,
            p75 REAL NOT NULL DEFAULT 0,
            skewness REAL NOT NULL DEFAULT 0,
            kurtosis REAL NOT NULL DEFAULT 0,
            distribution_json TEXT NOT NULL DEFAULT '[]',
            psi_trend_json TEXT NOT NULL DEFAULT '[]',
            stability_status TEXT NOT NULL DEFAULT '稳定',
            job_id TEXT NOT NULL DEFAULT '',
            computed_at TEXT NOT NULL DEFAULT ''
        );
        """
    )

    seeded = cur.execute("SELECT COUNT(1) AS c FROM features").fetchone()["c"]
    if seeded == 0:
        seed_data(cur)
    conn.commit()
    conn.close()


def seed_data(cur: sqlite3.Cursor) -> None:
    features = [
        (
            "FT_CREDIT_001",
            "近30日逾期天数最大值",
            "信用历史",
            "贷前",
            "征信数据",
            "上线",
            "v2.3",
            0.487,
            0.08,
            "贷前评分卡,LightGBM模型",
            "张建模",
            "2025-06-12",
            "2026-01-08",
            "用户近30日内最大逾期天数",
            "overdue_days_30d",
        ),
        (
            "FT_CREDIT_002",
            "征信硬查询近6月次数",
            "信用历史",
            "贷前",
            "征信数据",
            "上线",
            "v1.8",
            0.356,
            0.11,
            "贷前评分卡",
            "李风控",
            "2025-03-20",
            "2025-12-01",
            "近6个月硬查询次数",
            "query_6m",
        ),
        (
            "FT_BEH_001",
            "夜间交易金额占比",
            "行为特征",
            "反欺诈",
            "行为埋点",
            "上线",
            "v1.2",
            0.312,
            0.28,
            "反欺诈规则引擎,XGBoost模型",
            "王分析",
            "2025-08-15",
            "2026-03-10",
            "22:00-06:00交易占比",
            "night_txn_ratio",
        ),
        (
            "FT_DEVICE_001",
            "设备指纹风险评分",
            "设备特征",
            "反欺诈",
            "设备指纹服务",
            "上线",
            "v3.0",
            0.276,
            0.07,
            "反欺诈规则引擎",
            "赵安全",
            "2024-12-01",
            "2026-04-01",
            "设备综合风险评分",
            "device_risk_score",
        ),
        (
            "FT_MULTI_001",
            "多头借贷申请次数",
            "多头行为",
            "贷前",
            "三方数据",
            "测试中",
            "v1.0",
            0.562,
            0.04,
            "",
            "赵安全",
            "2026-04-15",
            "2026-04-18",
            "近3个月申请借款次数",
            "multi_apply_3m",
        ),
    ]
    cur.executemany(
        """
        INSERT INTO features (
            id, name, category, scene, source, status, version, iv, psi, usedBy,
            creator, createTime, updateTime, desc, definition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        features,
    )

    cur.executemany(
        """
        INSERT INTO datasources
        (id, name, type, tables, status, latency, lastSync, coverage, host, port, database)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("DS001", "业务核心库", "MySQL", 48, "正常", "12ms", "09:30:05", 98, "db-core.internal", 3306, "core_db"),
            ("DS002", "用户行为埋点", "Hive", 126, "正常", "—", "每日00:30", 95, "hive.internal", 10000, "behavior_db"),
        ],
    )

    cur.execute(
        """
        INSERT INTO tasks (id, name, features, mode, cron, status, lastRun, duration, success)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("JOB001", "贷前特征日批任务", 186, "离线", "每日 01:00", "运行中", "2026-04-19 01:00", "42min", 184),
    )

    cur.executemany(
        """
        INSERT INTO rules (id, name, type, logic, action, priority, status, hitRate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("R001", "黑名单拦截", "单条规则", "third_party_score > 90", "拒绝", 1, "上线", 1.2),
            ("R002", "多头借贷高风险", "规则集(AND)", "multi_apply_3m > 8 AND query_6m >= 5", "拒绝", 2, "上线", 4.8),
        ],
    )

    cur.executemany(
        """
        INSERT INTO alerts (id, level, feature, type, detail, time, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        [
            ("AL001", "严重", "收入预测分", "数据质量", "缺失率 32.1% 超过阈值 10%", "09:28:12", "未处理"),
            ("AL002", "告警", "三方行为评分", "接口响应", "P99延迟 312ms，超过阈值 200ms", "09:50:03", "处理中"),
        ],
    )

    random.seed(42)
    users: List[Tuple[Any, ...]] = []
    for i in range(1, 1201):
        query_6m = min(40, int(random.gammavariate(2.2, 1.5)))
        overdue = min(25, int(max(0, random.gauss(1.2 + 0.3 * query_6m, 3.8))))
        night_ratio = max(0.0, min(1.0, random.betavariate(2.5, 8.0)))
        device = max(0, min(100, int(random.gauss(35 + query_6m * 1.1, 18))))
        multi_apply = max(0, min(20, int(random.gammavariate(1.8, 1.9))))
        login = max(0, min(30, int(random.gauss(6, 3))))
        apply_ratio = max(0.1, min(3.5, random.gauss(1.0 + 0.06 * multi_apply, 0.4)))
        register_days = max(1, min(1800, int(random.gammavariate(2.2, 120))))
        third_score = max(0.0, min(100.0, random.gauss(45 + 3.5 * multi_apply, 20)))
        income_score = max(0.0, min(100.0, random.gauss(52 - 0.8 * overdue, 16)))

        risk_signal = (
            0.9 * query_6m
            + 1.25 * overdue
            + 0.6 * multi_apply
            + 0.08 * device
            + 35 * night_ratio
            + 9.0 * apply_ratio
            - 0.012 * register_days
            + 0.08 * third_score
            - 0.05 * income_score
            + random.gauss(0, 7)
        )
        label = 1 if risk_signal > 38 else 0

        # inject missing values in a controllable way
        if random.random() < 0.08:
            third_score = None
        if random.random() < 0.04:
            income_score = None

        users.append(
            (
                f"U{str(i).zfill(6)}",
                label,
                query_6m,
                overdue,
                night_ratio,
                device,
                multi_apply,
                login,
                apply_ratio,
                register_days,
                third_score,
                income_score,
            )
        )

    cur.executemany(
        """
        INSERT INTO sample_users (
            user_id, label, query_6m, overdue_days_30d, night_txn_ratio, device_risk_score,
            multi_apply_3m, login_7d, apply_amount_ratio, register_days, third_party_score, income_pred_score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        users,
    )


def row_to_feature(row: sqlite3.Row) -> Dict[str, Any]:
    used = [x for x in row["usedBy"].split(",") if x]
    return {
        "id": row["id"],
        "name": row["name"],
        "category": row["category"],
        "scene": row["scene"],
        "source": row["source"],
        "status": row["status"],
        "version": row["version"],
        "iv": float(row["iv"]),
        "psi": float(row["psi"]),
        "usedBy": used,
        "creator": row["creator"],
        "createTime": row["createTime"],
        "updateTime": row["updateTime"],
        "desc": row["desc"],
        "definition": row["definition"],
    }


def log_activity(
    conn: sqlite3.Connection,
    event_type: str,
    text: str,
    actor: str,
    module: str,
    detail: str,
) -> None:
    log_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM activity_logs").fetchall()],
        "ACT",
        width=5,
    )
    conn.execute(
        """
        INSERT INTO activity_logs (id, type, text, actor, time, module, detail)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (log_id, event_type, text, actor, now_clock(), module, detail),
    )


def _trigger_analysis_job_db(conn: sqlite3.Connection, triggered_by: str = "manual") -> str:
    """Insert a pending analysis job record and return its ID."""
    existing_ids = [r["id"] for r in conn.execute("SELECT id FROM analysis_jobs").fetchall()]
    job_id = _next_numeric_id(existing_ids, "ANLYS", width=5)
    conn.execute(
        """
        INSERT INTO analysis_jobs (id, status, triggered_by, started_at, ended_at,
                                   total_features, success_features, error_msg)
        VALUES (?, 'pending', ?, ?, '', 0, 0, '')
        """,
        (job_id, triggered_by, datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    return job_id


def build_analysis_from_cache(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Build the analysis overview response from pre-computed feature_stats_cache."""
    rows = conn.execute(
        "SELECT * FROM feature_stats_cache ORDER BY iv DESC"
    ).fetchall()

    empty_stability_cards = [
        {"label": "稳定特征（PSI<0.1）", "value": "0", "pct": "0.0%", "color": "emerald"},
        {"label": "轻微波动（PSI 0.1-0.2）", "value": "0", "pct": "0.0%", "color": "amber"},
        {"label": "显著漂移（PSI>0.2）", "value": "0", "pct": "0.0%", "color": "red"},
    ]

    if not rows:
        return {
            "empty": True,
            "message": "分析任务尚未运行，请点击「触发分析」按钮启动后台分析任务",
            "featureStats": [],
            "ivData": [],
            "distributionData": [],
            "psiTrendData": [],
            "psiTrendSeries": [],
            "stabilityCards": empty_stability_cards,
            "driftAlerts": [],
            "lastComputedAt": "",
        }

    # featureStats (top 10 by IV)
    feature_stats: List[Dict[str, Any]] = []
    for r in rows[:10]:
        psi = float(r["psi"])
        stats_status = "正常" if psi < 0.1 else ("右偏" if psi < 0.2 else "极右偏")
        feature_stats.append({
            "name": r["feature_name"],
            "missing": f"{float(r['missing_rate']) * 100:.1f}%",
            "min": round(float(r["min_val"]), 4),
            "max": round(float(r["max_val"]), 4),
            "mean": round(float(r["mean"]), 4),
            "std": round(float(r["std"]), 4),
            "p25": round(float(r["p25"]), 4),
            "p75": round(float(r["p75"]), 4),
            "skewness": round(float(r["skewness"]), 3),
            "kurtosis": round(float(r["kurtosis"]), 3),
            "status": stats_status,
        })

    # ivData (top 20 by IV)
    iv_data: List[Dict[str, Any]] = []
    for r in rows[:20]:
        iv_data.append({
            "name": r["feature_name"],
            "iv": round(float(r["iv"]), 3),
            "ks": round(float(r["ks"]), 3),
            "psi": round(float(r["psi"]), 3),
            "auc": round(float(r["auc"]), 3),
            "crossing": bool(r["crossing"]),
        })

    # distributionData – prefer "夜间交易金额占比", fall back to first non-empty
    dist_data: List[Dict[str, Any]] = []
    target_row = next(
        (r for r in rows if r["feature_name"] == "夜间交易金额占比"),
        rows[0],
    )
    try:
        dist_data = json.loads(target_row["distribution_json"]) or []
    except Exception:
        dist_data = []

    # psiTrendData / psiTrendSeries – top 3 features by PSI
    window_count = 6
    psi_candidates = sorted(rows, key=lambda x: float(x["psi"]), reverse=True)[:3]
    psi_trend_data: List[Dict[str, Any]] = [{"month": f"窗口{i}"} for i in range(1, window_count + 1)]
    psi_trend_series: List[Dict[str, str]] = []
    for index, r in enumerate(psi_candidates, start=1):
        key = f"F{index}"
        try:
            trend: List[float] = json.loads(r["psi_trend_json"]) or []
        except Exception:
            trend = []
        while len(trend) < window_count:
            trend.append(0.0)
        for i, row_d in enumerate(psi_trend_data):
            row_d[key] = round(float(trend[i]), 3)
        last_psi = trend[-1] if trend else 0.0
        psi_trend_series.append({
            "key": key,
            "name": r["feature_name"],
            "status": "稳定" if float(last_psi) < 0.1 else ("波动" if float(last_psi) < 0.2 else "漂移"),
        })

    # stabilityCards
    stable = sum(1 for r in rows if float(r["psi"]) < 0.1)
    mild = sum(1 for r in rows if 0.1 <= float(r["psi"]) <= 0.2)
    drift = sum(1 for r in rows if float(r["psi"]) > 0.2)
    total_feats = max(1, len(rows))
    stability_cards = [
        {"label": "稳定特征（PSI<0.1）", "value": str(stable), "pct": f"{stable / total_feats * 100:.1f}%", "color": "emerald"},
        {"label": "轻微波动（PSI 0.1-0.2）", "value": str(mild), "pct": f"{mild / total_feats * 100:.1f}%", "color": "amber"},
        {"label": "显著漂移（PSI>0.2）", "value": str(drift), "pct": f"{drift / total_feats * 100:.1f}%", "color": "red"},
    ]

    # driftAlerts – top 3 most unstable
    drift_alerts = [
        {"name": r["feature_name"], "psi": round(float(r["psi"]), 3), "reason": "分布显著漂移"}
        for r in sorted(rows, key=lambda x: float(x["psi"]), reverse=True)[:3]
    ]

    # last computed time
    all_times = [r["computed_at"] for r in rows if r["computed_at"]]
    last_computed_at = max(all_times) if all_times else ""

    return {
        "empty": False,
        "featureStats": feature_stats,
        "ivData": iv_data,
        "distributionData": dist_data,
        "psiTrendData": psi_trend_data,
        "psiTrendSeries": psi_trend_series,
        "stabilityCards": stability_cards,
        "driftAlerts": drift_alerts,
        "lastComputedAt": last_computed_at,
    }


def snapshot_feature_version(
    conn: sqlite3.Connection,
    feature_id: str,
    author: str,
    change_desc: str,
) -> None:
    row = conn.execute("SELECT * FROM features WHERE id = ?", (feature_id,)).fetchone()
    if not row:
        return
    existing = conn.execute(
        "SELECT version FROM feature_versions WHERE feature_id = ? ORDER BY created_at DESC",
        (feature_id,),
    ).fetchone()
    if existing and existing["version"].startswith("v"):
        try:
            v_num = int(existing["version"][1:]) + 1
        except ValueError:
            v_num = 1
    else:
        v_num = 1
    vid = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM feature_versions").fetchall()],
        "FV",
        width=5,
    )
    version = f"v{v_num}"
    payload = dict(row)
    conn.execute(
        """
        INSERT INTO feature_versions (id, feature_id, version, payload, created_at, author, change_desc)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            vid,
            feature_id,
            version,
            json.dumps(payload, ensure_ascii=False),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            author,
            change_desc,
        ),
    )
    conn.execute("UPDATE features SET version = ? WHERE id = ?", (version, feature_id))


def snapshot_rule_version(
    conn: sqlite3.Connection,
    rule_id: str,
    author: str,
    change_desc: str,
) -> None:
    row = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
    if not row:
        return
    existing = conn.execute(
        "SELECT version FROM rule_versions WHERE rule_id = ? ORDER BY created_at DESC",
        (rule_id,),
    ).fetchone()
    if existing and existing["version"].startswith("v"):
        try:
            v_num = int(existing["version"][1:]) + 1
        except ValueError:
            v_num = 1
    else:
        v_num = 1
    rid = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM rule_versions").fetchall()],
        "RV",
        width=5,
    )
    version = f"v{v_num}"
    payload = dict(row)
    conn.execute(
        """
        INSERT INTO rule_versions (id, rule_id, version, payload, created_at, author, change_desc)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            rid,
            rule_id,
            version,
            json.dumps(payload, ensure_ascii=False),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            author,
            change_desc,
        ),
    )


def list_feature_versions(conn: sqlite3.Connection, feature_id: str) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM feature_versions WHERE feature_id = ? ORDER BY created_at DESC",
        (feature_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def restore_feature_version(conn: sqlite3.Connection, feature_id: str, version: str, actor: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM feature_versions WHERE feature_id = ? AND version = ?",
        (feature_id, version),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Feature version not found")
    payload = json.loads(row["payload"])
    conn.execute(
        """
        UPDATE features
        SET name=?, category=?, scene=?, source=?, status=?, version=?, iv=?, psi=?,
            usedBy=?, creator=?, updateTime=?, desc=?, definition=?
        WHERE id=?
        """,
        (
            payload["name"],
            payload["category"],
            payload["scene"],
            payload["source"],
            payload["status"],
            payload["version"],
            float(payload["iv"]),
            float(payload["psi"]),
            payload.get("usedBy", ""),
            payload["creator"],
            now_date(),
            payload["desc"],
            payload.get("definition", ""),
            feature_id,
        ),
    )
    snapshot_feature_version(conn, feature_id, actor, f"rollback to {version}")
    log_activity(conn, "feature-rollback", f"特征{feature_id}回滚到{version}", actor, "特征资产库", f"rollback:{version}")
    current = conn.execute("SELECT * FROM features WHERE id = ?", (feature_id,)).fetchone()
    return row_to_feature(current)


def list_rule_versions(conn: sqlite3.Connection, rule_id: str) -> List[Dict[str, Any]]:
    rows = conn.execute(
        "SELECT * FROM rule_versions WHERE rule_id = ? ORDER BY created_at DESC",
        (rule_id,),
    ).fetchall()
    return [dict(r) for r in rows]


def restore_rule_version(conn: sqlite3.Connection, rule_id: str, version: str, actor: str) -> Dict[str, Any]:
    row = conn.execute(
        "SELECT * FROM rule_versions WHERE rule_id = ? AND version = ?",
        (rule_id, version),
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Rule version not found")
    payload = json.loads(row["payload"])
    conn.execute(
        "UPDATE rules SET name=?, type=?, logic=?, action=?, priority=?, status=?, hitRate=? WHERE id=?",
        (
            payload["name"],
            payload["type"],
            payload["logic"],
            payload["action"],
            int(payload["priority"]),
            payload["status"],
            float(payload["hitRate"]),
            rule_id,
        ),
    )
    snapshot_rule_version(conn, rule_id, actor, f"rollback to {version}")
    log_activity(conn, "rule-rollback", f"规则{rule_id}回滚到{version}", actor, "规则挖掘", f"rollback:{version}")
    current = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
    return dict(current)


def suggest_features(conn: sqlite3.Connection, top_k: int = 6) -> List[Dict[str, Any]]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    allowed_fields = _sample_user_fields(conn)
    fields = [
        ("query_6m + overdue_days_30d", "查询逾期叠加压力", "计数型", "同时捕捉信用查询与近期逾期压力", "query_6m"),
        ("night_txn_ratio * device_risk_score", "夜间设备风险强度", "交叉型", "夜间异常行为叠加设备风险更利于识别欺诈", "night_txn_ratio"),
        ("multi_apply_3m / (register_days + 30)", "多头申请密度", "比率型", "衡量注册周期内的借贷申请密度", "multi_apply_3m"),
        ("apply_amount_ratio * query_6m", "额度申请冲击", "交叉型", "额度压力与查询活跃组合体现资金饥渴度", "apply_amount_ratio"),
        ("(100 - income_pred_score) + overdue_days_30d", "收入逾期反差分", "评分型", "低收入预测与逾期共同表征偿债风险", "income_pred_score"),
        ("third_party_score / (login_7d + 1)", "三方分登录稀释比", "比率型", "外部风险高且活跃不足时更值得关注", "third_party_score"),
    ]
    scored: List[Dict[str, Any]] = []
    for definition, name, kind, reason, source_field in fields:
        paired = []
        for row in users:
            value = evaluate_feature_expression(definition, row, allowed_fields)
            if value is None:
                continue
            paired.append((float(value), int(row["label"])))
        if len(paired) < 50:
            continue
        iv = iv_stat(paired)
        ks = ks_stat(paired)
        score = iv * 0.7 + ks * 0.3
        scored.append(
            {
                "name": name,
                "sourceField": source_field,
                "type": kind,
                "reason": reason,
                "definition": definition,
                "score": round(score, 4),
                "iv": round(iv, 4),
                "ks": round(ks, 4),
            }
        )
    scored.sort(key=lambda x: x["score"], reverse=True)
    recs = scored[:top_k]
    snap_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM recommendation_snapshots").fetchall()],
        "REC",
        width=5,
    )
    conn.execute(
        "INSERT INTO recommendation_snapshots (id, rec_type, payload, created_at) VALUES (?, ?, ?, ?)",
        (snap_id, "feature-suggestion", json.dumps(recs, ensure_ascii=False), datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    return recs


def optimize_rule_set(
    conn: sqlite3.Connection,
    objective: str,
    max_pass_impact: float,
    min_bad_rate: float,
    max_rules: int,
) -> Dict[str, Any]:
    rules = [dict(r) for r in conn.execute("SELECT * FROM rules WHERE status IN ('上线', '测试中')").fetchall()]
    if not rules:
        raise HTTPException(status_code=400, detail="No rules available")

    users = conn.execute("SELECT * FROM sample_users").fetchall()
    total = len(users)
    if total == 0:
        raise HTTPException(status_code=400, detail="No samples available")

    best = None
    candidate_ids = [r["id"] for r in rules]
    for r_count in range(1, min(max_rules, len(candidate_ids)) + 1):
        for combo in combinations(candidate_ids, r_count):
            sim = simulate_rules(conn, list(combo))["overall"]
            pass_impact = abs(float(sim["passRateImpact"]))
            after_bad = float(sim["afterBadRate"])
            if pass_impact > max_pass_impact:
                continue
            if after_bad > min_bad_rate:
                continue
            score = float(sim["oddsImprove"]) if objective == "max_odds_improve" else -after_bad
            item = {
                "ruleIds": list(combo),
                "overall": sim,
                "score": score,
            }
            if best is None or item["score"] > best["score"]:
                best = item

    if best is None:
        best = {
            "ruleIds": [],
            "overall": {
                "passRateImpact": 0,
                "baseBadRate": sum(int(u["label"]) for u in users) / total * 100,
                "afterBadRate": sum(int(u["label"]) for u in users) / total * 100,
                "oddsImprove": 0,
            },
            "score": 0,
        }

    run_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM optimization_runs").fetchall()],
        "OPT",
        width=5,
    )
    conn.execute(
        """
        INSERT INTO optimization_runs
        (id, objective, max_pass_impact, min_bad_rate, selected_rule_ids, metrics, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_id,
            objective,
            max_pass_impact,
            min_bad_rate,
            ",".join(best["ruleIds"]),
            json.dumps(best["overall"], ensure_ascii=False),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    return {"runId": run_id, "selectedRuleIds": best["ruleIds"], "metrics": best["overall"]}


def run_experiment(
    conn: sqlite3.Connection,
    name: str,
    champion_rule_ids: List[str],
    challenger_rule_ids: List[str],
    sample_rate: float,
) -> Dict[str, Any]:
    if not champion_rule_ids or not challenger_rule_ids:
        raise HTTPException(status_code=400, detail="championRuleIds and challengerRuleIds are required")

    champion = simulate_rules(conn, champion_rule_ids)["overall"]
    challenger = simulate_rules(conn, challenger_rule_ids)["overall"]
    champion_bad = float(champion["afterBadRate"])
    challenger_bad = float(challenger["afterBadRate"])
    champion_improve = float(champion["oddsImprove"])
    challenger_improve = float(challenger["oddsImprove"])
    winner = "challenger" if (challenger_bad < champion_bad and challenger_improve >= champion_improve) else "champion"

    exp_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM strategy_experiments").fetchall()],
        "EXP",
        width=5,
    )
    conn.execute(
        """
        INSERT INTO strategy_experiments
        (id, name, champion_rule_ids, challenger_rule_ids, sample_rate, status, champion_bad_rate,
         challenger_bad_rate, winner, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            exp_id,
            name,
            ",".join(champion_rule_ids),
            ",".join(challenger_rule_ids),
            sample_rate,
            "完成",
            champion_bad,
            challenger_bad,
            winner,
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        ),
    )
    return {
        "id": exp_id,
        "name": name,
        "sampleRate": sample_rate,
        "champion": {"ruleIds": champion_rule_ids, "metrics": champion},
        "challenger": {"ruleIds": challenger_rule_ids, "metrics": challenger},
        "winner": winner,
    }


def parse_rule_logic(logic: str) -> List[Tuple[str, str, float]]:
    text = logic.replace("≥", ">=").replace("≤", "<=")
    chunks = [part.strip() for part in text.split("AND") if part.strip()]
    parsed: List[Tuple[str, str, float]] = []
    for chunk in chunks:
        op = None
        for candidate in [">=", "<=", ">", "<", "="]:
            if candidate in chunk:
                op = candidate
                break
        if not op:
            continue
        left, right = chunk.split(op, 1)
        field = left.strip()
        if field not in {
            "query_6m",
            "overdue_days_30d",
            "night_txn_ratio",
            "device_risk_score",
            "multi_apply_3m",
            "login_7d",
            "apply_amount_ratio",
            "register_days",
            "third_party_score",
            "income_pred_score",
        }:
            field = FIELD_ALIAS_MAP.get(field, field)
        try:
            value = float(right.strip())
        except ValueError:
            continue
        parsed.append((field, op, value))
    return parsed


def _coerce_numeric(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _sample_user_fields(conn: sqlite3.Connection) -> set[str]:
    cols = conn.execute("PRAGMA table_info(sample_users)").fetchall()
    return {str(col["name"]) for col in cols}


def _normalize_expression(definition: str) -> str:
    expr = str(definition or "").strip()
    for alias, field in sorted(FIELD_ALIAS_MAP.items(), key=lambda item: len(item[0]), reverse=True):
        expr = expr.replace(alias, field)
    return expr


def evaluate_feature_expression(definition: str, row: sqlite3.Row, allowed_fields: set[str]) -> Optional[float]:
    expr = _normalize_expression(definition)
    if not expr:
        return None
    if expr in allowed_fields:
        return _coerce_numeric(row[expr])

    tokens = set(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", expr))
    allowed_names = set(allowed_fields) | set(SAFE_EVAL_FUNCTIONS.keys())
    if any(token not in allowed_names for token in tokens):
        return None

    local_ctx: Dict[str, Any] = {}
    for field in allowed_fields:
        local_ctx[field] = _coerce_numeric(row[field])
    local_ctx.update(SAFE_EVAL_FUNCTIONS)

    try:
        result = eval(expr, {"__builtins__": {}}, local_ctx)
    except (ZeroDivisionError, NameError, SyntaxError, TypeError, ValueError):
        return None
    return _coerce_numeric(result)


def compute_feature_preview(
    conn: sqlite3.Connection,
    definition: str,
    limit: int,
) -> Dict[str, Any]:
    allowed_fields = _sample_user_fields(conn)
    rows = conn.execute("SELECT * FROM sample_users ORDER BY user_id LIMIT 1200").fetchall()
    preview_rows = []
    values: List[Tuple[float, int]] = []
    for row in rows:
        value = evaluate_feature_expression(definition, row, allowed_fields)
        if value is None:
            continue
        values.append((float(value), int(row["label"])))
        if len(preview_rows) < limit:
            preview_rows.append(
                {
                    "userId": row["user_id"],
                    "label": int(row["label"]),
                    "value": round(float(value), 6),
                }
            )

    total_rows = len(rows)
    coverage = len(values) / total_rows if total_rows else 0.0
    iv = iv_stat(values) if values else 0.0
    ks = ks_stat(values) if values else 0.0
    auc = auc_from_scores(values) if values else 0.5
    split = max(1, len(values) // 2)
    psi = psi_stat([v for v, _ in values[:split]], [v for v, _ in values[split:]]) if len(values) >= 20 else 0.0
    return {
        "rows": preview_rows,
        "stats": {
            "sampleCount": len(values),
            "coverage": round(coverage * 100, 2),
            "iv": round(iv, 4),
            "ks": round(ks, 4),
            "psi": round(psi, 4),
            "auc": round(auc, 4),
        },
    }


def evaluate_conditions(row: sqlite3.Row, conditions: List[Tuple[str, str, float]]) -> bool:
    for field, op, val in conditions:
        if field not in row.keys():
            return False
        cur = row[field]
        if cur is None:
            return False
        cur_f = float(cur)
        if op == ">=" and not (cur_f >= val):
            return False
        if op == "<=" and not (cur_f <= val):
            return False
        if op == ">" and not (cur_f > val):
            return False
        if op == "<" and not (cur_f < val):
            return False
        if op == "=" and not (abs(cur_f - val) < 1e-9):
            return False
    return True


def auc_from_scores(scores: List[Tuple[float, int]]) -> float:
    if not scores:
        return 0.5
    positives = sum(1 for _, y in scores if y == 1)
    negatives = len(scores) - positives
    if positives == 0 or negatives == 0:
        return 0.5
    ranked = sorted(scores, key=lambda x: x[0])
    rank_sum = 0.0
    for idx, (_, label) in enumerate(ranked, start=1):
        if label == 1:
            rank_sum += idx
    return (rank_sum - positives * (positives + 1) / 2) / (positives * negatives)


def ks_stat(values: List[Tuple[float, int]]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values, key=lambda x: x[0])
    total_bad = sum(1 for _, y in ordered if y == 1)
    total_good = len(ordered) - total_bad
    if total_bad == 0 or total_good == 0:
        return 0.0
    bad_cum = 0
    good_cum = 0
    ks = 0.0
    for _, y in ordered:
        if y == 1:
            bad_cum += 1
        else:
            good_cum += 1
        ks = max(ks, abs(bad_cum / total_bad - good_cum / total_good))
    return ks


def iv_stat(values: List[Tuple[float, int]], bins: int = 10) -> float:
    clean = [(v, y) for v, y in values if v is not None]
    if len(clean) < 10:
        return 0.0
    ordered = sorted(clean, key=lambda x: x[0])
    total_bad = sum(1 for _, y in ordered if y == 1)
    total_good = len(ordered) - total_bad
    if total_bad == 0 or total_good == 0:
        return 0.0

    chunks: List[List[Tuple[float, int]]] = []
    size = max(1, len(ordered) // bins)
    for i in range(0, len(ordered), size):
        chunks.append(ordered[i : i + size])

    iv = 0.0
    eps = 1e-6
    for bucket in chunks:
        bad = sum(1 for _, y in bucket if y == 1)
        good = len(bucket) - bad
        bad_pct = max(eps, bad / total_bad)
        good_pct = max(eps, good / total_good)
        iv += (bad_pct - good_pct) * math.log(bad_pct / good_pct)
    return iv


def psi_stat(base: List[float], cur: List[float], bins: int = 10) -> float:
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
        h = [0 for _ in range(bins)]
        for v in data:
            idx = 0
            while idx < bins - 1 and v > boundaries[idx]:
                idx += 1
            h[idx] += 1
        total = len(data)
        return [x / total for x in h]

    bh = hist(b)
    ch = hist(c)
    eps = 1e-6
    psi = 0.0
    for bp, cp in zip(bh, ch):
        bp = max(bp, eps)
        cp = max(cp, eps)
        psi += (cp - bp) * math.log(cp / bp)
    return psi


def load_features(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    rows = conn.execute("SELECT * FROM features ORDER BY id").fetchall()
    return [row_to_feature(r) for r in rows]


def run_feature_processing(conn: sqlite3.Connection, scene: str = "全部") -> Dict[str, Any]:
    started = datetime.now()
    run_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM feature_runs").fetchall()],
        "RUN",
        width=4,
    )
    run_key = run_id

    rows = conn.execute("SELECT * FROM sample_users").fetchall()
    allowed_fields = _sample_user_fields(conn)
    feature_rows = conn.execute(
        "SELECT id, scene, definition FROM features WHERE status IN ('上线', '测试中')"
    ).fetchall()
    if scene != "全部":
        scene_norm = normalize_scene(scene)
        feature_rows = [fr for fr in feature_rows if normalize_scene(fr["scene"]) == scene_norm]

    computed = 0
    inserts: List[Tuple[str, str, str, float]] = []
    for fr in feature_rows:
        fid = fr["id"]
        definition = fr["definition"]
        for user in rows:
            value = evaluate_feature_expression(definition, user, allowed_fields)
            if value is None:
                continue
            inserts.append((run_key, user["user_id"], fid, float(value)))
        computed += 1

    conn.executemany(
        "INSERT OR REPLACE INTO feature_values (run_id, user_id, feature_id, value) VALUES (?, ?, ?, ?)",
        inserts,
    )
    ended = datetime.now()
    duration_ms = int((ended - started).total_seconds() * 1000)
    conn.execute(
        """
        INSERT INTO feature_runs
        (id, task_name, scene, status, started_at, ended_at, duration_ms, total_features, success_features, log)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            run_key,
            "特征加工任务",
            scene,
            "成功",
            started.strftime("%Y-%m-%d %H:%M:%S"),
            ended.strftime("%Y-%m-%d %H:%M:%S"),
            duration_ms,
            len(feature_rows),
            computed,
            f"processed rows={len(rows)}, features={len(feature_rows)}",
        ),
    )
    log_activity(
        conn,
        "feature-run",
        f"执行特征加工任务，场景={scene}，成功特征={computed}",
        "系统",
        "特征开发",
        f"run={run_key}",
    )
    conn.commit()

    return {
        "runId": run_key,
        "status": "成功",
        "rows": len(rows),
        "features": len(feature_rows),
        "success": computed,
        "durationMs": duration_ms,
    }


def evaluate_features(conn: sqlite3.Connection, persist: bool = False) -> Dict[str, Any]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    allowed_fields = _sample_user_fields(conn)
    y = [int(r["label"]) for r in users]
    total = len(users)

    feature_meta = conn.execute("SELECT id, name, definition FROM features").fetchall()
    iv_data = []
    stats_rows = []
    dist_data = []
    latest_snapshot_rows = []
    psi_trend_candidates = []

    for fm in feature_meta:
        field = fm["definition"]
        values = [evaluate_feature_expression(field, r, allowed_fields) for r in users]
        missing = sum(1 for v in values if v is None)
        clean = [float(v) for v in values if v is not None]
        if not clean:
            continue

        paired = [(float(v), int(r["label"])) for r, v in zip(users, values) if v is not None]
        iv = iv_stat(paired)
        ks = ks_stat(paired)
        auc = auc_from_scores(paired)

        base = clean[: len(clean) // 2]
        cur = clean[len(clean) // 2 :]
        psi = psi_stat(base, cur)
        crossing = 1 if iv > 0.5 else 0

        iv_data.append(
            {
                "name": fm["name"],
                "iv": round(iv, 3),
                "ks": round(ks, 3),
                "psi": round(psi, 3),
                "auc": round(auc, 3),
                "crossing": bool(crossing),
            }
        )
        psi_trend_candidates.append(
            {
                "name": fm["name"],
                "psi": round(psi, 3),
                "values": clean,
            }
        )

        stats_rows.append(
            {
                "name": fm["name"],
                "missing": f"{(missing / total) * 100:.1f}%",
                "min": round(min(clean), 4),
                "max": round(max(clean), 4),
                "mean": round(mean(clean), 4),
                "std": round((sum((x - mean(clean)) ** 2 for x in clean) / len(clean)) ** 0.5, 4),
                "p25": round(sorted(clean)[int(0.25 * (len(clean) - 1))], 4),
                "p75": round(sorted(clean)[int(0.75 * (len(clean) - 1))], 4),
                "skewness": round(0.0 if len(clean) < 3 else _skewness(clean), 3),
                "kurtosis": round(0.0 if len(clean) < 4 else _kurtosis(clean), 3),
                "status": "正常" if psi < 0.1 else ("右偏" if psi < 0.2 else "极右偏"),
            }
        )

        snapshot_id = f"TMP{len(latest_snapshot_rows) + 1:05d}"
        if persist:
            snapshot_id = _next_numeric_id(
                [r["id"] for r in conn.execute("SELECT id FROM feature_eval_snapshots").fetchall()],
                "EV",
                width=5,
            )
            conn.execute(
                """
                INSERT INTO feature_eval_snapshots
                (id, feature_id, feature_name, iv, ks, psi, auc, crossing, missing_rate, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    snapshot_id,
                    fm["id"],
                    fm["name"],
                    float(iv),
                    float(ks),
                    float(psi),
                    float(auc),
                    crossing,
                    float(missing / total),
                    datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
        latest_snapshot_rows.append(
            {
                "id": snapshot_id,
                "featureId": fm["id"],
                "featureName": fm["name"],
                "iv": round(iv, 3),
                "ks": round(ks, 3),
                "psi": round(psi, 3),
                "auc": round(auc, 3),
                "crossing": bool(crossing),
            }
        )

    target_name = "夜间交易金额占比"
    target = next((x for x in feature_meta if x["name"] == target_name), feature_meta[0] if feature_meta else None)
    if target:
        vals = []
        for r in users:
            value = evaluate_feature_expression(target["definition"], r, allowed_fields)
            if value is not None:
                vals.append((float(value), int(r["label"])))
        bins = _distribution(vals, bin_count=9)
        dist_data = [
            {
                "bin": b["bin"],
                "count": b["count"],
                "badRate": round(b["badRate"], 4),
            }
            for b in bins
        ]

    if persist:
        log_activity(
            conn,
            "feature-eval",
            f"完成特征评估，特征数={len(iv_data)}",
            "系统",
            "特征分析",
            "evaluation refresh",
        )
        conn.commit()

    stable = len([x for x in iv_data if x["psi"] < 0.1])
    mild = len([x for x in iv_data if 0.1 <= x["psi"] <= 0.2])
    drift = len([x for x in iv_data if x["psi"] > 0.2])
    total_feats = max(1, len(iv_data))
    psi_trend_data, psi_trend_series = _build_psi_trend_rows(
        sorted(psi_trend_candidates, key=lambda item: item["psi"], reverse=True)[:3]
    )

    return {
        "featureStats": stats_rows[:10],
        "ivData": sorted(iv_data, key=lambda x: x["iv"], reverse=True)[:20],
        "distributionData": dist_data,
        "psiTrendData": psi_trend_data,
        "psiTrendSeries": psi_trend_series,
        "stabilityCards": [
            {
                "label": "稳定特征（PSI<0.1）",
                "value": str(stable),
                "pct": f"{stable / total_feats * 100:.1f}%",
                "color": "emerald",
            },
            {
                "label": "轻微波动（PSI 0.1-0.2）",
                "value": str(mild),
                "pct": f"{mild / total_feats * 100:.1f}%",
                "color": "amber",
            },
            {
                "label": "显著漂移（PSI>0.2）",
                "value": str(drift),
                "pct": f"{drift / total_feats * 100:.1f}%",
                "color": "red",
            },
        ],
        "driftAlerts": [
            {"name": x["name"], "psi": x["psi"], "reason": "分布显著漂移"}
            for x in sorted(iv_data, key=lambda y: y["psi"], reverse=True)[:3]
        ],
        "latestSnapshots": latest_snapshot_rows[:10],
    }


def _skewness(vals: List[float]) -> float:
    m = mean(vals)
    s2 = sum((x - m) ** 2 for x in vals) / len(vals)
    if s2 == 0:
        return 0.0
    s = s2**0.5
    return (sum((x - m) ** 3 for x in vals) / len(vals)) / (s**3)


def _kurtosis(vals: List[float]) -> float:
    m = mean(vals)
    s2 = sum((x - m) ** 2 for x in vals) / len(vals)
    if s2 == 0:
        return 0.0
    return (sum((x - m) ** 4 for x in vals) / len(vals)) / (s2**2) - 3


def _distribution(vals: List[Tuple[float, int]], bin_count: int = 9) -> List[Dict[str, Any]]:
    if not vals:
        return []
    arr = sorted(vals, key=lambda x: x[0])
    min_v = arr[0][0]
    max_v = arr[-1][0]
    if abs(max_v - min_v) < 1e-9:
        bad_rate = sum(y for _, y in arr) / len(arr)
        return [{"bin": "single", "count": len(arr), "badRate": bad_rate}]

    step = (max_v - min_v) / bin_count
    bins = []
    for i in range(bin_count):
        low = min_v + i * step
        high = min_v + (i + 1) * step
        part = [p for p in arr if low <= p[0] < high] if i < bin_count - 1 else [p for p in arr if low <= p[0] <= high]
        if not part:
            continue
        bins.append(
            {
                "bin": f"{i * 10}-{(i + 1) * 10}%",
                "count": len(part),
                "badRate": sum(y for _, y in part) / len(part),
            }
        )
    return bins


def _split_series_windows(values: List[float], window_count: int = 6) -> List[List[float]]:
    if window_count <= 0:
        return []
    if not values:
        return [[] for _ in range(window_count)]
    step = max(1, math.ceil(len(values) / window_count))
    windows: List[List[float]] = []
    for index in range(window_count):
        start = index * step
        end = min(len(values), (index + 1) * step)
        windows.append(values[start:end])
    return windows


def _build_psi_trend_rows(candidates: List[Dict[str, Any]], window_count: int = 6) -> Tuple[List[Dict[str, Any]], List[Dict[str, str]]]:
    rows: List[Dict[str, Any]] = [{"month": f"窗口{i}"} for i in range(1, window_count + 1)]
    series_meta: List[Dict[str, str]] = []
    for index, candidate in enumerate(candidates, start=1):
        values = [float(v) for v in candidate["values"]]
        if not values:
            continue
        windows = _split_series_windows(values, window_count)
        baseline = next((window for window in windows if window), values)
        key = f"F{index}"
        last_psi = 0.0
        for row, window in zip(rows, windows):
            compare = window or baseline
            psi_value = round(psi_stat(baseline, compare), 3)
            row[key] = psi_value
            last_psi = psi_value
        series_meta.append(
            {
                "key": key,
                "name": str(candidate["name"]),
                "status": "稳定" if last_psi < 0.1 else ("波动" if last_psi < 0.2 else "漂移"),
            }
        )
    return rows, series_meta


def build_monitoring(conn: sqlite3.Connection) -> Dict[str, Any]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    total = len(users)

    fields = [
        ("近30日逾期天数", "overdue_days_30d", 5),
        ("征信硬查询次数", "query_6m", 5),
        ("夜间交易占比", "night_txn_ratio", 5),
        ("三方行为评分", "third_party_score", 10),
        ("设备指纹评分", "device_risk_score", 5),
        ("收入预测分", "income_pred_score", 10),
    ]
    missing = []
    for name, field, th in fields:
        miss = sum(1 for r in users if r[field] is None)
        rate = (miss / total) * 100
        status = "正常"
        if rate > th:
            status = "严重" if rate > th * 1.8 else "告警"
        missing.append({"name": name, "rate": round(rate, 1), "threshold": th, "status": status})

    api_metrics = [
        {"name": "贷前特征服务", "endpoint": "/api/v3/feature/pre-loan", "qps": 1840, "p99": "42ms", "successRate": 99.94, "status": "正常"},
        {"name": "实时行为特征", "endpoint": "/api/v3/feature/behavior", "qps": 5620, "p99": "18ms", "successRate": 99.97, "status": "正常"},
        {"name": "设备风险特征", "endpoint": "/api/v3/feature/device", "qps": 3240, "p99": "28ms", "successRate": 99.91, "status": "正常"},
        {"name": "三方数据特征", "endpoint": "/api/v3/feature/third-party", "qps": 980, "p99": "312ms", "successRate": 97.82, "status": "告警"},
    ]

    response = [
        {"time": "09:00", "p50": 12, "p99": 38, "p999": 120},
        {"time": "09:10", "p50": 13, "p99": 41, "p999": 128},
        {"time": "09:20", "p50": 14, "p99": 42, "p999": 135},
        {"time": "09:30", "p50": 12, "p99": 39, "p999": 118},
        {"time": "09:40", "p50": 15, "p99": 52, "p999": 180},
        {"time": "09:50", "p50": 28, "p99": 312, "p999": 890},
    ]
    success = [
        {"time": "09:00", "rate": 99.95},
        {"time": "09:10", "rate": 99.96},
        {"time": "09:20", "rate": 99.94},
        {"time": "09:30", "rate": 99.93},
        {"time": "09:40", "rate": 99.82},
        {"time": "09:50", "rate": 97.82},
    ]

    eval_data_top = conn.execute(
        "SELECT feature_name, iv FROM feature_stats_cache ORDER BY iv DESC LIMIT 3"
    ).fetchall()
    top = [{"name": r["feature_name"], "iv": float(r["iv"])} for r in eval_data_top]
    iv_decay: List[Dict[str, Any]] = []
    months = ["10月", "11月", "12月", "1月", "2月", "3月"]
    for i, m in enumerate(months):
        item: Dict[str, Any] = {"month": m}
        for idx, f in enumerate(top, start=1):
            base = f["iv"]
            item[f"F{idx}"] = round(max(0.01, base * (1 - 0.02 * i)), 3)
        iv_decay.append(item)

    return {
        "apiMetrics": api_metrics,
        "responseTimeTrend": response,
        "successRateTrend": success,
        "missingRateData": missing,
        "ivDecayData": iv_decay,
    }


def build_dashboard(conn: sqlite3.Connection) -> Dict[str, Any]:
    features = load_features(conn)
    cache_rows = conn.execute(
        "SELECT feature_name, iv, ks, psi FROM feature_stats_cache ORDER BY iv DESC"
    ).fetchall()
    alerts = [dict(r) for r in conn.execute("SELECT * FROM alerts").fetchall()]
    rules = [dict(r) for r in conn.execute("SELECT * FROM rules").fetchall()]

    total = len(features)
    online = len([f for f in features if f["status"] == "上线"])
    testing = len([f for f in features if f["status"] == "测试中"])
    feature_trend = []
    months = ["10月", "11月", "12月", "1月", "2月", "3月"]
    base_total = max(total - 60, 1)
    base_active = max(online - 45, 1)
    for idx, month in enumerate(months):
        feature_trend.append({
            "month": month,
            "total": base_total + idx * max(5, (total - base_total) // max(1, len(months) - 1)),
            "active": base_active + idx * max(4, (online - base_active) // max(1, len(months) - 1)),
            "new": max(3, testing + idx),
        })
    if feature_trend:
        feature_trend[-1]["total"] = total
        feature_trend[-1]["active"] = online
        feature_trend[-1]["new"] = testing

    iv_buckets = {
        "无效 (<0.02)": 0,
        "弱 (0.02-0.1)": 0,
        "中 (0.1-0.3)": 0,
        "强 (0.3-0.5)": 0,
        "疑似穿越 (>0.5)": 0,
    }
    for r in cache_rows:
        iv = float(r["iv"])
        if iv < 0.02:
            iv_buckets["无效 (<0.02)"] += 1
        elif iv < 0.1:
            iv_buckets["弱 (0.02-0.1)"] += 1
        elif iv < 0.3:
            iv_buckets["中 (0.1-0.3)"] += 1
        elif iv < 0.5:
            iv_buckets["强 (0.3-0.5)"] += 1
        else:
            iv_buckets["疑似穿越 (>0.5)"] += 1

    iv_dist = [
        {"name": "无效 (<0.02)", "value": iv_buckets["无效 (<0.02)"], "color": "#94a3b8"},
        {"name": "弱 (0.02-0.1)", "value": iv_buckets["弱 (0.02-0.1)"], "color": "#60a5fa"},
        {"name": "中 (0.1-0.3)", "value": iv_buckets["中 (0.1-0.3)"], "color": "#34d399"},
        {"name": "强 (0.3-0.5)", "value": iv_buckets["强 (0.3-0.5)"], "color": "#a78bfa"},
        {"name": "疑似穿越 (>0.5)", "value": iv_buckets["疑似穿越 (>0.5)"], "color": "#f87171"},
    ]

    top_features = []
    for r in cache_rows[:5]:
        top_features.append({
            "name": r["feature_name"],
            "iv": round(float(r["iv"]), 3),
            "ks": round(float(r["ks"]), 3),
            "psi": round(float(r["psi"]), 3),
            "status": "波动" if float(r["psi"]) > 0.1 else "稳定",
        })

    cache_count = len(cache_rows)
    module_cards = {
        "featureDev": f"{total} 个特征",
        "featureAnalysis": f"{cache_count} 个已评估",
        "featureLibrary": f"{len({f['scene'] for f in features})} 个业务场景",
        "monitoring": f"{len([a for a in alerts if a['status'] in {'未处理', '处理中'}])} 个活跃告警",
        "ruleMining": f"{len([r for r in rules if r['status'] in {'上线', '测试中'}])} 条活跃规则",
    }

    return {
        "featureTrendData": feature_trend,
        "ivDistData": iv_dist,
        "topFeatures": top_features,
        "moduleCards": module_cards,
    }


def _rule_action_for_bad_rate(bad_rate: float) -> str:
    if bad_rate >= 55:
        return "建议：拒绝"
    if bad_rate >= 35:
        return "建议：人工审核"
    return "建议：降额"


def _rule_field_label(field: str) -> str:
    mapping = {
        "query_6m": "征信硬查询次数",
        "overdue_days_30d": "近30日逾期天数",
        "night_txn_ratio": "夜间交易占比",
        "device_risk_score": "设备指纹风险评分",
        "multi_apply_3m": "多头借贷申请次数",
        "login_7d": "近7日登录次数",
        "apply_amount_ratio": "申请金额比",
        "register_days": "注册天数",
        "third_party_score": "三方行为评分",
        "income_pred_score": "收入预测分",
    }
    return mapping.get(field, field)


def _infer_feature_set(scene_name: str) -> List[str]:
    scene = normalize_scene(scene_name)
    if scene == "反欺诈":
        return ["night_txn_ratio", "device_risk_score", "multi_apply_3m", "third_party_score", "query_6m"]
    if scene == "贷后":
        return ["overdue_days_30d", "apply_amount_ratio", "income_pred_score", "login_7d", "query_6m"]
    return ["query_6m", "overdue_days_30d", "multi_apply_3m", "apply_amount_ratio", "register_days", "night_txn_ratio"]


def _summarize_rule_match(users: List[sqlite3.Row], matched: List[sqlite3.Row]) -> Dict[str, float]:
    total = len(users)
    hit_rate = len(matched) / total * 100 if total else 0.0
    bad_rate = sum(int(r["label"]) for r in matched) / len(matched) * 100 if matched else 0.0
    pass_users = [u for u in users if u["user_id"] not in {m["user_id"] for m in matched}]
    base_bad_rate = sum(int(u["label"]) for u in users) / total * 100 if total else 0.0
    after_bad_rate = sum(int(u["label"]) for u in pass_users) / len(pass_users) * 100 if pass_users else 0.0
    return {
        "hitRate": round(hit_rate, 2),
        "badRate": round(bad_rate, 2),
        "passRateImpact": round(-hit_rate, 2),
        "baseBadRate": round(base_bad_rate, 2),
        "afterBadRate": round(after_bad_rate, 2),
        "oddsImprove": round(max(0.0, base_bad_rate - after_bad_rate), 2),
    }


def mine_rules(conn: sqlite3.Connection, config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    total = len(users)
    config = config or {}
    scene = normalize_scene(str(config.get("scene") or str(config.get("featureSet") or "贷前")))
    selected_features = [str(f) for f in (config.get("selectedFeatures") or []) if str(f).strip()]
    features = selected_features or _infer_feature_set(str(config.get("featureSet") or scene))
    max_depth = max(2, min(4, int(config.get("maxDepth") or 4)))
    min_samples = max(30, int(config.get("minSamples") or 120))

    candidates: List[Dict[str, Any]] = []
    rule_eval_data: List[Dict[str, Any]] = []

    feature_splits: List[Dict[str, Any]] = []
    for field in features:
        available = [float(r[field]) for r in users if field in r.keys() and r[field] is not None]
        if len(available) < min_samples:
            continue
        ordered = sorted(available)
        thresholds = sorted({
            ordered[int((len(ordered) - 1) * 0.5)],
            ordered[int((len(ordered) - 1) * 0.75)],
        })
        for threshold in thresholds:
            matched = [r for r in users if r[field] is not None and float(r[field]) >= threshold]
            if len(matched) < min_samples:
                continue
            metrics = _summarize_rule_match(users, matched)
            feature_splits.append(
                {
                    "field": field,
                    "threshold": round(float(threshold), 4),
                    "ruleText": f"{_rule_field_label(field)} >= {round(float(threshold), 4)}",
                    "matched": matched,
                    "metrics": metrics,
                }
            )

    feature_splits.sort(key=lambda item: (item["metrics"]["badRate"], -item["metrics"]["hitRate"]), reverse=True)
    top_splits = feature_splits[: max(3, max_depth)]

    seen_rules = set()
    for split in top_splits:
        metrics = split["metrics"]
        rule_key = split["ruleText"]
        seen_rules.add(rule_key)
        candidates.append(
            {
                "rule": split["ruleText"],
                "hitRate": f"{metrics['hitRate']:.1f}%",
                "badRate": f"{metrics['badRate']:.1f}%",
                "action": _rule_action_for_bad_rate(metrics["badRate"]),
            }
        )
        rule_eval_data.append(
            {
                "rule": split["ruleText"],
                "hitRate": round(metrics["hitRate"], 1),
                "badRate": round(metrics["badRate"], 1),
                "passRateImpact": round(metrics["passRateImpact"], 1),
                "oddsImprove": round(metrics["oddsImprove"], 1),
            }
        )

    pair_budget = max(1, min(3, max_depth - 1))
    for i in range(len(top_splits)):
        for j in range(i + 1, min(len(top_splits), i + 1 + pair_budget)):
            left = top_splits[i]
            right = top_splits[j]
            if left["field"] == right["field"]:
                continue
            left_ids = {r["user_id"] for r in left["matched"]}
            matched = [r for r in right["matched"] if r["user_id"] in left_ids]
            if len(matched) < min_samples:
                continue
            metrics = _summarize_rule_match(users, matched)
            if metrics["badRate"] < max(left["metrics"]["badRate"], right["metrics"]["badRate"]):
                continue
            rule_text = f"{left['ruleText']} AND {right['ruleText']}"
            if rule_text in seen_rules:
                continue
            seen_rules.add(rule_text)
            candidates.append(
                {
                    "rule": rule_text,
                    "hitRate": f"{metrics['hitRate']:.1f}%",
                    "badRate": f"{metrics['badRate']:.1f}%",
                    "action": _rule_action_for_bad_rate(metrics["badRate"]),
                }
            )
            rule_eval_data.append(
                {
                    "rule": rule_text,
                    "hitRate": round(metrics["hitRate"], 1),
                    "badRate": round(metrics["badRate"], 1),
                    "passRateImpact": round(metrics["passRateImpact"], 1),
                    "oddsImprove": round(metrics["oddsImprove"], 1),
                }
            )
            if len(candidates) >= 6:
                break
        if len(candidates) >= 6:
            break

    top_tree = top_splits[:2]
    tree_children = []
    for split in top_tree:
        matched = split["matched"]
        unmatched_ids = {r["user_id"] for r in matched}
        unmatched = [r for r in users if r["user_id"] not in unmatched_ids]
        tree_children.append(
            {
                "condition": split["ruleText"],
                "feature": _rule_field_label(split["field"]),
                "samples": len(matched),
                "children": [
                    {
                        "condition": "命中规则",
                        "feature": _rule_field_label(split["field"]),
                        "samples": len(matched),
                        "badRate": round(split["metrics"]["badRate"] / 100, 3),
                        "isLeaf": True,
                    },
                    {
                        "condition": "未命中规则",
                        "feature": _rule_field_label(split["field"]),
                        "samples": len(unmatched),
                        "badRate": round(_summarize_rule_match(users, unmatched)["badRate"] / 100, 3),
                        "isLeaf": True,
                    },
                ],
            }
        )

    if not tree_children:
        tree_children = [
            {
                "condition": "无有效规则候选",
                "feature": scene,
                "samples": total,
                "badRate": round(sum(int(r["label"]) for r in users) / total if total else 0.0, 3),
                "isLeaf": True,
            }
        ]

    tree_data = {
        "condition": f"{scene}规则挖掘根节点",
        "feature": f"算法: {str(config.get('algorithm') or 'CART决策树')}",
        "samples": total,
        "children": tree_children,
    }

    cold_start_templates = [
        {
            "id": "CS001",
            "name": "黑名单核查",
            "category": "基础拦截",
            "params": ["黑名单库来源"],
            "severity": "高",
            "desc": "命中内外部黑名单则直接拒绝",
        },
        {
            "id": "CS002",
            "name": "设备欺诈识别",
            "category": "设备风险",
            "params": ["设备风险评分阈值", "更换次数阈值"],
            "severity": "高",
            "desc": "基于设备评分识别异常",
        },
    ]

    return {
        "treeData": tree_data,
        "ruleEvalData": rule_eval_data,
        "candidates": candidates,
        "coldStartTemplates": cold_start_templates,
    }


def simulate_rules(conn: sqlite3.Connection, rule_ids: List[str]) -> Dict[str, Any]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    total = len(users)
    selected_rules = []
    for rid in rule_ids:
        row = conn.execute("SELECT * FROM rules WHERE id = ?", (rid,)).fetchone()
        if row:
            selected_rules.append(row)
    if not selected_rules:
        raise HTTPException(status_code=400, detail="No valid rules selected")

    hit_users = set()
    per_rule = []
    for rr in selected_rules:
        cond = parse_rule_logic(rr["logic"])
        matched = [u for u in users if evaluate_conditions(u, cond)]
        hit_users.update(u["user_id"] for u in matched)
        hit = len(matched) / total * 100
        bad = (sum(int(x["label"]) for x in matched) / len(matched) * 100) if matched else 0.0
        per_rule.append(
            {
                "id": rr["id"],
                "name": rr["name"],
                "hitRate": round(hit, 2),
                "badRate": round(bad, 2),
            }
        )

    total_hit = len(hit_users)
    reject_rate = total_hit / total * 100
    base_bad_rate = sum(int(u["label"]) for u in users) / total * 100
    pass_users = [u for u in users if u["user_id"] not in hit_users]
    pass_bad_rate = (sum(int(u["label"]) for u in pass_users) / len(pass_users) * 100) if pass_users else 0.0
    improve = max(0.0, base_bad_rate - pass_bad_rate)

    return {
        "rules": per_rule,
        "overall": {
            "passRateImpact": round(-reject_rate, 2),
            "baseBadRate": round(base_bad_rate, 2),
            "afterBadRate": round(pass_bad_rate, 2),
            "oddsImprove": round(improve, 2),
        },
    }


def simulate_candidate_rule(conn: sqlite3.Connection, rule_expr: str) -> Dict[str, float]:
    users = conn.execute("SELECT * FROM sample_users").fetchall()
    total = len(users)
    if total == 0:
        raise HTTPException(status_code=400, detail="No samples available")
    cond = parse_rule_logic(rule_expr)
    if not cond:
        raise HTTPException(status_code=400, detail="Invalid candidate rule expression")
    matched = [u for u in users if evaluate_conditions(u, cond)]
    if not matched:
        return {"hitRate": 0.0, "badRate": 0.0, "passRateImpact": 0.0, "oddsImprove": 0.0}

    hit_rate = len(matched) / total * 100
    bad_rate = sum(int(x["label"]) for x in matched) / len(matched) * 100
    pass_users = [u for u in users if u["user_id"] not in {m["user_id"] for m in matched}]
    base_bad_rate = sum(int(u["label"]) for u in users) / total * 100
    after_bad_rate = (sum(int(u["label"]) for u in pass_users) / len(pass_users) * 100) if pass_users else 0.0
    improve = max(0.0, base_bad_rate - after_bad_rate)
    return {
        "hitRate": round(hit_rate, 2),
        "badRate": round(bad_rate, 2),
        "passRateImpact": round(-hit_rate, 2),
        "oddsImprove": round(improve, 2),
    }


@app.get("/api/features")
def list_features(
    scene: Optional[str] = Query(default=None),
    status: Optional[str] = Query(default=None),
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM features").fetchall()
    conn.close()
    features = [row_to_feature(r) for r in rows]

    if scene and scene != "全部":
        features = [f for f in features if f["scene"] == scene]
    if status and status != "全部":
        features = [f for f in features if f["status"] == status]
    if category and category != "全部":
        features = [f for f in features if f["category"] == category]
    if search:
        features = [f for f in features if search in f["name"] or search in f["id"]]
    return features


@app.get("/api/features/{feature_id}")
def get_feature(feature_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM features WHERE id = ?", (feature_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Feature not found")
    return row_to_feature(row)


@app.post("/api/features", status_code=201)
def create_feature(payload: Dict[str, Any]):
    name = payload.get("name")
    category = payload.get("category")
    if not name or not category:
        raise HTTPException(status_code=400, detail="name and category are required")

    conn = get_conn()
    definition = str(payload.get("definition") or "")
    if definition:
        preview = compute_feature_preview(conn, definition, 5)
        if preview["stats"]["sampleCount"] == 0:
            conn.close()
            raise HTTPException(status_code=400, detail="definition produced no valid samples")
        payload["iv"] = preview["stats"]["iv"]
        payload["psi"] = preview["stats"]["psi"]
    fid = generate_feature_id(conn, str(category))
    today = now_date()
    row = (
        fid,
        str(name),
        str(category),
        normalize_scene(str(payload.get("scene") or "贷前")),
        str(payload.get("source") or ""),
        "测试中",
        "v1.0",
        float(payload.get("iv") or 0),
        float(payload.get("psi") or 0),
        "",
        str(payload.get("creator") or "系统"),
        today,
        today,
        str(payload.get("desc") or ""),
        _normalize_expression(definition),
    )
    conn.execute(
        """
        INSERT INTO features (
            id, name, category, scene, source, status, version, iv, psi, usedBy,
            creator, createTime, updateTime, desc, definition
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        row,
    )
    conn.commit()
    snapshot_feature_version(conn, fid, str(payload.get("creator") or "系统"), "feature created")
    log_activity(conn, "feature-create", f"新增特征 {name}", str(payload.get("creator") or "系统"), "特征资产库", fid)
    conn.commit()
    created = conn.execute("SELECT * FROM features WHERE id = ?", (fid,)).fetchone()
    conn.close()
    return row_to_feature(created)


@app.put("/api/features/{feature_id}")
def update_feature(feature_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    row = conn.execute("SELECT * FROM features WHERE id = ?", (feature_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Feature not found")

    current = dict(row)
    fields = ["name", "category", "scene", "source", "status", "version", "iv", "psi", "creator", "desc", "definition"]
    for f in fields:
        if f in payload:
            current[f] = payload[f]
    if "scene" in current:
        current["scene"] = normalize_scene(str(current["scene"]))
    if "definition" in payload:
        preview = compute_feature_preview(conn, str(current["definition"]), 5)
        if preview["stats"]["sampleCount"] == 0:
            conn.close()
            raise HTTPException(status_code=400, detail="definition produced no valid samples")
        current["definition"] = _normalize_expression(str(current["definition"]))
        current["iv"] = preview["stats"]["iv"]
        current["psi"] = preview["stats"]["psi"]
    current["updateTime"] = now_date()
    if "usedBy" in payload and isinstance(payload["usedBy"], list):
        current["usedBy"] = ",".join(payload["usedBy"])

    conn.execute(
        """
        UPDATE features
        SET name=?, category=?, scene=?, source=?, status=?, version=?, iv=?, psi=?,
            usedBy=?, creator=?, updateTime=?, desc=?, definition=?
        WHERE id=?
        """,
        (
            current["name"],
            current["category"],
            current["scene"],
            current["source"],
            current["status"],
            current["version"],
            float(current["iv"]),
            float(current["psi"]),
            str(current["usedBy"]),
            current["creator"],
            current["updateTime"],
            current["desc"],
            current["definition"],
            feature_id,
        ),
    )
    conn.commit()
    snapshot_feature_version(conn, feature_id, str(payload.get("creator") or "系统"), "feature updated")
    log_activity(conn, "feature-update", f"更新特征 {feature_id}", str(payload.get("creator") or "系统"), "特征资产库", json.dumps(payload, ensure_ascii=False))
    conn.commit()
    updated = conn.execute("SELECT * FROM features WHERE id = ?", (feature_id,)).fetchone()
    conn.close()
    return row_to_feature(updated)


@app.delete("/api/features/{feature_id}")
def delete_feature(feature_id: str):
    conn = get_conn()
    n = conn.execute("DELETE FROM features WHERE id = ?", (feature_id,)).rowcount
    conn.commit()
    conn.close()
    if n == 0:
        raise HTTPException(status_code=404, detail="Feature not found")
    return {"success": True}


@app.get("/api/datasources")
def list_datasources(search: Optional[str] = Query(default=None)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM datasources ORDER BY id").fetchall()
    conn.close()
    items = [dict(r) for r in rows]
    if search:
        items = [x for x in items if search in x["name"]]
    return items


@app.post("/api/datasources", status_code=201)
def create_datasource(payload: Dict[str, Any]):
    name = payload.get("name")
    ds_type = payload.get("type")
    if not name or not ds_type:
        raise HTTPException(status_code=400, detail="name and type are required")
    conn = get_conn()
    ids = [r["id"] for r in conn.execute("SELECT id FROM datasources").fetchall()]
    ds_id = _next_numeric_id(ids, "DS")
    conn.execute(
        """
        INSERT INTO datasources
        (id, name, type, tables, status, latency, lastSync, coverage, host, port, database)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            ds_id,
            str(name),
            str(ds_type),
            0,
            "正常",
            "—",
            "—",
            int(payload.get("coverage") or 0),
            str(payload.get("host") or ""),
            int(payload.get("port") or 0),
            str(payload.get("database") or ""),
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/datasources/{ds_id}")
def update_datasource(ds_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    row = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="DataSource not found")
    cur = dict(row)
    for k in ["name", "type", "tables", "status", "latency", "lastSync", "coverage", "host", "port", "database"]:
        if k in payload:
            cur[k] = payload[k]
    conn.execute(
        """
        UPDATE datasources SET
            name=?, type=?, tables=?, status=?, latency=?, lastSync=?, coverage=?, host=?, port=?, database=?
        WHERE id=?
        """,
        (
            cur["name"],
            cur["type"],
            int(cur["tables"]),
            cur["status"],
            cur["latency"],
            cur["lastSync"],
            int(cur["coverage"]),
            cur["host"],
            int(cur["port"] or 0),
            cur["database"],
            ds_id,
        ),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM datasources WHERE id = ?", (ds_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/datasources/{ds_id}")
def delete_datasource(ds_id: str):
    conn = get_conn()
    n = conn.execute("DELETE FROM datasources WHERE id = ?", (ds_id,)).rowcount
    conn.commit()
    conn.close()
    if n == 0:
        raise HTTPException(status_code=404, detail="DataSource not found")
    return {"success": True}


@app.get("/api/tasks")
def list_tasks():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM tasks ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/tasks", status_code=201)
def create_task(payload: Dict[str, Any]):
    name = payload.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    conn = get_conn()
    ids = [r["id"] for r in conn.execute("SELECT id FROM tasks").fetchall()]
    task_id = _next_numeric_id(ids, "JOB")
    conn.execute(
        """
        INSERT INTO tasks (id, name, features, mode, cron, status, lastRun, duration, success)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            task_id,
            str(name),
            int(payload.get("features") or 0),
            str(payload.get("mode") or "离线"),
            str(payload.get("cron") or "每日 00:00"),
            "等待中",
            "—",
            "—",
            0,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/tasks/{task_id}")
def update_task(task_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    cur = dict(row)
    for k in ["name", "features", "mode", "cron", "status", "lastRun", "duration", "success"]:
        if k in payload:
            cur[k] = payload[k]
    conn.execute(
        """
        UPDATE tasks SET name=?, features=?, mode=?, cron=?, status=?, lastRun=?, duration=?, success=? WHERE id=?
        """,
        (
            cur["name"],
            int(cur["features"]),
            cur["mode"],
            cur["cron"],
            cur["status"],
            cur["lastRun"],
            cur["duration"],
            int(cur["success"]),
            task_id,
        ),
    )
    conn.commit()
    updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.post("/api/tasks/{task_id}/toggle")
def toggle_task(task_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    status = row["status"]
    new_status = "运行中" if status == "暂停" else "暂停"
    conn.execute("UPDATE tasks SET status = ? WHERE id = ?", (new_status, task_id))
    conn.commit()
    updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str):
    conn = get_conn()
    n = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,)).rowcount
    conn.commit()
    conn.close()
    if n == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"success": True}


@app.post("/api/tasks/{task_id}/run")
def run_task(task_id: str, payload: Optional[Dict[str, Any]] = None):
    conn = get_conn()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Task not found")
    scene = str((payload or {}).get("scene") or "全部")
    result = run_feature_processing(conn, scene=scene)
    conn.execute(
        "UPDATE tasks SET lastRun = ?, duration = ?, success = ?, features = ?, status = ? WHERE id = ?",
        (
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            f"{max(1, int(result['durationMs'] / 1000))}s",
            int(result["success"]),
            int(result["features"]),
            "运行中",
            task_id,
        ),
    )
    conn.commit()
    conn.close()
    return {"success": True, "result": result}


@app.get("/api/tasks/{task_id}/runs")
def task_runs(task_id: str):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM feature_runs ORDER BY started_at DESC LIMIT 20").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/rules")
def list_rules():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM rules ORDER BY priority ASC, id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.post("/api/rules", status_code=201)
def create_rule(payload: Dict[str, Any]):
    name = payload.get("name")
    logic = payload.get("logic")
    if not name or not logic:
        raise HTTPException(status_code=400, detail="name and logic are required")
    conn = get_conn()
    ids = [r["id"] for r in conn.execute("SELECT id FROM rules").fetchall()]
    rid = _next_numeric_id(ids, "R")
    priority = int(payload.get("priority") or (len(ids) + 1))
    logic = str(logic)
    hit_rate = float(payload.get("hitRate") or 0)
    if hit_rate <= 0:
        try:
            sim = simulate_candidate_rule(conn, logic)
            hit_rate = float(sim["hitRate"])
        except HTTPException:
            hit_rate = 0.0
    conn.execute(
        """
        INSERT INTO rules (id, name, type, logic, action, priority, status, hitRate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            rid,
            str(name),
            str(payload.get("type") or "单条规则"),
            logic,
            str(payload.get("action") or "拒绝"),
            priority,
            "测试中",
            hit_rate,
        ),
    )
    conn.commit()
    snapshot_rule_version(conn, rid, "系统", "rule created")
    log_activity(conn, "rule-create", f"新增规则 {name}", "系统", "规则挖掘", rid)
    conn.commit()
    row = conn.execute("SELECT * FROM rules WHERE id = ?", (rid,)).fetchone()
    conn.close()
    return dict(row)


@app.put("/api/rules/{rule_id}")
def update_rule(rule_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    row = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Rule not found")
    cur = dict(row)
    for k in ["name", "type", "logic", "action", "priority", "status", "hitRate"]:
        if k in payload:
            cur[k] = payload[k]
    conn.execute(
        "UPDATE rules SET name=?, type=?, logic=?, action=?, priority=?, status=?, hitRate=? WHERE id=?",
        (cur["name"], cur["type"], cur["logic"], cur["action"], int(cur["priority"]), cur["status"], float(cur["hitRate"]), rule_id),
    )
    conn.commit()
    snapshot_rule_version(conn, rule_id, "系统", "rule updated")
    log_activity(conn, "rule-update", f"更新规则 {rule_id}", "系统", "规则挖掘", json.dumps(payload, ensure_ascii=False))
    conn.commit()
    updated = conn.execute("SELECT * FROM rules WHERE id = ?", (rule_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: str):
    conn = get_conn()
    n = conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,)).rowcount
    conn.commit()
    conn.close()
    if n == 0:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"success": True}


@app.post("/api/rules/simulate")
def simulate(payload: Dict[str, Any]):
    rule_ids = payload.get("ruleIds") or []
    if not isinstance(rule_ids, list) or not rule_ids:
        raise HTTPException(status_code=400, detail="ruleIds must be non-empty list")
    conn = get_conn()
    result = simulate_rules(conn, [str(x) for x in rule_ids])
    log_activity(conn, "rule-simulate", f"执行规则仿真，规则数={len(rule_ids)}", "系统", "规则评估", ",".join([str(x) for x in rule_ids]))
    conn.commit()
    conn.close()
    return {"success": True, "result": result}


@app.get("/api/alerts")
def list_alerts():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM alerts ORDER BY id").fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.put("/api/alerts/{alert_id}")
def update_alert(alert_id: str, payload: Dict[str, Any]):
    conn = get_conn()
    row = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Alert not found")
    cur = dict(row)
    for k in ["level", "feature", "type", "detail", "time", "status"]:
        if k in payload:
            cur[k] = payload[k]
    conn.execute(
        "UPDATE alerts SET level=?, feature=?, type=?, detail=?, time=?, status=? WHERE id=?",
        (cur["level"], cur["feature"], cur["type"], cur["detail"], cur["time"], cur["status"], alert_id),
    )
    log_activity(conn, "alert-update", f"更新告警 {alert_id} 为 {cur['status']}", "系统", "监控运维", json.dumps(payload, ensure_ascii=False))
    conn.commit()
    updated = conn.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,)).fetchone()
    conn.close()
    return dict(updated)


@app.get("/api/stats")
def get_stats():
    conn = get_conn()
    features = load_features(conn)
    online = [f for f in features if f["status"] == "上线"]
    avg_iv = (sum(float(x["iv"]) for x in online) / len(online)) if online else 0
    stable = [f for f in online if float(f["psi"]) < 0.2]
    stable_ratio = (len(stable) / len(online) * 100) if online else 0
    alerts = [dict(r) for r in conn.execute("SELECT * FROM alerts").fetchall()]
    pending = [a for a in alerts if a["status"] in {"未处理", "处理中"}]
    conn.close()
    return {
        "totalFeatures": len(features),
        "avgIV": f"{avg_iv:.3f}",
        "stableRatio": f"{stable_ratio:.1f}%",
        "pendingAlerts": len(pending),
        "highPriorityAlerts": len([a for a in pending if a["level"] == "严重"]),
    }


@app.get("/api/analysis/overview")
def analysis_overview():
    conn = get_conn()
    data = build_analysis_from_cache(conn)
    conn.close()
    return data


@app.post("/api/analysis/trigger")
def trigger_analysis(payload: Optional[Dict[str, Any]] = None):
    triggered_by = str((payload or {}).get("triggered_by") or "manual")
    conn = get_conn()
    job_id = _trigger_analysis_job_db(conn, triggered_by)
    conn.commit()
    log_activity(conn, "analysis-trigger", f"触发后台分析任务 job={job_id}", "系统", "特征分析", triggered_by)
    conn.commit()
    conn.close()
    return {"jobId": job_id, "message": "后台分析任务已提交，请稍后刷新页面查看结果"}


@app.get("/api/analysis/jobs")
def list_analysis_jobs(limit: int = Query(default=20, ge=1, le=100)):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM analysis_jobs ORDER BY started_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/analysis/jobs/{job_id}")
def get_analysis_job(job_id: str):
    conn = get_conn()
    row = conn.execute("SELECT * FROM analysis_jobs WHERE id = ?", (job_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Analysis job not found")
    return dict(row)


@app.get("/api/monitoring/overview")
def monitoring_overview():
    conn = get_conn()
    data = build_monitoring(conn)
    conn.close()
    return data


@app.get("/api/dashboard/overview")
def dashboard_overview():
    conn = get_conn()
    data = build_dashboard(conn)
    conn.close()
    return data


@app.get("/api/rule-mining/overview")
def rule_mining_overview():
    conn = get_conn()
    data = mine_rules(conn, {"scene": "贷前", "algorithm": "CART决策树", "maxDepth": 4, "minSamples": 120})
    conn.close()
    return data


@app.post("/api/rule-mining/run")
def run_rule_mining(payload: Optional[Dict[str, Any]] = None):
    config = payload or {}
    conn = get_conn()
    mined = mine_rules(conn, config)
    log_activity(conn, "rule-mining-run", "执行规则挖掘任务", "系统", "规则挖掘", json.dumps(config, ensure_ascii=False))
    conn.commit()
    conn.close()
    return {
        "success": True,
        "message": "规则挖掘任务已执行",
        "result": {
            "treeData": mined["treeData"],
            "candidates": mined["candidates"],
        },
    }


@app.post("/api/feature-processing/run")
def manual_feature_run(payload: Optional[Dict[str, Any]] = None):
    scene = str((payload or {}).get("scene") or "全部")
    conn = get_conn()
    result = run_feature_processing(conn, scene=scene)
    conn.close()
    return {"success": True, "result": result}


@app.get("/api/feature-evaluation/latest")
def latest_feature_evaluation(limit: int = Query(default=20, ge=1, le=200)):
    conn = get_conn()
    rows = conn.execute(
        "SELECT * FROM feature_eval_snapshots ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [
        {
            "id": r["id"],
            "featureId": r["feature_id"],
            "featureName": r["feature_name"],
            "iv": round(float(r["iv"]), 3),
            "ks": round(float(r["ks"]), 3),
            "psi": round(float(r["psi"]), 3),
            "auc": round(float(r["auc"]), 3),
            "crossing": bool(r["crossing"]),
            "missingRate": round(float(r["missing_rate"]) * 100, 2),
            "createdAt": r["created_at"],
        }
        for r in rows
    ]


@app.get("/api/features/{feature_id}/versions")
def feature_versions(feature_id: str):
    conn = get_conn()
    rows = list_feature_versions(conn, feature_id)
    conn.close()
    return rows


@app.post("/api/features/{feature_id}/rollback")
def feature_rollback(feature_id: str, payload: Dict[str, Any]):
    version = str(payload.get("version") or "")
    actor = str(payload.get("actor") or "系统")
    if not version:
        raise HTTPException(status_code=400, detail="version is required")
    conn = get_conn()
    updated = restore_feature_version(conn, feature_id, version, actor)
    conn.commit()
    conn.close()
    return {"success": True, "feature": updated}


@app.get("/api/rules/{rule_id}/versions")
def rule_versions(rule_id: str):
    conn = get_conn()
    rows = list_rule_versions(conn, rule_id)
    conn.close()
    return rows


@app.post("/api/rules/{rule_id}/rollback")
def rule_rollback(rule_id: str, payload: Dict[str, Any]):
    version = str(payload.get("version") or "")
    actor = str(payload.get("actor") or "系统")
    if not version:
        raise HTTPException(status_code=400, detail="version is required")
    conn = get_conn()
    updated = restore_rule_version(conn, rule_id, version, actor)
    conn.commit()
    conn.close()
    return {"success": True, "rule": updated}


@app.get("/api/activities/recent")
def recent_activities(limit: int = Query(default=20, ge=1, le=200)):
    conn = get_conn()
    rows = conn.execute("SELECT * FROM activity_logs ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@app.get("/api/feature-suggestions")
def feature_suggestions(topK: int = Query(default=6, ge=1, le=20)):
    conn = get_conn()
    recs = suggest_features(conn, top_k=topK)
    log_activity(conn, "feature-recommend", f"生成智能特征建议 topK={topK}", "系统", "特征开发", "suggestions")
    conn.commit()
    conn.close()
    return {"success": True, "recommendations": recs}


@app.get("/api/rule-mining/cold-start")
def cold_start_recommendation():
    conn = get_conn()
    mined = mine_rules(conn)
    templates = mined["coldStartTemplates"]
    candidates = mined["candidates"][:2]
    payload = {
        "templates": templates,
        "recommendedCandidates": candidates,
        "principle": "全面性、从严性、可核性",
    }
    snap_id = _next_numeric_id(
        [r["id"] for r in conn.execute("SELECT id FROM recommendation_snapshots").fetchall()],
        "REC",
        width=5,
    )
    conn.execute(
        "INSERT INTO recommendation_snapshots (id, rec_type, payload, created_at) VALUES (?, ?, ?, ?)",
        (snap_id, "cold-start", json.dumps(payload, ensure_ascii=False), datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
    )
    log_activity(conn, "cold-start-recommend", "生成冷启动推荐", "系统", "规则挖掘", snap_id)
    conn.commit()
    conn.close()
    return {"success": True, **payload}


@app.post("/api/rules/optimize")
def optimize_rules(payload: Dict[str, Any]):
    objective = str(payload.get("objective") or "max_odds_improve")
    max_pass_impact = float(payload.get("maxPassImpact") or 15.0)
    min_bad_rate = float(payload.get("minBadRate") or 20.0)
    max_rules = int(payload.get("maxRules") or 3)
    conn = get_conn()
    result = optimize_rule_set(conn, objective, max_pass_impact, min_bad_rate, max_rules)
    log_activity(conn, "rule-optimize", f"完成策略优化 run={result['runId']}", "系统", "规则评估", json.dumps(result, ensure_ascii=False))
    conn.commit()
    conn.close()
    return {"success": True, "result": result}


@app.post("/api/experiments/champion-challenger")
def champion_challenger(payload: Dict[str, Any]):
    name = str(payload.get("name") or "策略对照实验")
    champion = [str(x) for x in (payload.get("championRuleIds") or [])]
    challenger = [str(x) for x in (payload.get("challengerRuleIds") or [])]
    sample_rate = float(payload.get("sampleRate") or 0.2)
    conn = get_conn()
    result = run_experiment(conn, name, champion, challenger, sample_rate)
    log_activity(conn, "experiment", f"完成策略实验 {result['id']} winner={result['winner']}", "系统", "策略实验", json.dumps(result, ensure_ascii=False))
    conn.commit()
    conn.close()
    return {"success": True, "result": result}


@app.post("/api/rule-mining/candidates/convert")
def convert_candidate_to_rule(payload: Dict[str, Any]):
    rule_expr = str(payload.get("rule") or "").strip()
    action = str(payload.get("action") or "拒绝")
    name = str(payload.get("name") or "自动转化规则")
    if not rule_expr:
        raise HTTPException(status_code=400, detail="rule is required")
    conn = get_conn()
    ids = [r["id"] for r in conn.execute("SELECT id FROM rules").fetchall()]
    rid = _next_numeric_id(ids, "R")
    priority = len(ids) + 1
    sim = simulate_candidate_rule(conn, rule_expr)
    conn.execute(
        "INSERT INTO rules (id, name, type, logic, action, priority, status, hitRate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (rid, name, "规则集(AND)", rule_expr, action, priority, "测试中", float(sim["hitRate"])),
    )
    snapshot_rule_version(conn, rid, "系统", "candidate converted")
    log_activity(conn, "candidate-convert", f"候选规则转化为{rid}", "系统", "规则挖掘", rule_expr)
    conn.commit()
    row = conn.execute("SELECT * FROM rules WHERE id = ?", (rid,)).fetchone()
    conn.close()
    return {"success": True, "rule": dict(row)}


@app.post("/api/rule-mining/candidates/simulate")
def simulate_candidate(payload: Dict[str, Any]):
    rule_expr = str(payload.get("rule") or "").strip()
    if not rule_expr:
        raise HTTPException(status_code=400, detail="rule is required")
    conn = get_conn()
    result = simulate_candidate_rule(conn, rule_expr)
    log_activity(conn, "candidate-simulate", "候选规则仿真完成", "系统", "规则评估", rule_expr)
    conn.commit()
    conn.close()
    return {"success": True, "result": result}


@app.post("/api/feature-development/preview")
def feature_preview(payload: Dict[str, Any]):
    definition = str(payload.get("definition") or payload.get("field") or "").strip()
    limit = int(payload.get("limit") or 30)
    if not definition:
        raise HTTPException(status_code=400, detail="definition is required")
    conn = get_conn()
    result = compute_feature_preview(conn, definition, max(1, min(200, limit)))
    conn.close()
    if result["stats"]["sampleCount"] == 0:
        raise HTTPException(status_code=400, detail="definition produced no valid samples")
    return {"success": True, **result}


@app.post("/api/feature-development/validate-save")
def validate_and_save_feature(payload: Dict[str, Any]):
    required = ["name", "category", "scene", "source", "definition"]
    for key in required:
        if not str(payload.get(key) or "").strip():
            raise HTTPException(status_code=400, detail=f"{key} is required")
    conn = get_conn()
    preview = compute_feature_preview(conn, str(payload["definition"]), 20)
    if preview["stats"]["sampleCount"] == 0:
        conn.close()
        raise HTTPException(status_code=400, detail="definition produced no valid samples")
    feature_payload = {
        "name": str(payload["name"]),
        "category": str(payload["category"]),
        "scene": normalize_scene(str(payload["scene"])),
        "source": str(payload["source"]),
        "desc": str(payload.get("desc") or ""),
        "creator": str(payload.get("creator") or "系统"),
        "definition": _normalize_expression(str(payload["definition"])),
        "iv": preview["stats"]["iv"],
        "psi": preview["stats"]["psi"],
    }
    conn.close()
    created = create_feature(feature_payload)
    conn = get_conn()
    log_activity(conn, "feature-validate-save", f"验证并保存特征 {created['id']}", feature_payload["creator"], "特征开发", feature_payload["definition"])
    conn.commit()
    conn.close()
    return {"success": True, "feature": created, "preview": preview}


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    conn = get_conn()
    feature_ids = [r["id"] for r in conn.execute("SELECT id FROM features").fetchall()]
    for fid in feature_ids:
        exists = conn.execute("SELECT COUNT(1) AS c FROM feature_versions WHERE feature_id = ?", (fid,)).fetchone()["c"]
        if exists == 0:
            snapshot_feature_version(conn, fid, "系统", "bootstrap snapshot")

    rule_ids = [r["id"] for r in conn.execute("SELECT id FROM rules").fetchall()]
    for rid in rule_ids:
        exists = conn.execute("SELECT COUNT(1) AS c FROM rule_versions WHERE rule_id = ?", (rid,)).fetchone()["c"]
        if exists == 0:
            snapshot_rule_version(conn, rid, "系统", "bootstrap snapshot")

    has_activity = conn.execute("SELECT COUNT(1) AS c FROM activity_logs").fetchone()["c"]
    if has_activity == 0:
        log_activity(conn, "bootstrap", "系统初始化完成", "系统", "平台概览", "startup")

    # Auto-trigger an analysis job if the stats cache is empty
    cache_count = conn.execute("SELECT COUNT(1) AS c FROM feature_stats_cache").fetchone()["c"]
    if cache_count == 0:
        pending_count = conn.execute(
            "SELECT COUNT(1) AS c FROM analysis_jobs WHERE status IN ('pending', 'running')"
        ).fetchone()["c"]
        if pending_count == 0:
            _trigger_analysis_job_db(conn, "startup")

    conn.commit()
    conn.close()



if __name__ == "__main__":
    import uvicorn

    init_db()
    uvicorn.run("main:app", host="0.0.0.0", port=3002, reload=False)
