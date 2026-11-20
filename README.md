# Olist Commerce Analytics

A React dashboard served by a FastAPI application for the Olist Brazilian E-Commerce Public Dataset. Neon PostgreSQL stores the imported data. Node.js is used only to build the React frontend; the deployed application server and data importer are Python.

## Analytics

- Filter the full dashboard by any purchase year present in the imported data.
- Track monthly gross merchandise value and month-over-month revenue change, with zero-sales months kept visible.
- Compare leading product categories by sales, order reach, average item price, and share of period sales.
- Assess delivery reliability with on-time rate plus mean and median delivery time.
- Inspect canceled-order share, order-status mix, and the complete review-score distribution.
- Forecast six months of sales with a naïve/seasonal-naïve model selected by rolling one-step backtesting.
- Explore payment methods, the customer-state sales footprint, hourly/weekday order patterns, and review outcomes by delivery timing.
- Compare all 27 Brazilian federative units in an interactive sales choropleth with neon state borders, order-volume bubbles, state-level average order value, review and delivery benchmarks against Brazil-wide averages, and top-five revenue concentration.
- Explore the Google BigQuery TheLook eCommerce export in a separate analyst tab with revenue, category, event, fulfillment, and regional summaries. Each chart includes a question and a collapsible inference.

Gross merchandise value is the sum of item prices and excludes freight. Average order value is the mean of item totals grouped by order. Delivery-time statistics include orders with both purchase and customer-delivery timestamps; comparing mean and median helps identify skew from long-delayed orders. Year filters use purchase year. These descriptive metrics show association and distribution, not causal effects.

The time-series view compares a last-observation naïve baseline with a seasonal-naïve baseline using the same expanding-history, one-month-ahead test origins. Seasonal-naïve is considered only when at least 24 monthly observations are available. The model with the lower rolling WAPE is used for the six-month outlook; MAE and WAPE are shown as error summaries. The shaded forecast band is the 90th percentile of rolling one-step absolute errors, not a formal prediction interval. Forecasts are a historical-method demonstration on Olist data ending in 2018, not current-market projections.

The importer also enriches an existing Neon database with payment records and customer-state dimensions. It tracks this enrichment separately from the original orders/items/reviews import, so the existing core dataset is preserved and the added CSVs are imported once. The delivery/review comparison is descriptive and should not be interpreted as a causal estimate.

The Brazil map shades states by product sales and uses circles sized by order volume at representative state positions; it does not plot individual customer locations. Simplified state boundaries are adapted from [Click That 'Hood's Brazil states GeoJSON](https://github.com/codeforgermany/click_that_hood/blob/main/public/data/brazil-states.geojson); the source repository's MIT license is included in [`src/data/LICENSE`](./src/data/LICENSE).

## Google BigQuery analysis snapshot

The analyst workspace's Google BigQuery tab is a static aggregate snapshot of the TheLook eCommerce export, not a live BigQuery connection. To refresh it from the supplied archive, run:

```sh
python build_bigquery_snapshot.py "archive (1).zip"
```

The builder writes only aggregate metrics to `src/data/googleBigQuerySummary.json`; it does not include customer IDs, contact details, or event-level records. Keep the source archive out of version control.

## Run locally

1. Install Python 3.10 or newer and Node.js 20.9 or newer.
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

The importer expects `olist_orders_dataset.csv`, `olist_order_items_dataset.csv`, `olist_products_dataset.csv`, `product_category_name_translation.csv`, `olist_order_reviews_dataset.csv`, `olist_customers_dataset.csv`, and `olist_order_payments_dataset.csv` in the repository root.

## Deploy to Render with Neon

The included `render.yaml` configures one Python web service. Its build installs the Python dependencies and builds the React frontend. Its start command imports the data and then runs Uvicorn. Configure the full Neon connection string as the Render service's secret `DATABASE_URL` environment variable; do not commit it to source.

If configuring the existing Render service manually, choose the Python runtime and repository root as the root directory. Set the build command to `pip install -r requirements.txt && npm ci && npm run build`, the start command to `python -m app.seed && uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and the health check path to `/api/healthz`.

The first import can take several minutes. It runs in a database transaction and marks the dataset as imported when complete; subsequent starts skip it. The database advisory lock prevents two deploys from importing simultaneously.

## Client and analyst workspaces

The Olist dashboard remains publicly viewable at `/`; its header links to the optional Clerk sign-in for the client and analyst workspace. New sign-ups and accounts without an assigned role are treated as clients, so clients can create accounts and submit requests. Analyst access is restricted to accounts explicitly assigned the `analyst` role in Clerk. Clients can attach up to 10 CSV or ZIP files (500 MB each). Analysts can view requests and accept or decline them. Accepting a request does not execute analysis: the analyst writes the analysis in their IDE and deploys a code-defined dashboard tab.

Neon stores both request metadata and file contents. Files are split into 8 MB chunks and stored as PostgreSQL `BYTEA` rows; downloads are streamed back in chunks. This avoids loading a full 500 MB file into application memory. ZIP files are not extracted by the app. Large uploads consume Neon database storage and transfer, so monitor the database's storage limits and usage.

Configure these environment variables for both local/deployed environments as appropriate:

- `VITE_CLERK_PUBLISHABLE_KEY` for the frontend.
- `CLERK_JWKS_URL` and `CLERK_ISSUER` for backend JWT verification.

For Vite, the publishable key must use the `VITE_CLERK_PUBLISHABLE_KEY` name; a `NEXT_PUBLIC_` prefix is not read. No Clerk secret key is used by this app. For local development, put the publishable key in the ignored `.env.local` file and set the backend Clerk variables in the FastAPI process environment.

In Clerk, set the analyst's **public metadata** `role` to `analyst`, and add a session-token custom claim mapping public metadata into a signed `metadata` claim (for example, `{"metadata":"{{user.public_metadata}}"}`). No metadata change is needed for clients. Set the frontend's Clerk sign-in allowed origins to include the deployed domain and local development origin. Never commit Clerk or storage secret keys.

The workspace tables are created by the FastAPI app on startup. For Render, add the Clerk variables to the service before enabling client accounts. New analyst tabs are registered in `src/analysisTabs.js`. Client-facing tabs must include the target Clerk `clientUserId` so other clients cannot see them, for example:

```js
{ id: "repeat-purchases", label: "Repeat purchases", clientUserId: "user_...", Component: RepeatPurchaseAnalysis }
```

Implement each analysis as a React view in the IDE and deploy it with the app.
