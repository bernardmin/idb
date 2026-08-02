"""
[4] 시뮬레이션 · [5] 안전 필터 · [6] 후보 정렬  — 규칙·로직 (AI 아님)

설정온도 3단계 × 팬 속도 3단계 = 9개 조합을 모두 계산하고,
허용온도를 넘는 조합은 이유를 남기고 제외한 뒤, 남은 것을 예상 전력 순으로
정렬해 상위 2개를 변경안 ①·②로 제시합니다. (제안서 7p)

제외 사유를 반드시 기록합니다 — "왜 이 후보가 빠졌는지 항상 설명 가능"이
이 시스템의 강점입니다.
"""
from __future__ import annotations

import joblib
import numpy as np
import pandas as pd

import config as C
from preprocess import FEATURES
from train import fan_bin

STEP_MIN = 30            # 모델의 예측 지평
MAX_HORIZON_MIN = 180    # 예측을 예측에 물리므로 3시간까지만


class ZoneModels:
    """학습된 모델과 오차범위 표를 한 번만 읽어 재사용합니다."""

    def __init__(self, zone_id: str, metrics: dict):
        self.zone_id = zone_id
        bundle = joblib.load(C.MODEL_DIR / f"temp_model_{zone_id}.pkl")
        self.temp = bundle["models"]              # {지평(분): 모델}
        self.horizons = bundle["horizons"]
        self.power = joblib.load(C.MODEL_DIR / f"power_model_{zone_id}.pkl")["model"]
        self.eq = joblib.load(C.MODEL_DIR / f"eq_model_{zone_id}.pkl")
        self.sigma_table = metrics["zones"][zone_id]["sigma_table"]

        # 지평이 길수록 오차범위가 넓어집니다 (30분 기준 대비 배율)
        by_h = {r["horizon_min"]: r["rmse"] for r in metrics["zones"][zone_id]["by_horizon"]}
        base = by_h.get(30, 1.0) or 1.0
        # 지평이 길수록 오차가 커지지만, 희소구간 확대(최대 2.2배)와 겹치면
        # 밴드가 과하게 벌어져 멀쩡한 후보까지 제외됩니다. 상한을 둡니다.
        self.horizon_scale = {h: min(1.5, by_h.get(h, base) / base) for h in self.horizons}

    def sigma_for(self, load_bin: str, fan: float, horizon: int = 30) -> tuple[float, bool]:
        key = f"{load_bin}|{fan_bin(np.array([fan]))[0]}"
        cell = self.sigma_table.get(key)
        scale = self.horizon_scale.get(horizon, 1.0)
        if not cell or cell.get("sigma_eff") is None:
            return self.sigma_table["_overall"]["sigma_eff"] * scale, True
        return float(cell["sigma_eff"]) * scale, bool(cell.get("sparse"))

    def samples_for(self, load_bin: str, fan: float) -> int:
        key = f"{load_bin}|{fan_bin(np.array([fan]))[0]}"
        cell = self.sigma_table.get(key)
        return int(cell["n"]) if cell else 0


def load_bin_of(kw: float) -> str:
    for name, lo, hi in C.LOAD_BINS:
        if lo <= kw < hi:
            return name
    return "중부하"


def current_state(df: pd.DataFrame, when: str | pd.Timestamp) -> dict:
    ts = pd.Timestamp(when)
    row = df.loc[df["timestamp"] == ts]
    if row.empty:
        row = df.loc[df["timestamp"] <= ts].tail(1)
    r = row.iloc[0]
    return {
        "timestamp": str(r["timestamp"]),
        "it_power_kw": float(r["it_power_kw"]),
        "zone_temp_c": float(r["zone_temp_c"]),
        "setpoint_c": float(r["setpoint_c"]),
        "fan_speed_pct": float(r["fan_speed_pct"]),
        "outdoor_temp_c": float(r["outdoor_temp_c"]),
        "cooling_power_kw": float(r["cooling_power_kw"]),
        "facility_other_kw": float(r["facility_other_kw"]),
        "load_bin": load_bin_of(float(r["it_power_kw"])),
        "_feat": {f: float(r[f]) for f in FEATURES if f in r.index},
    }


