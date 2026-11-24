# Tichu Counter

Tichu Counter is a lightweight Progressive Web App for keeping score during
Tichu games and entire game nights. It runs in the browser, works offline
after installation, and stores data locally on your device.

**Try it now:** [michelvw.github.io/tichu-counter](https://michelvw.github.io/tichu-counter/)

## What it does

### Score a game

- Record points round by round for two teams.
- Apply Tichu and Grand Tichu modifiers, including failed bids.
- Record double wins.
- Set a winning score of 300, 500, 750, 1,000, or a custom value.
- Rename teams, undo the last round, and reset the board.

![Tichu Counter scoring screen](screenshots/screenshot.jpg?raw=true "Tichu Counter scoring screen")

### Review the score

Open the round summary at any time to review the complete game. The chart
opens by default; switch to the table using the toolbar. The chart can show
labels and can be shared as an image.

![Score progression chart](screenshots/score%20graph.jpg?raw=true "Score progression chart")

![Round scores table](screenshots/score%20table.jpg?raw=true "Round scores table")

### Track a game night with Sessions

Sessions keep multiple games and their results together:

- Create a session for four, five, or six players.
- Generate teams while reducing repeated pairings.
- Rotate the sitting-out player fairly in five-player sessions.
- In six-player sessions, play in three pairs: two pairs play each round
  while the third sits out, and each pair's score, progress, and points
  remaining are shown.
- Indicate who deals each hand, rotating the deal fairly so a sitting-out
  player never deals and the dealing team alternates every round.
- Start and finish multiple games without losing the session history.
- Review session statistics, completed games, and player rankings later.

For six players, the game ends as soon as one pair has the highest score
and reaches the target. If the highest score is tied at or above the target,
play continues until there is a sole leader. A game can end before all pairs
have played the same number of rounds. Starting a new game reshuffles pairs,
favoring less-repeated partnerships, and chooses the first resting pair
using previous sit-outs.

![Create a session](screenshots/session%20new.jpg?raw=true "Create a session")

![Active session](screenshots/sessions%20active.jpg?raw=true "Active session")

![Session details and statistics](screenshots/session%20details.jpg?raw=true "Session details and statistics")

### Manage players and statistics

Maintain a reusable player roster, archive inactive players, and rename
players. Player statistics include games played, wins, points, averages, best
scores, Tichu and Grand Tichu records, double wins, and session participation.

![Player roster](screenshots/players%20overview.jpg?raw=true "Player roster")

![Player statistics](screenshots/player.jpg?raw=true "Player statistics")

## Install as an app

Tichu Counter is a Progressive Web App. From a supported browser, use the
browser's **Install app** or **Add to Home Screen** action to use it like a
standalone app on mobile or desktop.

The service worker caches the application files so the app can continue to
work without an internet connection after the first visit.

## Data and privacy

There is no server, account, or database. The app stores the current game,
round history, players, sessions, statistics, rankings, and preferences in
your browser's `localStorage`.

This also means that clearing the browser's site data removes the saved
information. Data is not automatically synchronised between devices.

## Run locally

The app is a static website and does not require a build step or backend.

```bash
git clone https://github.com/michelvw/tichu-counter.git
cd tichu-counter
python -m http.server 8000
```

Then open <http://localhost:8000> in your browser. You can use any static
file server instead of Python's built-in server.

## Run the tests

Optional end-to-end checks run against a local server with [Puppeteer](https://pptr.dev) (Node.js required):

```bash
cd tests
npm install
python -m http.server 8000 &
node headless-test.js            # service worker caching + rotation fairness
node scoreboard-interaction-test.js  # undo / reset / win-threshold behavior
node dealer-rotation-test.js         # dealer fairness / alternation / sit-out skip
node six-player-test.js              # three-team rotation, scoring and history
```

The first three tests expect the app at <http://localhost:8000>. The
six-player test starts its own server on an available local port.

## Technology

- HTML, CSS, and vanilla JavaScript
- jQuery
- Materialize CSS
- Chart.js
- Browser `localStorage`
- Service worker and web app manifest

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Main scoring screen |
| `round-scores.html` | Round history and charts |
| `sessions.html` | Session setup and active sessions |
| `session-history.html` | Completed session history |
| `session-details.html` | Session statistics and game details |
| `players.html` | Player roster management |
| `player-stats.html` | Individual player statistics |
| `js/` | Application logic and bundled front-end dependencies |
| `service-worker.js` | Offline caching |
| `manifest.json` | Progressive Web App configuration |
| `screenshots/` | README and manifest screenshots |

## Credits

Originally based on [bernikr/tichu-counter](https://github.com/bernikr/tichu-counter).

Maintained by Michel van Westen.

## License

Refer to the repository for licensing information.
