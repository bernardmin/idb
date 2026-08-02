"""
[생성] 90일 1분 단위 가상 운전 데이터 (구역 2개)

인수인계서 3장 구현. 실제 계측 데이터가 아니라, 부하–온도–설정–전력의
관계를 재현한 개념 예시 데이터입니다.

실행:  python src/generate_data.py
출력:  data/raw_zone1.csv, data/raw_zone2.csv
"""
from __future__ import annotations

import numpy as np
import pandas as pd

import config as C


# ─────────────────────────────────────────────────────────────
# 보조
# ─────────────────────────────────────────────────────────────
def _ar1_noise(n: int, std: float, rho: float, rng: np.random.Generator) -> np.ndarray:
    """자기상관이 있는 노이즈(AR(1)). white noise를 쓰면 부하가 톱니처럼 보입니다."""
    innov = rng.normal(0.0, std * np.sqrt(1.0 - rho**2), n)
    out = np.empty(n)
    out[0] = rng.normal(0.0, std)
    for i in range(1, n):
        out[i] = rho * out[i - 1] + innov[i]
    return out


def _first_order_lag(target: np.ndarray, tau_min: float, dt_min: float) -> np.ndarray:
    """1차 지연.  temp[t] = temp[t-1] + alpha * (target[t] - temp[t-1])"""
    alpha = 1.0 - np.exp(-dt_min / tau_min)
    out = np.empty_like(target)
    prev = target[0]
    out[0] = prev
    for i in range(1, target.size):
        prev = prev + alpha * (target[i] - prev)
        out[i] = prev
    return out


def _step_schedule(
    n: int, values, weights, rng: np.random.Generator,
    min_block_min: int, max_block_min: int,
) -> np.ndarray:
    """계단형 설정값 시계열. 운영자가 가끔 바꾸는 모습을 재현합니다."""
    out = np.empty(n)
    idx = 0
    prev = None
    while idx < n:
        length = int(rng.integers(min_block_min, max_block_min))
        pick = rng.choice(len(values), p=np.asarray(weights, dtype=float))
        val = values[pick]
        if val == prev and rng.random() < 0.7:      # 같은 값이 계속 이어지지 않도록
            pick = rng.choice(len(values), p=np.asarray(weights, dtype=float))
            val = values[pick]
        out[idx: idx + length] = val
        prev = val
        idx += length
    return out[:n]


def _smooth_window(n: int, center: int, half_width: int) -> np.ndarray:
    """center 부근에서 1, 바깥에서 0으로 부드럽게 떨어지는 가중치."""
    x = np.arange(n, dtype=float)
    d = np.abs(x - center) / max(half_width, 1)
    w = np.clip(1.0 - d, 0.0, 1.0)
    return w * w * (3.0 - 2.0 * w)                  # smoothstep


# ─────────────────────────────────────────────────────────────
# 구성 요소
# ─────────────────────────────────────────────────────────────
def build_outdoor_temp(ts: pd.DatetimeIndex, rng: np.random.Generator) -> np.ndarray:
    """외기온도: 계절 추세 + 일주기 + 완만한 노이즈 (5월~8월 한국 기준)."""
    doy = ts.dayofyear.to_numpy(dtype=float)
    hour = ts.hour.to_numpy(dtype=float) + ts.minute.to_numpy(dtype=float) / 60.0

    seasonal = 19.0 + 8.0 * np.sin(2 * np.pi * (doy - 110) / 365.0)
    diurnal = 4.5 * np.sin(2 * np.pi * (hour - 9.0) / 24.0)
    return seasonal + diurnal + _ar1_noise(ts.size, 1.2, 0.999, rng)


def build_it_power(
    ts: pd.DatetimeIndex, base_kw: float, rng: np.random.Generator
) -> np.ndarray:
    """IT 부하 — 모든 분석의 기준 데이터."""
    n = ts.size
    hour = ts.hour.to_numpy(dtype=float) + ts.minute.to_numpy(dtype=float) / 60.0
    dow = ts.dayofweek.to_numpy()

    # 일주기: 업무시간(09~18) 가산, 야간 감산. 사인파로 부드럽게.
    shape = np.sin(np.pi * np.clip((hour - 6.0) / 14.0, 0.0, 1.0))
    diurnal = C.LOAD_DIURNAL_KW * shape - C.LOAD_NIGHT_KW * (1.0 - shape)

    weekend = dow >= 5
    weekly = np.where(weekend, -C.LOAD_WEEKEND_KW, C.LOAD_WEEKDAY_KW)

    noise = (_ar1_noise(n, C.LOAD_NOISE_KW, 0.9990, rng)
             + _ar1_noise(n, C.LOAD_NOISE_KW * 0.55, 0.985, rng))

    # 배치 작업 스파이크: 주 2~3회, 2~4시간
    batch = np.zeros(n)
    n_batch = int(C.DAYS / 7 * 2.5)
    for _ in range(n_batch):
        start = int(rng.integers(0, max(n - 300, 1)))
        length = int(rng.integers(120, 240))
        ramp = np.hanning(min(length, n - start))
        batch[start: start + ramp.size] += C.LOAD_BATCH_KW * ramp

    return base_kw + diurnal + weekly + noise + batch


