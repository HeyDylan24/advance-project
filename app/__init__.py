import os

from flask import Flask
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def _database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError(
            "DATABASE_URL is not set. Add your Neon connection string to the "
            "Render service environment."
        )

    if value.startswith("postgres://"):
        value = "postgresql+psycopg://" + value[len("postgres://") :]
    elif value.startswith("postgresql://"):
        value = "postgresql+psycopg://" + value[len("postgresql://") :]
    elif not value.startswith(("postgresql+psycopg://", "sqlite:")):
        raise RuntimeError(
            "DATABASE_URL must be a PostgreSQL/Neon URL or a SQLite URL for local tests."
        )
    return value


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_mapping(
        SQLALCHEMY_DATABASE_URI=_database_url(),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SQLALCHEMY_ENGINE_OPTIONS={"pool_pre_ping": True, "pool_recycle": 300},
    )
    if test_config:
        app.config.update(test_config)

    db.init_app(app)

    @app.template_filter("brl")
    def format_brl(value: float) -> str:
        formatted = f"{float(value or 0):,.2f}"
        formatted = formatted.replace(",", "\0").replace(".", ",").replace("\0", ".")
        return f"R$ {formatted}"

    @app.template_filter("number")
    def format_number(value: int) -> str:
        return f"{int(value):,}".replace(",", ".")

    from app.routes import dashboard

    app.register_blueprint(dashboard)
    return app
