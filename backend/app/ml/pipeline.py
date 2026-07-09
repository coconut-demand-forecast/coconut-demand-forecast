import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

BASE_NUMERIC_COLS = [
    "avg_price",
    "cost_price",
    "production_volume",
    "avg_temp",
    "rainfall",
    "tourists",
]

MODEL_FACTORY = {
    "random_forest": lambda: RandomForestRegressor(
        n_estimators=300, max_depth=12, random_state=42, n_jobs=-1
    ),
    "xgboost": lambda: XGBRegressor(
        n_estimators=300, max_depth=6, learning_rate=0.05, random_state=42, n_jobs=-1
    ),
    "lightgbm": lambda: LGBMRegressor(
        n_estimators=300,
        max_depth=-1,
        learning_rate=0.05,
        random_state=42,
        n_jobs=-1,
        verbosity=-1,
    ),
}

FEATURE_LABELS = {
    "avg_price": "ราคาขายเฉลี่ย",
    "cost_price": "ราคาหน้าสวน/ต้นทุน",
    "production_volume": "ปริมาณผลผลิต",
    "avg_temp": "อุณหภูมิเฉลี่ย",
    "rainfall": "ปริมาณน้ำฝน",
    "tourists": "จำนวนนักท่องเที่ยว",
    "is_holiday": "วันหยุด/เทศกาล",
    "has_promotion": "โปรโมชั่น",
    "month": "เดือน",
    "day_of_week": "วันในสัปดาห์",
    "is_weekend": "วันหยุดสุดสัปดาห์",
    "lag_1": "ยอดขายเมื่อวาน (lag 1)",
    "lag_7": "ยอดขาย 7 วันก่อน (lag 7)",
    "lag_30": "ยอดขาย 30 วันก่อน (lag 30)",
    "roll_mean_7": "ค่าเฉลี่ย 7 วันย้อนหลัง",
    "roll_mean_30": "ค่าเฉลี่ย 30 วันย้อนหลัง",
}


def feature_label(col: str) -> str:
    if col in FEATURE_LABELS:
        return FEATURE_LABELS[col]
    if col.startswith("season_"):
        return f"ฤดูกาล: {col[len('season_'):]}"
    if col.startswith("channel_"):
        return f"ช่องทางจำหน่าย: {col[len('channel_'):]}"
    return col


def build_features(records_df: pd.DataFrame):
    df = records_df.sort_values("date").reset_index(drop=True).copy()
    df["date"] = pd.to_datetime(df["date"])

    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_holiday"] = df["is_holiday"].fillna(False).astype(int)
    df["has_promotion"] = df["has_promotion"].fillna(False).astype(int)

    for col in BASE_NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")
        df[col] = df[col].fillna(df[col].mean())

    df["season"] = df["season"].fillna("ไม่ระบุ").replace("", "ไม่ระบุ")
    df["channel"] = df["channel"].fillna("ไม่ระบุ").replace("", "ไม่ระบุ")
    season_dummies = pd.get_dummies(df["season"], prefix="season")
    channel_dummies = pd.get_dummies(df["channel"], prefix="channel")

    df["lag_1"] = df["demand"].shift(1)
    df["lag_7"] = df["demand"].shift(7)
    df["lag_30"] = df["demand"].shift(30)
    df["roll_mean_7"] = df["demand"].shift(1).rolling(7).mean()
    df["roll_mean_30"] = df["demand"].shift(1).rolling(30).mean()

    feat = pd.concat([df, season_dummies, channel_dummies], axis=1)

    feature_cols = (
        BASE_NUMERIC_COLS
        + [
            "is_holiday",
            "has_promotion",
            "month",
            "day_of_week",
            "is_weekend",
            "lag_1",
            "lag_7",
            "lag_30",
            "roll_mean_7",
            "roll_mean_30",
        ]
        + list(season_dummies.columns)
        + list(channel_dummies.columns)
    )

    feat = feat.dropna(subset=["lag_30", "roll_mean_30"]).reset_index(drop=True)
    return feat, feature_cols


def time_split(feat: pd.DataFrame, test_ratio: float = 0.2):
    n = len(feat)
    split = max(int(n * (1 - test_ratio)), 1)
    return feat.iloc[:split], feat.iloc[split:]


def train_and_evaluate(records_df: pd.DataFrame, model_type: str) -> dict:
    if model_type not in MODEL_FACTORY:
        raise ValueError(f"ไม่รู้จักโมเดล: {model_type}")

    feat, feature_cols = build_features(records_df)
    if len(feat) < 40:
        raise ValueError(
            "ข้อมูลไม่เพียงพอสำหรับเทรนโมเดล (ต้องการข้อมูลอย่างน้อยประมาณ 70 วันขึ้นไป)"
        )

    train_df, test_df = time_split(feat)
    X_train, y_train = train_df[feature_cols], train_df["demand"]
    X_test, y_test = test_df[feature_cols], test_df["demand"]

    model = MODEL_FACTORY[model_type]()
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    mae = float(mean_absolute_error(y_test, y_pred))
    rmse = float(mean_squared_error(y_test, y_pred) ** 0.5)
    mape = float(
        np.mean(np.abs((y_test.values - y_pred) / np.clip(y_test.values, 1e-6, None))) * 100
    )
    r2 = float(r2_score(y_test, y_pred))
    residual_std = float(np.std(y_test.values - y_pred))

    importances = getattr(model, "feature_importances_", None)
    feature_importance = {}
    if importances is not None:
        total = float(np.sum(importances)) or 1.0
        pct = {
            feature_label(col): round(float(v) / total * 100, 2)
            for col, v in zip(feature_cols, importances)
        }
        feature_importance = dict(sorted(pct.items(), key=lambda kv: -kv[1])[:8])

    return {
        "model": model,
        "feature_cols": feature_cols,
        "mae": mae,
        "rmse": rmse,
        "mape": mape,
        "r2": r2,
        "residual_std": residual_std,
        "feature_importance": feature_importance,
    }