def build_zone(
    ts: pd.DatetimeIndex, zone_id: str, outdoor: np.ndarray, rng: np.random.Generator
) -> pd.DataFrame:
    n = ts.size
    meta = C.ZONES[zone_id]

    it_power = build_it_power(ts, meta["base_kw"], rng)

    # 조작 변수: 대부분 고정, 가끔 운영자가 변경
    setpoint = _step_schedule(
        n, C.SETPOINT_VALUES, C.SETPOINT_WEIGHTS, rng,
        min_block_min=3 * 60, max_block_min=24 * 60,
    )
    fan = _step_schedule(
        n, C.FAN_VALUES, C.FAN_WEIGHTS, rng,
        min_block_min=3 * 60, max_block_min=18 * 60,
    )

    # ── 목표 정상상태 온도 (config의 검산 주석 참조)
    disturb = (_ar1_noise(n, C.DISTURB_STD, C.DISTURB_RHO, rng)
               + _ar1_noise(n, C.DISTURB_FAST_STD, C.DISTURB_FAST_RHO, rng))
    temp_target = C.temp_steady_state(setpoint, it_power, fan, outdoor) + disturb

    # ── 랙별 온도 → 구역 대표온도는 '가장 더운 지점' (제안서 7p)
    rack_temps = []
    for r in range(C.RACKS_PER_ZONE):
        rack_target = temp_target + C.RACK_OFFSETS[r]
        rack = _first_order_lag(rack_target, C.TAU_MIN, C.FREQ_MIN)
        rack = rack + rng.normal(0.0, C.RACK_NOISE_STD, n)
        rack_temps.append(rack)
    rack_arr = np.vstack(rack_temps)
    zone_temp = rack_arr.max(axis=0)

    # ── 컴프레서: 온도가 목표보다 높으면 가동 (히스테리시스 근사)
    deviation = zone_temp - (setpoint + C.TEMP_BASE_OFFSET)
    comp_on = (deviation > 0.55).astype(int)

    cooling = (
        C.COOL_BASE
        + C.COOL_IT_COEF * it_power
        + C.COOL_SP_COEF * np.maximum(0.0, C.COOL_SP_REF - setpoint)
        + C.COOL_FAN_COEF * (fan - C.COOL_FAN_REF)
        + C.COOL_OUT_COEF * np.maximum(0.0, outdoor - C.COOL_OUT_REF)
        + comp_on * C.COOL_COMP_KW
        + rng.normal(0.0, C.COOL_NOISE_STD, n)
    )

    facility_other = (
        C.FACILITY_OVERHEAD_BASE_KW + C.FACILITY_OVERHEAD_IT_COEF * it_power
    )

    humidity = 52.0 - 0.8 * (zone_temp - 24.0) + _ar1_noise(n, 2.5, 0.999, rng)

    df = pd.DataFrame({
        "timestamp": ts,
        "zone_id": zone_id,
        "it_power_kw": it_power,
        "zone_temp_c": zone_temp,
        "zone_humidity_pct": np.clip(humidity, 40.0, 65.0),
        "setpoint_c": setpoint,
        "fan_speed_pct": fan,
        "comp_on": comp_on,
        "cooling_power_kw": cooling,
        "facility_other_kw": facility_other,
        "outdoor_temp_c": outdoor,
        "alarm_flag": (rng.random(n) < 0.001).astype(int),
        "op_mode": "auto",
        "_disturb": disturb,
    })
    for r in range(C.RACKS_PER_ZONE):
        df[f"rack{r + 1}_temp_c"] = rack_arr[r]
    return df


