import logging
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from psycopg.rows import dict_row

from app.database import create_pool
from app.forecast import build_forecast

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
def dashboard_data(
    request: Request,
    year: int | None = Query(default=None, ge=2000, le=2100),
) -> dict[str, Any]:
    params = (year, year)
    queries = {
        "metrics": """
            SELECT
              (SELECT COUNT(*) FROM orders o
               WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s))
                AS orders,
              COALESCE((
                SELECT SUM(i.price)
                FROM order_items i JOIN orders o ON o.order_id = i.order_id
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS sales,
              COALESCE((
                SELECT AVG(order_total)
                FROM (
                  SELECT SUM(i.price) AS order_total
                  FROM order_items i JOIN orders o ON o.order_id = i.order_id
                  WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
                  GROUP BY o.order_id
                ) AS order_totals
              ), 0)::float8 AS average_order,
              COALESCE((
                SELECT AVG(r.score) FROM reviews r
                JOIN orders o ON o.order_id = r.order_id
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8
                AS average_review,
              COALESCE((
                SELECT COUNT(*) FILTER (WHERE r.score = 5)::float8 * 100
                  / NULLIF(COUNT(*), 0)
                FROM reviews r JOIN orders o ON o.order_id = r.order_id
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS five_star_rate,
              COALESCE((
                SELECT COUNT(*) FILTER (WHERE o.delivered_at <= o.estimated_delivery_at)::float8 * 100
                  / NULLIF(COUNT(*) FILTER (
                    WHERE o.delivered_at IS NOT NULL AND o.estimated_delivery_at IS NOT NULL
                  ), 0)
                FROM orders o
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS on_time_rate,
              COALESCE((
                SELECT COUNT(*) FILTER (WHERE o.status IN ('canceled', 'cancelled'))::float8 * 100
                  / NULLIF(COUNT(*), 0)
                FROM orders o
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS cancellation_rate,
              COALESCE((
                SELECT AVG(
                  EXTRACT(EPOCH FROM (o.delivered_at - o.purchased_at)) / 86400.0
                ) FILTER (
                  WHERE o.delivered_at IS NOT NULL AND o.purchased_at IS NOT NULL
                )
                FROM orders o
                WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS average_delivery_days,
              COALESCE((
                SELECT percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY EXTRACT(EPOCH FROM (o.delivered_at - o.purchased_at)) / 86400.0
                )
                FROM orders o
                WHERE o.delivered_at IS NOT NULL AND o.purchased_at IS NOT NULL
                  AND (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              ), 0)::float8 AS median_delivery_days,
              (SELECT MAX(o.purchased_at) FROM orders o
               WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s))
                AS latest_purchase
        """,
        "monthly_sales": """
            WITH monthly AS (
              SELECT DATE_TRUNC('month', o.purchased_at) AS month,
                     COALESCE(SUM(i.price), 0)::float8 AS sales,
                     COUNT(DISTINCT o.order_id)::int AS orders
              FROM orders o JOIN order_items i ON i.order_id = o.order_id
              WHERE o.purchased_at IS NOT NULL
                AND (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
              GROUP BY DATE_TRUNC('month', o.purchased_at)
            ), calendar AS (
              SELECT GENERATE_SERIES(
                (SELECT MIN(month) FROM monthly),
                (SELECT MAX(month) FROM monthly),
                INTERVAL '1 month'
              ) AS month
            ), complete_monthly AS (
              SELECT c.month, COALESCE(m.sales, 0)::float8 AS sales,
                     COALESCE(m.orders, 0)::int AS orders
              FROM calendar c
              LEFT JOIN monthly m ON m.month = c.month
            )
            SELECT TO_CHAR(month, 'YYYY-MM') AS label,
                   sales AS value,
                   orders,
                   ((sales - LAG(sales) OVER (ORDER BY month))
                    / NULLIF(LAG(sales) OVER (ORDER BY month), 0) * 100)::float8
                    AS growth_rate
            FROM complete_monthly
            ORDER BY month
        """,
        "categories": """
            WITH selected_sales AS (
              SELECT COALESCE(SUM(i.price), 0) AS total
              FROM order_items i JOIN orders o ON o.order_id = i.order_id
              WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
            )
            SELECT i.category AS label,
                   SUM(i.price)::float8 AS sales,
                   COUNT(DISTINCT i.order_id)::int AS orders,
                   AVG(i.price)::float8 AS average_item_price,
                   (SUM(i.price) / NULLIF(s.total, 0) * 100)::float8 AS sales_share
            FROM order_items i
            JOIN orders o ON o.order_id = i.order_id
            CROSS JOIN selected_sales s
            WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
            GROUP BY i.category, s.total
            ORDER BY SUM(i.price) DESC
            LIMIT 8
        """,
        "statuses": """
            SELECT o.status AS label, COUNT(*)::int AS value
            FROM orders o
            WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
            GROUP BY o.status
            ORDER BY o.status
        """,
        "ratings": """
            SELECT r.score AS label, COUNT(*)::int AS value
            FROM reviews r JOIN orders o ON o.order_id = r.order_id
            WHERE (%s::int IS NULL OR EXTRACT(YEAR FROM o.purchased_at) = %s)
            GROUP BY r.score
            ORDER BY r.score
        """,
        "years": """
            SELECT DISTINCT EXTRACT(YEAR FROM purchased_at)::int AS year
            FROM orders
            WHERE purchased_at IS NOT NULL
            ORDER BY year DESC
        """,
    }

    try:
        with request.app.state.db_pool.connection() as connection:
            result = {}
            for name, query in queries.items():
                with connection.cursor(row_factory=dict_row) as cursor:
                    query_params = params * (query.count("%s") // 2)
                    cursor.execute(query, query_params)
                    rows = cursor.fetchall()
                result[name] = rows[0] if name == "metrics" else rows
        return {
            "metrics": result["metrics"],
            "monthlySales": result["monthly_sales"],
            "categories": result["categories"],
            "statuses": result["statuses"],
            "ratings": result["ratings"],
            "years": [row["year"] for row in result["years"]],
            "forecast": build_forecast(result["monthly_sales"]),
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
