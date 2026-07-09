// Retrieve team names from storage
const teamAName = TichuStorage.getTeamName("A");
const teamBName = TichuStorage.getTeamName("B");

// Round number and win threshold are set on the main screen; just
// mirror them here for reference.
const roundNumber = TichuStorage.getRoundNumber();
document.getElementById("round-counter-display").textContent = "Round " + roundNumber;
const winThreshold = TichuStorage.getWinThreshold();
document.getElementById("win-threshold-display").textContent = "Win: " + winThreshold;

// Update table headers and labels with team names
document.getElementById("team-a-header").textContent = teamAName;
document.getElementById("team-b-header").textContent = teamBName;

// Load round scores from storage
const roundScores = TichuStorage.getRoundScores();
const tableBody = document.querySelector("#round-scores tbody");

// Data for the graph
const labels = []; // Round numbers
const teamAData = []; // Team A cumulative totals
const teamBData = []; // Team B cumulative totals
const teamADelta = []; // Team A round points (this round's gain/loss)
const teamBDelta = []; // Team B round points
const teamATichuCodes = []; // Team A Tichu badge text, plain (no HTML)
const teamBTichuCodes = []; // Team B Tichu badge text, plain (no HTML)

// The table stores Tichu results as small HTML snippets (e.g. with
// <s> for a lost call). Canvas text can't render HTML, so convert
// to a plain-text equivalent for the chart labels.
function tichuPlainCode(html) {
  if (!html) return "";
  return html.replace("<s>GT</s>", "✗GT").replace("<s>T</s>", "✗T");
}

// Populate the table with round scores
roundScores.forEach((round, index) => {
  // Calculate points for the current round
  const teamAPoints = index === 0 ? round.teamA : round.teamA - roundScores[index - 1].teamA;
  const teamBPoints = index === 0 ? round.teamB : round.teamB - roundScores[index - 1].teamB;

  const row = `
    <tr>
      <td>${index + 1}</td>
      <td>${round.teamA}</td> <!-- Total Points for Team A -->
      <td>${teamAPoints}</td> <!-- Points for Team A -->
      <td>${round.teamATichu}</td>
      <td>${round.teamB}</td> <!-- Total Points for Team B -->
      <td>${teamBPoints}</td> <!-- Points for Team B -->
      <td>${round.teamBTichu}</td>
    </tr>
  `;
  tableBody.innerHTML += row;

  // Add data for the graph
  labels.push(`${index + 1}`);
  teamAData.push(round.teamA);
  teamBData.push(round.teamB);
  teamADelta.push(teamAPoints);
  teamBDelta.push(teamBPoints);
  teamATichuCodes.push(tichuPlainCode(round.teamATichu));
  teamBTichuCodes.push(tichuPlainCode(round.teamBTichu));
});

// --- Auto-scale the Y axis to the actual score range ---
// Instead of forcing the axis to start at 0 (which wastes space and
// squashes the two lines together when scores are e.g. -120..340),
// scale to the real min/max of the data with a bit of padding.
const allScores = [...teamAData, ...teamBData];
let yMin = 0;
let yMax = 100;
if (allScores.length) {
  const rawMin = Math.min(...allScores);
  const rawMax = Math.max(...allScores);
  const range = rawMax - rawMin;
  // Padding: 15% of the range, but never less than 30 points so a
  // single round (range = 0) still gets a sensible axis.
  const padding = Math.max(30, Math.round(range * 0.15));
  yMin = Math.floor((rawMin - padding) / 10) * 10;
  yMax = Math.ceil((rawMax + padding) / 10) * 10;
}

// Build the multi-line label shown at each point: total, round
// delta (with sign), and the Tichu code if one was called.
function buildPointLabel(total, delta, tichuCode) {
  const lines = [`${total}`, delta >= 0 ? `+${delta}` : `${delta}`];
  if (tichuCode) lines.push(tichuCode);
  return lines;
}

// Fixed "A above, B below" alignment overlaps whenever the lines
// are close together or cross. Instead, push whichever team is
// higher at that round's point further up, and whichever is lower
// further down, so the two chips always diverge away from each
// other rather than both crowding into the same gap. Ties fall
// back to team A on top so they don't land on the same side.
function makeAlignFn(isTeamA) {
  return (dctx) => {
    const idx = dctx.dataIndex;
    const aVal = teamAData[idx];
    const bVal = teamBData[idx];
    if (aVal === bVal) return isTeamA ? "top" : "bottom";
    const teamIsHigher = isTeamA ? aVal > bVal : bVal > aVal;
    return teamIsHigher ? "top" : "bottom";
  };
}

// Whether to show the on-chart total/delta/Tichu chips, persisted
// across visits.
let chipsVisible = TichuStorage.getChipsVisible();

Chart.register(ChartDataLabels);