def _expand(models: ZoneModels, state: dict, setpoint: float, fan: float) -> list[dict]:
    """
    시간축 전개: t=0 현재 → 30분 후 → 60분 후 …
    부하와 외기는 현재 수준이 유지된다고 가정합니다(운영자가 판단할 시간 범위).
    """
    base = dict(state["_feat"])
    temp = state["zone_temp_c"]

    # ── ① 아무것도 바꾸지 않았을 때의 기준 예측 (지평별 직접 예측)
    #     부하 추이·시간대 같은 일상 변화를 여기서 담당합니다.
    x_base = np.array([[base[f] for f in FEATURES]], dtype=float)

    # ── ② 설정을 바꿔서 생기는 추가분
    #     평형온도가 얼마나 움직이는지 × 그 시점까지 반응이 진행된 비율
    shift = models.eq.eq_shift(base, setpoint, fan)

    out = [{"minute": 0, "temp": round(temp, 3)}]
    for h in models.horizons:
        base_pred = temp + float(models.temp[h].predict(x_base)[0])
        frac = models.eq.response.get(h, 1.0)
        out.append({"minute": h, "temp": round(base_pred + frac * shift, 3)})

    # 전력은 즉시 반응하므로 바뀐 설정을 그대로 넣어 예측합니다.
    feat = dict(base)
    feat["setpoint_c"] = setpoint
    feat["fan_speed_pct"] = fan
    feat["temp_minus_setpoint"] = temp - setpoint
    if abs(setpoint - state["setpoint_c"]) > 1e-9:
        feat["sp_elapsed_min"] = 0.0
        feat["setpoint_prev"] = state["setpoint_c"]
        feat["sp_step"] = setpoint - state["setpoint_c"]
    if abs(fan - state["fan_speed_pct"]) > 1e-9:
        feat["fan_elapsed_min"] = 0.0
        feat["fan_prev"] = state["fan_speed_pct"]
        feat["fan_step"] = fan - state["fan_speed_pct"]
    power = float(models.power.predict(np.array([[feat[f] for f in FEATURES]], dtype=float))[0])
    return out, power


