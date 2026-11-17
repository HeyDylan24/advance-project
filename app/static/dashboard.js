const dataElement = document.getElementById("dashboard-data");

if (dataElement && window.Chart) {
  const data = JSON.parse(dataElement.textContent);
  const colors = ["#6c63ff", "#24b8a2", "#ffae57", "#e6759a", "#55a4e8", "#a584d6", "#9baa69", "#e17b5d"];
  Chart.defaults.font.family = "'DM Sans', sans-serif";
  Chart.defaults.color = "#8790a3";

  const currency = value => new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value);

  new Chart(document.getElementById("sales-chart"), {
    type: "line",
    data: {
      labels: data.monthly.map(item => item.label),
      datasets: [{
        data: data.monthly.map(item => item.value),
        borderColor: "#766cff",
        backgroundColor: context => {
          const gradient = context.chart.ctx.createLinearGradient(0, 0, 0, 280);
          gradient.addColorStop(0, "rgba(118, 108, 255, .24)");
          gradient.addColorStop(1, "rgba(118, 108, 255, 0)");
          return gradient;
        },
        fill: true,
        tension: 0.38,
        pointRadius: 2,
        pointHoverRadius: 5,
        pointBackgroundColor: "#766cff",
        borderWidth: 2
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => currency(item.raw) } } },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { grid: { color: "rgba(135, 144, 163, .12)" }, ticks: { callback: value => currency(value) } }
      }
    }
  });

  new Chart(document.getElementById("category-chart"), {
    type: "bar",
    data: {
      labels: data.categories.map(item => item.label),
      datasets: [{
        data: data.categories.map(item => item.sales),
        backgroundColor: colors,
        borderRadius: 5,
        maxBarThickness: 26
      }]
    },
    options: {
      indexAxis: "y",
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: item => currency(item.raw) } } },
      scales: {
        x: { grid: { color: "rgba(135, 144, 163, .12)" }, ticks: { callback: value => currency(value) } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });

  const statusChart = new Chart(document.getElementById("status-chart"), {
    type: "doughnut",
    data: {
      labels: data.statuses.map(item => item.label.replaceAll("_", " ")),
      datasets: [{
        data: data.statuses.map(item => item.value),
        backgroundColor: colors,
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: "72%",
      plugins: { legend: { display: false } }
    }
  });
  const statusLegend = document.getElementById("status-legend");
  statusChart.data.labels.forEach((label, index) => {
    const row = document.createElement("div");
    row.className = "legend-row";
    const name = document.createElement("span");
    name.className = "legend-name";
    const dot = document.createElement("i");
    dot.style.backgroundColor = colors[index % colors.length];
    name.append(dot, document.createTextNode(label));
    const count = document.createElement("strong");
    count.textContent = new Intl.NumberFormat().format(data.statuses[index].value);
    row.append(name, count);
    statusLegend.append(row);
  });

  new Chart(document.getElementById("rating-chart"), {
    type: "bar",
    data: {
      labels: data.ratings.map(item => `${item.label} star${item.label === 1 ? "" : "s"}`),
      datasets: [{
        data: data.ratings.map(item => item.value),
        backgroundColor: ["#e6759a", "#ee9c79", "#ffbd69", "#76c6ae", "#6cbd9f"],
        borderRadius: 5,
        maxBarThickness: 52
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true, grid: { color: "rgba(135, 144, 163, .12)" }, ticks: { precision: 0 } }
      }
    }
  });
}
