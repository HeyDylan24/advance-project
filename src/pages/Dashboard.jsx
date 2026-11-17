import { useEffect, useState } from "react";

const palette = ["#766cff", "#24b8a2", "#ffae57", "#e6759a", "#55a4e8", "#a584d6", "#9baa69", "#e17b5d"];

const currency = (value) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));

function MetricCard({ label, value, caption, icon, iconClass }) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${iconClass}`}>{icon}</span>
      </div>
      <div className="metric-value">{value}</div>
      <p className="metric-caption">{caption}</p>
    </article>
  );
}

function PanelHeading({ eyebrow, title, unit }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {unit && <span className="panel-unit">{unit}</span>}
    </div>
  );
}

function SalesChart({ rows }) {
  if (!rows.length) return <p className="empty-chart">No sales data available.</p>;
  const width = 720;
  const height = 220;
  const padding = { top: 14, right: 12, bottom: 34, left: 80 };
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
  const ticks = [0, 0.5, 1];
  const labelIndexes = new Set([0, Math.floor((rows.length - 1) / 3), Math.floor(((rows.length - 1) * 2) / 3), rows.length - 1]);

  return (
    <div className="chart-wrap chart-tall">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly item sales">
        <defs>
          <linearGradient id="sales-gradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#766cff" stopOpacity=".28" />
            <stop offset="100%" stopColor="#766cff" stopOpacity="0" />
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
        <polyline points={line} fill="none" stroke="#847cff" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          labelIndexes.has(index) && (
            <text key={point.row.label} x={point.x} y={height - 10} textAnchor="middle" className="axis-label">
              {point.row.label}
            </text>
          )
        ))}
      </svg>
    </div>
  );
}

function CategoryChart({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.sales)), 1);
  return (
    <div className="category-list">
      {rows.map((row, index) => (
        <div className="category-row" key={row.label}>
          <span className="category-name" title={row.label}>{row.label}</span>
          <span className="category-track">
            <span className="category-fill" style={{ width: `${(Number(row.sales) / max) * 100}%`, background: palette[index % palette.length] }} />
          </span>
          <strong className="category-value">{currency(row.sales)}</strong>
        </div>
      ))}
    </div>
  );
}

function StatusSummary({ rows }) {
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  return (
    <div className="legend-list">
      {rows.map((row, index) => (
        <div className="legend-row" key={row.label}>
          <span className="legend-name">
            <i style={{ background: palette[index % palette.length] }} />
            {row.label.replaceAll("_", " ")}
          </span>
          <strong>{number(row.value)}</strong>
          <span className="legend-percent">{total ? `${((Number(row.value) / total) * 100).toFixed(1)}%` : "0%"}</span>
        </div>
      ))}
    </div>
  );
}

function RatingChart({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  return (
    <div className="rating-bars">
      {rows.map((row, index) => (
        <div className="rating-column" key={row.label}>
          <span className="rating-count">{number(row.value)}</span>
          <span className="rating-bar-track">
            <span className="rating-bar-fill" style={{ height: `${(Number(row.value) / max) * 100}%`, background: ["#e6759a", "#ee9c79", "#ffbd69", "#76c6ae", "#6cbd9f"][index] }} />
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
      <h1>We could not load the dashboard</h1>
      <p>{message}</p>
      <a className="setup-link" href="/api/healthz">Check database connection</a>
    </main>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || `Request failed (${response.status})`);
        }
        return response.json();
      })
      .then(setData)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      });
    return () => controller.abort();
  }, []);

  if (error) return <SetupMessage message={error} />;
  if (!data) {
    return (
      <main className="loading-shell" aria-live="polite">
        <span className="brand-mark">O</span>
        <p>Loading commerce data…</p>
      </main>
    );
  }

  const { metrics } = data;
  const purchaseDate = metrics.latest_purchase
    ? new Date(metrics.latest_purchase).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="Olist Commerce dashboard home">
          <span className="brand-mark">O</span>
          <span>olist<span className="brand-light">commerce</span></span>
        </a>
        <div className="topbar-meta"><span className="live-dot" /> DATA OVERVIEW</div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow">BRAZILIAN E-COMMERCE</p>
          <h1>Commerce overview</h1>
          <p className="subheading">A clear view of sales, customers’ experience, and delivery performance.</p>
        </div>
        <div className="data-note"><span className="note-label">DATASET</span><span>Olist · 2016–2018</span></div>
      </section>

      <section className="metric-grid" aria-label="Key performance indicators">
        <MetricCard label="Total sales" value={currency(metrics.sales)} caption="Item value, excluding freight" icon="R$" iconClass="icon-sales" />
        <MetricCard label="Orders" value={number(metrics.orders)} caption="Unique orders placed" icon="↗" iconClass="icon-orders" />
        <MetricCard label="Average order" value={currency(metrics.average_order)} caption="Average item value per order" icon="◎" iconClass="icon-average" />
        <MetricCard label="Customer rating" value={<>{Number(metrics.average_review).toFixed(2)}<span className="value-unit">/ 5</span></>} caption="Average submitted review" icon="★" iconClass="icon-rating" />
      </section>

      <section className="chart-grid">
        <article className="panel panel-wide">
          <PanelHeading eyebrow="SALES TREND" title="Monthly item sales" unit="BRL" />
          <SalesChart rows={data.monthlySales} />
        </article>
        <article className="panel">
          <PanelHeading eyebrow="FULFILLMENT" title="Delivery performance" />
          <div className="delivery-stat">
            <div className="delivery-number">{Number(metrics.on_time_rate).toFixed(1)}<span>%</span></div>
            <div className="delivery-label">Delivered on or before estimated date</div>
          </div>
          <div className="delivery-divider" />
          <div className="delivery-bottom"><span>Average delivery time</span><strong>{Number(metrics.average_delivery_days).toFixed(1)} days</strong></div>
          {purchaseDate && <p className="footnote">Latest order: {purchaseDate}</p>}
        </article>
      </section>

      <section className="chart-grid lower-grid">
        <article className="panel panel-wide">
          <PanelHeading eyebrow="PRODUCT MIX" title="Top categories by sales" unit="BRL" />
          <CategoryChart rows={data.categories} />
        </article>
        <article className="panel">
          <PanelHeading eyebrow="ORDER HEALTH" title="Order status" />
          <StatusSummary rows={data.statuses} />
        </article>
      </section>

      <section className="panel rating-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">VOICE OF CUSTOMER</p><h2>Review score distribution</h2></div>
          <span className="rating-summary">Average <strong>{Number(metrics.average_review).toFixed(2)}</strong> / 5</span>
        </div>
        <RatingChart rows={data.ratings} />
      </section>

      <footer>
        <span>Olist Commerce Analytics</span>
        <span>Source: Olist Brazilian E-Commerce Public Dataset</span>
      </footer>
    </main>
  );
}