// Create the graph
const ctx = document.getElementById("scoreChart").getContext("2d");
Chart.defaults.font.family = "sans-serif";
Chart.defaults.font.weight = "bolder";
Chart.defaults.font.size = 16;
const scoreChart = new Chart(ctx, {
  type: "line", // Line chart
  data: {
    labels: labels, // Round numbers
    datasets: [
      {
        label: teamAName,
        data: teamAData,
        borderColor: "rgba(255, 99, 132, 1)", // Red line
        backgroundColor: "rgba(255, 99, 132, 0.2)", // Light red fill
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        datalabels: {
          align: makeAlignFn(true),
          anchor: "center",
          offset: 6,
          color: "rgba(200, 50, 80, 1)",
          font: { size: 9, weight: "bold" },
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 4, right: 4 },
          formatter: (value, dctx) =>
            buildPointLabel(teamAData[dctx.dataIndex], teamADelta[dctx.dataIndex], teamATichuCodes[dctx.dataIndex]),
        },
      },
      {
        label: teamBName,
        data: teamBData,
        borderColor: "rgba(54, 162, 235, 1)", // Blue line
        backgroundColor: "rgba(54, 162, 235, 0.2)", // Light blue fill
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        datalabels: {
          align: makeAlignFn(false),
          anchor: "center",
          offset: 6,
          color: "rgba(30, 110, 180, 1)",
          font: { size: 9, weight: "bold" },
          backgroundColor: "rgba(255, 255, 255, 0.85)",
          borderRadius: 4,
          padding: { top: 2, bottom: 2, left: 4, right: 4 },
          formatter: (value, dctx) =>
            buildPointLabel(teamBData[dctx.dataIndex], teamBDelta[dctx.dataIndex], teamBTichuCodes[dctx.dataIndex]),
        },
      },
    ],
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 24, bottom: 24 },
    },
    plugins: {
      legend: {
        position: "top",
      },
      title: {
        display: false,
        text: "Tichu Scores",
      },
      datalabels: {
        display: chipsVisible,
      },
      // Correctly positioned configuration option:
      customCanvasBackgroundColor: {
        color: '#ffffff',
      },
    },
    elements: {
      line: {
          tension : 0.4  // smooth lines
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "Rounds",
        },
      },
      y: {
        beginAtZero: false,
        min: yMin,
        max: yMax,
        title: {
          display: true,
          text: "Points",
        },
      },
    },
  },
   plugins: [{
      id: 'customCanvasBackgroundColor',
      beforeDraw: (chart, args, options) => {
        const { ctx } = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.color || '#ffffff';
        ctx.fillRect(0, 0, chart.width, chart.height);
        ctx.restore();
      }
    }],
});

// Toggle between table and graph
const toggleButton = document.getElementById("toggle-view");
const tableContainer = document.getElementById("table-container");
const graphContainer = document.getElementById("graph-container");

function isGraphActive() {
  return !graphContainer.classList.contains("hidden");
}

// Apply/remove the landscape-expanded look. The actual expansion is
// done in CSS via the @media (orientation: landscape) rule in main.css;
// this just toggles whether that rule is allowed to apply, based on
// whether the graph is the active view.
function syncLandscapeClass() {
  graphContainer.classList.toggle("landscape-graph", isGraphActive());
}

// The chip-toggle and share buttons only make sense while the
// graph is on screen; hide them in table view.
const graphOnlyButtons = document.querySelectorAll(".graph-only-btn");
function syncGraphOnlyButtons() {
  graphOnlyButtons.forEach((el) => el.classList.toggle("hidden", !isGraphActive()));
}

toggleButton.addEventListener("click", () => {
  if (tableContainer.classList.contains("hidden")) {
    tableContainer.classList.remove("hidden");
    graphContainer.classList.add("hidden");
    toggleButton.innerHTML = '<i class="material-icons">show_chart</i>';
  } else {
    tableContainer.classList.add("hidden");
    graphContainer.classList.remove("hidden");
    toggleButton.innerHTML = '<i class="material-icons">list</i>';
    // The graph was hidden (display:none) so Chart.js couldn't
    // measure it; nudge a resize now that it's visible.
    requestAnimationFrame(() => scoreChart.resize());
  }
  syncLandscapeClass();
  syncGraphOnlyButtons();
});

syncLandscapeClass();
syncGraphOnlyButtons();

// Toggle the on-chart total/delta/Tichu chips on and off
const chipsToggleButton = document.getElementById("toggle-chips");
function updateChipsIcon() {
  chipsToggleButton.innerHTML =
    `<i class="material-icons">${chipsVisible ? "visibility" : "visibility_off"}</i>`;
}
chipsToggleButton.addEventListener("click", () => {
  chipsVisible = !chipsVisible;
  TichuStorage.setChipsVisible(chipsVisible);
  scoreChart.options.plugins.datalabels.display = chipsVisible;
  scoreChart.update();
  updateChipsIcon();
});
updateChipsIcon();

// Share the chart as an image. Uses the Web Share API (with a
// file attachment) where supported, e.g. Android/iOS Chrome and
// Safari, so it opens straight into WhatsApp/etc.; falls back to
// a plain download on desktop browsers that don't support that.
const shareButton = document.getElementById("share-graph");
shareButton.addEventListener("click", () => {
  scoreChart.canvas.toBlob(async (blob) => {
    if (!blob) return;
    const fileName = `tichu-scores-round-${labels.length || 0}.png`;
    const file = new File([blob], fileName, { type: "image/png" });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Tichu Scores",
          text: `${teamAName} vs ${teamBName}`,
        });
      } catch (err) {
        // User cancelled the share sheet, or share failed silently.
        console.log("Share cancelled or failed:", err);
      }
    } else {
      // Fallback: trigger a plain download of the image.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  }, "image/png");
});
