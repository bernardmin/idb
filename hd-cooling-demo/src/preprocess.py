"""
전처리 — 결함 구간 제외 + 지연 반응 학습용 lag feature 생성

지연(시상수 22분)을 모델이 배우려면 lag feature가 반드시 필요합니다.
없으면 정확도가 나오지 않습니다. (인수인계서 4.1)

실행:  python src/preprocess.py
출력:  data/clean_zone1.csv, data/clean_zone2.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import config as C
from diagnose import find_spike, find_stuck, load_raw, to_full_grid

HORIZON_MIN = 30          # 제안서 7p의 기준 지평 (성능 지표는 이 값으로 산출)

# 예측을 예측에 물리면 오차가 누적됩니다(인수인계서 5.2).
# 각 지평을 '직접' 예측하는 모델을 따로 두어 재귀를 없앱니다.
HORIZONS = [30, 60, 90, 120]

FEATURES = [
    "it_power_kw",
    "zone_temp_c",
    "setpoint_c",
    "fan_speed_pct",
    "outdoor_temp_c",
    "hour",
    "dayofweek",
    "it_ma15",
    "it_ma30",
    "temp_lag15",
    "temp_rate15",
    "sp_elapsed_min",
    "fan_elapsed_min",
    "sp_step",           # 마지막 설정 변경의 크기 (+0.5 / -0.5 …)
    "fan_step",
    "setpoint_prev",
    "fan_prev",
    # ★ 평형에서 얼마나 벗어나 있는가 — 모든 행에 존재하는 밀도 높은 신호.
    #   설정을 올린 직후에는 이 값이 평소보다 작아지고, 온도는 그만큼 오릅니다.
    #   sp_elapsed_min=0 인 행은 9만 행 중 250행뿐이라 그것만으로는 부족합니다.
    "temp_minus_setpoint",
    "temp_minus_lag15",
]

TARGET_TEMP = "target_temp_delta"     # 30분 후 온도 - 현재 온도
TARGET_TEMP_ABS = "target_temp_c"     # 30분 후 온도 (표시·검증용)
TARGET_POWER = "target_cooling_kw"


def _elapsed_since_change(values: pd.Series) -> np.ndarray:
    """설정값이 마지막으로 바뀐 뒤 경과한 분. 지연 반응의 핵심 단서입니다."""
    v = values.to_numpy()
    changed = np.r_[True, v[1:] != v[:-1]]
    idx = np.arange(v.size)
    last = np.maximum.accumulate(np.where(changed, idx, 0))
    return (idx - last).astype(float)


def _prev_value_before_change(values: pd.Series) -> np.ndarray:
    """
    직전 변경 이전의 값. 모델이 '어디에서 어디로 바뀌었는지'를 알아야
    같은 설정값이라도 올라가는 중인지 내려가는 중인지 구분할 수 있습니다.
    이 feature가 없으면 22.0→22.5 와 23.0→22.5 가 뒤섞여 반응이 상쇄됩니다.
    """
    v = values.to_numpy()
    prev = np.empty_like(v)
    prev[0] = v[0]
    last_val = v[0]
    for i in range(1, v.size):
        if v[i] != v[i - 1]:
            last_val = v[i - 1]
        prev[i] = last_val
    return prev


def build_features(zone_id: str) -> pd.DataFrame:
    raw = load_raw(zone_id)
    df = to_full_grid(raw)
    ts = df["timestamp"]

    # ── 분석 대상에서 제외할 구간 (진단 단계와 같은 규칙)
    f_outage = df["it_power_kw"].isna().to_numpy()
    f_missing = df["zone_temp_c"].isna().to_numpy() & ~f_outage
    f_stuck = find_stuck(df["zone_temp_c"].ffill()) & ~f_outage
    f_spike = find_spike(df["zone_temp_c"].ffill()) & ~f_outage
    f_bad_mode = df["op_mode"].isin(["maintenance", "manual"]).to_numpy()
    df["usable"] = ~(f_outage | f_missing | f_stuck | f_spike | f_bad_mode)

    # ── 시간축은 채워두되, 값은 채워 넣지 않습니다(가짜 데이터 방지).
    df["setpoint_c"] = df["setpoint_c"].ffill()
    df["fan_speed_pct"] = df["fan_speed_pct"].ffill()

    df["hour"] = ts.dt.hour + ts.dt.minute / 60.0
    df["dayofweek"] = ts.dt.dayofweek

    df["it_ma15"] = df["it_power_kw"].rolling(15, min_periods=5).mean()
    df["it_ma30"] = df["it_power_kw"].rolling(30, min_periods=10).mean()
    df["temp_lag15"] = df["zone_temp_c"].shift(15)
    df["temp_rate15"] = (df["zone_temp_c"] - df["temp_lag15"]) / 15.0 * 60.0   # ℃/시간

    df["sp_elapsed_min"] = _elapsed_since_change(df["setpoint_c"])
    df["fan_elapsed_min"] = _elapsed_since_change(df["fan_speed_pct"])

    df["setpoint_prev"] = _prev_value_before_change(df["setpoint_c"])
    df["fan_prev"] = _prev_value_before_change(df["fan_speed_pct"])
    df["temp_minus_setpoint"] = df["zone_temp_c"] - df["setpoint_c"]
    df["temp_minus_lag15"] = df["zone_temp_c"] - df["temp_lag15"]
    df["sp_step"] = df["setpoint_c"] - df["setpoint_prev"]
    df["fan_step"] = df["fan_speed_pct"] - df["fan_prev"]

    # ── 타깃: 30분 후
    for h in HORIZONS:
        # 그 지평 동안 설정이 그대로 유지됐는가 — 중간에 되돌린 구간을 쓰면
        # 응답 크기가 희석됩니다.
        df[f"hold_{h}"] = (
            (df["setpoint_c"].shift(-h) == df["setpoint_c"])
            & (df["fan_speed_pct"].shift(-h) == df["fan_speed_pct"])
        ).fillna(False)
        abs_col = f"target_temp_c_{h}"
        df[abs_col] = df["zone_temp_c"].shift(-h)
        df[f"target_temp_delta_{h}"] = df[abs_col] - df["zone_temp_c"]
    df[TARGET_TEMP_ABS] = df[f"target_temp_c_{HORIZON_MIN}"]
    df[TARGET_TEMP] = df[f"target_temp_delta_{HORIZON_MIN}"]
    df[TARGET_POWER] = df["cooling_power_kw"]

    # 타깃 시점도 정상 운전이어야 학습에 씁니다.
    usable_future = pd.Series(df["usable"]).shift(-HORIZON_MIN).fillna(False).to_numpy()
    df["trainable"] = df["usable"] & usable_future

    # ── 구간 분할 (시간 순서 유지 · shuffle 금지)
    day = (ts - ts.iloc[0]).dt.total_seconds() / 86400.0
    split = np.where(day < C.TRAIN_DAYS, "train",
             np.where(day < C.TRAIN_DAYS + C.VALID_DAYS, "valid", "replay"))
    df["split"] = split

    # 부하 구간
    bins = pd.Series("중부하", index=df.index)
    for name, lo, hi in C.LOAD_BINS:
        bins[(df["it_power_kw"] >= lo) & (df["it_power_kw"] < hi)] = name
    df["load_bin"] = bins

    df["pue"] = (
        (df["it_power_kw"] + df["cooling_power_kw"] + df["facility_other_kw"])
        / df["it_power_kw"]
    )
    return df


def main() -> None:
    for zone_id in C.ZONES:
        df = build_features(zone_id)
        out = C.DATA_DIR / f"clean_{zone_id}.csv"
        df.to_csv(out, index=False, float_format="%.4f")

        ok = df["trainable"] & df[TARGET_TEMP].notna()
        label = C.ZONES[zone_id]["label"]
        print(f"[전처리] {label}: 전체 {len(df):,}행 → 학습 가능 {int(ok.sum()):,}행 "
              f"({ok.mean()*100:.1f}%)")
        for s in ("train", "valid", "replay"):
            m = ok & (df["split"] == s)
            print(f"           {s:7s} {int(m.sum()):>7,}행")
        print(f"           → {out.name}")


if __name__ == "__main__":
    main()
