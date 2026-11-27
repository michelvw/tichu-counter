# Tichu Counter

Tichu Counter is a lightweight Progressive Web App for keeping score during
Tichu games and entire game nights. It runs in the browser, works offline
after installation, and stores data locally on your device.

**Try it now:** [michelvw.github.io/tichu-counter](https://michelvw.github.io/tichu-counter/)

## What it does

### Score a game

- Open Settings from the scoreboard to choose Light, Dark, or System and
  set the points needed to win. Preferences are remembered on this device.
- Changing the target during a game requires confirmation and can end a
  six-player game immediately if there is a sole leader at the new target.
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

### Sign in, sync and live sessions

Signing in with Google is optional. Guests keep everything on the device.

- **Backup:** export and import all data as JSON from Settings.
- **Cloud sync:** when signed in, players, sessions and games sync to Firestore
  (the same database as the companion Android app), so data follows you across
  devices and between the PWA and the Android app.
- **Player linking:** invite other players with a code so they are linked to
  your roster and can see shared sessions.
- **Real names:** the host writes player names onto sessions and games, so
  viewers see actual names without access to the host's private roster.
- **Live view:** a user is either a host or a viewer. While another player
  hosts a live session, your scoreboard shows that game read-only (banner,
  scores, dealer, who sits out, refreshed about every 15 seconds) and the
  Sessions page shows a "Live shared session" card. Shared sessions are
  marked "Shared" in the history and cannot be changed or deleted by viewers.

## Install as an app

Tichu Counter is a Progressive Web App. From a supported browser, use the
browser's **Install app** or **Add to Home Screen** action to use it like a
standalone app on mobile or desktop.

The service worker caches the application files so the app can continue to
work without an internet connection after the first visit.

## Data and privacy

By default there is no server or account. The app stores the current game,
round history, players, sessions, statistics, rankings, and preferences in
your browser's `localStorage`.

This also means that clearing the browser's site data removes the saved
information. Data is only synchronised between devices if you sign in with
Google; guests stay local. Synced data is stored in Firebase (Firestore), and
only the host can modify their own sessions and games.

## Run locally

The pages are static. Only the optional Firebase module (`js/cloud.js`) is
bundled with [Vite](https://vite.dev); sign-in needs the `VITE_FIREBASE_*`
variables at build time, and guest mode works without it.

```bash
git clone https://github.com/michelvw/tichu-counter.git
cd tichu-counter
npm install
npm run build
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
node theme-test.js                   # theme preference, chart and offline caching
node settings-test.js                # target settings and in-progress games
node live-view-test.js               # read-only live view of shared sessions
```

The first three tests expect the app at <http://localhost:8000>. The
six-player, theme, and settings tests start their own servers on available local ports.

## Technology

- HTML, CSS, and vanilla JavaScript
- jQuery
- Materialize CSS
- Chart.js
- Browser `localStorage`
- Optional Firebase Auth and Firestore sync, bundled with Vite
- Service worker and web app manifest

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Main scoring screen |
| `settings.html` | Appearance and game settings |
| `round-scores.html` | Round history and charts |
| `sessions.html` | Session setup and active sessions |
| `session-history.html` | Completed session history |
| `session-details.html` | Session statistics and game details |
| `players.html` | Player roster management |
| `player-stats.html` | Individual player statistics |
| `welcome.html` | Sign-in / guest start screen |
| `src/cloud/` | Firebase sign-in and Firestore sync (bundled to `js/cloud.js`) |
| `js/` | Application logic and bundled front-end dependencies |
| `service-worker.js` | Offline caching |
| `manifest.json` | Progressive Web App configuration |
| `screenshots/` | README and manifest screenshots |

## Credits

Originally based on [bernikr/tichu-counter](https://github.com/bernikr/tichu-counter).

Maintained by Michel van Westen.

## License

Refer to the repository for licensing information.
