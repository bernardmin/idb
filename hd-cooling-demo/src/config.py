"""
HD현대중공업 데이터센터 냉각 최적화 데모 — 공통 설정

모든 물리 계수·기준값을 이 파일 한 곳에 모읍니다.
화면과 제안서의 숫자가 어긋나면 여기부터 확인하십시오.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
REPORT_DIR = ROOT / "reports"
STATIC_DIR = ROOT / "static"

for _d in (DATA_DIR, MODEL_DIR, REPORT_DIR, STATIC_DIR):
    _d.mkdir(parents=True, exist_ok=True)

RANDOM_SEED = 20260801

# ─────────────────────────────────────────────────────────────
# 기간
# 제안서 운영 대시보드가 2026-08-01 14:00 기준이므로,
# 90일 구간의 끝이 2026-08-01이 되도록 시작일을 맞춥니다.
# ─────────────────────────────────────────────────────────────
START = "2026-05-04 00:00"
DAYS = 90
FREQ_MIN = 1

TRAIN_DAYS = 60          # 1~60일   학습
VALID_DAYS = 20          # 61~80일  검증
REPLAY_DAYS = 10         # 81~90일  데모 재생

# ─────────────────────────────────────────────────────────────
# 구역별 IT 부하 (제안서 10p: 구역① 180kW / 구역② 165kW @ 14:00)
# ─────────────────────────────────────────────────────────────
ZONES = {
    "zone1": {"label": "구역①", "role": "주",   "base_kw": 150.0},
    "zone2": {"label": "구역②", "role": "보조", "base_kw": 137.0},
}

LOAD_DIURNAL_KW = 40.0   # 업무시간 가산
LOAD_NIGHT_KW = 20.0     # 야간 감산
LOAD_WEEKDAY_KW = 15.0
LOAD_WEEKEND_KW = 25.0
LOAD_NOISE_KW = 11.0
LOAD_BATCH_KW = 30.0

# 부하 구간 (구역① 기준)
LOAD_BINS = [
    ("저부하", -1e9, 160.0),
    ("중부하", 160.0, 200.0),
    ("고부하", 200.0, 1e9),
]

# ─────────────────────────────────────────────────────────────
# 구역 온도 모델  ★ 제안서 재현의 핵심 ★
#
#   temp_target = SP_REF + TEMP_SP_GAIN * (setpoint_c - SP_REF)
#               + TEMP_BASE_OFFSET
#               + TEMP_LOAD_COEF * (it_power_kw - 150)
#               + fan_term(fan_speed_pct)
#               + TEMP_OUT_COEF  * (outdoor_temp_c - 25)
#
#   fan_term = TEMP_FAN_LIN  * max(0, 85 - fan)
#            + TEMP_FAN_KNEE * max(0, 78 - fan)
#
# ── 왜 이런 모양인가 (제안서 3개 숫자를 동시에 맞추기 위해서입니다)
#
#   ① 제안서 8p:  "설정 +0.5℃ → 온도 평균 +0.6℃"
#      과거 사례 매칭은 팬 속도가 같은 구간끼리 비교하므로,
#      설정온도 단독 효과가 +0.6 이어야 합니다 → TEMP_SP_GAIN = 1.2
#      (설정을 올리면 압축기 가동률이 함께 떨어져 이득이 1보다 큽니다)
#
#   ② 제안서 7p:  변경안① 22.5℃·팬80% → "24.4 ± 0.4℃"
#      23.8 + 0.6(설정) + 0.04(팬 85→80) = 24.44 → 24.4 ✓
#
#   ③ 제안서 7p:  변경안② 23.0℃·팬75% → "상한 초과 가능"
#      23.8 + 1.2(설정) + 0.44(팬 85→75) = 25.44
#      25.44 + 1.96×0.4 = 26.22 > 26.0 → 안전 필터가 제외 ✓
#
#      ②와 ③을 함께 만족시키려면 팬 효과가 선형이면 안 됩니다.
#      팬을 78% 아래로 낮추면 기류 단락·재순환으로 온도가 급히 오르는
#      실제 거동을 무릎(knee) 항으로 반영했습니다.
#      → 선형 모델은 못 맞추고 GBM은 맞추므로, 탭3 비교 근거도 됩니다.
#
# 인수인계서 원안(offset 1.2 / fan 0.035 선형)은 24.15℃·24.83℃가 나오고
# 초과 조합이 하나도 안 생겨 제안서 화면이 재현되지 않습니다.
# ─────────────────────────────────────────────────────────────
TEMP_SP_REF_C = 22.0
TEMP_SP_GAIN = 1.2
TEMP_BASE_OFFSET = 1.0
TEMP_LOAD_COEF = 0.020
TEMP_FAN_LIN = 0.008
TEMP_FAN_KNEE = 0.12
TEMP_FAN_LIN_REF = 85.0
TEMP_FAN_KNEE_REF = 78.0
TEMP_OUT_COEF = 0.030
TEMP_LOAD_REF_KW = 150.0
TEMP_OUT_REF_C = 25.0


def temp_steady_state(setpoint_c, it_power_kw, fan_speed_pct, outdoor_temp_c):
    """목표 정상상태 온도. 데이터 생성·시뮬레이션이 같은 식을 씁니다."""
    import numpy as _np
    fan_term = (
        TEMP_FAN_LIN * _np.maximum(0.0, TEMP_FAN_LIN_REF - fan_speed_pct)
        + TEMP_FAN_KNEE * _np.maximum(0.0, TEMP_FAN_KNEE_REF - fan_speed_pct)
    )
    return (
        TEMP_SP_REF_C
        + TEMP_SP_GAIN * (setpoint_c - TEMP_SP_REF_C)
        + TEMP_BASE_OFFSET
        + TEMP_LOAD_COEF * (it_power_kw - TEMP_LOAD_REF_KW)
        + fan_term
        + TEMP_OUT_COEF * (outdoor_temp_c - TEMP_OUT_REF_C)
    )

TAU_MIN = 22.0           # 1차 지연 시상수 (분) — 제안서 "15~30분"
TEMP_NOISE_STD = 0.15

# ─────────────────────────────────────────────────────────────
# 관측되지 않는 외란  ★ 모델 성능을 현실적으로 만드는 장치 ★
#
# 실제 서버실에는 계측되지 않는 교란이 있습니다.
#   문 개폐 · 랙 증설/이설 · 타일 개구율 변화 · 인접 구역 간섭 ·
#   항온항습기 개체차 · 기류 단락
# 이 항을 넣지 않으면 데이터가 결정론적 수식 그대로여서 모델이
# MAE 0.02℃ 같은 비현실적 성적을 냅니다(발표에서 바로 의심받습니다).
#
# 이 값은 CSV에 저장하지 않습니다 — 모델이 볼 수 없어야
# '줄일 수 없는 오차'로 남고, 정확도 수치가 정직해집니다.
# ─────────────────────────────────────────────────────────────
DISTURB_STD = 0.40           # ℃
DISTURB_RHO = 0.9985         # 1분 스텝 자기상관 (≈ 11시간 상관시간)
DISTURB_FAST_STD = 0.13      # 빠른 성분
DISTURB_FAST_RHO = 0.97      # (≈ 33분 상관시간)

# 랙별 온도 (제안서 7p "평균이 아니라 가장 더운 지점을 봅니다")
# 구역 대표온도 = 랙 4개 중 최댓값
RACKS_PER_ZONE = 4
RACK_OFFSETS = [-0.45, -0.15, 0.10, 0.00]   # 마지막 랙이 대표(최고)가 되도록 보정
RACK_NOISE_STD = 0.13

# ─────────────────────────────────────────────────────────────
# 냉각 전력
#   cooling = COOL_BASE
#           + COOL_IT_COEF   * it_power_kw
#           + COOL_SP_COEF   * max(0, COOL_SP_REF - setpoint_c)
#           + COOL_FAN_COEF  * (fan_speed_pct - 70)
#           + COOL_OUT_COEF  * max(0, outdoor_temp_c - 28)
#           + comp_on * COOL_COMP_KW
#
# 검산 (180kW / 외기 25℃ / comp off)
#   현재    22.0℃·85%  → 18 + 57.6 + 5.6 + 1.35 = 82.55 kW
#   변경안① 22.5℃·80%  → 18 + 57.6 + 4.2 + 0.90 = 80.70 kW  (-1.85 kW)
# ─────────────────────────────────────────────────────────────
COOL_BASE = 18.0
COOL_IT_COEF = 0.32
COOL_SP_COEF = 2.8
COOL_SP_REF = 24.0
COOL_FAN_COEF = 0.09
COOL_FAN_REF = 70.0
COOL_OUT_COEF = 0.45
COOL_OUT_REF = 28.0
COOL_COMP_KW = 6.0
COOL_NOISE_STD = 1.2

# 시설 부대 전력 (PUE 산출용)
# 운영 PUE = (IT + 냉각 + 부대) / IT
FACILITY_OVERHEAD_BASE_KW = 6.0
FACILITY_OVERHEAD_IT_COEF = 0.035

# ─────────────────────────────────────────────────────────────
# 조작 변수
# ─────────────────────────────────────────────────────────────
SETPOINT_VALUES = [21.5, 22.0, 22.5, 23.0]
# 과거 사례 매칭(제안서 8p)이 성립하려면 22.5℃ 구간이 충분히 있어야 합니다.
# 인수인계서 원안(22.0을 70%)은 매칭 표본이 부족해 분포를 넓혔습니다.
SETPOINT_WEIGHTS = [0.15, 0.45, 0.25, 0.15]
DEFAULT_SETPOINT = 22.0

FAN_VALUES = [75, 80, 85, 90]
FAN_WEIGHTS = [0.10, 0.20, 0.55, 0.15]
DEFAULT_FAN = 85

SETPOINT_STEP = 0.5
FAN_STEP = 5

# ─────────────────────────────────────────────────────────────
# 안전 기준
# ─────────────────────────────────────────────────────────────
TEMP_LIMIT_C = 26.0          # 허용온도 (고객 운영기준 확인 후 확정)
RISE_RATE_LIMIT = 1.5        # ℃/시간
MIN_MATCH_SAMPLES = 50       # 유사 구간 최소 표본
CONFIDENCE_Z = 1.96          # 95% 구간

# 통과 기준 (제안서 13p)
PASS_DATA_RATIO = 0.90       # 비교 가능 시간 90% 이상
PASS_WITHIN_1C = 0.80        # 오차 ±1℃ 이내 80% 이상
PASS_MAE = 0.5
PASS_POWER_MAPE = 0.08

# ─────────────────────────────────────────────────────────────
# 데이터 결함 (진단 화면용) — 인수인계서 3.7
# ─────────────────────────────────────────────────────────────
DEFECT_MISSING_RATIO = 0.012
DEFECT_STUCK_BLOCKS = 5
DEFECT_SPIKE_COUNT = 20
DEFECT_OUTAGE_BLOCKS = 8
DEFECT_MAINT_BLOCKS = 7
DEFECT_MANUAL_BLOCKS = 10

# 데모 기준 시각 (제안서 10p)
DEMO_NOW = "2026-08-01 14:00"

SERVER_PORT = 8090
