# Olist Commerce Analytics

A React dashboard served by a FastAPI application for the Olist Brazilian E-Commerce Public Dataset. Neon PostgreSQL stores the imported data. Node.js is used only to build the React frontend; the deployed application server and data importer are Python.

## Analytics

- Filter the full dashboard by any purchase year present in the imported data.
- Track monthly gross merchandise value and month-over-month revenue change, with zero-sales months kept visible.
- Compare leading product categories by sales, order reach, average item price, and share of period sales.
- Assess delivery reliability with on-time rate plus mean and median delivery time.
- Inspect canceled-order share, order-status mix, and the complete review-score distribution.
- Forecast six months of sales with a naïve/seasonal-naïve model selected by rolling one-step backtesting.

Gross merchandise value is the sum of item prices and excludes freight. Average order value is the mean of item totals grouped by order. Delivery-time statistics include orders with both purchase and customer-delivery timestamps; comparing mean and median helps identify skew from long-delayed orders. Year filters use purchase year. These descriptive metrics show association and distribution, not causal effects.

The time-series view compares a last-observation naïve baseline with a seasonal-naïve baseline using the same expanding-history, one-month-ahead test origins. Seasonal-naïve is considered only when at least 24 monthly observations are available. The model with the lower rolling WAPE is used for the six-month outlook; MAE and WAPE are shown as error summaries. The shaded forecast band is the 90th percentile of rolling one-step absolute errors, not a formal prediction interval. Forecasts are a historical-method demonstration on Olist data ending in 2018, not current-market projections.

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
