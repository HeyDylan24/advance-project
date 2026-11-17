from datetime import datetime

from app import db


class Order(db.Model):
    __tablename__ = "orders"

    order_id = db.Column(db.String(32), primary_key=True)
    status = db.Column(db.String(32), nullable=False, index=True)
    purchased_at = db.Column(db.DateTime, nullable=True, index=True)
    delivered_at = db.Column(db.DateTime, nullable=True)
    estimated_delivery_at = db.Column(db.DateTime, nullable=True)


class OrderItem(db.Model):
    __tablename__ = "order_items"

    order_id = db.Column(
        db.String(32), db.ForeignKey("orders.order_id"), primary_key=True
    )
    item_id = db.Column(db.Integer, primary_key=True)
    category = db.Column(db.String(128), nullable=False, index=True)
    price = db.Column(db.Float, nullable=False)
    freight_value = db.Column(db.Float, nullable=False)


class Review(db.Model):
    __tablename__ = "reviews"

    review_id = db.Column(db.String(32), primary_key=True)
    order_id = db.Column(
        db.String(32),
        db.ForeignKey("orders.order_id"),
        primary_key=True,
        nullable=False,
        index=True,
    )
    score = db.Column(db.Integer, nullable=False)
