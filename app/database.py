import os

from psycopg_pool import ConnectionPool


def database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError(
            "DATABASE_URL is not set. Add your Neon connection string to the "
            "Render service environment."
        )
    if value.startswith("postgres://"):
        return "postgresql://" + value[len("postgres://") :]
    return value


def create_pool() -> ConnectionPool:
    return ConnectionPool(
        conninfo=database_url(),
        min_size=1,
        max_size=int(os.environ.get("DB_POOL_MAX", "5")),
        timeout=10,
        open=False,
    )
