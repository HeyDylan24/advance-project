import csv
import logging
from datetime import datetime
from pathlib import Path
from typing import Iterator

from app.database import create_pool

ROOT = Path(__file__).resolve().parent.parent
logger = logging.getLogger(__name__)

SCHEMA = """
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      purchased_at TIMESTAMP,
      delivered_at TIMESTAMP,
      estimated_delivery_at TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL REFERENCES orders(order_id),
      item_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      freight_value DOUBLE PRECISION NOT NULL,
      PRIMARY KEY (order_id, item_id)
    );
    CREATE TABLE IF NOT EXISTS reviews (
      review_id TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(order_id),
      score INTEGER NOT NULL,
      PRIMARY KEY (review_id, order_id)
    );
    CREATE TABLE IF NOT EXISTS dataset_imports (
      dataset_key TEXT PRIMARY KEY,
      imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS order_items_category_idx ON order_items(category);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status);
    CREATE INDEX IF NOT EXISTS orders_purchase_idx ON orders(purchased_at);
    CREATE INDEX IF NOT EXISTS reviews_order_idx ON reviews(order_id);
"""


def _read_csv(filename: str) -> Iterator[dict[str, str]]:
    path = ROOT / filename
    if not path.is_file():
        raise FileNotFoundError(f"Required dataset is missing: {path}")
    with path.open(encoding="utf-8-sig", newline="") as dataset:
        yield from csv.DictReader(dataset)


def _date(value: str) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


def _copy_rows(connection, table: str, columns: tuple[str, ...], rows) -> int:
    count = 0
    copy_statement = f"COPY {table} ({', '.join(columns)}) FROM STDIN"
    with connection.cursor().copy(copy_statement) as copy:
        for row in rows:
            copy.write_row(tuple(row[column] for column in columns))
            count += 1
    return count


def seed_database() -> bool:
    pool = create_pool()
    pool.open()
    try:
        with pool.connection() as connection:
            connection.execute(SCHEMA)
            connection.commit()
            with connection.transaction():
                connection.execute("SELECT pg_advisory_xact_lock(847201116)")
                imported = connection.execute(
                    "SELECT 1 FROM dataset_imports WHERE dataset_key = %s",
                    ("olist",),
                ).fetchone()
                if imported:
                    logger.info("Olist dataset is already imported; skipping.")
                    return False

                existing_counts = connection.execute(
                    """
                    SELECT
                      (SELECT COUNT(*) FROM orders),
                      (SELECT COUNT(*) FROM order_items),
                      (SELECT COUNT(*) FROM reviews)
                    """
                ).fetchone()
                if any(existing_counts):
                    if not all(existing_counts):
                        raise RuntimeError(
                            "Neon contains a partial Olist import "
                            f"(orders={existing_counts[0]}, "
                            f"items={existing_counts[1]}, "
                            f"reviews={existing_counts[2]}). "
                            "Inspect the existing tables before retrying."
                        )
                    connection.execute(
                        "INSERT INTO dataset_imports (dataset_key) VALUES (%s)",
                        ("olist",),
                    )
                    logger.info(
                        "Existing Olist data found "
                        "(orders=%s, items=%s, reviews=%s); "
                        "marking it imported and skipping duplicate CSV rows.",
                        *existing_counts,
                    )
                    return False

                logger.info("Importing Olist orders...")
                order_count = _copy_rows(
                    connection,
                    "orders",
                    (
                        "order_id",
                        "status",
                        "purchased_at",
                        "delivered_at",
                        "estimated_delivery_at",
                    ),
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
                )

                translations = {
                    row["product_category_name"]: row[
                        "product_category_name_english"
                    ]
                    for row in _read_csv("product_category_name_translation.csv")
                }
                categories = {
                    row["product_id"]: translations.get(
                        row["product_category_name"], "Uncategorized"
                    )
                    or "Uncategorized"
                    for row in _read_csv("olist_products_dataset.csv")
                }

                logger.info("Importing Olist order items...")
                item_count = _copy_rows(
                    connection,
                    "order_items",
                    ("order_id", "item_id", "category", "price", "freight_value"),
                    (
                        {
                            "order_id": row["order_id"],
                            "item_id": int(row["order_item_id"]),
                            "category": categories.get(row["product_id"], "Uncategorized"),
                            "price": float(row["price"]),
                            "freight_value": float(row["freight_value"]),
                        }
                        for row in _read_csv("olist_order_items_dataset.csv")
                    ),
                )

                logger.info("Importing Olist reviews...")
                review_count = _copy_rows(
                    connection,
                    "reviews",
                    ("review_id", "order_id", "score"),
                    (
                        {
                            "review_id": row["review_id"],
                            "order_id": row["order_id"],
                            "score": int(row["review_score"]),
                        }
                        for row in _read_csv("olist_order_reviews_dataset.csv")
                    ),
                )
                connection.execute(
                    "INSERT INTO dataset_imports (dataset_key) VALUES (%s)",
                    ("olist",),
                )

            logger.info(
                "Olist import complete: %s orders, %s items, %s reviews.",
                order_count,
                item_count,
                review_count,
            )
            return True
    except Exception:
        logger.exception("Olist data import failed.")
        raise
    finally:
        pool.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_database()
