// This page normally shows the live scoreboard (Quick Game, or a
// session game currently in progress) via TichuStorage. It can also
// show a *finished* session game from history: passing ?game=<gameId>
// reconstructs the same {teamAName, teamBName, roundScores, ...} shape
// from that game's stored rounds instead, so the rest of this file
// (table, graph, sharing) works unchanged either way.
const historyGameId = new URLSearchParams(window.location.search).get("game");
const historyGame = historyGameId && typeof TichuPlayers !== "undefined" ? TichuPlayers.getGame(historyGameId) : null;
const liveGame = typeof TichuPlayers !== "undefined" ? TichuPlayers.getCurrentGame() : null;
const sixGame = (historyGame || (!historyGameId && liveGame));
const threeTeamGame = sixGame && sixGame.mode === "threeTeams" ? sixGame : null;

// Mirrors the exact Tichu-call label convention built in js/script.js's
// nextRound() (HTML snippet with <s> for a lost call, prefixed with the
// double-win glyph) so archived rounds render identically to live ones.
function tichuLabel(mod, doubleWin) {
  return (doubleWin ? "\u21c9 " : "") +
    (mod === 200 ? "GT" :
     mod === 100 ? "T" :
     mod === -200 ? "<s>GT</s>" :
     mod === -100 ? "<s>T</s>" : "");
}

let teamAName, teamBName, teamCName, roundScores, roundCounterText, thresholdOrFinalText;

if (threeTeamGame) {
  [teamAName, teamBName, teamCName] = threeTeamGame.teams.map((team) => TichuPlayers.teamNameString(team));
  roundScores = threeTeamGame.rounds.map((r) => ({
    teamA: r.scores[0], teamB: r.scores[1], teamC: r.scores[2],
    teamATichu: tichuLabel(r.tichuMods[0], r.doubleWins[0]),
    teamBTichu: tichuLabel(r.tichuMods[1], r.doubleWins[1]),
    teamCTichu: tichuLabel(r.tichuMods[2], r.doubleWins[2]),
    activeTeams: r.activeTeams
  }));
  roundCounterText = threeTeamGame.winner
    ? "Final \u2014 " + roundScores.length + " rounds"
    : "Round " + (roundScores.length + 1);
  thresholdOrFinalText = threeTeamGame.finalScores
    ? "Final: " + [threeTeamGame.finalScores.teamA, threeTeamGame.finalScores.teamB, threeTeamGame.finalScores.teamC].join(" - ")
    : "Win: " + TichuStorage.getWinThreshold();
  if (historyGame) document.getElementById("back").href = "sessions.html";
} else if (historyGame) {
  teamAName = historyGame.mode === "rotation"
    ? TichuPlayers.teamNameString(historyGame.fixedTeam)
    : TichuPlayers.teamNameString(historyGame.teams[0]);
  teamBName = historyGame.mode === "rotation"
    ? TichuPlayers.teamNameString(historyGame.pool)
    : TichuPlayers.teamNameString(historyGame.teams[1]);
  roundScores = (historyGame.rounds || []).map((r) => ({
    teamA: r.teamAPoints,
    teamB: r.teamBPoints,
    teamATichu: tichuLabel(r.teamATichuMod, r.teamADoubleWin),
    teamBTichu: tichuLabel(r.teamBTichuMod, r.teamBDoubleWin),
  }));
  roundCounterText = "Final \u2014 " + roundScores.length + " round" + (roundScores.length === 1 ? "" : "s");
  thresholdOrFinalText = historyGame.finalScores
    ? "Final: " + historyGame.finalScores.teamA + " - " + historyGame.finalScores.teamB
    : "Finished";
  // Came here from a session's game list -- send "back" there instead
  // of the plain scoreboard, which wouldn't have this game loaded.
  document.getElementById("back").href = "sessions.html";
} else {
  teamAName = TichuStorage.getTeamName("A");
  teamBName = TichuStorage.getTeamName("B");
  roundScores = TichuStorage.getRoundScores();
  roundCounterText = "Round " + TichuStorage.getRoundNumber();
  thresholdOrFinalText = "Win: " + TichuStorage.getWinThreshold();
}

