import Dashboard from "./pages/Dashboard.jsx";
import GoogleBigQueryDashboard from "./pages/GoogleBigQueryDashboard.jsx";

export const analystAnalysisTabs = [
  { id: "olist", label: "Olist analysis", Component: Dashboard, fullPage: true },
  { id: "bigquery", label: "Google BigQuery", Component: GoogleBigQueryDashboard, fullPage: true },
];

export const clientAnalysisTabs = [];
