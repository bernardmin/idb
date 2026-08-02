"""
[1] 데이터 진단 — 규칙·통계 (AI 아님)

결측·고정값·급변·통신두절·정비·수동조작 구간을 찾아 분석 대상에서 제외하고,
"비교 가능한 시간"의 비율을 산출합니다. (제안서 13p 통과 기준: 90% 이상)

실행:  python src/diagnose.py
출력:  reports/diagnosis_report.json
"""
from __future__ import annotations

import json

import numpy as np
import pandas as pd

import config as C


def load_raw(zone_id: str) -> pd.DataFrame:
    df = pd.read_csv(C.DATA_DIR / f"raw_{zone_id}.csv", parse_dates=["timestamp"])
    return df.sort_values("timestamp").reset_index(drop=True)


def to_full_grid(df: pd.DataFrame) -> pd.DataFrame:
    """통신 두절로 빠진 행을 되살려 '있어야 할 시간축'을 복원합니다."""
    full = pd.date_range(df["timestamp"].iloc[0], df["timestamp"].iloc[-1],
                         freq=f"{C.FREQ_MIN}min")
    out = df.set_index("timestamp").reindex(full)
    out.index.name = "timestamp"
    return out.reset_index()


def find_stuck(series: pd.Series, min_len: int = 60) -> np.ndarray:
    """동일 값이 min_len분 이상 이어지는 구간 = 센서 고정값 의심."""
    v = series.to_numpy()
    flag = np.zeros(v.size, dtype=bool)
    start = 0
    for i in range(1, v.size + 1):
        same = i < v.size and np.isfinite(v[i]) and np.isfinite(v[i - 1]) and v[i] == v[i - 1]
        if not same:
            if i - start >= min_len:
                flag[start:i] = True
            start = i
    return flag


def find_spike(series: pd.Series, jump: float = 3.0) -> np.ndarray:
    """1분 만에 jump℃ 이상 뛰었다가 되돌아오는 값 = 이상치."""
    v = series.to_numpy(dtype=float)
    d = np.diff(v, prepend=v[0])
    flag = np.abs(d) > jump
    # 다음 스텝에서 되돌아오면 단발 이상치로 확정
    back = np.zeros_like(flag)
    idx = np.where(flag)[0]
    for i in idx:
        if i + 1 < v.size and np.sign(d[i]) != np.sign(d[i + 1]) and abs(d[i + 1]) > jump * 0.6:
            back[i] = True
    return back | flag


def blocks_from_flag(ts: pd.Series, flag: np.ndarray, label: str, action: str) -> list[dict]:
    """불리언 플래그를 연속 구간 목록으로 바꿉니다."""
    out = []
    if flag.size == 0:
        return out
    d = np.diff(flag.astype(int), prepend=0, append=0)
    starts = np.where(d == 1)[0]
    ends = np.where(d == -1)[0]
    for s, e in zip(starts, ends):
        e = min(e, len(ts) - 1)
        out.append({
            "type": label,
            "start": ts.iloc[s].strftime("%m-%d %H:%M"),
            "end": ts.iloc[e].strftime("%m-%d %H:%M"),
            "minutes": int(e - s),
            "action": action,
        })
    return out


def diagnose_zone(zone_id: str) -> dict:
    raw = load_raw(zone_id)
    df = to_full_grid(raw)
    n = len(df)
    ts = df["timestamp"]

    temp = df["zone_temp_c"]
    mode = df["op_mode"]

    f_outage = df["it_power_kw"].isna().to_numpy()
    f_missing = temp.isna().to_numpy() & ~f_outage
    f_stuck = find_stuck(temp.ffill()) & ~f_outage
    f_spike = find_spike(temp.ffill()) & ~f_outage
    f_maint = (mode == "maintenance").to_numpy()
    f_manual = (mode == "manual").to_numpy()
    f_alarm = (df["alarm_flag"] == 1).to_numpy()

    excluded = f_outage | f_missing | f_stuck | f_spike | f_maint | f_manual
    usable = ~excluded

    blocks: list[dict] = []
    blocks += blocks_from_flag(ts, f_outage, "통신 두절", "행 없음 · 제외")
    blocks += blocks_from_flag(ts, f_maint, "정비", "분석 제외")
    blocks += blocks_from_flag(ts, f_manual, "수동 조작", "분석 제외")
    blocks += blocks_from_flag(ts, f_stuck, "고정값(센서 의심)", "분석 제외")
    blocks = sorted(blocks, key=lambda b: b["start"])

    # 화면 타임라인용 — 하루 단위로 상태를 압축
    df["_day"] = ts.dt.floor("D")
    timeline = []
    for day, g in df.groupby("_day"):
        idx = g.index.to_numpy()
        timeline.append({
            "date": day.strftime("%m-%d"),
            "usable": round(float(usable[idx].mean()), 4),
            "outage": round(float(f_outage[idx].mean()), 4),
            "stuck": round(float(f_stuck[idx].mean()), 4),
            "maint": round(float((f_maint | f_manual)[idx].mean()), 4),
            "missing": round(float(f_missing[idx].mean()), 4),
        })

    cols = ["it_power_kw", "zone_temp_c", "setpoint_c", "fan_speed_pct",
            "cooling_power_kw", "outdoor_temp_c", "zone_humidity_pct"]
    col_missing = [
        {"column": c, "missing_pct": round(float(df[c].isna().mean() * 100), 2)}
        for c in cols
    ]

    usable_ratio = float(usable.mean())
    return {
        "zone_id": zone_id,
        "label": C.ZONES[zone_id]["label"],
        "period": [str(ts.iloc[0]), str(ts.iloc[-1])],
        "total_rows": int(n),
        "usable_rows": int(usable.sum()),
        "usable_ratio": round(usable_ratio, 4),
        "pass": bool(usable_ratio >= C.PASS_DATA_RATIO),
        "pass_threshold": C.PASS_DATA_RATIO,
        "counts": {
            "통신 두절": int(f_outage.sum()),
            "결측": int(f_missing.sum()),
            "고정값": int(f_stuck.sum()),
            "급변": int(f_spike.sum()),
            "정비": int(f_maint.sum()),
            "수동 조작": int(f_manual.sum()),
            "알람": int(f_alarm.sum()),
        },
        "blocks": blocks[:60],
        "block_total": len(blocks),
        "timeline": timeline,
        "column_missing": col_missing,
    }


def main() -> None:
    report = {"generated_for": "HD현대중공업 데이터센터 냉각 최적화 PoC", "zones": {}}
    for zone_id in C.ZONES:
        r = diagnose_zone(zone_id)
        report["zones"][zone_id] = r
        mark = "통과" if r["pass"] else "미달"
        print(f"[진단] {r['label']}: 비교 가능 시간 {r['usable_ratio']*100:.1f}% "
              f"(기준 {C.PASS_DATA_RATIO*100:.0f}% {mark}) · 결함 구간 {r['block_total']}개")
        for k, v in r["counts"].items():
            if v:
                print(f"         {k}: {v:,}분")

    out = C.REPORT_DIR / "diagnosis_report.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[진단] 완료 → {out}")


if __name__ == "__main__":
    main()
