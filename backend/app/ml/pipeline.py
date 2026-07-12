import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from xgboost import XGBRegressor

# Lag/rolling features need 30 prior days of history before they're defined,
# so the first WARMUP_DAYS rows of any dataset are always dropped.
WARMUP_DAYS = 30
# Below this many usable (post-warmup) rows, an 80/20 split leaves too few
# test rows for MAPE/RMSE to mean anything, so training is refused.
MIN_USABLE_ROWS = 40
MIN_RAW_ROWS = WARMUP_DAYS + MIN_USABLE_ROWS

TEST_RATIO = 0.2

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

# None of these models have been hyperparameter-tuned (grid/random/Bayesian
# search) for this dataset — the values above are reasonable defaults only.
HYPERPARAMETERS_TUNED = False

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
    "lag_1": "ความต้องการย้อนหลัง 1 วัน",
    "lag_7": "ความต้องการย้อนหลัง 7 วัน",
    "lag_30": "ความต้องการย้อนหลัง 30 วัน",
    "roll_mean_7": "ค่าเฉลี่ยความต้องการย้อนหลัง 7 วัน",
    "roll_mean_30": "ค่าเฉลี่ยความต้องการย้อนหลัง 30 วัน",
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
    """Build the model feature matrix WITHOUT imputing any statistics.

    Date-derived fields (month/day-of-week/weekend), lag/rolling demand
    features, and the season/channel one-hot columns are all either
    deterministic from the date or look only at past demand — none of
    that depends on train/test split and none of it leaks future
    information. What IS split-dependent is imputing missing exogenous
    values (price, temperature, ...) — those NaNs are deliberately left
    in place here and filled later, in `impute_from_train`, using only
    statistics from the training portion. Call `build_features` once,
    then `time_split`, then `impute_from_train` — in that order.
    """
    df = records_df.sort_values("date").reset_index(drop=True).copy()
    df["date"] = pd.to_datetime(df["date"])

    df["month"] = df["date"].dt.month
    df["day_of_week"] = df["date"].dt.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["is_holiday"] = df["is_holiday"].fillna(False).astype(int)
    df["has_promotion"] = df["has_promotion"].fillna(False).astype(int)

    for col in BASE_NUMERIC_COLS:
        df[col] = pd.to_numeric(df[col], errors="coerce")  # NaNs kept, filled later from train stats only

    df["season"] = df["season"].fillna("ไม่ระบุ").replace("", "ไม่ระบุ")
    df["channel"] = df["channel"].fillna("ไม่ระบุ").replace("", "ไม่ระบุ")
    season_dummies = pd.get_dummies(df["season"], prefix="season")
    channel_dummies = pd.get_dummies(df["channel"], prefix="channel")

    # Lag/rolling look only backward in time relative to each row, so
    # computing them on the full chronological series before splitting is
    # not leakage: a test-set row's lag features only ever reference demand
    # that already happened (often in the training period), exactly as
    # they would at real prediction time.
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


def time_split(feat: pd.DataFrame, test_ratio: float = TEST_RATIO):
    """Chronological split — never shuffle a time series. The first
    (1-test_ratio) share of rows (oldest) becomes train, the rest (most
    recent) becomes test, matching how the model would actually be used:
    trained on the past, evaluated on more recent unseen days."""
    n = len(feat)
    split = max(int(n * (1 - test_ratio)), 1)
    return feat.iloc[:split].copy(), feat.iloc[split:].copy()


def impute_from_train(train_df: pd.DataFrame, test_df: pd.DataFrame, cols: list[str]):
    """Fill missing exogenous values using ONLY training-set means.

    Applying the same train-derived means to the test set (rather than
    each split's own mean) is what prevents test-period statistics from
    leaking into how training data gets filled, and vice versa.
    """
    train_means = train_df[cols].mean()
    train_df = train_df.copy()
    test_df = test_df.copy()
    train_df[cols] = train_df[cols].fillna(train_means)
    test_df[cols] = test_df[cols].fillna(train_means)
    return train_df, test_df, train_means


def train_and_evaluate(records_df: pd.DataFrame, model_type: str) -> dict:
    if model_type not in MODEL_FACTORY:
        raise ValueError(f"ไม่รู้จักโมเดล: {model_type}")

    feat, feature_cols = build_features(records_df)
    if len(feat) < MIN_USABLE_ROWS:
        raise ValueError(
            f"ข้อมูลไม่เพียงพอสำหรับเทรนโมเดล ต้องการข้อมูลดิบอย่างน้อย {MIN_RAW_ROWS} วัน "
            f"(ตัดข้อมูล {WARMUP_DAYS} วันแรกสำหรับสร้าง Lag/Rolling Mean แล้วเหลือใช้ได้จริง {len(feat)} วัน "
            f"ต้องการอย่างน้อย {MIN_USABLE_ROWS} วัน)"
        )

    train_df, test_df = time_split(feat)
    train_df, test_df, train_means = impute_from_train(train_df, test_df, BASE_NUMERIC_COLS)

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

    test_dates = pd.to_datetime(test_df["date"]).dt.date.tolist()
    test_predictions = [
        {
            "date": d,
            "actual": round(float(a), 1),
            "predicted": round(float(p), 1),
            "error": round(float(p) - float(a), 1),
        }
        for d, a, p in zip(test_dates, y_test.values, y_pred)
    ]

    return {
        "model": model,
        "feature_cols": feature_cols,
        "train_means": train_means,
        "mae": mae,
        "rmse": rmse,
        "mape": mape,
        "r2": r2,
        "residual_std": residual_std,
        "feature_importance": feature_importance,
        "usable_rows": len(feat),
        "train_size": len(train_df),
        "test_size": len(test_df),
        "hyperparameters_tuned": HYPERPARAMETERS_TUNED,
        "parameters": _model_params(model_type),
        "test_predictions": test_predictions,
    }


def _model_params(model_type: str) -> dict:
    """Human-readable hyperparameters actually used to train, for logging."""
    params = {
        "random_forest": {"n_estimators": 300, "max_depth": 12, "random_state": 42},
        "xgboost": {"n_estimators": 300, "max_depth": 6, "learning_rate": 0.05, "random_state": 42},
        "lightgbm": {"n_estimators": 300, "max_depth": -1, "learning_rate": 0.05, "random_state": 42},
    }
    return params[model_type]


def rank_key(result_like) -> tuple:
    """Best-model ranking used everywhere in the app: lowest MAPE first,
    ties within 0.1 percentage point broken by lowest RMSE, further ties
    broken by highest R². `result_like` needs .mape, .rmse, .r2 attributes
    or dict keys — pass whichever object each caller already has."""
    def get(obj, key):
        return obj[key] if isinstance(obj, dict) else getattr(obj, key)

    mape_bucket = round(get(result_like, "mape"), 1)  # 0.1-point tolerance for "close enough"
    return (mape_bucket, get(result_like, "rmse"), -get(result_like, "r2"))
