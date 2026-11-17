import unittest

from app.forecast import build_forecast


def monthly_rows(values: list[float]) -> list[dict[str, float | str]]:
    year, month = 2016, 1
    rows = []
    for value in values:
        rows.append({"label": f"{year:04d}-{month:02d}", "value": value})
        month += 1
        if month == 13:
            year += 1
            month = 1
    return rows


class ForecastTests(unittest.TestCase):
    def test_selects_seasonal_naive_when_it_wins_rolling_backtest(self):
        seasonal_pattern = [80, 90, 100, 110, 125, 140, 155, 150, 135, 120, 110, 100]
        values = seasonal_pattern * 3

        result = build_forecast(monthly_rows(values))

        self.assertEqual(result["model"], "seasonal_naive")
        self.assertEqual(result["backtest"][0]["observations"], 24)
        self.assertEqual(result["backtest"][1]["wape"], 0)
        self.assertEqual(result["values"][0]["label"], "2019-01")
        self.assertEqual(result["values"][0]["value"], seasonal_pattern[0])
        self.assertEqual(result["values"][-1]["label"], "2019-06")

    def test_uses_naive_model_when_seasonality_has_insufficient_history(self):
        result = build_forecast(monthly_rows([100 + month for month in range(12)]))

        self.assertEqual(result["model"], "naive")
        self.assertEqual(len(result["backtest"]), 1)
        self.assertEqual(result["values"][0]["value"], 111)
        self.assertEqual(result["values"][0]["label"], "2017-01")

    def test_returns_unavailable_for_too_short_series(self):
        result = build_forecast(monthly_rows([100, 120, 90, 130, 110]))

        self.assertFalse(result["available"])
        self.assertEqual(result["values"], [])


if __name__ == "__main__":
    unittest.main()
