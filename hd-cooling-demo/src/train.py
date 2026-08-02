"""
[2] 모델 학습 · [3] 정확도 확인   ★ AI가 담당하는 두 단계 중 하나 ★

모델 2개 (둘 다 회귀):
  · 온도 예측  → 30분 후 구역 대표온도의 '변화량'
  · 전력 예측  → 냉각설비 전력(kW)

분류 모델은 쓰지 않습니다. 허용온도 초과 여부는 예측값과 상한을 비교하는
단순 연산입니다. (제안서 11p)

실행:  python src/train.py
출력:  models/temp_model.pkl, models/power_model.pkl, models/metrics.json
"""
from __future__ import annotations

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

import config as C
from equilibrium import EquilibriumModel
from preprocess import (FEATURES, HORIZON_MIN, HORIZONS, TARGET_POWER, TARGET_TEMP,
                        TARGET_TEMP_ABS)

# 오차범위 산출용 — 표본이 이만큼 있으면 '충분'으로 봅니다.
SIGMA_REF_SAMPLES = 3000
SIGMA_MAX_WIDEN = 2.2


def fan_bin(fan: float | np.ndarray):
    return np.where(fan >= 85, "팬 85%↑", np.where(fan >= 80, "팬 80~84%", "팬 80%↓"))


def load_clean(zone_id: str) -> pd.DataFrame:
    df = pd.read_csv(C.DATA_DIR / f"clean_{zone_id}.csv", parse_dates=["timestamp"])
    ok = df["trainable"] & df[TARGET_TEMP].notna() & df[FEATURES].notna().all(axis=1)
    return df.loc[ok].reset_index(drop=True)


def transient_weight(df: pd.DataFrame) -> np.ndarray:
    """
    설정 변경 직후 구간에 가중치를 줍니다.

    변경 직후 행은 전체의 0.3%(9만 행 중 약 270행)뿐이라, 균등 가중으로
    학습하면 MSE 최소화 관점에서 무시됩니다. 실제로 min_samples_leaf=200
    으로 두었을 때 모델은 설정 반응의 1/6밖에 배우지 못했습니다.
    이 구간이야말로 시뮬레이션이 답해야 할 질문이므로 비중을 올립니다.
    """
    sp = df["sp_elapsed_min"].to_numpy()
    fan = df["fan_elapsed_min"].to_numpy()
    return 1.0 + 12.0 * np.exp(-sp / 45.0) + 12.0 * np.exp(-fan / 45.0)


def fit_pair(tr: pd.DataFrame, va: pd.DataFrame, target: str):
    """LinearRegression(하한선)과 GBM(주 모델)을 함께 학습해 비교합니다."""
    Xtr, ytr = tr[FEATURES].to_numpy(), tr[target].to_numpy()
    Xva, yva = va[FEATURES].to_numpy(), va[target].to_numpy()
    w = transient_weight(tr)

    lin = LinearRegression().fit(Xtr, ytr, sample_weight=w)
    # 리프를 작게 허용해야 '설정 변경 직후'라는 희소 구간을 분리할 수 있습니다.
    gbm = HistGradientBoostingRegressor(
        max_iter=700, learning_rate=0.05, max_leaf_nodes=63,
        min_samples_leaf=20, l2_regularization=0.5,
        early_stopping=True, validation_fraction=0.15, n_iter_no_change=30,
        random_state=C.RANDOM_SEED,
    ).fit(Xtr, ytr, sample_weight=w)
    return lin, gbm, lin.predict(Xva), gbm.predict(Xva)


def temp_metrics(actual_abs: np.ndarray, pred_abs: np.ndarray) -> dict:
    err = pred_abs - actual_abs
    return {
        "mae": round(float(mean_absolute_error(actual_abs, pred_abs)), 4),
        "rmse": round(float(np.sqrt(mean_squared_error(actual_abs, pred_abs))), 4),
        "within_1c": round(float((np.abs(err) <= 1.0).mean()), 4),
        "bias": round(float(err.mean()), 4),
    }


