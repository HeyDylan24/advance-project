import { useEffect, useMemo, useState } from "react";
import brazilStates from "../data/brazilStates";

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

function ForecastChart({ history, forecast }) {
  const observed = history.slice(-18);
  const projected = forecast.values;
  const values = [
    ...observed.map((point) => Number(point.value)),
    ...projected.map((point) => Number(point.upper)),
  ];
  const max = Math.max(...values, 1);
  const width = 760;
  const height = 235;
  const padding = { top: 16, right: 16, bottom: 38, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const combined = [
    ...observed.map((point) => ({ ...point, forecast: false })),
    ...projected.map((point) => ({ ...point, forecast: true })),
  ];
  const points = combined.map((point, index) => ({
    ...point,
    x: padding.left + (combined.length === 1 ? plotWidth / 2 : (index / (combined.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (Number(point.value) / max) * plotHeight,
  }));
  const observedPoints = points.filter((point) => !point.forecast);
  const forecastPoints = points.filter((point) => point.forecast);
  const anchor = observedPoints.at(-1);
  const forecastLine = [anchor, ...forecastPoints].map((point) => `${point.x},${point.y}`).join(" ");
  const upper = forecastPoints.map((point) => `${point.x},${padding.top + plotHeight - (Number(point.upper) / max) * plotHeight}`);
  const lower = forecastPoints.slice().reverse().map((point) => `${point.x},${padding.top + plotHeight - (Number(point.lower) / max) * plotHeight}`);
  const band = [...upper, ...lower].join(" ");
  const observedLine = observedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <div className="chart-wrap forecast-chart">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${forecast.horizon_months}-month sales forecast with empirical error band`}>
        {[0, 0.5, 1].map((tick) => {
          const y = padding.top + plotHeight * (1 - tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="axis-label">{currency(max * tick)}</text>
            </g>
          );
        })}
        <polygon points={band} className="forecast-band" />
        <polyline points={observedLine} fill="none" stroke="#85908a" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={forecastLine} className="forecast-line" />
        {observedPoints.map((point, index) => (
          <g key={`observed-${point.label}`}>
            <circle className="observed-point" cx={point.x} cy={point.y} r="3" />
            {labelIndexes.has(index) && <text x={point.x} y={height - 10} textAnchor="middle" className="axis-label">{point.label}</text>}
          </g>
        ))}
        {forecastPoints.map((point, index) => (
          <g key={`forecast-${point.label}`}>
            <circle className="forecast-point" cx={point.x} cy={point.y} r="4" />
            <title>{point.label}: {currency(point.value)} · empirical range {currency(point.lower)}–{currency(point.upper)}</title>
            {labelIndexes.has(observedPoints.length + index) && <text x={point.x} y={height - 10} textAnchor="middle" className="axis-label">{point.label}</text>}
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

function PaymentMix({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  return (
    <div className="payment-list">
      {rows.map((row, index) => (
        <div className="payment-row" key={row.label}>
          <div className="payment-label">
            <i style={{ background: palette[index % palette.length] }} />
            <span>{row.label.replaceAll("_", " ")}</span>
            <strong>{percent(row.share)}</strong>
          </div>
          <div className="payment-track"><span style={{ width: `${(Number(row.value) / max) * 100}%`, background: palette[index % palette.length] }} /></div>
          <div className="payment-detail"><span>{currency(row.value)}</span><span>{number(row.orders)} orders</span><span>{Number(row.average_installments).toFixed(1)}× avg.</span></div>
        </div>
      ))}
    </div>
  );
}

function RegionTable({ rows }) {
  const max = Math.max(...rows.map((row) => Number(row.sales)), 1);
  return (
    <div className="region-list">
      {rows.map((row, index) => (
        <div className="region-row" key={row.state}>
          <span className="region-rank">{String(index + 1).padStart(2, "0")}</span>
          <strong className="region-state">{row.state}</strong>
          <div className="region-bar"><span style={{ width: `${(Number(row.sales) / max) * 100}%` }} /></div>
          <span className="region-sales">{currency(row.sales)}</span>
          <span className="region-review">{row.average_review ? `${Number(row.average_review).toFixed(2)} ★` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

function BrazilMap({ rows, selectedState, onSelectState }) {
  const values = new Map(rows.map((row) => [row.state, row]));
  const maxSales = Math.max(...rows.map((row) => Number(row.sales)), 1);
  const maxOrders = Math.max(...rows.map((row) => Number(row.orders)), 1);

  return (
    <div className="brazil-map-wrap">
      <svg className="brazil-map" viewBox="0 0 800 720" role="img" aria-label="Brazil map shaded by state sales with circles sized by order volume">
        <defs>
          <radialGradient id="order-bubble">
            <stop offset="0%" stopColor="#b5fff0" stopOpacity=".96" />
            <stop offset="100%" stopColor="#61d8b8" stopOpacity=".84" />
          </radialGradient>
          <linearGradient id="state-hover" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#56e4d4" />
            <stop offset="52%" stopColor="#9b7bff" />
            <stop offset="100%" stopColor="#f08acb" />
          </linearGradient>
        </defs>
        {brazilStates.map((state, index) => {
          const row = values.get(state.code);
          const sales = Number(row?.sales || 0);
          const orders = Number(row?.orders || 0);
          const isSelected = selectedState === state.code;
          const fillOpacity = row ? 0.12 + 0.68 * Math.sqrt(sales / maxSales) : 0.08;
          const radius = row ? 2.5 + 7 * Math.sqrt(orders / maxOrders) : 2;
          const borderHue = (index * 137.508) % 360;
          return (
            <g
              className={`map-state ${isSelected ? "map-state-selected" : ""}`}
              key={state.code}
              style={{ "--state-stroke": `hsl(${borderHue} 95% 67%)` }}
              role="button"
              tabIndex={0}
              aria-label={`${state.name}: ${currency(sales)} sales, ${number(orders)} orders`}
              onClick={() => onSelectState(state.code)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectState(state.code);
                }
              }}
            >
              <path d={state.path} style={{ fill: `rgba(125, 108, 255, ${fillOpacity})` }} />
              {row && <circle className="map-order-bubble" cx={state.x} cy={state.y} r={radius} />}
              <text className="map-state-label" x={state.x} y={state.y - radius - 4}>{state.code}</text>
              <title>{state.name} · {currency(sales)} sales · {number(orders)} orders{row?.average_review ? ` · ${Number(row.average_review).toFixed(2)} average rating` : ""}</title>
            </g>
          );
        })}
      </svg>
      <div className="map-compass" aria-hidden="true"><span>N</span><i>↑</i></div>
    </div>
  );
}

function BrazilRegionalAnalysis({ rows }) {
  const [selectedState, setSelectedState] = useState("");
  const ranked = rows.slice().sort((left, right) => Number(right.sales) - Number(left.sales));
  const totalSales = ranked.reduce((sum, row) => sum + Number(row.sales), 0);
  const totalOrders = ranked.reduce((sum, row) => sum + Number(row.orders), 0);
  const salesOrders = ranked.reduce((sum, row) => sum + Number(row.sales_orders || 0), 0);
  const leadingStates = ranked.slice(0, 5);
  const leadingStateShare = totalSales
    ? leadingStates.reduce((sum, row) => sum + Number(row.sales), 0) / totalSales * 100
    : 0;
  const selected = ranked.find((row) => row.state === selectedState) || ranked[0];
  const selectedShare = selected && totalSales ? Number(selected.sales) / totalSales * 100 : 0;
  const totalReviews = ranked.reduce((sum, row) => sum + Number(row.reviews || 0), 0);
  const brazilAverageReview = totalReviews
    ? ranked.reduce((sum, row) => sum + Number(row.average_review || 0) * Number(row.reviews || 0), 0) / totalReviews
    : 0;
  const eligibleDeliveries = ranked.reduce((sum, row) => sum + Number(row.eligible_deliveries || 0), 0);
  const onTimeOrders = ranked.reduce((sum, row) => sum + Number(row.on_time_orders || 0), 0);
  const deliveredOrders = ranked.reduce((sum, row) => sum + Number(row.delivered_orders || 0), 0);
  const brazilOnTimeRate = eligibleDeliveries ? onTimeOrders / eligibleDeliveries * 100 : 0;
  const brazilAverageDeliveryDays = deliveredOrders
    ? ranked.reduce((sum, row) => sum + Number(row.average_delivery_days || 0) * Number(row.delivered_orders || 0), 0) / deliveredOrders
    : 0;
  const selectedEligibleDeliveries = Number(selected?.eligible_deliveries || 0);
  const selectedOnTimeRate = selectedEligibleDeliveries
    ? Number(selected.on_time_orders || 0) / selectedEligibleDeliveries * 100
    : null;
  const stateComparisons = [
    {
      label: "AVERAGE ORDER",
      value: selected?.average_order ? currency(selected.average_order) : "—",
      brazil: salesOrders ? currency(totalSales / salesOrders) : "—",
      sample: `${number(selected?.sales_orders || 0)} orders with items`,
    },
    {
      label: "AVERAGE REVIEW",
      value: selected?.average_review ? `${Number(selected.average_review).toFixed(2)} / 5` : "—",
      brazil: totalReviews ? `${brazilAverageReview.toFixed(2)} / 5` : "—",
      sample: `${number(selected?.reviews || 0)} reviews`,
    },
    {
      label: "ON-TIME DELIVERY",
      value: selectedOnTimeRate === null ? "—" : percent(selectedOnTimeRate),
      brazil: eligibleDeliveries ? percent(brazilOnTimeRate) : "—",
      sample: `${number(selectedEligibleDeliveries)} eligible orders`,
    },
    {
      label: "AVERAGE DELIVERY",
      value: Number(selected?.delivered_orders || 0) ? `${Number(selected.average_delivery_days).toFixed(1)} days` : "—",
      brazil: deliveredOrders ? `${brazilAverageDeliveryDays.toFixed(1)} days` : "—",
      sample: `${number(selected?.delivered_orders || 0)} delivered orders`,
    },
  ];

  return (
    <section className="regional-section" id="regional-analysis">
      <article className="panel regional-panel" aria-label="Brazil state-level sales map">
        <PanelHeading
          eyebrow="08 / BRAZIL · STATE-LEVEL ANALYSIS"
          title="Where commerce happens"
          detail="Explore the geographic concentration of orders and product sales"
          action={<span className="panel-unit">27 FEDERATIVE UNITS</span>}
        />
        {ranked.length ? (
          <div className="regional-layout">
            <div className="map-column">
              <div className="map-stat-strip">
                <div><span>STATES WITH ORDERS</span><strong>{ranked.length}<small> / 27</small></strong></div>
                <div><span>REGIONAL SALES</span><strong>{currency(totalSales)}</strong></div>
                <div><span>ORDERS MAPPED</span><strong>{number(totalOrders)}</strong></div>
              </div>
              <BrazilMap rows={ranked} selectedState={selected?.state} onSelectState={setSelectedState} />
              <div className="map-legend">
                <span className="map-legend-title">MAP KEY</span>
                <span><i className="legend-state-fill" />Fill intensity · sales</span>
                <span><i className="legend-order-dot" />Circle area · orders</span>
                <span className="legend-gradient"><i /><b>Lower</b><i /><i /><i /><i /><b>Higher</b></span>
              </div>
            </div>
            <aside className="region-insights">
              <div className="selected-state-card">
                <span className="insight-kicker"><i /> SELECTED STATE</span>
                <div className="selected-state-name"><strong>{selected?.state || "—"}</strong><span>{brazilStates.find((state) => state.code === selected?.state)?.name || "No state data"}</span></div>
                <div className="selected-state-sales">{currency(selected?.sales || 0)}<small>product sales</small></div>
                <div className="selected-state-metrics">
                  <div><span>ORDERS</span><strong>{number(selected?.orders || 0)}</strong></div>
                  <div><span>SALES SHARE</span><strong>{percent(selectedShare)}</strong></div>
                  <div><span>ITEM ORDERS</span><strong>{number(selected?.sales_orders || 0)}</strong></div>
                </div>
              </div>
              <div className="regional-benchmarks">
                <span className="insight-kicker">STATE VS. BRAZIL AVERAGE</span>
                {stateComparisons.map((comparison) => (
                  <div className="regional-benchmark-row" key={comparison.label}>
                    <span>{comparison.label}</span>
                    <div><strong>{comparison.value}</strong><small>BRAZIL {comparison.brazil} · {comparison.sample}</small></div>
                  </div>
                ))}
              </div>
              <div className="concentration-card">
                <span className="insight-kicker">TOP 5 STATE CONCENTRATION</span>
                <strong>{percent(leadingStateShare)}</strong>
                <div className="concentration-track"><i style={{ width: `${leadingStateShare}%` }} /></div>
                <p>of mapped product sales come from {leadingStates.length} leading states.</p>
              </div>
              <div className="regional-leaders">
                <div className="leaders-heading"><span>LEADING MARKETS</span><span>SALES</span></div>
                <RegionTable rows={leadingStates} />
              </div>
              <p className="map-method-note">State shading shows item sales; bubbles are sized by order volume and placed at representative state positions—not individual customer coordinates.</p>
            </aside>
          </div>
        ) : (
          <p className="empty-chart">Regional data is unavailable for this period. Confirm that customer-state data was imported.</p>
        )}
      </article>
    </section>
  );
}

function DeliveryReviewComparison({ rows }) {
  const byOutcome = new Map(rows.map((row) => [row.label, row]));
  const onTime = byOutcome.get("On time");
  const late = byOutcome.get("Late");

  if (!onTime || !late) {
    return <p className="empty-chart">Not enough delivered orders with reviews to compare timing groups.</p>;
  }

  const scoreDifference = Number(onTime.average_score) - Number(late.average_score);
  return (
    <div className="delivery-review">
      <div className="comparison-head"><span>DELIVERY GROUP</span><span>REVIEWS</span><span>AVG SCORE</span><span>LOW SCORES</span></div>
      {[onTime, late].map((row) => (
        <div className={`comparison-row ${row.label === "Late" ? "comparison-late" : ""}`} key={row.label}>
          <strong><i />{row.label}</strong>
          <span>{number(row.reviews)}</span>
          <span className="comparison-score">{Number(row.average_score).toFixed(2)} <small>/ 5</small></span>
          <span>{percent(row.low_score_rate)}</span>
        </div>
      ))}
      <div className="association-callout">
        <span className="association-symbol">{scoreDifference >= 0 ? "↘" : "↗"}</span>
        <p>On-time orders average <strong>{Math.abs(scoreDifference).toFixed(2)} {scoreDifference >= 0 ? "points higher" : "points lower"}</strong> than late orders. This is an observed association, not evidence of causation.</p>
      </div>
    </div>
  );
}

function DemandHeatmap({ rows }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lookup = new Map(rows.map((row) => [`${row.weekday}-${row.hour}`, Number(row.orders)]));
  const max = Math.max(...rows.map((row) => Number(row.orders)), 1);

  return (
    <div className="heatmap-scroll">
      <div className="heatmap">
        <div className="heatmap-corner" />
        {Array.from({ length: 24 }, (_, hour) => (
          <span className="heatmap-hour" key={hour}>{hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}</span>
        ))}
        {days.map((day, weekday) => (
          <div className="heatmap-row" key={day}>
            <span className="heatmap-day">{day}</span>
            {Array.from({ length: 24 }, (_, hour) => {
              const orders = lookup.get(`${weekday}-${hour}`) || 0;
              return (
                <span
                  className="heatmap-cell"
                  key={hour}
                  style={{ "--intensity": orders ? Math.max(0.12, orders / max) : 0 }}
                  title={`${day}, ${String(hour).padStart(2, "0")}:00 · ${number(orders)} orders`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="heatmap-scale"><span>Fewer orders</span><i /><i /><i /><i /><i /><span>More orders</span></div>
    </div>
  );
}

function SetupMessage({ message, onBackToPortal }) {
  return (
    <main className="setup-shell">
      {onBackToPortal && <button className="portal-back" type="button" onClick={onBackToPortal}>← Analyst inbox</button>}
      <span className="brand-mark">O</span>
      <p className="eyebrow">DASHBOARD NOT READY</p>
      <h1>We could not load the analysis</h1>
      <p>{message}</p>
      <a className="setup-link" href="/api/healthz">Check database connection</a>
    </main>
  );
}

export default function Dashboard({ onBackToPortal }) {
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

  if (error) return <SetupMessage message={error} onBackToPortal={onBackToPortal} />;
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
    <div className="workspace">
      <aside className="sidebar">
        <a className="sidebar-brand" href="/" aria-label="Olist Commerce dashboard home">
          <span className="brand-mark">O</span>
          <span>olist<span className="brand-light"> / lab</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">OI</span>
          <span><strong>Commerce intelligence</strong><small>Analytics workspace</small></span>
          <span className="switcher-chevron">⌄</span>
        </div>
        <p className="sidebar-section-label">ANALYZE</p>
        <nav className="sidebar-nav" aria-label="Dashboard sections">
          <a className="nav-link nav-link-active" href="#overview"><span className="nav-icon">▦</span>Overview</a>
          <a className="nav-link" href="#revenue"><span className="nav-icon">⌁</span>Revenue & forecast</a>
          <a className="nav-link" href="#product-analysis"><span className="nav-icon">◈</span>Product performance</a>
          <a className="nav-link" href="#customer-insights"><span className="nav-icon">◎</span>Customer insights</a>
          <a className="nav-link" href="#regional-analysis"><span className="nav-icon">◉</span>Brazil map</a>
          <a className="nav-link" href="#delivery-review"><span className="nav-icon">↗</span>Delivery & reviews</a>
          <a className="nav-link" href="#demand-patterns"><span className="nav-icon">▥</span>Demand patterns</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="dataset-status">
          <span className="dataset-status-dot" />
          <span><strong>Dataset connected</strong><small>Olist · PostgreSQL</small></span>
          <span className="dataset-menu">···</span>
        </div>
        <div className="sidebar-profile">
          <span className="profile-avatar">OL</span>
          <span><strong>Olist Analytics</strong><small>Research project</small></span>
          <span className="profile-menu">⌄</span>
        </div>
      </aside>
      <div className="workspace-main">
        <main className="shell">
      <header className="topbar">
        <div className="topbar-breadcrumb"><span>WORKSPACE</span><i>/</i><strong>Commerce overview</strong></div>
        <div className="topbar-actions">
          {onBackToPortal && <button className="portal-back" type="button" onClick={onBackToPortal}>← Analyst inbox</button>}
          <a className="portal-back" href="#workspace">Client / analyst sign-in</a>
          <span className="data-status"><i /> DATA CONNECTED</span>
          <span className="topbar-dataset">OLIST PUBLIC DATASET</span>
        </div>
      </header>

      <section className="page-heading">
        <div>
          <p className="eyebrow"><span className="heading-dot" /> BRAZILIAN E-COMMERCE <i>/</i> EXPLORATORY ANALYSIS</p>
          <h1>Commerce, in context.</h1>
          <p className="subheading">A research workspace for revenue quality, customer behavior, and operational performance.</p>
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

      <section className="metric-grid" id="overview" aria-label="Key performance indicators" aria-busy={loading}>
        <MetricCard label="Gross merchandise value" value={currency(metrics.sales)} caption="Product value · freight excluded" icon="R$" tone="revenue" />
        <MetricCard label="Orders analyzed" value={number(metrics.orders)} caption="Unique customer orders" icon="↗" tone="orders" />
        <MetricCard label="Average order value" value={currency(metrics.average_order)} caption="Mean item value per order" icon="Ø" tone="basket" />
        <MetricCard label="Customer rating" value={<>{Number(metrics.average_review).toFixed(2)}<span className="value-unit">/ 5</span></>} caption={`${percent(metrics.five_star_rate)} of reviews are 5-star`} icon="★" tone="rating" />
      </section>

      <section className="chart-grid primary-grid" id="revenue">
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
        <article className="panel operations-panel" id="operations" aria-busy={loading}>
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

      {(data.forecast.available || year) && (
        <section className="forecast-section">
          <article className="panel forecast-panel" aria-busy={loading}>
            {data.forecast.available ? (
              <>
                <PanelHeading
                  eyebrow="03 / TIME-SERIES LAB"
                  title="Monthly sales forecast"
                  detail={`Next ${data.forecast.horizon_months} months after ${data.forecast.last_observed_month} · ${data.forecast.training_months} monthly observations`}
                  action={<span className="model-badge">{data.forecast.model_label.toUpperCase()} · BACKTESTED</span>}
                />
                <div className="forecast-legend">
                  <span><i className="legend-observed" />Observed</span>
                  <span><i className="legend-projection" />Forecast</span>
                  <span><i className="legend-range" />Empirical error range</span>
                </div>
                <ForecastChart history={data.monthlySales} forecast={data.forecast} />
                <div className="model-diagnostics">
                  <div className="diagnostic-intro">
                    <span className="eyebrow">ROLLING ONE-STEP BACKTEST</span>
                    <p>Model choice is based on historical forecast error, not training fit.</p>
                  </div>
                  <div className="model-score-grid">
                    {data.forecast.backtest.map((score) => (
                      <div className={`model-score ${score.model === data.forecast.model ? "model-score-selected" : ""}`} key={score.model}>
                        <span>{score.model === "seasonal_naive" ? "Seasonal naïve" : "Naïve baseline"}</span>
                        <strong>{score.wape === null ? "—" : percent(score.wape)}</strong>
                        <small>WAPE · MAE {currency(score.mae)} · {score.observations} tests</small>
                      </div>
                    ))}
                  </div>
                  <div className="interval-note">
                    <span className="interval-icon">i</span>
                    <p><strong>Uncertainty, made visible.</strong> Shaded range uses the 90th percentile of rolling one-step absolute errors; it is an empirical reference, not a formal prediction interval.</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <PanelHeading eyebrow="03 / TIME-SERIES LAB" title="Monthly sales forecast" detail="Forecast uses chronological history, not a single-year slice." />
                <p className="forecast-unavailable">{data.forecast.reason}</p>
              </>
            )}
          </article>
        </section>
      )}

      <section className="chart-grid secondary-grid" id="product-analysis">
        <article className="panel panel-wide" aria-busy={loading}>
          <PanelHeading eyebrow="04 / ASSORTMENT" title="Category performance" detail="Sales contribution, reach, and average item value" action={<span className="panel-unit">TOP 8 BY SALES</span>} />
          <CategoryTable rows={data.categories} />
        </article>
        <article className="panel status-panel" aria-busy={loading}>
          <PanelHeading eyebrow="05 / ORDER FULFILLMENT" title="Order status mix" detail="Share of all orders in the selected period" />
          <StatusSummary rows={data.statuses} />
          <div className="risk-callout">
            <span className="risk-label">CANCELLATION RATE</span>
            <strong>{percent(metrics.cancellation_rate)}</strong>
            <span>Orders marked canceled</span>
          </div>
        </article>
      </section>

      <section className="panel rating-panel" id="customer-insights" aria-busy={loading}>
        <PanelHeading eyebrow="06 / CUSTOMER VOICE" title="Review score distribution" detail="Ratings reveal the shape of satisfaction—not just its average" action={<span className="panel-unit">{number(data.ratings.reduce((sum, row) => sum + Number(row.value), 0))} REVIEWS</span>} />
        <RatingChart rows={data.ratings} />
      </section>

      <section className="chart-grid research-grid">
        <article className="panel" aria-busy={loading}>
          <PanelHeading eyebrow="07 / PAYMENT BEHAVIOR" title="How customers pay" detail="Payment value, order reach, and typical installments" />
          <PaymentMix rows={data.payments} />
        </article>
      </section>

      <BrazilRegionalAnalysis rows={data.regions} />

      <section className="chart-grid research-grid" id="delivery-review">
        <article className="panel">
          <PanelHeading eyebrow="09 / DELIVERY & SENTIMENT" title="Does delivery timing align with reviews?" detail="Compare score patterns for delivered orders" />
          <DeliveryReviewComparison rows={data.deliveryReviews} />
        </article>
        <article className="panel" id="demand-patterns" aria-busy={loading}>
          <PanelHeading eyebrow="10 / TEMPORAL BEHAVIOR" title="When orders are placed" detail="Order volume by weekday and hour · dataset purchase hour" />
          <DemandHeatmap rows={data.demandHeatmap} />
        </article>
      </section>

      <footer>
        <span>OLIST COMMERCE INTELLIGENCE <i>·</i> Exploratory analysis</span>
        <span>Source: Olist Brazilian E-Commerce Public Dataset</span>
      </footer>
        </main>
      </div>
    </div>
  );
}
