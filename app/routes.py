from flask import Blueprint, render_template
from sqlalchemy import extract, func, select, text

from app import db
from app.models import Order, OrderItem, Review

dashboard = Blueprint("dashboard", __name__)


def _monthly_sales():
    dialect = db.session.get_bind().dialect.name
    if dialect == "postgresql":
        month = func.to_char(Order.purchased_at, "YYYY-MM")
    else:
        month = func.strftime("%Y-%m", Order.purchased_at)

    rows = db.session.execute(
        select(month, func.sum(OrderItem.price))
        .join(Order, Order.order_id == OrderItem.order_id)
        .where(Order.purchased_at.is_not(None))
        .group_by(month)
        .order_by(month)
    ).all()
    return [{"label": label, "value": round(float(value or 0), 2)} for label, value in rows]


@dashboard.get("/")
def index():
    order_count = db.session.scalar(select(func.count()).select_from(Order))
    if not order_count:
        return (
            render_template(
                "setup.html",
                message=(
                    "The database is connected, but the Olist data has not been "
                    "imported yet. Run the Render release command or "
                    "`python -m app.seed`."
                ),
            ),
            503,
        )

    item_sales = func.sum(OrderItem.price)
    order_totals = (
        select(func.sum(OrderItem.price).label("total"))
        .group_by(OrderItem.order_id)
        .subquery()
    )
    gross_sales = db.session.scalar(select(func.coalesce(item_sales, 0))) or 0
    average_order_value = db.session.scalar(
        select(func.avg(order_totals.c.total))
    ) or 0
    average_review = db.session.scalar(select(func.avg(Review.score))) or 0

    delivered_orders = db.session.scalar(
        select(func.count())
        .select_from(Order)
        .where(
            Order.delivered_at.is_not(None),
            Order.estimated_delivery_at.is_not(None),
        )
    ) or 0
    on_time_orders = db.session.scalar(
        select(func.count())
        .select_from(Order)
        .where(
            Order.delivered_at.is_not(None),
            Order.estimated_delivery_at.is_not(None),
            Order.delivered_at <= Order.estimated_delivery_at,
        )
    ) or 0

    dialect = db.session.get_bind().dialect.name
    if dialect == "postgresql":
        delivery_days = (
            extract("epoch", Order.delivered_at - Order.purchased_at) / 86400.0
        )
    else:
        delivery_days = func.julianday(Order.delivered_at) - func.julianday(
            Order.purchased_at
        )
    average_delivery_days = db.session.scalar(
        select(func.avg(delivery_days)).where(
            Order.delivered_at.is_not(None), Order.purchased_at.is_not(None)
        )
    ) or 0

    category_rows = db.session.execute(
        select(
            OrderItem.category,
            func.sum(OrderItem.price),
            func.count(func.distinct(OrderItem.order_id)),
        )
        .group_by(OrderItem.category)
        .order_by(func.sum(OrderItem.price).desc())
        .limit(8)
    ).all()
    status_rows = db.session.execute(
        select(Order.status, func.count()).group_by(Order.status).order_by(Order.status)
    ).all()
    rating_rows = db.session.execute(
        select(Review.score, func.count())
        .group_by(Review.score)
        .order_by(Review.score)
    ).all()
    latest_purchase = db.session.scalar(select(func.max(Order.purchased_at)))

    return render_template(
        "dashboard.html",
        metrics={
            "orders": int(order_count),
            "sales": float(gross_sales),
            "average_order": float(average_order_value),
            "average_review": float(average_review),
            "on_time_rate": (on_time_orders / delivered_orders * 100)
            if delivered_orders
            else 0,
            "average_delivery_days": float(average_delivery_days),
            "latest_purchase": latest_purchase,
        },
        monthly_sales=_monthly_sales(),
        categories=[
            {
                "label": category or "Uncategorized",
                "sales": round(float(sales or 0), 2),
                "orders": int(orders),
            }
            for category, sales, orders in category_rows
        ],
        statuses=[{"label": status, "value": int(count)} for status, count in status_rows],
        ratings=[{"label": int(score), "value": int(count)} for score, count in rating_rows],
    )


@dashboard.get("/healthz")
def healthcheck():
    db.session.execute(text("SELECT 1"))
    return {"status": "ok"}, 200
