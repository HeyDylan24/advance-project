from datetime import date
from math import ceil
from typing import Any


def _next_month(month: date) -> date:
    if month.month == 12:
        return date(month.year + 1, 1, 1)
    return date(month.year, month.month + 1, 1)


def _wape(actual: list[float], predicted: list[float]) -> float | None:
    denominator = sum(abs(value) for value in actual)
    if not actual or denominator == 0:
        return None
    return sum(abs(value - estimate) for value, estimate in zip(actual, predicted)) / denominator * 100


def _mae(actual: list[float], predicted: list[float]) -> float | None:
    if not actual:
        return None
    return sum(abs(value - estimate) for value, estimate in zip(actual, predicted)) / len(actual)


def _error_quantile(errors: list[float], probability: float = 0.9) -> float:
    if not errors:
        return 0.0
    ordered = sorted(errors)
    return ordered[max(0, ceil(probability * len(ordered)) - 1)]


def build_forecast(monthly_sales: list[dict[str, Any]], horizon: int = 6) -> dict[str, Any]:
    """Compare naïve and seasonal-naïve forecasts using expanding-window backtests."""
    series = [
        (date.fromisoformat(f"{row['label']}-01"), float(row["value"]))
        for row in monthly_sales
    ]
    series.sort(key=lambda point: point[0])

    if len(series) < 6:
        return {
            "available": False,
            "reason": "At least six consecutive months are needed to create a forecast.",
            "training_months": len(series),
            "horizon_months": horizon,
            "backtest": [],
            "values": [],
        }

    actual = [value for _, value in series]
    has_seasonal_history = len(actual) >= 24
    naive_actual: list[float] = []
    naive_predictions: list[float] = []
    seasonal_actual: list[float] = []
    seasonal_predictions: list[float] = []

    first_backtest_index = 12 if has_seasonal_history else 1
    for index in range(first_backtest_index, len(actual)):
        naive_actual.append(actual[index])
        naive_predictions.append(actual[index - 1])
        if has_seasonal_history:
            seasonal_actual.append(actual[index])
            seasonal_predictions.append(actual[index - 12])

    naive_wape = _wape(naive_actual, naive_predictions)
    seasonal_wape = _wape(seasonal_actual, seasonal_predictions)
    if has_seasonal_history and seasonal_wape is not None and (
        naive_wape is None or seasonal_wape <= naive_wape
    ):
        model = "seasonal_naive"
        residuals = [
            abs(target - prediction)
            for target, prediction in zip(seasonal_actual, seasonal_predictions)
        ]
    else:
        model = "naive"
        residuals = [
            abs(target - prediction)
            for target, prediction in zip(naive_actual, naive_predictions)
        ]

    interval = _error_quantile(residuals)
    last_month = series[-1][0]
    forecast_values = []
    for step in range(1, horizon + 1):
        target_month = last_month
        for _ in range(step):
            target_month = _next_month(target_month)
        prediction = actual[-12 + ((step - 1) % 12)] if model == "seasonal_naive" else actual[-1]
        forecast_values.append(
            {
                "label": target_month.strftime("%Y-%m"),
                "value": round(prediction, 2),
                "lower": round(max(0.0, prediction - interval), 2),
                "upper": round(prediction + interval, 2),
            }
        )

    backtest = [
        {
            "model": "naive",
            "wape": round(naive_wape, 2) if naive_wape is not None else None,
            "mae": round(_mae(naive_actual, naive_predictions) or 0, 2),
            "observations": len(naive_actual),
        }
    ]
    if has_seasonal_history:
        backtest.append(
            {
                "model": "seasonal_naive",
                "wape": round(seasonal_wape, 2) if seasonal_wape is not None else None,
                "mae": round(_mae(seasonal_actual, seasonal_predictions) or 0, 2),
                "observations": len(seasonal_actual),
            }
        )

    return {
        "available": True,
        "model": model,
        "model_label": "Seasonal naïve" if model == "seasonal_naive" else "Naïve",
        "training_months": len(series),
        "horizon_months": horizon,
        "last_observed_month": last_month.strftime("%Y-%m"),
        "backtest": backtest,
        "interval_method": "90th percentile of rolling one-step absolute errors",
        "values": forecast_values,
    }