def simulate(models: ZoneModels, state: dict) -> dict:
    """9개 조합을 계산하고 안전 필터를 적용합니다."""
    sp0, fan0 = state["setpoint_c"], state["fan_speed_pct"]
    setpoints = [sp0, sp0 + C.SETPOINT_STEP, sp0 + 2 * C.SETPOINT_STEP]
    fans = [fan0, fan0 - C.FAN_STEP, fan0 - 2 * C.FAN_STEP]

    combos = []
    for sp in setpoints:
        for fan in fans:
            timeline, power = _expand(models, state, sp, fan)
            settle = timeline[-1]["temp"]
            t30 = next(p["temp"] for p in timeline if p["minute"] == 30)

            sigma30, sparse = models.sigma_for(state["load_bin"], fan, 30)
            sigma_set, _ = models.sigma_for(state["load_bin"], fan, timeline[-1]["minute"])
            band = C.CONFIDENCE_Z * sigma30          # 제안서 표기 기준(30분 후)
            band_set = C.CONFIDENCE_Z * sigma_set

            # 안전 판정은 30분 후와 안정화 시점 중 나쁜 쪽을 씁니다.
            worst = max(t30 + band, settle + band_set)
            n_samples = models.samples_for(state["load_bin"], fan)

            # 온도 상승 속도 (℃/시간) — 첫 1시간 기준
            rise_rate = (timeline[2]["temp"] - timeline[0]["temp"]) if len(timeline) > 2 else 0.0

            reasons: list[str] = []
            if worst > C.TEMP_LIMIT_C:
                reasons.append(
                    f"상한 초과 — 30분 후 {t30:.1f}±{band:.1f}℃ · "
                    f"안정화 {settle:.1f}±{band_set:.1f}℃, "
                    f"최악 {worst:.1f}℃ > 허용 {C.TEMP_LIMIT_C:.1f}℃"
                )
            if rise_rate > C.RISE_RATE_LIMIT:
                reasons.append(f"급상승 — {rise_rate:.2f}℃/시간 > {C.RISE_RATE_LIMIT:.2f}℃/시간")

            warnings: list[str] = []
            if n_samples < C.MIN_MATCH_SAMPLES:
                warnings.append(f"데이터 부족 — 유사 구간 {n_samples}건 < {C.MIN_MATCH_SAMPLES}건")
            elif sparse:
                warnings.append(f"표본 적음 — 유사 구간 {n_samples:,}건, 오차범위를 넓게 적용")

            is_current = abs(sp - sp0) < 1e-9 and abs(fan - fan0) < 1e-9
            if reasons:
                verdict = "제외"
            elif is_current:
                verdict = "현재 운전"
            elif warnings:
                verdict = "추가 확인"
            else:
                verdict = "후보"

            combos.append({
                "setpoint_c": round(sp, 2),
                "fan_speed_pct": round(fan, 1),
                "expected_temp_c": round(t30, 2),
                "settle_temp_c": round(settle, 2),
                "settle_band_c": round(band_set, 2),
                "settle_minute": timeline[-1]["minute"],
                "band_c": round(band, 2),
                "worst_temp_c": round(worst, 2),
                "expected_cooling_kw": round(power, 2),
                "delta_cooling_kw": round(power - state["cooling_power_kw"], 2),
                "rise_rate_c_per_h": round(rise_rate, 2),
                "samples": n_samples,
                "verdict": verdict,
                "is_current": is_current,
                "exclude_reasons": reasons,
                "warnings": warnings,
                "timeline": timeline,
            })

    # ── 후보 정렬
    #  제안서 8p는 "0.5℃ 올림 → 30분 대기 → 확인 → 초과 시 복귀"의 단계적
    #  탐색을 원칙으로 둡니다. 그래서 변경안①은 '한 단계(설정 +0.5℃) 안에서
    #  전력이 가장 낮은 후보'로 뽑고, 변경안②는 그 다음을 제시합니다.
    #  전력만으로 정렬하면 한 번에 +1.0℃를 올리는 안이 1순위가 되어
    #  단계적 적용 원칙과 어긋납니다.
    eligible = [c for c in combos if c["verdict"] in ("후보", "추가 확인")]
    eligible.sort(key=lambda c: c["expected_cooling_kw"])

    one_step = [c for c in eligible
                if abs(c["setpoint_c"] - sp0) <= C.SETPOINT_STEP + 1e-9
                and abs(c["fan_speed_pct"] - fan0) <= C.FAN_STEP + 1e-9
                and not c["is_current"]]
    proposals: list[dict] = []
    if one_step:
        proposals.append(one_step[0])
    for c in eligible:
        if len(proposals) >= 2:
            break
        if c is not proposals[0] if proposals else True:
            if c not in proposals:
                proposals.append(c)
    for i, c in enumerate(proposals):
        c["proposal_rank"] = i + 1

    return {
        "state": {k: v for k, v in state.items() if k != "_feat"},
        "combos": combos,
        "proposals": proposals,
        "excluded": [c for c in combos if c["verdict"] == "제외"],
        "temp_limit_c": C.TEMP_LIMIT_C,
    }


