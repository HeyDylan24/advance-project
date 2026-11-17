import { useEffect, useMemo, useState } from "react";

const palette = ["#5b61d6", "#168b78", "#d18b36", "#ba647a", "#4385a5", "#8d6ab5", "#718b4c", "#c26c43"];

const currency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));

const percent = (value) => `${Number(value || 0).toFixed(1)}%`;

function MetricCard({ label, value, caption, icon, tone }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <p className="metric-caption">{caption}</p>
    </article>
  );
}

function PanelHeading({ eyebrow, title, detail, action }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        {detail && <p className="panel-detail">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function SalesChart({ rows }) {
  if (!rows.length) return <p className="empty-chart">No sales data is available for this period.</p>;

  const width = 760;
  const height = 270;
  const padding = { top: 22, right: 16, bottom: 42, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  const points = rows.map((row, index) => ({
    x: padding.left + (rows.length === 1 ? plotWidth / 2 : (index / (rows.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (Number(row.value) / max) * plotHeight,
    row,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padding.left},${height - padding.bottom} ${line} ${width - padding.right},${height - padding.bottom}`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelIndexes = new Set(
    Array.from({ length: Math.min(rows.length, 6) }, (_, index) =>
      Math.round((index * (rows.length - 1)) / (Math.min(rows.length, 6) - 1 || 1)),
    ),
  );

  return (
    <div className="chart-wrap chart-tall">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly item sales with month-over-month change">
        <defs>
          <linearGradient id="sales-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#5b61d6" stopOpacity=".2" />
            <stop offset="100%" stopColor="#5b61d6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => {
          const y = padding.top + plotHeight * (1 - tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="axis-label">{currency(max * tick)}</text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#sales-gradient)" />
        <polyline points={line} fill="none" stroke="#5b61d6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.row.label}>
            <circle className="chart-point" cx={point.x} cy={point.y} r="4" />
            <title>
              {point.row.label}: {currency(point.row.value)}
              {point.row.growth_rate !== null && point.row.growth_rate !== undefined
                ? ` · ${Number(point.row.growth_rate) >= 0 ? "+" : ""}${Number(point.row.growth_rate).toFixed(1)}% vs. prior month`
                : ""}
            </title>
            {labelIndexes.has(index) && (
              <text x={point.x} y={height - 13} textAnchor="middle" className="axis-label">{point.row.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function CategoryTable({ rows }) {
  if (!rows.length) return <p className="empty-chart">No category data is available for this period.</p>;
  return (
    <div className="table-scroll">
      <table className="category-table">
        <thead>
          <tr><th>Category</th><th>Sales</th><th>Share</th><th>Orders</th><th>Avg. item</th></tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.label}>
              <td><span className="rank-dot" style={{ background: palette[index % palette.length] }}>{index + 1}</span><span className="category-name" title={row.label}>{row.label}</span></td>
              <td className="table-strong">{currency(row.sales)}</td>
              <td>
                <span className="share-cell">
                  <span className="share-track"><span style={{ width: `${Math.min(Number(row.sales_share), 100)}%`, background: palette[index % palette.length] }} /></span>
                  {percent(row.sales_share)}
                </span>
              </td>
              <td>{number(row.orders)}</td>
              <td>{currency(row.average_item_price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusSummary({ rows }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  return (
    <div className="legend-list">
      {rows.map((row, index) => (
        <div className="legend-row" key={row.label}>
          <span className="legend-name"><i style={{ background: palette[index % palette.length] }} />{row.label.replaceAll("_", " ")}</span>
          <strong>{number(row.value)}</strong>
          <span className="legend-percent">{total ? percent((Number(row.value) / total) * 100) : "0%"}</span>
        </div>
      ))}
    </div>
  );
}

function RatingChart({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  const colors = ["#bd6d77", "#cd8666", "#d2a34f", "#83a58a", "#438d75"];
  return (
    <div className="rating-bars">
      {rows.map((row, index) => (
        <div className="rating-column" key={row.label}>
          <span className="rating-count">{number(row.value)}</span>
          <span className="rating-bar-track">
            <span className="rating-bar-fill" style={{ height: `${(Number(row.value) / max) * 100}%`, background: colors[index] || colors[0] }} />
          </span>
          <span className="rating-label">{row.label} star{Number(row.label) === 1 ? "" : "s"}</span>
        </div>
      ))}
    </div>
  );
}

function SetupMessage({ message }) {
  return (
    <main className="setup-shell">
      <span className="brand-mark">O</span>
      <p className="eyebrow">DASHBOARD NOT READY</p>
      <h1>We could not load the analysis</h1>
      <p>{message}</p>
      <a className="setup-link" href="/api/healthz">Check database connection</a>
    </main>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (year) params.set("year", year);
    setLoading(true);
    setError("");

    fetch(`/api/dashboard${params.size ? `?${params}` : ""}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || body.message || `Request failed (${response.status})`);
        }
        return response.json();
      })
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setError(requestError.message);
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [year]);

  const latestGrowth = useMemo(
    () => data?.monthlySales?.slice().reverse().find((row) => row.growth_rate !== null && row.growth_rate !== undefined)?.growth_rate,
    [data],
  );

  if (error) return <SetupMessage message={error} />;
  if (!data) {
    return (
      <main className="loading-shell" aria-live="polite">
        <span className="brand-mark">O</span>
        <p>Loading commerce intelligence…</p>
      </main>
    );
  }

  const { metrics } = data;
  const purchaseDate = metrics.latest_purchase
    ? new Date(metrics.latest_purchase).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;
  const currentYear = year || "All years";

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Olist Commerce dashboard home">
          <span className="brand-mark">O</span>
          <span>olist<span className="brand-light"> / intelligence</span></span>
        </a>
        <div className="topbar-meta"><span className="live-dot" /> ANALYTICS WORKSPACE</div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">BRAZILIAN E-COMMERCE · EXPLORATORY ANALYSIS</p>
          <h1>Commerce, in context.</h1>
          <p className="subheading">A data-led view of revenue quality, customer sentiment, and operational performance.</p>
        </div>
        <label className="period-control">
          <span>ANALYSIS PERIOD</span>
          <select value={year} onChange={(event) => setYear(event.target.value)} aria-label="Filter dashboard by year">
            <option value="">All available years</option>
            {data.years.map((availableYear) => <option value={availableYear} key={availableYear}>{availableYear}</option>)}
          </select>
        </label>
      </section>

      <div className="analysis-context">
        <span className="context-marker" />
        <span>Showing <strong>{currentYear}</strong> performance</span>
        <span className="context-separator">/</span>
        <span>{number(metrics.orders)} orders in scope</span>
        {purchaseDate && <span className="context-date">Latest order {purchaseDate}</span>}
        {loading && <span className="refresh-indicator">Updating analysis…</span>}
      </div>

      <section className="metric-grid" aria-label="Key performance indicators" aria-busy={loading}>
        <MetricCard label="Gross merchandise value" value={currency(metrics.sales)} caption="Product value · freight excluded" icon="R$" tone="revenue" />
        <MetricCard label="Orders analyzed" value={number(metrics.orders)} caption="Unique customer orders" icon="↗" tone="orders" />
        <MetricCard label="Average order value" value={currency(metrics.average_order)} caption="Mean item value per order" icon="Ø" tone="basket" />
        <MetricCard label="Customer rating" value={<>{Number(metrics.average_review).toFixed(2)}<span className="value-unit">/ 5</span></>} caption={`${percent(metrics.five_star_rate)} of reviews are 5-star`} icon="★" tone="rating" />
      </section>

      <section className="chart-grid primary-grid">
        <article className="panel panel-wide" aria-busy={loading}>
          <PanelHeading
            eyebrow="01 / REVENUE MOMENTUM"
            title="Monthly sales trend"
            detail={year ? `Revenue movement across ${year}` : "Seasonality and growth across the full dataset"}
            action={latestGrowth !== undefined && latestGrowth !== null
              ? <span className={`trend-badge ${Number(latestGrowth) >= 0 ? "trend-up" : "trend-down"}`}>{Number(latestGrowth) >= 0 ? "↗" : "↘"} {percent(Math.abs(Number(latestGrowth)))} latest MoM</span>
              : <span className="trend-badge trend-neutral">MoM baseline</span>}
          />
          <SalesChart rows={data.monthlySales} />
          <p className="chart-footnote">Month-over-month growth compares each month with the immediately preceding month in the selected period.</p>
        </article>
        <article className="panel operations-panel" aria-busy={loading}>
          <PanelHeading eyebrow="02 / OPERATIONS" title="Delivery reliability" detail="Speed and promise-keeping, together" />
          <div className="reliability-score">
            <div className="reliability-number">{percent(metrics.on_time_rate)}</div>
            <div className="reliability-copy"><strong>on-time delivery</strong><span>Delivered on or before estimate</span></div>
          </div>
          <div className="delivery-comparison">
            <div><span>Mean transit</span><strong>{Number(metrics.average_delivery_days).toFixed(1)} <small>days</small></strong></div>
            <div><span>Median transit</span><strong>{Number(metrics.median_delivery_days).toFixed(1)} <small>days</small></strong></div>
          </div>
          <p className="analysis-note"><strong>Why both?</strong> Median is less affected by unusually delayed orders than the mean.</p>
        </article>
      </section>

      <section className="chart-grid secondary-grid">
        <article className="panel panel-wide" aria-busy={loading}>
          <PanelHeading eyebrow="03 / ASSORTMENT" title="Category performance" detail="Sales contribution, reach, and average item value" action={<span className="panel-unit">TOP 8 BY SALES</span>} />
          <CategoryTable rows={data.categories} />
        </article>
        <article className="panel status-panel" aria-busy={loading}>
          <PanelHeading eyebrow="04 / ORDER FULFILLMENT" title="Order status mix" detail="Share of all orders in the selected period" />
          <StatusSummary rows={data.statuses} />
          <div className="risk-callout">
            <span className="risk-label">CANCELLATION RATE</span>
            <strong>{percent(metrics.cancellation_rate)}</strong>
            <span>Orders marked canceled</span>
          </div>
        </article>
      </section>

      <section className="panel rating-panel" aria-busy={loading}>
        <PanelHeading eyebrow="05 / CUSTOMER VOICE" title="Review score distribution" detail="Ratings reveal the shape of satisfaction—not just its average" action={<span className="panel-unit">{number(data.ratings.reduce((sum, row) => sum + Number(row.value), 0))} REVIEWS</span>} />
        <RatingChart rows={data.ratings} />
      </section>

      <footer>
        <span>OLIST COMMERCE INTELLIGENCE <i>·</i> Exploratory analysis</span>
        <span>Source: Olist Brazilian E-Commerce Public Dataset</span>
      </footer>
    </main>
  );
}
