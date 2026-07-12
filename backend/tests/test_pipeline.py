import numpy as np
import pandas as pd
import pytest

from app.ml.pipeline import (
    MIN_RAW_ROWS,
    build_features,
    impute_from_train,
    rank_key,
    time_split,
    train_and_evaluate,
)


def _synthetic_df(n_days=200, seed=0):
    rng = np.random.default_rng(seed)
    dates = pd.date_range("2024-01-01", periods=n_days, freq="D")
    demand = 2000 + 50 * np.sin(np.arange(n_days) / 7) + rng.normal(0, 30, n_days)
    avg_price = rng.normal(22, 1, n_days)
    avg_price[::10] = np.nan  # sprinkle some missing values
    return pd.DataFrame(
        {
            "date": dates,
            "demand": demand,
            "avg_price": avg_price,
            "cost_price": rng.normal(17, 1, n_days),
            "production_volume": rng.normal(2200, 100, n_days),
            "season": "ฤดูหนาว",
            "is_holiday": False,
            "avg_temp": rng.normal(27, 2, n_days),
            "rainfall": rng.normal(80, 20, n_days),
            "tourists": rng.normal(45000, 2000, n_days),
            "channel": "ค้าปลีก",
            "has_promotion": False,
        }
    )


def test_impute_from_train_does_not_use_test_statistics():
    df = _synthetic_df()
    feat, _ = build_features(df)
    train_df, test_df = time_split(feat)

    # Deliberately make train and test means very different so leakage
    # would be detectable: force all train avg_price NaN except one low
    # value, and all test avg_price to a very high value.
    train_df = train_df.copy()
    test_df = test_df.copy()
    train_df["avg_price"] = np.nan
    train_df.loc[train_df.index[0], "avg_price"] = 10.0
    test_df["avg_price"] = 999.0

    _, filled_test, train_means = impute_from_train(train_df, test_df, ["avg_price"])

    assert train_means["avg_price"] == 10.0
    # test_df had no NaNs, so imputation must leave its real values alone —
    # this proves fillna only touches missing cells, not all of test.
    assert (filled_test["avg_price"] == 999.0).all()


def test_train_test_split_is_chronological_not_random():
    df = _synthetic_df()
    feat, _ = build_features(df)
    train_df, test_df = time_split(feat)

    assert train_df["date"].max() < test_df["date"].min()
    assert len(train_df) + len(test_df) == len(feat)


def test_usable_rows_drops_exactly_warmup_days():
    df = _synthetic_df(n_days=100)
    feat, _ = build_features(df)
    assert len(feat) == 100 - 30


def test_insufficient_data_raises():
    df = _synthetic_df(n_days=MIN_RAW_ROWS - 1)
    with pytest.raises(ValueError):
        train_and_evaluate(df, "random_forest")


def test_rank_key_prefers_lower_mape():
    a = {"mape": 5.0, "rmse": 100.0, "r2": 0.9}
    b = {"mape": 6.0, "rmse": 50.0, "r2": 0.95}
    assert min([a, b], key=rank_key) is a


def test_rank_key_tie_breaks_on_rmse_then_r2():
    a = {"mape": 5.04, "rmse": 120.0, "r2": 0.9}  # rounds to 5.0
    b = {"mape": 5.02, "rmse": 90.0, "r2": 0.8}  # rounds to 5.0, lower rmse
    assert min([a, b], key=rank_key) is b
