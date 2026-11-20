import summary from "../data/googleBigQuerySummary.json";
import ChartExplanation from "../ChartExplanation.jsx";

const palette = ["#ff5fd2", "#5de4ff", "#c06bff", "#ffd166", "#6bffca", "#ff7a91", "#74a7ff", "#ff9b53"];
const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));
const percent = (value) => `${Number(value || 0).toFixed(1)}%`;
const currency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
const compactCurrency = (value) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));

const continents = [
  [[-168, 70], [-150, 72], [-132, 60], [-124, 50], [-118, 33], [-105, 23], [-98, 17], [-82, 9], [-77, 25], [-80, 34], [-66, 45], [-53, 49], [-62, 60], [-82, 70], [-110, 75], [-140, 72]],
  [[-53, 82], [-38, 80], [-23, 71], [-43, 59], [-54, 61], [-60, 72]],
  [[-80, 10], [-70, 8], [-62, -3], [-65, -20], [-72, -39], [-68, -54], [-58, -51], [-49, -34], [-38, -10], [-47, 1], [-52, 8], [-66, 12]],
  [[-11, 36], [-5, 44], [8, 48], [16, 58], [28, 69], [47, 72], [63, 66], [82, 72], [103, 70], [124, 60], [146, 57], [164, 61], [178, 51], [158, 43], [143, 43], [134, 34], [122, 24], [108, 19], [96, 8], [80, 7], [74, 15], [60, 24], [46, 31], [32, 35], [20, 39], [8, 36]],
  [[-17, 35], [2, 38], [20, 34], [34, 29], [43, 12], [50, 10], [42, -12], [33, -35], [19, -34], [10, -20], [3, -2], [-10, 10], [-17, 21]],
  [[112, -11], [130, -10], [153, -17], [153, -29], [144, -39], [129, -35], [115, -23]],
];

function scrollToSection(event) {
  event.preventDefault();
  document.getElementById(event.currentTarget.hash.slice(1))?.scrollIntoView({ block: "start" });
}

function projectWorldPoint(longitude, latitude) {
  return {
    x: 50 + ((Number(longitude) + 180) / 360) * 900,
    y: 20 + ((90 - Number(latitude)) / 180) * 460,
  };
}

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