// Dealer names only exist for session games, where player identities are
// known. The history view reads them straight from the finished game
// record; the live view mirrors the board from the in-progress session
// game's stored rounds (recordRound keeps them in lockstep with the
// scoreboard). Quick Games and pre-dealer games simply leave the column
// empty, and it is hidden below when there is nothing to show.
let roundDealerIds = [];
if (historyGame) {
  roundDealerIds = (historyGame.rounds || []).map((r) => r.dealerPlayerId || null);
} else if (typeof TichuPlayers !== "undefined" && TichuPlayers.getCurrentGame) {
  if (liveGame && liveGame.rounds) {
    roundDealerIds = liveGame.rounds.map((r) => r.dealerPlayerId || null);
  }
}
const anyDealers = roundDealerIds.some((id) => !!id);
function dealerNameFor(roundIndex) {
  const id = roundDealerIds[roundIndex];
  if (!id || typeof TichuPlayers === "undefined") return "";
  const player = TichuPlayers.getPlayer(id);
  return player ? player.name : "(removed player)";
}

document.getElementById("round-counter-display").textContent = roundCounterText;
document.getElementById("win-threshold-display").textContent = thresholdOrFinalText;

// Update table headers and labels with team names
document.getElementById("team-a-header").textContent = teamAName;
document.getElementById("team-b-header").textContent = teamBName;
if (threeTeamGame) {
  const headerRows = document.querySelectorAll("#round-scores thead tr");
  const teamHeader = document.createElement("th");
  teamHeader.colSpan = 3;
  teamHeader.className = "team-c-column";
  teamHeader.textContent = teamCName;
  headerRows[0].insertBefore(teamHeader, headerRows[0].lastElementChild);
  ["Total", "Round", "Tichu"].forEach((label) => {
    const th = document.createElement("th");
    th.className = "team-c-column";
    th.textContent = label;
    headerRows[1].insertBefore(th, headerRows[1].lastElementChild);
  });
}

const tableBody = document.querySelector("#round-scores tbody");

// Data for the graph
const labels = []; // Round numbers
const teamAData = []; // Team A cumulative totals
const teamBData = []; // Team B cumulative totals
const teamCData = [];
const teamADelta = []; // Team A round points (this round's gain/loss)
const teamBDelta = []; // Team B round points
const teamCDelta = [];
const teamATichuCodes = []; // Team A Tichu badge text, plain (no HTML)
const teamBTichuCodes = []; // Team B Tichu badge text, plain (no HTML)
const teamCTichuCodes = [];

// The table stores Tichu results as small HTML snippets (e.g. with
// <s> for a lost call). Canvas text can't render HTML, so convert
// to a plain-text equivalent for the chart labels.
function tichuPlainCode(html) {
  if (!html) return "";
  return html.replace("<s>GT</s>", "✗GT").replace("<s>T</s>", "✗T");
}

// Populate the table with round scores
let tableRows = "";
roundScores.forEach((round, index) => {
  // Calculate points for the current round
  const teamAPoints = index === 0 ? round.teamA : round.teamA - roundScores[index - 1].teamA;
  const teamBPoints = index === 0 ? round.teamB : round.teamB - roundScores[index - 1].teamB;

  const row = `
    <tr>
      <td>${index + 1}</td>
      <td>${round.teamA}</td> <!-- Total Points for Team A -->
      <td>${threeTeamGame && !round.activeTeams.includes(0) ? "&mdash;" : teamAPoints}</td> <!-- Points for Team A -->
      <td>${round.teamATichu}</td>
      <td>${round.teamB}</td> <!-- Total Points for Team B -->
      <td>${threeTeamGame && !round.activeTeams.includes(1) ? "&mdash;" : teamBPoints}</td> <!-- Points for Team B -->
      <td>${round.teamBTichu}</td>
      ${threeTeamGame ? `<td class="team-c-column">${round.teamC}</td>
      <td class="team-c-column">${!round.activeTeams.includes(2) ? "&mdash;" : (index === 0 ? round.teamC : round.teamC - roundScores[index - 1].teamC)}</td>
      <td class="team-c-column">${round.teamCTichu}</td>` : ""}
      <td class="dealer-cell"></td>
    </tr>
  `;
  tableRows += row;

  // Add data for the graph
  labels.push(`${index + 1}`);
  teamAData.push(round.teamA);
  teamBData.push(round.teamB);
  teamADelta.push(teamAPoints);
  teamBDelta.push(teamBPoints);
  teamATichuCodes.push(tichuPlainCode(round.teamATichu));
  teamBTichuCodes.push(tichuPlainCode(round.teamBTichu));
  if (threeTeamGame) {
    teamCData.push(round.teamC);
    teamCDelta.push(index === 0 ? round.teamC : round.teamC - roundScores[index - 1].teamC);
    teamCTichuCodes.push(tichuPlainCode(round.teamCTichu));
  }
});

