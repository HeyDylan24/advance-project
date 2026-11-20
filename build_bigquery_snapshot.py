import argparse
import csv
import io
import json
import unicodedata
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent
COUNTRY_CENTERS = {
    "Australia": (-25.0, 133.0),
    "Austria": (47.5, 14.5),
    "Belgium": (50.5, 4.5),
    "Brazil": (-10.0, -53.0),
    "China": (35.0, 103.0),
    "Colombia": (4.0, -73.0),
    "France": (46.0, 2.0),
    "Germany": (51.0, 10.0),
    "Japan": (37.0, 138.0),
    "Poland": (52.0, 20.0),
    "South Korea": (36.0, 128.0),
    "Spain": (40.0, -4.0),
    "United Kingdom": (55.0, -3.0),
    "United States": (39.0, -98.0),
}
COUNTRY_LABELS = {
    "australia": "Australia",
    "austria": "Austria",
    "belgium": "Belgium",
    "brasil": "Brazil",
    "brazil": "Brazil",
    "china": "China",
    "colombia": "Colombia",
    "deutschland": "Germany",
    "espana": "Spain",
    "espaa": "Spain",
    "france": "France",
    "germany": "Germany",
    "japan": "Japan",
    "poland": "Poland",
    "south korea": "South Korea",
    "spain": "Spain",
    "united kingdom": "United Kingdom",
    "united states": "United States",
}


def _read_rows(archive, filename):
    with archive.open(filename) as raw:
        with io.TextIOWrapper(raw, encoding="utf-8-sig", newline="") as stream:
            yield from csv.DictReader(stream)


def _parse_datetime(value):
    if not value:
        return None
    normalized = value.strip().replace(" UTC", "").replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized).replace(tzinfo=None)
    except ValueError:
        return None


