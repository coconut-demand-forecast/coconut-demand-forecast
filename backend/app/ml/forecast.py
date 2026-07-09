import numpy as np
import pandas as pd

Z_80 = 1.28


def generate_forecast(
    records_df: pd.DataFrame,
    model,
    feature_cols: list[str],
    horizon_days: int,
    residual_std: float,
) -> list[dict]:
    history = records_df.sort_values("date").reset_index(drop=True).copy()
    history["date"] = pd.to_datetime(history["date"])
    history["is_holiday"] = history["is_holiday"].fillna(False).astype(int)
    history["has_promotion"] = history["has_promotion"].fillna(False).astype(int)

    exo_cols = ["avg_price", "cost_price", "production_volume", "avg_temp", "rainfall", "tourists"]
    for col in exo_cols:
        history[col] = pd.to_numeric(history[col], errors="coerce")

    monthly_avg = history.groupby(history["date"].dt.month)[exo_cols].mean()
    overall_avg = history[exo_cols].mean()

    last_row = history.iloc[-1]
    last_season = last_row["season"] if pd.notna(last_row["season"]) else "ไม่ระบุ"
    last_channel = last_row["channel"] if pd.notna(last_row["channel"]) else "ไม่ระบุ"
    last_promotion = int(last_row["has_promotion"])

    demand_series = list(history["demand"].astype(float))
    last_date = history["date"].iloc[-1]

    points = []
    for step in range(1, horizon_days + 1):
        next_date = last_date + pd.Timedelta(days=step)
        month = next_date.month
        m = monthly_avg.loc[month] if month in monthly_avg.index else overall_avg

        row = {
            "avg_price": float(m["avg_price"]) if pd.notna(m["avg_price"]) else float(overall_avg["avg_price"]),
            "cost_price": float(m["cost_price"]) if pd.notna(m["cost_price"]) else float(overall_avg["cost_price"]),
            "production_volume": float(m["production_volume"]) if pd.notna(m["production_volume"]) else float(overall_avg["production_volume"]),
            "avg_temp": float(m["avg_temp"]) if pd.notna(m["avg_temp"]) else float(overall_avg["avg_temp"]),
            "rainfall": float(m["rainfall"]) if pd.notna(m["rainfall"]) else float(overall_avg["rainfall"]),
            "tourists": float(m["tourists"]) if pd.notna(m["tourists"]) else float(overall_avg["tourists"]),
            "is_holiday": 0,
            "has_promotion": last_promotion,
            "month": month,
            "day_of_week": next_date.dayofweek,
            "is_weekend": int(next_date.dayofweek >= 5),
            "lag_1": demand_series[-1],
            "lag_7": demand_series[-7] if len(demand_series) >= 7 else demand_series[0],
            "lag_30": demand_series[-30] if len(demand_series) >= 30 else demand_series[0],
            "roll_mean_7": float(np.mean(demand_series[-7:])),
            "roll_mean_30": float(np.mean(demand_series[-30:])),
        }

        for col in feature_cols:
            if col.startswith("season_"):
                row.setdefault(col, 1 if col == f"season_{last_season}" else 0)
            elif col.startswith("channel_"):
                row.setdefault(col, 1 if col == f"channel_{last_channel}" else 0)

        X = pd.DataFrame([row])[feature_cols]
        pred = float(model.predict(X)[0])
        pred = max(pred, 0.0)

        lower = max(pred - Z_80 * residual_std, 0.0)
        upper = pred + Z_80 * residual_std

        points.append(
            {"date": next_date.date(), "predicted": round(pred, 1), "lower": round(lower, 1), "upper": round(upper, 1)}
        )

        demand_series.append(pred)

    return points