# ─────────────────────────────────────────────────────────────
# 데모 기준 시각 고정
# ─────────────────────────────────────────────────────────────
def apply_demo_anchor(df: pd.DataFrame, zone_id: str) -> pd.DataFrame:
    """
    제안서 2p·7p·8p·10p가 모두 '2026-08-01 14:00 / 구역① 180kW / 23.8℃ /
    설정 22.0℃ / 팬 85%' 를 기준으로 그려져 있습니다.
    발표 시 화면과 제안서가 같은 숫자를 보이도록 그 시점만 부드럽게 맞춥니다.
    (앞뒤 2시간에 걸쳐 서서히 적용되므로 시계열이 끊기지 않습니다.)
    """
    ts = pd.DatetimeIndex(df["timestamp"])
    target_ts = pd.Timestamp(C.DEMO_NOW)
    if target_ts not in ts:
        return df
    center = int(ts.get_loc(target_ts))
    n = len(df)
    half = 120                                   # ±2시간
    w = _smooth_window(n, center, half)

    target_load = 180.0 if zone_id == "zone1" else 165.0
    load = df["it_power_kw"].to_numpy()
    df["it_power_kw"] = load + w * (target_load - load[center])

    # 기준 시각 부근은 기본 설정값으로 운전 중이어야 합니다.
    band = slice(max(center - half, 0), min(center + half, n))
    df.loc[df.index[band], "setpoint_c"] = C.DEFAULT_SETPOINT
    df.loc[df.index[band], "fan_speed_pct"] = C.DEFAULT_FAN

    # 온도를 재계산한 뒤, 기준 시각의 대표온도를 제안서 값에 맞춥니다.
    it_power = df["it_power_kw"].to_numpy()
    setpoint = df["setpoint_c"].to_numpy()
    fan = df["fan_speed_pct"].to_numpy(dtype=float)
    outdoor = df["outdoor_temp_c"].to_numpy()

    temp_target = (C.temp_steady_state(setpoint, it_power, fan, outdoor)
                   + df['_disturb'].to_numpy())

    rack_cols = [f"rack{r + 1}_temp_c" for r in range(C.RACKS_PER_ZONE)]
    racks = []
    for r, col in enumerate(rack_cols):
        rack = _first_order_lag(temp_target + C.RACK_OFFSETS[r], C.TAU_MIN, C.FREQ_MIN)
        racks.append(rack)
    rack_arr = np.vstack(racks)
    zone_temp = rack_arr.max(axis=0)

    anchor_temp = 23.80 if zone_id == "zone1" else 24.10   # 제안서 6p·10p
    delta = anchor_temp - zone_temp[center]
    rack_arr = rack_arr + w * delta
    zone_temp = rack_arr.max(axis=0)

    for r, col in enumerate(rack_cols):
        df[col] = rack_arr[r]
    df["zone_temp_c"] = zone_temp

    deviation = zone_temp - (setpoint + C.TEMP_BASE_OFFSET)
    comp_on = (deviation > 0.55).astype(int)
    df["comp_on"] = comp_on
    df["cooling_power_kw"] = (
        C.COOL_BASE
        + C.COOL_IT_COEF * it_power
        + C.COOL_SP_COEF * np.maximum(0.0, C.COOL_SP_REF - setpoint)
        + C.COOL_FAN_COEF * (fan - C.COOL_FAN_REF)
        + C.COOL_OUT_COEF * np.maximum(0.0, outdoor - C.COOL_OUT_REF)
        + comp_on * C.COOL_COMP_KW
    )
    df["facility_other_kw"] = (
        C.FACILITY_OVERHEAD_BASE_KW + C.FACILITY_OVERHEAD_IT_COEF * it_power
    )
    return df


