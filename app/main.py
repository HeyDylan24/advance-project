import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row

from app.database import create_pool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool = create_pool()
    pool.open()
    pool.wait()
    app.state.db_pool = pool
    try:
        yield
    finally:
        pool.close()


app = FastAPI(title="Olist Commerce Analytics", lifespan=lifespan)


@app.get("/api/healthz")
def healthcheck(request: Request):
    try:
        with request.app.state.db_pool.connection() as connection:
            connection.execute("SELECT 1")
    except Exception as error:
        logger.exception("Database health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return {"status": "ok"}


@app.get("/api/dashboard")
def dashboard_data(request: Request) -> dict[str, Any]:
    queries = {
        "metrics": """
            SELECT
              (SELECT COUNT(*) FROM orders)::bigint AS orders,
              COALESCE((SELECT SUM(price) FROM order_items), 0)::float8 AS sales,
              COALESCE((
                SELECT AVG(order_total)
                FROM (
                  SELECT SUM(price) AS order_total
                  FROM order_items
                  GROUP BY order_id
                ) AS order_totals
              ), 0)::float8 AS average_order,
              COALESCE((SELECT AVG(score) FROM reviews), 0)::float8
                AS average_review,
              COALESCE((
                SELECT COUNT(*) FILTER (
                  WHERE delivered_at <= estimated_delivery_at
                )::float8 * 100
                / NULLIF(COUNT(*) FILTER (
                  WHERE delivered_at IS NOT NULL
                    AND estimated_delivery_at IS NOT NULL
                ), 0)
                FROM orders
              ), 0)::float8 AS on_time_rate,
              COALESCE((
                SELECT AVG(
                  EXTRACT(EPOCH FROM (delivered_at - purchased_at)) / 86400.0
                ) FILTER (
                  WHERE delivered_at IS NOT NULL AND purchased_at IS NOT NULL
                )
                FROM orders
              ), 0)::float8 AS average_delivery_days,
              (SELECT MAX(purchased_at) FROM orders) AS latest_purchase
        """,
        "monthly_sales": """
            SELECT TO_CHAR(DATE_TRUNC('month', o.purchased_at), 'YYYY-MM')
                     AS label,
                   COALESCE(SUM(i.price), 0)::float8 AS value
            FROM orders AS o
            JOIN order_items AS i ON i.order_id = o.order_id
            WHERE o.purchased_at IS NOT NULL
            GROUP BY DATE_TRUNC('month', o.purchased_at)
            ORDER BY DATE_TRUNC('month', o.purchased_at)
        """,
        "categories": """
            SELECT category AS label, SUM(price)::float8 AS sales,
                   COUNT(DISTINCT order_id)::int AS orders
            FROM order_items
            GROUP BY category
            ORDER BY SUM(price) DESC
            LIMIT 8
        """,
        "statuses": """
            SELECT status AS label, COUNT(*)::int AS value
            FROM orders
            GROUP BY status
            ORDER BY status
        """,
        "ratings": """
            SELECT score AS label, COUNT(*)::int AS value
            FROM reviews
            GROUP BY score
            ORDER BY score
        """,
    }

    try:
        with request.app.state.db_pool.connection() as connection:
            result = {}
            for name, query in queries.items():
                with connection.cursor(row_factory=dict_row) as cursor:
                    cursor.execute(query)
                    rows = cursor.fetchall()
                result[name] = rows[0] if name == "metrics" else rows
        return {
            "metrics": result["metrics"],
            "monthlySales": result["monthly_sales"],
            "categories": result["categories"],
            "statuses": result["statuses"],
            "ratings": result["ratings"],
        }
    except Exception as error:
        logger.exception("Unable to load dashboard data")
        raise HTTPException(
            status_code=503, detail="Unable to load dashboard data"
        ) from error


@app.get("/", include_in_schema=False)
def serve_dashboard():
    index = DIST_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(
            status_code=503,
            detail="Dashboard assets are missing. Run `npm run build` first.",
        )
    return FileResponse(index)


if (DIST_DIR / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=DIST_DIR / "assets"),
        name="assets",
    )