def _money(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _country_label(value):
    normalized = unicodedata.normalize("NFKD", value or "")
    key = normalized.encode("ascii", "ignore").decode("ascii").strip().lower()
    return COUNTRY_LABELS.get(key, (value or "Unknown").strip())


def build_snapshot(archive_path):
    with zipfile.ZipFile(archive_path) as archive:
        user_locations = {}
        for row in _read_rows(archive, "users.csv"):
            if row["id"]:
                user_locations[row["id"]] = {
                    "state": row["state"],
                    "country": _country_label(row["country"]),
                }
        products = {
            row["id"]: {
                "category": row["category"] or "Unknown",
                "department": row["department"] or "Unknown",
                "cost": _money(row["cost"]),
            }
            for row in _read_rows(archive, "products.csv")
            if row["id"]
        }

        orders = {}
        months = defaultdict(lambda: {"orders": 0, "sales": 0.0, "delivery_days": []})
        statuses = Counter()
        regions = defaultdict(lambda: {"orders": 0, "sales": 0.0})
        countries = defaultdict(lambda: {"orders": 0, "sales": 0.0})
        customers = set()
        delivery_days = []
        returned_orders = 0
        order_dates = []

        for row in _read_rows(archive, "orders.csv"):
            order_id = row["order_id"]
            created = _parse_datetime(row["created_at"])
            if not order_id:
                continue
            month = created.strftime("%Y-%m") if created else None
            location = user_locations.get(row["user_id"], {})
            state = location.get("state")
            country = location.get("country")
            status = (row["status"] or "unknown").strip()
            returned = bool(row["returned_at"]) or status.lower() == "returned"
            delivered = _parse_datetime(row["delivered_at"])
            days = (delivered - created).total_seconds() / 86400 if created and delivered else None
            if days is not None and days >= 0:
                delivery_days.append(days)
                if month:
                    months[month]["delivery_days"].append(days)

            orders[order_id] = {"month": month, "state": state, "country": country}
            if created:
                order_dates.append(created)
                months[month]["orders"] += 1
            if row["user_id"]:
                customers.add(row["user_id"])
            statuses[status] += 1
            returned_orders += int(returned)
            if state:
                regions[state]["orders"] += 1
            if country:
                countries[country]["orders"] += 1

        categories = defaultdict(lambda: {"sales": 0.0, "cost": 0.0, "items": 0, "orders": set()})
        departments = defaultdict(lambda: {"sales": 0.0, "items": 0})
        item_count = 0
        gross_sales = 0.0
        cost_total = 0.0
        for row in _read_rows(archive, "order_items.csv"):
            order = orders.get(row["order_id"])
            product = products.get(row["product_id"])
            if order is None:
                continue
            category = product["category"] if product else "Unknown"
            department = product["department"] if product else "Unknown"
            sales = _money(row["sale_price"])
            cost = product["cost"] if product else 0.0
            item_count += 1
            gross_sales += sales
            cost_total += cost
            categories[category]["sales"] += sales
            categories[category]["cost"] += cost
            categories[category]["items"] += 1
            categories[category]["orders"].add(row["order_id"])
            departments[department]["sales"] += sales
            departments[department]["items"] += 1
            if order["month"]:
                months[order["month"]]["sales"] += sales
            if order["state"]:
                regions[order["state"]]["sales"] += sales
            if order["country"]:
                countries[order["country"]]["sales"] += sales

        event_types = Counter()
        traffic_sources = Counter()
        event_count = 0
        for row in _read_rows(archive, "events.csv"):
            event_count += 1
            event_types[row["event_type"] or "unknown"] += 1
            traffic_sources[row["traffic_source"] or "unknown"] += 1

    month_rows = [
        {
            "label": month,
            "sales": round(values["sales"], 2),
            "orders": values["orders"],
            "average_delivery_days": (
                round(sum(values["delivery_days"]) / len(values["delivery_days"]), 2)
                if values["delivery_days"]
                else None
            ),
        }
        for month, values in sorted(months.items())
    ]
    category_rows = [
        {
            "label": label,
            "sales": round(values["sales"], 2),
            "share": round(values["sales"] / gross_sales * 100, 2) if gross_sales else 0,
            "items": values["items"],
            "orders": len(values["orders"]),
            "gross_margin": (
                round((values["sales"] - values["cost"]) / values["sales"] * 100, 2)
                if values["sales"]
                else 0
            ),
        }
        for label, values in sorted(categories.items(), key=lambda item: item[1]["sales"], reverse=True)[:10]
    ]
    status_rows = [
        {"label": label, "value": count}
        for label, count in statuses.most_common()
    ]
    region_rows = [
        {
            "label": label,
            "sales": round(values["sales"], 2),
            "orders": values["orders"],
            "share": round(values["sales"] / gross_sales * 100, 2) if gross_sales else 0,
        }
        for label, values in sorted(regions.items(), key=lambda item: item[1]["sales"], reverse=True)[:10]
    ]
    country_rows = [
        {
            "label": label,
            "sales": round(values["sales"], 2),
            "orders": values["orders"],
            "share": round(values["sales"] / gross_sales * 100, 2) if gross_sales else 0,
            "map_latitude": COUNTRY_CENTERS[label][0],
            "map_longitude": COUNTRY_CENTERS[label][1],
        }
        for label, values in sorted(countries.items(), key=lambda item: item[1]["sales"], reverse=True)
        if label in COUNTRY_CENTERS
    ]
    department_rows = [
        {
            "label": label,
            "sales": round(values["sales"], 2),
            "share": round(values["sales"] / gross_sales * 100, 2) if gross_sales else 0,
            "items": values["items"],
        }
        for label, values in sorted(departments.items(), key=lambda item: item[1]["sales"], reverse=True)
    ]
    total_orders = sum(statuses.values())
    return {
        "source": "Google BigQuery TheLook eCommerce export",
        "privacy_note": "Aggregated snapshot only; no customer-level identifiers or contact details are included.",
        "date_range": {
            "first_order": min(order_dates).date().isoformat() if order_dates else None,
            "last_order": max(order_dates).date().isoformat() if order_dates else None,
        },
        "metrics": {
            "orders": total_orders,
            "items": item_count,
            "customers": len(customers),
            "sales": round(gross_sales, 2),
            "average_order_value": round(gross_sales / total_orders, 2) if total_orders else 0,
            "return_rate": round(returned_orders / total_orders * 100, 2) if total_orders else 0,
            "average_delivery_days": (
                round(sum(delivery_days) / len(delivery_days), 2) if delivery_days else 0
            ),
            "gross_margin": (
                round((gross_sales - cost_total) / gross_sales * 100, 2)
                if gross_sales
                else 0
            ),
            "events": event_count,
        },
        "monthly": month_rows,
        "categories": category_rows,
        "statuses": status_rows,
        "regions": region_rows,
        "countries": country_rows,
        "departments": department_rows,
        "event_types": [
            {"label": label, "value": count}
            for label, count in event_types.most_common(8)
        ],
        "traffic_sources": [
            {"label": label, "value": count}
            for label, count in traffic_sources.most_common(6)
        ],
    }


def main():
    parser = argparse.ArgumentParser(
        description="Build a privacy-preserving aggregate snapshot from the BigQuery archive."
    )
    parser.add_argument("archive", type=Path, help="Path to the source ZIP archive")
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "src" / "data" / "googleBigQuerySummary.json",
        help="Output JSON path (defaults to src/data/googleBigQuerySummary.json)",
    )
    args = parser.parse_args()
    snapshot = build_snapshot(args.archive)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"Wrote aggregate snapshot: {snapshot['metrics']['orders']:,} orders, "
        f"{snapshot['metrics']['events']:,} events, "
        f"{len(snapshot['monthly'])} months"
    )


if __name__ == "__main__":
    main()