# ─────────────────────────────────────────────────────────────
# 데이터 결함 삽입 (진단 화면이 '찾아낼 것'을 만들어 둡니다)
# ─────────────────────────────────────────────────────────────
def inject_defects(df: pd.DataFrame, rng: np.random.Generator) -> tuple[pd.DataFrame, list]:
    n = len(df)
    log: list[dict] = []
    # 결함은 학습 구간을 피해 검증·재생 구간 위주로 넣습니다.
    lo = int(n * 0.05)

    def record(kind, s, e, action):
        log.append({
            "type": kind,
            "start": str(df["timestamp"].iloc[s]),
            "end": str(df["timestamp"].iloc[min(e, n - 1)]),
            "minutes": int(min(e, n - 1) - s),
            "action": action,
        })

    # 1) 정비 구간 — 온도 비정상
    for _ in range(C.DEFECT_MAINT_BLOCKS):
        s = int(rng.integers(lo, n - 600))
        length = int(rng.integers(4 * 60, 8 * 60))
        sl = slice(s, s + length)
        df.loc[df.index[sl], "op_mode"] = "maintenance"
        df.loc[df.index[sl], "zone_temp_c"] += rng.uniform(1.5, 3.0)
        record("정비", s, s + length, "분석 제외")

    # 2) 수동 조작 — 설정값 급변
    for _ in range(C.DEFECT_MANUAL_BLOCKS):
        s = int(rng.integers(lo, n - 400))
        length = int(rng.integers(90, 300))
        sl = slice(s, s + length)
        df.loc[df.index[sl], "op_mode"] = "manual"
        df.loc[df.index[sl], "setpoint_c"] = float(rng.choice([20.5, 21.0, 23.5]))
        record("수동 조작", s, s + length, "분석 제외")

    # 3) 고정값 (센서 고장)
    for _ in range(C.DEFECT_STUCK_BLOCKS):
        s = int(rng.integers(lo, n - 800))
        length = int(rng.integers(6 * 60, 12 * 60))
        df.loc[df.index[s: s + length], "zone_temp_c"] = df["zone_temp_c"].iloc[s]
        record("고정값", s, s + length, "분석 제외")

    # 4) 급변 이상치
    for _ in range(C.DEFECT_SPIKE_COUNT):
        s = int(rng.integers(lo, n - 10))
        df.loc[df.index[s], "zone_temp_c"] += float(rng.choice([-5.0, 5.0]))
        record("급변", s, s + 1, "해당 값 제외")

    # 5) 결측
    miss = rng.random(n) < C.DEFECT_MISSING_RATIO
    miss[:lo] = False
    df.loc[miss, "zone_temp_c"] = np.nan
    log.append({
        "type": "결측", "start": "-", "end": "-",
        "minutes": int(miss.sum()), "action": "해당 값 제외",
    })

    # 6) 통신 두절 — 행 전체 삭제
    drop = np.zeros(n, dtype=bool)
    for _ in range(C.DEFECT_OUTAGE_BLOCKS):
        s = int(rng.integers(lo, n - 120))
        length = int(rng.integers(30, 90))
        drop[s: s + length] = True
        record("통신 두절", s, s + length, "행 없음")
    df = df.loc[~drop].reset_index(drop=True)

    return df, log


# ─────────────────────────────────────────────────────────────
def main() -> None:
    rng = np.random.default_rng(C.RANDOM_SEED)

    periods = C.DAYS * 24 * 60 // C.FREQ_MIN
    ts = pd.date_range(C.START, periods=periods, freq=f"{C.FREQ_MIN}min")
    print(f"[생성] 기간 {ts[0]} ~ {ts[-1]}  ({periods:,}행 × 구역 2개)")

    outdoor = build_outdoor_temp(ts, rng)

    all_logs = {}
    for zone_id in C.ZONES:
        df = build_zone(ts, zone_id, outdoor, rng)
        df = apply_demo_anchor(df, zone_id)

        # 누적 IT 에너지 (kWh) — 결함 삽입 전에 계산
        df["it_energy_kwh"] = (df["it_power_kw"] * C.FREQ_MIN / 60.0).cumsum()
        df["cooling_energy_kwh"] = (df["cooling_power_kw"] * C.FREQ_MIN / 60.0).cumsum()

        df = df.drop(columns=['_disturb'])   # 모델이 볼 수 없어야 합니다
        df, log = inject_defects(df, rng)
        all_logs[zone_id] = log

        out = C.DATA_DIR / f"raw_{zone_id}.csv"
        df.to_csv(out, index=False, float_format="%.4f")

        label = C.ZONES[zone_id]["label"]
        print(f"  {label}: {len(df):,}행 → {out.name}")
        print(f"     부하 {df.it_power_kw.min():.0f}~{df.it_power_kw.max():.0f}kW "
              f"(평균 {df.it_power_kw.mean():.0f})")
        print(f"     온도 {df.zone_temp_c.min():.1f}~{df.zone_temp_c.max():.1f}℃ "
              f"(평균 {df.zone_temp_c.mean():.1f})")
        print(f"     냉각 {df.cooling_power_kw.mean():.1f}kW 평균")

    import json
    (C.REPORT_DIR / "defect_log.json").write_text(
        json.dumps(all_logs, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"[생성] 완료 → {C.DATA_DIR}")


if __name__ == "__main__":
    main()
