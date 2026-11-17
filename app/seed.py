import csv
from datetime import datetime
from pathlib import Path

from sqlalchemy import func, insert, select

from app import create_app, db
from app.models import Order, OrderItem, Review

ROOT = Path(__file__).resolve().parent.parent
BATCH_SIZE = 2000


def _read_csv(filename: str):
    path = ROOT / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required dataset is missing: {path}")
    with path.open(encoding="utf-8-sig", newline="") as dataset:
        yield from csv.DictReader(dataset)


def _date(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _batches(rows, table, connection):
    batch = []
    for row in rows:
        batch.append(row)
        if len(batch) == BATCH_SIZE:
            connection.execute(insert(table), batch)
            batch.clear()
    if batch:
        connection.execute(insert(table), batch)


def seed_database() -> bool:
    app = create_app()
    with app.app_context():
        db.create_all()
        with db.engine.begin() as connection:
            existing_orders = connection.scalar(
                select(func.count()).select_from(Order.__table__)
            )
            if existing_orders:
                print(
                    f"Database already contains {existing_orders:,} orders; "
                    "skipping import."
                )
                return False

            print("Importing orders...")
            _batches(
                (
                    {
                        "order_id": row["order_id"],
                        "status": row["order_status"] or "unknown",
                        "purchased_at": _date(row["order_purchase_timestamp"]),
                        "delivered_at": _date(
                            row["order_delivered_customer_date"]
                        ),
                        "estimated_delivery_at": _date(
                            row["order_estimated_delivery_date"]
                        ),
                    }
                    for row in _read_csv("olist_orders_dataset.csv")
                ),
                Order.__table__,
                connection,
            )

            translations = {
                row["product_category_name"]: row["product_category_name_english"]
                for row in _read_csv("product_category_name_translation.csv")
            }
            categories = {
                row["product_id"]: translations.get(
                    row["product_category_name"], "Uncategorized"
                )
                for row in _read_csv("olist_products_dataset.csv")
            }

            print("Importing order items...")
            _batches(
                (
                    {
                        "order_id": row["order_id"],
                        "item_id": int(row["order_item_id"]),
                        "category": categories.get(row["product_id"], "Uncategorized")
                        or "Uncategorized",
                        "price": float(row["price"]),
                        "freight_value": float(row["freight_value"]),
                    }
                    for row in _read_csv("olist_order_items_dataset.csv")
                ),
                OrderItem.__table__,
                connection,
            )

            print("Importing reviews...")
            _batches(
                (
                    {
                        "review_id": row["review_id"],
                        "order_id": row["order_id"],
                        "score": int(row["review_score"]),
                    }
                    for row in _read_csv("olist_order_reviews_dataset.csv")
                ),
                Review.__table__,
                connection,
            )

        print("Dataset import complete.")
        return True


if __name__ == "__main__":
    seed_database()
