# Olist Commerce Analytics

A Flask dashboard for the Olist Brazilian E-Commerce Public Dataset. It summarizes item sales, order volume, review scores, delivery performance, product categories, and order status. PostgreSQL (including Neon) stores the imported data.

## Run locally

1. Use Python 3.10 or newer and create a virtual environment.
2. Install dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

3. Set `DATABASE_URL` to a PostgreSQL connection string for a development database. For a quick local check, SQLite also works:

   ```powershell
   $env:DATABASE_URL = "sqlite:///olist.db"
   ```

4. Import the CSV files into the database (the import runs once and skips a database that already contains orders):

   ```powershell
   python -m app.seed
   ```

5. Start the dashboard:

   ```powershell
   flask --app app:create_app run
   ```

Open <http://127.0.0.1:5000>.

The seed command expects `olist_orders_dataset.csv`, `olist_order_items_dataset.csv`, `olist_products_dataset.csv`, `product_category_name_translation.csv`, and `olist_order_reviews_dataset.csv` in the repository root.

## Deploy to Render with Neon

1. In Neon, copy the PostgreSQL connection string for your database. Use the pooled connection string if your project provides one.
2. In Render, create a **Blueprint** from this GitHub repository and select `render.yaml`.
3. In the Render service's **Environment** settings, add `DATABASE_URL` and paste the Neon connection string as its secret value. Do not commit the connection string or add it to `render.yaml`.
4. Deploy. The start command creates the dashboard tables and imports the CSV data before starting Gunicorn. The import is repeat-safe: on subsequent starts it detects existing orders and skips re-importing.
5. Verify the service's `/healthz` endpoint returns `{"status":"ok"}` and open the Render service URL.

If the Render service already exists, add `DATABASE_URL` in its Environment settings and set its build command to `pip install -r requirements.txt`, start command to `python -m app.seed && gunicorn --workers 2 --threads 4 --timeout 120 'app:create_app()'`, and health check path to `/healthz`.

The first import needs a writable Neon database and can take several minutes. If a failed import leaves any data behind, inspect the database before retrying; the seed command intentionally does not delete or overwrite existing rows.