function TrendChart({ rows, valueKey, color, formatValue, axisFormat, ariaLabel }) {
  const pointsData = rows
    .map((row) => ({ ...row, value: Number(row[valueKey]) }))
    .filter((row) => Number.isFinite(row.value));
  if (!pointsData.length) return <p className="empty-chart">No data is available for this chart.</p>;

  const width = 760;
  const height = 250;
  const padding = { top: 18, right: 16, bottom: 38, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const max = Math.max(...pointsData.map((row) => row.value), 1);
  const points = pointsData.map((row, index) => ({
    ...row,
    x: padding.left + (pointsData.length === 1 ? plotWidth / 2 : (index / (pointsData.length - 1)) * plotWidth),
    y: padding.top + plotHeight - (row.value / max) * plotHeight,
  }));
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = new Set(
    Array.from({ length: Math.min(points.length, 6) }, (_, index) =>
      Math.round((index * (points.length - 1)) / (Math.min(points.length, 6) - 1 || 1)),
    ),
  );

  return (
    <div className="chart-wrap bq-trend-chart">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={ariaLabel}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + plotHeight * (1 - tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="axis-label">
                {axisFormat(max * tick)}
              </text>
            </g>
          );
        })}
        <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="3.5" fill="#141923" stroke={color} strokeWidth="2" />
            <title>{point.label}: {formatValue(point.value)}{point.orders ? ` · ${number(point.orders)} orders` : ""}</title>
            {labelIndexes.has(index) && (
              <text x={point.x} y={height - 12} textAnchor="middle" className="axis-label">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function ForecastChart({ history, forecast }) {
  if (!forecast.available || !forecast.values.length) {
    return <p className="empty-chart">Not enough monthly history is available to forecast sales.</p>;
  }

  const observed = history.slice(-18).map((row) => ({ ...row, value: Number(row.sales), projected: false }));
  const projected = forecast.values.map((row) => ({ ...row, projected: true }));
  const upperValues = projected.map((row) => Number(row.upper));
  const max = Math.max(...observed.map((row) => row.value), ...upperValues, 1);
  const width = 760;
  const height = 250;
  const padding = { top: 18, right: 16, bottom: 38, left: 76 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const rows = [...observed, ...projected];
  const points = rows.map((row, index) => ({
    ...row,
    x: padding.left + (index / Math.max(rows.length - 1, 1)) * plotWidth,
    y: padding.top + plotHeight - (Number(row.value) / max) * plotHeight,
  }));
  const observedPoints = points.slice(0, observed.length);
  const forecastPoints = points.slice(observed.length);
  const anchor = observedPoints[observedPoints.length - 1];
  const forecastLine = [anchor, ...forecastPoints].map((point) => `${point.x},${point.y}`).join(" ");
  const upper = forecastPoints.map((point) =>
    `${point.x},${padding.top + plotHeight - (Number(point.upper) / max) * plotHeight}`,
  );
  const lower = forecastPoints.slice().reverse().map((point) =>
    `${point.x},${padding.top + plotHeight - (Number(point.lower) / max) * plotHeight}`,
  );
  const band = [...upper, ...lower].join(" ");
  const observedLine = observedPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const labelIndexes = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);

  return (
    <div className="chart-wrap bq-forecast-chart">
      <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly sales history and six-month model forecast">
        <defs>
          <linearGradient id="bq-forecast-band" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ff5fd2" stopOpacity=".22" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity=".08" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((tick) => {
          const y = padding.top + plotHeight * (1 - tick);
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} className="grid-line" />
              <text x={padding.left - 10} y={y + 4} textAnchor="end" className="axis-label">{compactCurrency(max * tick)}</text>
            </g>
          );
        })}
        <polygon points={band} className="bq-forecast-band" />
        <polyline points={observedLine} fill="none" stroke="#738095" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={forecastLine} className="bq-forecast-line" />
        {points.map((point, index) => (
          <g key={point.label}>
            <circle
              cx={point.x}
              cy={point.y}
              r={point.projected ? 4 : 3}
              className={point.projected ? "bq-forecast-point" : "bq-observed-point"}
            />
            <title>{point.label}: {currency(point.value)}{point.projected ? ` · range ${currency(point.lower)}–${currency(point.upper)}` : " · observed"}</title>
            {labelIndexes.has(index) && (
              <text x={point.x} y={height - 12} textAnchor="middle" className="axis-label">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function BarList({ rows, valueKey, total, formatValue, detail }) {
  if (!rows.length) return <p className="empty-chart">No data is available for this chart.</p>;
  const max = Math.max(...rows.map((row) => Number(row[valueKey])), 1);
  return (
    <ol className="bq-bar-list">
      {rows.map((row, index) => {
        const value = Number(row[valueKey]);
        const share = row.share ?? (total ? value / total * 100 : 0);
        return (
          <li key={row.label}>
            <div className="bq-bar-heading">
              <span title={row.label}>{row.label}</span>
              <strong>{formatValue(value)}</strong>
              <small>{detail ? detail(row) : percent(share)}</small>
            </div>
            <div className="bq-bar-track" aria-hidden="true">
              <span style={{ width: `${Math.min(value / max * 100, 100)}%`, "--bar-color": palette[index % palette.length] }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function WorldMarketMap({ rows }) {
  const maxSales = Math.max(...rows.map((row) => Number(row.sales)), 1);
  const labeledCountries = new Set(rows.slice(0, 3).map((row) => row.label));
  const outlinePath = (points) => points.map(([longitude, latitude], index) => {
    const point = projectWorldPoint(longitude, latitude);
    return `${index ? "L" : "M"}${point.x},${point.y}`;
  }).join(" ") + " Z";

  return (
    <div className="world-map-wrap">
      <svg className="world-map" viewBox="0 0 1000 500" role="img" aria-label="World bubble map of sales by country">
        <defs>
          <linearGradient id="world-land" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff61d1" stopOpacity=".23" />
            <stop offset="100%" stopColor="#5de4ff" stopOpacity=".15" />
          </linearGradient>
          <radialGradient id="world-bubble">
            <stop offset="0%" stopColor="#fff5ff" stopOpacity=".98" />
            <stop offset="35%" stopColor="#ff65d5" stopOpacity=".92" />
            <stop offset="100%" stopColor="#a34dff" stopOpacity=".76" />
          </radialGradient>
        </defs>
        {[-120, -60, 0, 60, 120].map((longitude) => {
          const x = projectWorldPoint(longitude, 0).x;
          return <line className="world-grid-line" key={`lon-${longitude}`} x1={x} x2={x} y1="20" y2="480" />;
        })}
        {[-60, -30, 0, 30, 60].map((latitude) => {
          const y = projectWorldPoint(0, latitude).y;
          return <line className="world-grid-line" key={`lat-${latitude}`} x1="50" x2="950" y1={y} y2={y} />;
        })}
        {continents.map((points, index) => (
          <path className="world-continent" d={outlinePath(points)} key={index} />
        ))}
        {rows.map((row) => {
          const point = projectWorldPoint(row.map_longitude, row.map_latitude);
          const radius = 4 + 17 * Math.sqrt(Number(row.sales) / maxSales);
          return (
            <g className="world-market-point" key={row.label} tabIndex="0">
              <circle cx={point.x} cy={point.y} r={radius + 4} className="world-market-halo" />
              <circle cx={point.x} cy={point.y} r={radius} className="world-market-bubble" />
              <title>{row.label}: {currency(row.sales)} in sales, {number(row.orders)} orders, {percent(row.share)} share</title>
              {labeledCountries.has(row.label) && (
                <text className="world-market-label" x={point.x + 8} y={point.y - radius - 4}>{row.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="world-map-legend"><span><i />Sales by country</span><small>Bubble area represents item sales</small></div>
    </div>
  );
}

export default function GoogleBigQueryDashboard({ onBackToPortal }) {
  const { metrics } = summary;
  const peakMonth = summary.monthly.reduce(
    (best, row) => !best || Number(row.sales) > Number(best.sales) ? row : best,
    null,
  );
  const fastestMonth = summary.monthly
    .filter((row) => row.average_delivery_days !== null)
    .reduce(
      (best, row) => !best || Number(row.average_delivery_days) < Number(best.average_delivery_days) ? row : best,
      null,
    );
  const slowestMonth = summary.monthly
    .filter((row) => row.average_delivery_days !== null)
    .reduce(
      (best, row) => !best || Number(row.average_delivery_days) > Number(best.average_delivery_days) ? row : best,
      null,
    );
  const topCategory = summary.categories[0];
  const topEvent = summary.event_types[0];
  const topStatus = summary.statuses.reduce(
    (best, row) => !best || Number(row.value) > Number(best.value) ? row : best,
    null,
  );
  const topRegion = summary.regions[0];
  const topTrafficSource = summary.traffic_sources[0];
  const topDepartment = summary.departments[0];
  const topCountry = summary.countries[0];
  const leadingCountryShare = summary.countries
    .slice(0, 3)
    .reduce((share, row) => share + Number(row.share), 0);
  const selectedModelScore = summary.forecast.backtest.find(
    (score) => score.model === summary.forecast.model,
  );
  const comparisonModelScore = summary.forecast.backtest.find(
    (score) => score.model !== summary.forecast.model,
  );
  const forecastTotal = summary.forecast.values.reduce((total, row) => total + Number(row.value), 0);
  const dateRange = `${summary.date_range.first_order} – ${summary.date_range.last_order}`;

  return (
    <div className="workspace bq-workspace">
      <aside className="sidebar">
        <a className="sidebar-brand" href="/" aria-label="Commerce dashboard home">
          <span className="brand-mark">O</span>
          <span>commerce<span className="brand-light"> / lab</span></span>
        </a>
        <div className="workspace-switcher">
          <span className="workspace-avatar">BQ</span>
          <span><strong>Google BigQuery</strong><small>Commerce snapshot</small></span>
          <span className="switcher-chevron">⌄</span>
        </div>
        <p className="sidebar-section-label">ANALYZE</p>
        <nav className="sidebar-nav" aria-label="BigQuery analysis sections">
          <a className="nav-link nav-link-active" href="#bq-overview" onClick={scrollToSection}><span className="nav-icon">▦</span>Overview</a>
          <a className="nav-link" href="#bq-revenue" onClick={scrollToSection}><span className="nav-icon">⌁</span>Revenue & delivery</a>
          <a className="nav-link" href="#bq-forecast" onClick={scrollToSection}><span className="nav-icon">↗</span>Sales forecast</a>
          <a className="nav-link" href="#bq-categories" onClick={scrollToSection}><span className="nav-icon">◈</span>Categories & events</a>
          <a className="nav-link" href="#bq-world" onClick={scrollToSection}><span className="nav-icon">◎</span>Global markets</a>
          <a className="nav-link" href="#bq-operations" onClick={scrollToSection}><span className="nav-icon">↗</span>Orders & regions</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="dataset-status">
          <span className="dataset-status-dot" />
          <span><strong>Aggregate snapshot</strong><small>BigQuery · TheLook</small></span>
          <span className="dataset-menu">···</span>
        </div>
        <div className="sidebar-profile">
          <span className="profile-avatar">BQ</span>
          <span><strong>Commerce analysis</strong><small>Research snapshot</small></span>
          <span className="profile-menu">⌄</span>
        </div>
      </aside>
      <div className="workspace-main">
        <main className="shell">
          <header className="topbar">
            <div className="topbar-breadcrumb"><span>WORKSPACE</span><i>/</i><strong>Google BigQuery</strong></div>
            <div className="topbar-actions">
              {onBackToPortal && <button className="portal-back" type="button" onClick={onBackToPortal}>← Analyst inbox</button>}
              <a className="portal-back" href="#workspace">Client / analyst sign-in</a>
              <span className="data-status"><i /> AGGREGATE SNAPSHOT</span>
              <span className="topbar-dataset">THELOOK ECOMMERCE</span>
            </div>
          </header>

          <section className="page-heading">
            <div>
              <p className="eyebrow"><span className="heading-dot" /> GOOGLE BIGQUERY <i>/</i> COMMERCE ANALYSIS</p>
              <h1>Commerce, at a glance.</h1>
              <p className="subheading">A privacy-preserving TheLook eCommerce snapshot with global market comparisons, chart insights, and a rolling-backtested six-month sales forecast.</p>
            </div>
            <div className="bq-period"><span>ORDER DATE RANGE</span><strong>{dateRange}</strong></div>
          </section>

          <div className="analysis-context">
            <span className="context-marker" />
            <span>Source: <strong>Google BigQuery TheLook eCommerce</strong></span>
            <span className="context-separator">/</span>
            <span>{number(metrics.orders)} orders · {number(metrics.events)} events</span>
            <span className="context-date">Static aggregate snapshot</span>
          </div>

          <section className="metric-grid bq-metric-grid" id="bq-overview" aria-label="BigQuery key performance indicators">
            <MetricCard label="Gross merchandise value" value={currency(metrics.sales)} caption="Item sales · freight excluded" icon="$" tone="revenue" />
            <MetricCard label="Orders analyzed" value={number(metrics.orders)} caption={`${number(metrics.customers)} distinct customers`} icon="↗" tone="orders" />
            <MetricCard label="Average order value" value={currency(metrics.average_order_value)} caption="Item sales per order" icon="Ø" tone="basket" />
            <MetricCard label="Returned orders" value={percent(metrics.return_rate)} caption="Share of all orders" icon="↩" tone="rating" />
          </section>

          <section className="chart-grid primary-grid" id="bq-revenue">
            <article className="panel panel-wide">
              <PanelHeading eyebrow="01 / REVENUE MOMENTUM" title="Monthly sales trend" detail="Item sales across the full snapshot period" action={<span className="panel-unit">{summary.monthly.length} MONTHS</span>} />
              <TrendChart
                rows={summary.monthly}
                valueKey="sales"
                color="#9b8cff"
                formatValue={currency}
                axisFormat={compactCurrency}
                ariaLabel="Monthly item sales from the BigQuery snapshot"
              />
              <ChartExplanation
                question="Which month generated the most item sales?"
                inference={peakMonth
                  ? `${peakMonth.label} is the strongest month at ${currency(peakMonth.sales)}. The chart follows order creation month; the snapshot covers ${summary.monthly.length} months.`
                  : "No monthly sales are available in this snapshot."}
              />
            </article>
            <article className="panel">
              <PanelHeading eyebrow="02 / UNIT ECONOMICS" title="Order & delivery pulse" detail="Snapshot-level operating measures" />
              <div className="bq-pulse">
                <div><span>AVG. DELIVERY</span><strong>{Number(metrics.average_delivery_days).toFixed(1)} days</strong><small>From order creation to delivery</small></div>
                <div><span>EST. GROSS MARGIN</span><strong>{percent(metrics.gross_margin)}</strong><small>Using archived product cost and item sale price</small></div>
                <div><span>ITEMS PER ORDER</span><strong>{(metrics.items / Math.max(metrics.orders, 1)).toFixed(2)}</strong><small>{number(metrics.items)} line items analyzed</small></div>
              </div>
              <ChartExplanation
                question="What do delivery speed and item economics look like overall?"
                inference={`Orders took ${Number(metrics.average_delivery_days).toFixed(1)} days to deliver on average. Estimated gross margin is ${percent(metrics.gross_margin)}; it is derived from the available product cost field and is not an accounting statement.`}
              />
            </article>
          </section>

          <section className="forecast-section bq-forecast-section" id="bq-forecast">
            <article className="panel forecast-panel">
              <PanelHeading
                eyebrow="03 / PREDICTIVE MODEL"
                title="Six-month sales outlook"
                detail={`Forecast begins after ${summary.forecast.last_observed_month} · ${summary.forecast.training_months} monthly observations · rolling backtest selected`}
                action={<span className="model-badge">{summary.forecast.model_label.toUpperCase()} · BACKTESTED</span>}
              />
              <div className="forecast-legend">
                <span><i className="legend-observed" />Observed</span>
                <span><i className="legend-projection" />Forecast</span>
                <span><i className="legend-range" />Empirical error range</span>
              </div>
              <ForecastChart history={summary.monthly} forecast={summary.forecast} />
              <div className="bq-model-diagnostics" aria-label="Rolling forecast backtest comparison">
                {summary.forecast.backtest.map((score) => (
                  <div className={`model-score ${score.model === summary.forecast.model ? "model-score-selected" : ""}`} key={score.model}>
                    <span>{score.model === "seasonal_naive" ? "Seasonal naïve" : "Naïve baseline"}</span>
                    <strong>{score.wape === null ? "—" : percent(score.wape)} WAPE</strong>
                    <small>MAE {currency(score.mae)} · {score.observations} rolling tests</small>
                  </div>
                ))}
                <p>Model selection uses expanding-window, one-month-ahead errors. This is a historical snapshot forecast, not a current-market projection.</p>
              </div>
              <ChartExplanation
                question="Which model performed better, and what does it project?"
                inference={selectedModelScore
                  ? `${summary.forecast.model_label} had ${percent(selectedModelScore.wape)} rolling WAPE${comparisonModelScore ? ` versus ${percent(comparisonModelScore.wape)} for the alternative` : ""}. It projects ${currency(forecastTotal)} in total item sales over six months after ${summary.forecast.last_observed_month}. The shaded range is based on the 90th percentile of past one-step errors, not a formal confidence interval.`
                  : "Not enough consecutive monthly sales history is available for a backtested forecast."}
              />
            </article>
          </section>

          <section className="chart-grid bq-triple-grid" id="bq-categories">
            <article className="panel">
              <PanelHeading eyebrow="04 / ASSORTMENT" title="Category sales" detail="Top product categories by item sales" />
              <BarList rows={summary.categories} valueKey="sales" formatValue={currency} />
              <ChartExplanation
                question="Which product categories drive the most sales?"
                inference={topCategory
                  ? `${topCategory.label} leads with ${currency(topCategory.sales)}, or ${percent(topCategory.share)} of total item sales.`
                  : "No category sales are available in this snapshot."}
              />
            </article>
            <article className="panel">
              <PanelHeading eyebrow="05 / PRODUCT MIX" title="Department sales" detail="Sales split across product departments" />
              <BarList rows={summary.departments} valueKey="sales" formatValue={currency} />
              <ChartExplanation
                question="Which department contributes more item sales?"
                inference={topDepartment
                  ? `${topDepartment.label} leads with ${currency(topDepartment.sales)}, or ${percent(topDepartment.share)} of item sales.`
                  : "No department data is available in this snapshot."}
              />
            </article>
            <article className="panel">
              <PanelHeading eyebrow="06 / SHOPPING ACTIVITY" title="Event mix" detail="Recorded event rows by event type—not unique users" />
              <BarList rows={summary.event_types} valueKey="value" total={metrics.events} formatValue={number} />
              <ChartExplanation
                question="Which event type appears most often in the event log?"
                inference={topEvent
                  ? `${topEvent.label} is the most frequent event (${number(topEvent.value)} rows). Event counts are activity volume, not unique visitors or a conversion rate.`
                  : "No event-type data is available in this snapshot."}
              />
            </article>
          </section>

          <section className="panel bq-world-panel" id="bq-world">
            <PanelHeading
              eyebrow="07 / GLOBAL MARKETS"
              title="Where commerce happens"
              detail={`Country-level sales across ${summary.countries.length} markets · markers use approximate country centers`}
              action={<span className="panel-unit">{summary.countries.length} COUNTRIES</span>}
            />
            <div className="world-market-layout">
              <WorldMarketMap rows={summary.countries} />
              <aside className="world-market-ranking">
                <span className="bq-mini-label">LEADING MARKETS · ITEM SALES</span>
                <BarList rows={summary.countries.slice(0, 8)} valueKey="sales" formatValue={currency} />
              </aside>
            </div>
            <ChartExplanation
              question="Which countries lead sales, and how concentrated are the top markets?"
              inference={topCountry
                ? `${topCountry.label} leads with ${currency(topCountry.sales)} (${percent(topCountry.share)}). The three largest markets contribute ${percent(leadingCountryShare)} of sales across the ${summary.countries.length} countries represented.`
                : "No country-level sales are available in this snapshot."}
            />
          </section>

          <section className="chart-grid research-grid" id="bq-operations">
            <article className="panel">
              <PanelHeading eyebrow="08 / ORDER FULFILLMENT" title="Order status mix" detail="Order counts grouped by recorded status" />
              <BarList rows={summary.statuses} valueKey="value" total={metrics.orders} formatValue={number} />
              <ChartExplanation
                question="What is the most common order outcome?"
                inference={topStatus
                  ? `${topStatus.label} is the most frequent status (${number(topStatus.value)} orders). The overall returned-order rate is ${percent(metrics.return_rate)}.`
                  : "No order-status data is available in this snapshot."}
              />
            </article>
            <article className="panel">
              <PanelHeading eyebrow="09 / CUSTOMER REGION" title="Sales by state" detail="Top states by item sales; location shown only in aggregate" />
              <BarList rows={summary.regions} valueKey="sales" formatValue={currency} />
              <ChartExplanation
                question="Where are the largest state-level markets?"
                inference={topRegion
                  ? `${topRegion.label} leads with ${currency(topRegion.sales)} in item sales (${percent(topRegion.share)} of total). State-level aggregation avoids exposing individual customer locations.`
                  : "No state-level sales are available in this snapshot."}
              />
            </article>
          </section>

          <section className="chart-grid research-grid">
            <article className="panel">
              <PanelHeading eyebrow="10 / DELIVERY TREND" title="Average delivery time by month" detail="Elapsed days from order creation to delivery" action={<span className="panel-unit">{Number(metrics.average_delivery_days).toFixed(1)} DAYS OVERALL</span>} />
              <TrendChart
                rows={summary.monthly.filter((row) => row.average_delivery_days !== null)}
                valueKey="average_delivery_days"
                color="#5ed6b0"
                formatValue={(value) => `${Number(value).toFixed(1)} days`}
                axisFormat={(value) => `${Number(value).toFixed(1)}d`}
                ariaLabel="Average delivery days by order month"
              />
              <ChartExplanation
                question="Did delivery speed vary substantially across the period?"
                inference={fastestMonth && slowestMonth
                  ? `Monthly averages ranged from ${Number(fastestMonth.average_delivery_days).toFixed(1)} days (${fastestMonth.label}) to ${Number(slowestMonth.average_delivery_days).toFixed(1)} days (${slowestMonth.label}); the overall average is ${Number(metrics.average_delivery_days).toFixed(1)} days.`
                  : "Not enough order and delivery timestamps are available to compare months."}
              />
            </article>
            <article className="panel">
              <PanelHeading eyebrow="11 / TRAFFIC SOURCES" title="Event traffic mix" detail="Recorded event rows grouped by traffic source" />
              <BarList rows={summary.traffic_sources} valueKey="value" total={metrics.events} formatValue={number} />
              <ChartExplanation
                question="Which traffic source contributed the most recorded events?"
                inference={topTrafficSource
                  ? `${topTrafficSource.label} accounts for ${number(topTrafficSource.value)} event rows (${percent(topTrafficSource.value / Math.max(metrics.events, 1) * 100)}). This describes event-log volume, not attributed sales.`
                  : "No traffic-source data is available in this snapshot."}
              />
            </article>
          </section>

          <footer>
            <span>GOOGLE BIGQUERY · THELOOK ECOMMERCE <i>·</i> AGGREGATE ANALYSIS</span>
            <span>{summary.privacy_note}</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