tableBody.innerHTML = tableRows;
tableBody.querySelectorAll(".dealer-cell").forEach((cell, index) => {
  cell.textContent = dealerNameFor(index);
});

// The Dealer column only means something when player identities are
// available (session games); collapse it out of plain Quick Game and
// legacy pre-dealer tables so they don't show a gap of empty cells.
if (!anyDealers) {
  document.querySelectorAll(".dealer-col, .dealer-cell").forEach((el) => el.classList.add("hidden"));
}

// --- Auto-scale the Y axis to the actual score range ---
// Instead of forcing the axis to start at 0 (which wastes space and
// squashes the two lines together when scores are e.g. -120..340),
// scale to the real min/max of the data with a bit of padding.
const allScores = [...teamAData, ...teamBData, ...teamCData];
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
        borderColor: "rgba(224, 160, 47, 1)", // Team A amber line
        backgroundColor: "rgba(224, 160, 47, 0.2)", // Team A amber fill
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        datalabels: {
          align: makeAlignFn(true),
          anchor: "center",
          offset: 6,
          color: "rgba(150, 100, 15, 1)",
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
        borderColor: "rgba(61, 142, 224, 1)", // Team B azure line
        backgroundColor: "rgba(61, 142, 224, 0.2)", // Team B azure fill
        borderWidth: 2,
        fill: true,
        pointRadius: 3,
        pointHoverRadius: 5,
        datalabels: {
          align: makeAlignFn(false),
          anchor: "center",
          offset: 6,
          color: "rgba(47, 116, 192, 1)",
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

if (threeTeamGame) {
  scoreChart.data.datasets.push({
    label: teamCName,
    data: teamCData,
    borderColor: "rgba(144, 90, 190, 1)",
    backgroundColor: "rgba(144, 90, 190, 0.2)",
    borderWidth: 2,
    pointRadius: 3,
    datalabels: {
      align: "right",
      anchor: "center",
      offset: 6,
      color: "rgba(115, 65, 160, 1)",
      font: { size: 9, weight: "bold" },
      backgroundColor: "rgba(255, 255, 255, 0.85)",
      borderRadius: 4,
      padding: { top: 2, bottom: 2, left: 4, right: 4 },
      formatter: (value, dctx) => buildPointLabel(teamCData[dctx.dataIndex], teamCDelta[dctx.dataIndex], teamCTichuCodes[dctx.dataIndex]),
    }
  });
  scoreChart.update();
}

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

toggleButton.addEventListener("click", (event) => {
  event.preventDefault();
  if (tableContainer.classList.contains("hidden")) {
    tableContainer.classList.remove("hidden");
    graphContainer.classList.add("hidden");
  } else {
    tableContainer.classList.add("hidden");
    graphContainer.classList.remove("hidden");
    // The graph was hidden (display:none) so Chart.js couldn't
    // measure it; nudge a resize now that it's visible.
    requestAnimationFrame(() => scoreChart.resize());
  }
  syncLandscapeClass();
  syncGraphOnlyButtons();
  syncToggleButton();
});

function syncToggleButton() {
  const graphActive = isGraphActive();
  const label = graphActive ? "Show score table" : "Show score graph";
  toggleButton.innerHTML = `<i class="material-icons" aria-hidden="true">${graphActive ? "list" : "show_chart"}</i>`;
  toggleButton.setAttribute("aria-label", label);
  toggleButton.setAttribute("title", label);
  toggleButton.setAttribute("data-label", graphActive ? "Table" : "Graph");
}

syncLandscapeClass();
syncGraphOnlyButtons();
syncToggleButton();

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
          text: threeTeamGame ? `${teamAName} vs ${teamBName} vs ${teamCName}` : `${teamAName} vs ${teamBName}`,
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