# ─────────────────────────────────────────────────────────────
# [제안서 8p] 과거 사례 매칭
# ─────────────────────────────────────────────────────────────
def history_match(df: pd.DataFrame, state: dict, days: int = 60,
                  band_kw: float = 5.0) -> dict:
    ts = pd.Timestamp(state["timestamp"])
    load = state["it_power_kw"]
    sp_now = state["setpoint_c"]
    sp_next = sp_now + C.SETPOINT_STEP

    hist = df[(df["timestamp"] < ts)
              & (df["timestamp"] >= ts - pd.Timedelta(days=days))
              & (df["usable"] == True)]                                # noqa: E712

    used_band = band_kw
    while used_band <= 25:
        m = hist[(hist["it_power_kw"] >= load - used_band)
                 & (hist["it_power_kw"] <= load + used_band)]
        a = m[np.isclose(m["setpoint_c"], sp_now)]
        b = m[np.isclose(m["setpoint_c"], sp_next)]
        if len(a) >= C.MIN_MATCH_SAMPLES and len(b) >= C.MIN_MATCH_SAMPLES:
            break
        used_band += 5.0

    if len(a) < C.MIN_MATCH_SAMPLES or len(b) < C.MIN_MATCH_SAMPLES:
        return {"enough": False, "band_kw": used_band,
                "matched_minutes": int(len(m)) if len(m) else 0}

    ta, tb = float(a["zone_temp_c"].mean()), float(b["zone_temp_c"].mean())
    delta = tb - ta
    return {
        "enough": True,
        "days": days,
        "band_kw": used_band,
        "load_lo": round(load - used_band, 1),
        "load_hi": round(load + used_band, 1),
        "matched_minutes": int(len(m)),
        "matched_hours": round(len(m) / 60.0, 1),
        "group_a": {"setpoint_c": sp_now, "hours": round(len(a) / 60.0, 1),
                    "mean_temp_c": round(ta, 2)},
        "group_b": {"setpoint_c": sp_next, "hours": round(len(b) / 60.0, 1),
                    "mean_temp_c": round(tb, 2), "std_temp_c": round(float(b["zone_temp_c"].std()), 2)},
        "delta_c": round(delta, 2),
        "current_temp_c": round(state["zone_temp_c"], 2),
        "expected_temp_c": round(state["zone_temp_c"] + delta, 2),
    }


def pue_of(it_kw: float, cooling_kw: float, other_kw: float) -> dict:
    """운영 PUE = 전체 시설 에너지 ÷ IT 에너지 (제안서 13p)"""
    total = it_kw + cooling_kw + other_kw
    return {
        "pue": round(total / it_kw, 3),
        "partial_pue": round((it_kw + cooling_kw) / it_kw, 3),   # 측정경계 미확보 시
        "it_kw": round(it_kw, 1),
        "cooling_kw": round(cooling_kw, 1),
        "other_kw": round(other_kw, 1),
        "total_kw": round(total, 1),
    }


if __name__ == "__main__":
    import json

    metrics = json.loads((C.MODEL_DIR / "metrics.json").read_text(encoding="utf-8"))
    df = pd.read_csv(C.DATA_DIR / "clean_zone1.csv", parse_dates=["timestamp"])
    models = ZoneModels("zone1", metrics)

    st = current_state(df, C.DEMO_NOW)
    res = simulate(models, st)

    print(f"[시뮬] 기준 {st['timestamp']}  부하 {st['it_power_kw']:.0f}kW  "
          f"온도 {st['zone_temp_c']:.1f}℃  설정 {st['setpoint_c']}℃  팬 {st['fan_speed_pct']:.0f}%")
    print(f"       허용온도 {C.TEMP_LIMIT_C}℃\n")
    print(f"  {'설정':>6} {'팬':>5} {'예상온도':>12} {'최악':>7} {'냉각kW':>8} {'판정':>9}  사유")
    for c in res["combos"]:
        why = (c["exclude_reasons"] + c["warnings"])
        print(f"  {c['setpoint_c']:>5.1f}℃ {c['fan_speed_pct']:>4.0f}% "
              f"{c['expected_temp_c']:>7.2f}±{c['band_c']:.2f}℃ {c['worst_temp_c']:>6.2f} "
              f"{c['expected_cooling_kw']:>8.2f} {c['verdict']:>9}  {why[0] if why else ''}")

    print("\n[변경안]")
    for i, p in enumerate(res["proposals"], 1):
        print(f"  ①② {i}: 설정 {p['setpoint_c']}℃ · 팬 {p['fan_speed_pct']:.0f}% → "
              f"예상 {p['expected_temp_c']:.1f} ± {p['band_c']:.1f}℃, "
              f"냉각 {p['delta_cooling_kw']:+.2f}kW")

    hm = history_match(df, st)
    print("\n[과거 사례]", json.dumps(hm, ensure_ascii=False))
