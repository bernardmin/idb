"""
화면용 데이터 생성 — static/data.js

모델 추론을 미리 끝내 결과만 굽습니다. 화면에서는 계산하지 않으므로
발표 중 즉시 반응하고, 서버 없이 index.html 더블클릭만으로도 동작합니다.

실행:  python src/export_web.py
출력:  static/data.js  (window.DEMO_DATA = {...})
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config as C
from preprocess import FEATURES
from simulate import (ZoneModels, current_state, history_match, load_bin_of,
                      pue_of, simulate)

REPLAY_STEP_MIN = 10          # 재생용 다운샘플 간격


def _f(x, n=2):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)


def load_zone(zone_id: str) -> pd.DataFrame:
    return pd.read_csv(C.DATA_DIR / f"clean_{zone_id}.csv", parse_dates=["timestamp"])


# ─────────────────────────────────────────────────────────────
# 탭 2 — 운전 분석 (현재 운전 기준)
# ─────────────────────────────────────────────────────────────
def build_baseline(df: pd.DataFrame, metrics_zone: dict) -> dict:
    now = pd.Timestamp(C.DEMO_NOW)
    day = df[(df["timestamp"] > now - pd.Timedelta(hours=24)) & (df["timestamp"] <= now)]
    day = day.iloc[::5]

    series = [{
        "t": r["timestamp"].strftime("%H:%M"),
        "load": _f(r["it_power_kw"], 1),
        "sp": _f(r["setpoint_c"], 1),
        "temp": _f(r["zone_temp_c"], 2),
        "fan": _f(r["fan_speed_pct"], 0),
        "cool": _f(r["cooling_power_kw"], 1),
    } for _, r in day.iterrows()]

    # 부하는 오르내리는데 설정은 평평한 구간 (제안서 4p의 핵심 논리)
    flat = []
    if len(day) > 6:
        sp = day["setpoint_c"].to_numpy()
        load = day["it_power_kw"].to_numpy()
        win = 6
        for i in range(len(day) - win):
            if np.all(sp[i:i + win] == sp[i]) and (load[i:i + win].max() - load[i:i + win].min()) > 12:
                flat.append(i)
    flat_ranges = []
    if flat:
        start = prev = flat[0]
        for i in flat[1:]:
            if i - prev > 2:
                flat_ranges.append([start, prev + 6])
                start = i
            prev = i
        flat_ranges.append([start, prev + 6])

    usable = df[df["usable"] == True]                                  # noqa: E712
    by_bin = []
    for name, lo, hi in C.LOAD_BINS:
        g = usable[(usable["it_power_kw"] >= lo) & (usable["it_power_kw"] < hi)]
        if len(g) < 100:
            continue
        by_bin.append({
            "bin": name,
            "hours": _f(len(g) / 60.0, 0),
            "load": _f(g["it_power_kw"].mean(), 1),
            "temp": _f(g["zone_temp_c"].mean(), 2),
            "sp": _f(g["setpoint_c"].mean(), 2),
            "fan": _f(g["fan_speed_pct"].mean(), 1),
            "cool": _f(g["cooling_power_kw"].mean(), 1),
            "pue": _f(((g["it_power_kw"] + g["cooling_power_kw"] + g["facility_other_kw"])
                       / g["it_power_kw"]).mean(), 3),
            "headroom": _f(C.TEMP_LIMIT_C - g["zone_temp_c"].mean(), 2),
        })

    sp_dist = [{"sp": _f(k, 1), "hours": _f(v / 60.0, 0)}
               for k, v in sorted(usable["setpoint_c"].value_counts().items())]

    step = metrics_zone.get("step_response", {})
    return {
        "series_24h": series,
        "flat_ranges": flat_ranges,
        "by_load_bin": by_bin,
        "setpoint_hours": sp_dist,
        "step_response": {
            "n_events": step.get("n_events"),
            "tau_min": step.get("tau_min"),
            "gain_per_setpoint_c": step.get("gain_per_setpoint_c"),
            "curve": step.get("curve", []),
            "curve_step_min": step.get("curve_step_min", 5),
        },
    }


# ─────────────────────────────────────────────────────────────
# 탭 5 — 운영 대시보드 / 데모 재생
# ─────────────────────────────────────────────────────────────
def build_replay(dfs: dict[str, pd.DataFrame]) -> dict:
    z1 = dfs["zone1"]
    start = pd.Timestamp(C.DEMO_NOW) - pd.Timedelta(days=C.REPLAY_DAYS)
    frames = {}
    for zid, df in dfs.items():
        d = df[(df["timestamp"] >= start) & (df["timestamp"] <= pd.Timestamp(C.DEMO_NOW))]
        d = d.iloc[::REPLAY_STEP_MIN]
        frames[zid] = [{
            "t": r["timestamp"].strftime("%m-%d %H:%M"),
            "load": _f(r["it_power_kw"], 1),
            "temp": _f(r["zone_temp_c"], 2),
            "sp": _f(r["setpoint_c"], 1),
            "fan": _f(r["fan_speed_pct"], 0),
            "cool": _f(r["cooling_power_kw"], 1),
            "out": _f(r["outdoor_temp_c"], 1),
            "pue": _f((r["it_power_kw"] + r["cooling_power_kw"] + r["facility_other_kw"])
                      / r["it_power_kw"], 3),
        } for _, r in d.iterrows()]
    return {"step_min": REPLAY_STEP_MIN, "frames": frames}


# ─────────────────────────────────────────────────────────────
# [7] 사전 검증 — 설정을 바꾸지 않고 예측만 대조
# ─────────────────────────────────────────────────────────────
def build_shadow(df: pd.DataFrame, models: ZoneModels) -> dict:
    rep = df[(df["split"] == "replay") & (df["trainable"] == True)]     # noqa: E712
    rep = rep[rep[FEATURES].notna().all(axis=1)]
    if rep.empty:
        return {"days": 0, "n": 0}

    X = rep[FEATURES].to_numpy()
    pred = rep["zone_temp_c"].to_numpy() + models.temp[30].predict(X)
    actual = rep["target_temp_c_30"].to_numpy()
    ok = ~np.isnan(actual)
    err = pred[ok] - actual[ok]

    daily = []
    rep2 = rep.loc[ok].copy()
    rep2["_err"] = err
    for day, g in rep2.groupby(rep2["timestamp"].dt.date):
        daily.append({
            "date": str(day)[5:],
            "n": int(len(g)),
            "within_1c": _f((g["_err"].abs() <= 1.0).mean(), 4),
            "mae": _f(g["_err"].abs().mean(), 3),
        })

    over = int((rep2["zone_temp_c"] > C.TEMP_LIMIT_C).sum())
    return {
        "days": len(daily),
        "n": int(ok.sum()),
        "within_1c": _f(float((np.abs(err) <= 1.0).mean()), 4),
        "mae": _f(float(np.abs(err).mean()), 3),
        "limit_exceed_minutes": over,
        "daily": daily,
        "pass_within_1c": bool((np.abs(err) <= 1.0).mean() >= C.PASS_WITHIN_1C),
        "pass_no_exceed": bool(over == 0),
    }


# ─────────────────────────────────────────────────────────────
# 시나리오 — 발표용 버튼
# ─────────────────────────────────────────────────────────────
def pick_scenarios(df: pd.DataFrame) -> list[dict]:
    rep = df[(df["split"] == "replay") & (df["usable"] == True)]        # noqa: E712
    out = []

    def add(key, label, sub, row):
        if row is not None and len(row):
            out.append({"key": key, "label": label, "sub": sub,
                        "timestamp": str(row.iloc[0]["timestamp"])})

    night = rep[(rep["timestamp"].dt.hour.isin([2, 3, 4])) & (rep["it_power_kw"] < 150)]
    add("night", "① 저부하 야간", "부하가 낮은데 냉방은 그대로인 시간",
        night.sort_values("it_power_kw").head(1))

    peak = rep[rep["timestamp"].dt.hour.between(13, 16)]
    add("peak", "② 고부하 피크", "부하가 가장 높은 시간",
        peak.sort_values("it_power_kw", ascending=False).head(1))

    hot = rep.sort_values("outdoor_temp_c", ascending=False).head(1)
    add("hot", "③ 외기 급상승", "외기온도가 가장 높은 시간", hot)

    warm = rep.sort_values("zone_temp_c", ascending=False).head(1)
    add("warm", "④ 구역 온도 최고", "허용온도에 가장 근접했던 시간", warm)
    return out


# ─────────────────────────────────────────────────────────────
def main() -> None:
    metrics = json.loads((C.MODEL_DIR / "metrics.json").read_text(encoding="utf-8"))
    diagnosis = json.loads((C.REPORT_DIR / "diagnosis_report.json").read_text(encoding="utf-8"))

    dfs = {zid: load_zone(zid) for zid in C.ZONES}
    models = {zid: ZoneModels(zid, metrics) for zid in C.ZONES}

    print("[화면] 시뮬레이션 사전 계산 중…")
    sims = {}
    for zid, df in dfs.items():
        st = current_state(df, C.DEMO_NOW)
        sims[zid] = {
            "now": simulate(models[zid], st),
            "history": history_match(df, st),
        }

    scenarios = []
    for sc in pick_scenarios(dfs["zone1"]):
        st = current_state(dfs["zone1"], sc["timestamp"])
        res = simulate(models["zone1"], st)
        res["history"] = history_match(dfs["zone1"], st)
        scenarios.append({**sc, "result": res})
    print(f"        시나리오 {len(scenarios)}개")

    now_rows = {zid: current_state(dfs[zid], C.DEMO_NOW) for zid in C.ZONES}
    pue_now = {zid: pue_of(s["it_power_kw"], s["cooling_power_kw"], s["facility_other_kw"])
               for zid, s in now_rows.items()}

    data = {
        "meta": {
            "title": "HD현대중공업 데이터센터 냉각 최적화 · PUE 개선 운영지능 시스템",
            "subtitle": "서버 부하·온도·냉각설정값 기반의 단계형 냉각 최적화 PoC",
            "vendor": "IDB Inc.",
            "now": C.DEMO_NOW,
            "period": [C.START, str(dfs["zone1"]["timestamp"].iloc[-1])],
            "days": C.DAYS,
            "temp_limit_c": C.TEMP_LIMIT_C,
            "zones": {z: {"label": v["label"], "role": v["role"]} for z, v in C.ZONES.items()},
            "disclaimer": "개념 예시 · 실제 데이터 아님 — 실제 조정 폭과 상한은 데이터 진단과 운영기준 확인 후 확정합니다.",
            "thresholds": {
                "data_ratio": C.PASS_DATA_RATIO,
                "within_1c": C.PASS_WITHIN_1C,
                "temp_limit_c": C.TEMP_LIMIT_C,
            },
            "pipeline": [
                {"n": 1, "name": "데이터 진단", "kind": "규칙·통계", "desc": "결측·고정값·정비구간 제외"},
                {"n": 2, "name": "모델 학습", "kind": "AI", "desc": "과거 80% 학습 / 20% 검증"},
                {"n": 3, "name": "정확도 확인", "kind": "통계", "desc": "오차 ±1℃ 이내 비율 측정"},
                {"n": 4, "name": "시뮬레이션", "kind": "로직", "desc": "조합 9개 × 시간축 전개"},
                {"n": 5, "name": "안전 필터", "kind": "규칙", "desc": "상한 초과·급상승 후보 제외"},
                {"n": 6, "name": "후보 정렬", "kind": "로직", "desc": "예상 전력 낮은 순 제시"},
                {"n": 7, "name": "사전 검증", "kind": "비교", "desc": "예측값과 실제값 대조"},
                {"n": 8, "name": "재학습", "kind": "AI", "desc": "쌓인 결과를 학습에 반영"},
            ],
        },
        "diagnosis": diagnosis,
        "baseline": {zid: build_baseline(dfs[zid], metrics["zones"][zid]) for zid in C.ZONES},
        "metrics": metrics,
        "simulation": sims,
        "scenarios": scenarios,
        "replay": build_replay(dfs),
        "shadow": {zid: build_shadow(dfs[zid], models[zid]) for zid in C.ZONES},
        "pue_now": pue_now,
    }

    out = C.STATIC_DIR / "data.js"
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    out.write_text("window.DEMO_DATA = " + payload + ";\n", encoding="utf-8")
    print(f"[화면] 완료 → {out}  ({out.stat().st_size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
