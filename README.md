# Olist Commerce Analytics

A React dashboard served by a FastAPI application for the Olist Brazilian E-Commerce Public Dataset. Neon PostgreSQL stores the imported data. Node.js is used only to build the React frontend; the deployed application server and data importer are Python.

## Run locally

1. Install Python 3.10 or newer and Node.js 20 or newer.
2. Install Python dependencies and build the frontend:

   ```sh
   python -m pip install -r requirements.txt
   npm ci
   npm run build
   ```

3. Set `DATABASE_URL` to a PostgreSQL connection string for a development database.
4. Import the CSV files and start FastAPI:

   ```sh
   python -m app.seed
   uvicorn app.main:app --reload
   ```

Open <http://127.0.0.1:8000>. For frontend development, run `npm run dev` in a separate terminal; Vite proxies `/api` requests to `http://localhost:3000`, so start the API with `uvicorn app.main:app --reload --port 3000`.

The importer expects `olist_orders_dataset.csv`, `olist_order_items_dataset.csv`, `olist_products_dataset.csv`, `product_category_name_translation.csv`, and `olist_order_reviews_dataset.csv` in the repository root.

## Deploy to Render with Neon

The included `render.yaml` configures one Python web service. Its build installs the Python dependencies and builds the React frontend. Its start command imports the data and then runs Uvicorn. Configure the full Neon connection string as the Render service's secret `DATABASE_URL` environment variable; do not commit it to source.

If configuring the existing Render service manually, choose the Python runtime and repository root as the root directory. Set the build command to `pip install -r requirements.txt && npm ci && npm run build`, the start command to `python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and the health check path to `/api/healthz`.

The first import can take several minutes. It runs in a database transaction and marks the dataset as imported when complete; subsequent starts skip it. The database advisory lock prevents two deploys from importing simultaneously.
