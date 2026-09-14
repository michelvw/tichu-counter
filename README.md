# Tichu Counter

A modern Progressive Web App for scoring games of **Tichu**.

Use at: https://michelvw.github.io/tichu-counter/

Originally forked from the excellent work by Bernhard Kainz, this version has grown into a complete game-night companion with player management, sessions, statistics, history tracking, score visualisation, and offline support.

## Features

### Game Scoring

- Track scores round by round
- Support for:
  - Tichu won/lost
  - Grand Tichu won/lost
  - Double wins
- Customisable winning score (300, 500, 750, 1000, or custom)
- Undo last round
- Reset game
- Rename teams

### Score Analysis

- Complete round history
- Interactive score progression graph
- Toggle chart labels
- Share score graphs as images
- View scores as table or chart

### Session Mode

Track an entire evening of Tichu instead of a single game.

- Create sessions with 4 or 5 players
- Multiple games per session
- Automatic game history
- Session statistics
- Session leaderboards

#### 4 Player Sessions

Players are split into two fixed teams.

#### 5 Player Sessions

One fixed team plays against a rotating pool of three players.

The application automatically rotates the sitting-out player each round to ensure fair participation.

### Player Management

- Player roster
- Archive inactive players
- Rename players
- Persistent player profiles

### Player Statistics

Track long-term performance:

- Win rate
- Games played
- Games won/lost
- Total points
- Average points per game
- Best game score
- Tichu statistics
- Grand Tichu statistics
- Double wins
- Session participation

### Smart Team Generation

The session engine attempts to minimise repeated pairings across a session by analysing previous games and automatically generating balanced team compositions.

### Progressive Web App

Install the application on:

- Android
- iPhone / iPad
- Windows
- macOS
- Linux

Features include:

- Offline support
- Home screen installation
- App-like experience
- Cached assets using a Service Worker

## Technology Stack

- Vanilla JavaScript
- jQuery
- Materialize CSS
- Chart.js
- LocalStorage persistence
- Service Worker caching
- Progressive Web App (PWA)

No backend or database is required.

All data is stored locally in the browser.

## Data Storage

The application stores data in browser LocalStorage.

Stored information includes:

- Current game
- Round history
- Players
- Sessions
- Statistics
- Rankings
- Preferences

Because data is stored locally, clearing browser storage will remove all saved information.

## Running Locally

Clone the repository:

```bash
git clone https://github.com/michelvw/tichu-counter.git
cd tichu-counter
```

Serve the files using any static web server:

```bash
python -m http.server
```

Or use your preferred web server.

Open:

```text
http://localhost:8000
```

## Deployment

The application is designed for GitHub Pages and can be deployed as a static website without any build step.

## Screenshots

Screenshot available in:

```text
screenshots/screenshot.jpg
```

## Project Structure

```text
index.html               Main scoring screen
round-scores.html        Round history and charts

sessions.html            Session management
session-history.html     Session archive
session-details.html     Session statistics

players.html             Player management
player-stats.html        Individual player statistics

js/storage.js            Game storage abstraction
js/players-storage.js    Session and player data model
js/script.js             Main scoring logic
js/round-scores.js       Graphs and score history
js/sessions.js           Session workflows
js/players.js            Player management UI
js/player-stats.js       Statistics UI

service-worker.js        Offline support
manifest.json            PWA configuration
```

## Credits

Originally based on:

https://github.com/bernikr/tichu-counter

Extended and maintained by:

Michel van Westen

## License

Please refer to the repository license.