def build_sigma_table(va: pd.DataFrame, pred_abs: np.ndarray) -> dict:
    """
    부하 구간 × 팬 구간별 잔차 표준편차.
    표본이 적은 조합은 오차범위를 넓혀 보수적으로 판정합니다.
    (인수인계서 4.5 + 5.3 '데이터 부족 → 추가 검증')
    """
    resid = pred_abs - va[TARGET_TEMP_ABS].to_numpy()
    key_load = va["load_bin"].to_numpy()
    key_fan = fan_bin(va["fan_speed_pct"].to_numpy())

    table: dict[str, dict] = {}
    for lb in {b[0] for b in C.LOAD_BINS}:
        for fb in ("팬 85%↑", "팬 80~84%", "팬 80%↓"):
            m = (key_load == lb) & (key_fan == fb)
            n = int(m.sum())
            if n < 30:
                table[f"{lb}|{fb}"] = {"n": n, "sigma": None, "widen": None,
                                       "sigma_eff": None, "sparse": True}
                continue
            sigma = float(np.std(resid[m]))
            widen = float(min(SIGMA_MAX_WIDEN, max(1.0, np.sqrt(SIGMA_REF_SAMPLES / n))))
            table[f"{lb}|{fb}"] = {
                "n": n,
                "sigma": round(sigma, 4),
                "widen": round(widen, 3),
                "sigma_eff": round(sigma * widen, 4),
                "sparse": bool(n < C.MIN_MATCH_SAMPLES * 10),
            }
    overall = float(np.std(resid))
    table["_overall"] = {"n": int(resid.size), "sigma": round(overall, 4),
                         "widen": 1.0, "sigma_eff": round(overall, 4), "sparse": False}
    return table


