"""
평형온도 + 응답속도 모델   ★ 시뮬레이션이 쓰는 모델 ★

── 왜 이 구조인가

30분 후 온도를 한 번에 회귀하면, "지금 설정을 바꾸면?"이라는 질문에 답하지
못합니다. 설정 변경 직후 행이 9만 행 중 270행뿐이라 어떤 정규화 설정으로도
그 반응을 충분히 배우지 못합니다(실측 +0.42℃ / 학습 결과 +0.07℃).

서버실은 1차 지연계이므로 반응을 두 조각으로 나눠 각각 풍부한 데이터로
학습합니다.

  ① 평형온도 T_eq = f(설정, 부하, 팬, 외기, 시간대)
     → 안정 구간(설정 변경 후 90분 경과) 전체를 씁니다. 수만 행.
     → 설정을 바꿨을 때 '결국 어디로 가는지'를 이 모델이 답합니다.

  ② 응답 비율 f(h) = 1 - exp(-h/tau)
     → 과도 구간에서 원점 통과 회귀로 지평별 계수 하나씩만 추정.
     → 파라미터가 지평당 1개뿐이라 270행으로도 안정적으로 구해집니다.

  예측:  temp(t+h) = temp(t) + f(h) · (T_eq(새 설정) - temp(t))

제안서 8p의 "과거 같은 부하 구간에서 설정 22.0℃일 때와 22.5℃일 때의 실제
온도를 비교한다"가 바로 ①입니다. 화면 논리와 모델 구조가 일치합니다.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

# 평형온도는 '지금 어디로 가는가'만 설명하면 되므로 상태 변수는 넣지 않습니다.
# (현재 온도를 넣으면 모델이 그것만 베껴 설정 반응이 사라집니다.)
EQ_FEATURES = [
    "setpoint_c",
    "it_power_kw",
    "fan_speed_pct",
    "outdoor_temp_c",
    "hour",
    "dayofweek",
]

SETTLED_MIN = 90          # 설정 변경 후 이만큼 지나면 안정된 것으로 봅니다
TAU_FIT_MAX_MIN = 30      # 과도 구간 판정: 변경 후 30분 이내 시점을 기점으로


class EquilibriumModel:
    def __init__(self, horizons: list[int]):
        self.horizons = horizons
        self.model: HistGradientBoostingRegressor | None = None
        self.response: dict[int, float] = {}
        self.tau_min: float | None = None
        self.step_gain: float | None = None
        self.n_settled = 0
        self.n_transient = 0

    # ── ① 평형온도
    def fit_equilibrium(self, df: pd.DataFrame, seed: int) -> None:
        settled = df[(df["sp_elapsed_min"] >= SETTLED_MIN)
                     & (df["fan_elapsed_min"] >= SETTLED_MIN)]
        self.n_settled = len(settled)
        X = settled[EQ_FEATURES].to_numpy()
        y = settled["zone_temp_c"].to_numpy()
        self.model = HistGradientBoostingRegressor(
            max_iter=500, learning_rate=0.06, max_leaf_nodes=63,
            min_samples_leaf=30, l2_regularization=0.1,
            early_stopping=True, validation_fraction=0.15, n_iter_no_change=25,
            random_state=seed,
        ).fit(X, y)

    def predict_eq(self, feat: dict | pd.DataFrame) -> np.ndarray:
        if isinstance(feat, dict):
            X = np.array([[float(feat[k]) for k in EQ_FEATURES]])
        else:
            X = feat[EQ_FEATURES].to_numpy()
        return self.model.predict(X)

    # ── ② 응답 비율 — 평균 계단응답에서 시상수를 직접 측정
    def fit_response_curve(self, raw: pd.DataFrame, max_min: int = 120) -> dict:
        """
        설정을 바꾼 사례들을 모두 겹쳐 '평균 계단응답 곡선'을 만들고,
        거기서 시상수를 읽습니다. 제안서 4p의 "설정을 바꾸면 온도는 언제부터
        변하는가 / 반응 시간 자체도 데이터에서 먼저 측정합니다"가 이것입니다.

        개별 사례는 외란에 묻히지만, 수백 건을 평균 내면 곡선이 또렷해집니다.
        회귀로 기울기를 재는 방식은 설명변수 오차 때문에 시상수를 42분으로
        과대추정했습니다(실제 22분). 평균부터 내면 그 편향이 사라집니다.
        """
        ts = raw["timestamp"].to_numpy()
        temp = raw["zone_temp_c"].to_numpy(dtype=float)
        sp = raw["setpoint_c"].to_numpy(dtype=float)
        fan = raw["fan_speed_pct"].to_numpy(dtype=float)
        usable = raw["usable"].to_numpy().astype(bool)

        change = np.where((np.diff(sp, prepend=sp[0]) != 0))[0]
        curves = []
        for i in change:
            j = i + max_min
            if i < 30 or j >= temp.size:
                continue
            # 지평 동안 설정이 유지되고, 구간 전체가 정상 운전이어야 합니다.
            if not (np.all(sp[i:j] == sp[i]) and np.all(fan[i:j] == fan[i])):
                continue
            if usable[i - 30:j].mean() < 0.95:
                continue
            step = sp[i] - sp[i - 1]
            if abs(step) < 0.4:
                continue
            base = float(np.nanmean(temp[i - 15:i]))       # 변경 직전 15분 평균
            curves.append((temp[i:j] - base) / step)

        if len(curves) < 10:
            return {"n_events": len(curves), "tau_min": None, "curve": []}

        mean_curve = np.nanmean(np.vstack(curves), axis=0)
        gain = float(np.nanmean(mean_curve[-20:]))          # 마지막 20분 평균 = 정상상태 이득

        # 정규화 곡선에서 63.2% 도달 시각 = 시상수
        norm = mean_curve / gain if abs(gain) > 1e-6 else mean_curve
        idx = np.where(norm >= 0.632)[0]
        tau = float(idx[0]) if idx.size else None

        self.tau_min = tau
        self.step_gain = gain
        if tau:
            self.response = {h: float(1.0 - np.exp(-h / tau)) for h in self.horizons}

        return {
            "n_events": len(curves),
            "tau_min": tau,
            "gain_per_setpoint_c": round(gain, 3),
            "curve": [round(float(v), 4) for v in mean_curve[:max_min:5]],
            "curve_step_min": 5,
        }

    def fit_response(self, df: pd.DataFrame) -> None:
        """
        설정이 '막 바뀐' 순간만 모아  delta_h = f(h) · step_gap  의 기울기를 구합니다.

        step_gap = T_eq(바뀐 설정) - T_eq(바뀌기 전 설정)

        같은 모델의 예측 두 개를 빼기 때문에 외란·편향이 상쇄되어 깨끗한
        설명변수가 됩니다. (T_eq - 현재온도)를 쓰면 현재온도에 실린 외란이
        설명변수 오차로 들어가 기울기가 0쪽으로 끌려갑니다(회귀 희석).
        실제로 그 방식은 시상수를 22분 대신 53분으로 잘못 추정했습니다.
        """
        tr = df[((df["sp_elapsed_min"] <= 2) | (df["fan_elapsed_min"] <= 2))
                & ((df["sp_step"].abs() > 1e-9) | (df["fan_step"].abs() > 1e-9))].copy()
        self.n_transient = len(tr)
        if tr.empty:
            self.response = {h: 1.0 for h in self.horizons}
            return

        # '변경 전 상태'는 방금 실제로 바뀐 변수만 되돌립니다.
        # sp_step·fan_step 은 마지막 변경 이후 계속 그 값을 유지하므로,
        # 둘 다 되돌리면 며칠 전 팬 변경까지 섞여 step_gap이 오염됩니다.
        before = tr.copy()
        sp_just = (tr["sp_elapsed_min"] <= 2).to_numpy()
        fan_just = (tr["fan_elapsed_min"] <= 2).to_numpy()
        before.loc[sp_just, "setpoint_c"] = tr.loc[sp_just, "setpoint_prev"]
        before.loc[fan_just, "fan_speed_pct"] = tr.loc[fan_just, "fan_prev"]
        step_gap = self.predict_eq(tr) - self.predict_eq(before)

        for h in self.horizons:
            col = f"target_temp_delta_{h}"
            if col not in tr.columns:
                continue
            hold = f"hold_{h}"
            ok = tr[col].notna().to_numpy() & (np.abs(step_gap) > 0.15)
            if hold in tr.columns:
                ok &= tr[hold].to_numpy().astype(bool)
            g, d = step_gap[ok], tr.loc[ok, col].to_numpy()
            f = float(np.dot(g, d) / np.dot(g, g)) if g.size else 1.0
            self.response[h] = float(np.clip(f, 0.0, 1.0))

        # 지평이 길수록 반응이 더 진행되어야 합니다 (단조 증가로 정리)
        run = 0.0
        for h in sorted(self.response):
            run = max(run, self.response[h])
            self.response[h] = run

        f30 = self.response.get(30)
        if f30 and 0 < f30 < 1:
            self.tau_min = float(-30.0 / np.log(1.0 - f30))

    # ── 반사실 예측: "지금 설정을 이렇게 바꾸면?"
    def eq_shift(self, base_feat: dict, setpoint_new: float, fan_new: float) -> float:
        """
        설정을 바꿨을 때 평형온도가 얼마나 움직이는지.

        · 설정온도 축 — 계단응답에서 측정한 이득(℃/℃)을 씁니다.
          평형 회귀는 이 축을 과소평가합니다(+0.41 / 실제 +0.60). 설정값이
          며칠 단위 블록이라 느린 외란과 겹쳐 효과가 희석되기 때문입니다.
          운영자가 실제로 설정을 바꾼 사례를 겹쳐 측정한 값이 더 정확합니다.

        · 팬 속도 축 — 평형 회귀를 씁니다. 78% 아래의 비선형 급상승(무릎)을
          정확히 잡아냅니다(+0.44 / 실제 +0.44).

        둘 다 과거 운전 데이터에서 나온 값이며, 제안서 8p가 설명하는
        "과거 같은 조건의 실제 기록으로 계산한다"와 같은 방식입니다.
        """
        d_sp = (setpoint_new - float(base_feat["setpoint_c"])) * (self.step_gain or 1.0)

        cur_fan = dict(base_feat)
        new_fan = dict(base_feat)
        new_fan["fan_speed_pct"] = fan_new
        d_fan = float(self.predict_eq(new_fan)[0] - self.predict_eq(cur_fan)[0])
        return d_sp + d_fan

    def predict_at(self, feat: dict, current_temp: float, horizon: int) -> float:
        eq = float(self.predict_eq(feat)[0])
        return current_temp + self.response.get(horizon, 1.0) * (eq - current_temp)

    def predict_frame(self, df: pd.DataFrame, horizon: int) -> np.ndarray:
        eq = self.predict_eq(df)
        cur = df["zone_temp_c"].to_numpy()
        return cur + self.response.get(horizon, 1.0) * (eq - cur)