def train_zone(zone_id: str) -> dict:
    df = load_clean(zone_id)
    tr = df[df["split"] == "train"]
    va = df[df["split"] == "valid"]
    label = C.ZONES[zone_id]["label"]
    print(f"\n[학습] {label}  학습 {len(tr):,}행 / 검증 {len(va):,}행")

    # ── 온도 모델 (타깃은 '변화량')
    lin_t, gbm_t, p_lin_d, p_gbm_d = fit_pair(tr, va, TARGET_TEMP)
    cur = va["zone_temp_c"].to_numpy()
    act = va[TARGET_TEMP_ABS].to_numpy()

    m_lin = temp_metrics(act, cur + p_lin_d)
    m_gbm = temp_metrics(act, cur + p_gbm_d)
    # 아무것도 안 하는 기준선: "30분 뒤에도 지금 온도 그대로"
    m_naive = temp_metrics(act, cur)

    print(f"   온도  현재값유지 MAE {m_naive['mae']:.3f}℃  ±1℃ {m_naive['within_1c']*100:.1f}%")
    print(f"         선형회귀    MAE {m_lin['mae']:.3f}℃  ±1℃ {m_lin['within_1c']*100:.1f}%")
    print(f"         GBM         MAE {m_gbm['mae']:.3f}℃  ±1℃ {m_gbm['within_1c']*100:.1f}%"
          f"   ← 주 모델")

    # ── 설정 변경 직후 2시간 = 예측이 실제로 어려운 구간
    #    평상시 정확도는 '현재값 유지'로도 나오므로, 이 구간 성적이 진짜 근거입니다.
    tr_mask = (va["sp_elapsed_min"].to_numpy() <= 120) | (va["fan_elapsed_min"].to_numpy() <= 120)
    transient = {}
    if tr_mask.sum() > 100:
        transient = {
            "n": int(tr_mask.sum()),
            "naive": temp_metrics(act[tr_mask], cur[tr_mask]),
            "linear": temp_metrics(act[tr_mask], (cur + p_lin_d)[tr_mask]),
            "gbm": temp_metrics(act[tr_mask], (cur + p_gbm_d)[tr_mask]),
        }
        print(f"   설정 변경 직후 2시간 ({int(tr_mask.sum()):,}행) — 여기가 진짜 시험대")
        print(f"         현재값유지 MAE {transient['naive']['mae']:.3f}℃"
              f"   선형 {transient['linear']['mae']:.3f}℃"
              f"   GBM {transient['gbm']['mae']:.3f}℃")
        gain = 1 - transient["gbm"]["mae"] / max(transient["naive"]["mae"], 1e-9)
        print(f"         → GBM이 현재값유지 대비 오차 {gain*100:.0f}% 감소")

    # ── 전력 모델
    lin_p, gbm_p, p_lin_pw, p_gbm_pw = fit_pair(tr, va, TARGET_POWER)
    act_pw = va[TARGET_POWER].to_numpy()
    mape_lin = float(np.mean(np.abs(p_lin_pw - act_pw) / np.maximum(act_pw, 1e-6)))
    mape_gbm = float(np.mean(np.abs(p_gbm_pw - act_pw) / np.maximum(act_pw, 1e-6)))
    print(f"   전력  선형회귀 MAPE {mape_lin*100:.2f}%   GBM MAPE {mape_gbm*100:.2f}%")

    # ── 평형온도 + 응답속도 모델 (시뮬레이션의 반사실 예측용)
    raw_all = pd.read_csv(C.DATA_DIR / f"clean_{zone_id}.csv", parse_dates=["timestamp"])
    eq = EquilibriumModel(HORIZONS)
    eq.fit_equilibrium(tr, C.RANDOM_SEED)
    step_info = eq.fit_response_curve(raw_all[raw_all["split"] == "train"])
    print(f"   반응   계단응답 {step_info['n_events']}건에서 측정 → "
          f"시상수 {step_info['tau_min']:.0f}분, 설정 1℃당 {step_info['gain_per_setpoint_c']:.2f}℃")
    joblib.dump(eq, C.MODEL_DIR / f"eq_model_{zone_id}.pkl")

    sigma_table = build_sigma_table(va, cur + p_gbm_d)

    # 부하 구간별 정확도
    by_bin = []
    for name, _, _ in C.LOAD_BINS:
        m = va["load_bin"].to_numpy() == name
        if m.sum() < 30:
            continue
        mm = temp_metrics(act[m], (cur + p_gbm_d)[m])
        by_bin.append({"load_bin": name, "n": int(m.sum()), **mm})

    # ── 지평별 직접 예측 모델 (재귀 없이 30/60/90/120분을 각각 예측)
    horizon_models = {HORIZON_MIN: gbm_t}
    horizon_report = []
    for h in HORIZONS:
        if h == HORIZON_MIN:
            m_h, pred_h = m_gbm, cur + p_gbm_d
        else:
            col = f"target_temp_delta_{h}"
            ok_h = tr[col].notna()
            ok_v = va[col].notna()
            _, g_h, _, p_h = fit_pair(tr[ok_h], va[ok_v], col)
            horizon_models[h] = g_h
            m_h = temp_metrics(va.loc[ok_v, f"target_temp_c_{h}"].to_numpy(),
                               va.loc[ok_v, "zone_temp_c"].to_numpy() + p_h)
        horizon_report.append({"horizon_min": h, **m_h})
        print(f"         {h:>3}분 후  MAE {m_h['mae']:.3f}℃  ±1℃ {m_h['within_1c']*100:.1f}%")

    joblib.dump({"models": horizon_models, "features": FEATURES, "target": "delta",
                 "horizons": HORIZONS, "horizon_min": HORIZON_MIN},
                C.MODEL_DIR / f"temp_model_{zone_id}.pkl")
    joblib.dump({"model": gbm_p, "features": FEATURES, "target": "cooling_kw"},
                C.MODEL_DIR / f"power_model_{zone_id}.pkl")
    joblib.dump({"model": lin_t, "features": FEATURES}, C.MODEL_DIR / f"temp_linear_{zone_id}.pkl")

    # 화면 산점도·히스토그램용 표본
    rs = np.random.default_rng(C.RANDOM_SEED)
    idx = rs.choice(len(va), size=min(1200, len(va)), replace=False)
    scatter = [{"actual": round(float(act[i]), 3),
                "pred": round(float((cur + p_gbm_d)[i]), 3)} for i in idx]
    errors = (cur + p_gbm_d) - act
    hist, edges = np.histogram(errors, bins=41, range=(-2.5, 2.5))

    pass_temp = m_gbm["within_1c"] >= C.PASS_WITHIN_1C
    print(f"   판정  ±1℃ 이내 {m_gbm['within_1c']*100:.1f}% "
          f"(기준 {C.PASS_WITHIN_1C*100:.0f}% {'통과' if pass_temp else '미달'})")

    return {
        "zone_id": zone_id,
        "label": label,
        "rows": {"train": len(tr), "valid": len(va)},
        "horizon_min": HORIZON_MIN,
        "temp": {"gbm": m_gbm, "linear": m_lin, "naive": m_naive},
        "transient": transient,
        "by_horizon": horizon_report,
        "step_response": step_info,
        "response_fraction": {str(k): round(v, 3) for k, v in eq.response.items()},
        "power": {"mape_gbm": round(mape_gbm, 4), "mape_linear": round(mape_lin, 4),
                  "mae_gbm": round(float(mean_absolute_error(act_pw, p_gbm_pw)), 3)},
        "pass": {
            "within_1c": bool(pass_temp),
            "mae": bool(m_gbm["mae"] <= C.PASS_MAE),
            "power_mape": bool(mape_gbm <= C.PASS_POWER_MAPE),
        },
        "sigma_table": sigma_table,
        "by_load_bin": by_bin,
        "scatter": scatter,
        "error_hist": {"counts": hist.tolist(),
                       "edges": [round(float(e), 3) for e in edges]},
    }


def main() -> None:
    metrics = {"zones": {}, "thresholds": {
        "within_1c": C.PASS_WITHIN_1C, "mae": C.PASS_MAE,
        "power_mape": C.PASS_POWER_MAPE, "temp_limit_c": C.TEMP_LIMIT_C,
    }}
    for zone_id in C.ZONES:
        metrics["zones"][zone_id] = train_zone(zone_id)

    out = C.MODEL_DIR / "metrics.json"
    out.write_text(json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n[학습] 완료 → {out}")


if __name__ == "__main__":
    main()
