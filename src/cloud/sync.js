import {
  arrayUnion, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc,
  updateDoc, where, writeBatch,
} from "firebase/firestore";
import { getServices } from "./firebase.js";
import { chooseMergeOrDiscard } from "./ui.js";

const DIRTY_KEY = "tichuSyncDirty";
const HASH_KEY = "tichuSyncRemoteHash";
const RELOAD_KEY = "tichuSyncReloadAt";
const MARKER_KEY = "tichuCloudUser";
const WATCHED = new Set([
  "tichuPlayers", "tichuSessions", "tichuGames", "tichuCurrentGameId",
  "A_points", "B_points", "teamAName", "teamBName", "roundScores", "roundNumber",
  "winThreshold", "chipsVisible", "tichuTheme", "tichuModeHintDismissed",
  "tichuPlayersRankingSort", "tichuSessionRankingSort",
]);
// Fields written by other flows (linking); never part of the local comparison.
const REMOTE_ONLY = new Set([
  "createdAt", "updatedAt", "memberUids", "participantUids", "linkedUid", "linkedLabel",
  "lastClaimCode", "lastLinkedPlayerId",
]);
const IMMUTABLE = {
  players: ["ownerUid", "createdAtMs"],
  sessions: ["ownerUid", "startedAtMs"],
  games: ["ownerUid", "startedAtMs", "sessionId", "mode", "team0", "team1", "team2", "fixedTeam", "pool", "playerIds", "firstRestingTeam"],
};
const COLLECTIONS = ["players", "sessions", "games"];

let applying = false;
let version = 0;
let pushTimer = null;
let currentUser = null;
let busy = Promise.resolve();

const backup = () => window.TichuBackup;
const isId = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(s);
const int = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => Math.min(max, Math.max(min, Math.round(Number(n) || 0)));
const text = (s, max, fallback) => {
  const v = typeof s === "string" ? s.trim().slice(0, max) : "";
  return v || fallback;
};

function strip(value) {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value).forEach((k) => {
      if (value[k] !== null && value[k] !== undefined) out[k] = strip(value[k]);
    });
    return out;
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object" && typeof value.toMillis !== "function") {
    const out = {};
    Object.keys(value).sort().forEach((k) => { out[k] = stable(value[k]); });
    return out;
  }
  return value;
}

function comparable(data) {
  const out = {};
  Object.keys(data).forEach((k) => { if (!REMOTE_ONLY.has(k)) out[k] = data[k]; });
  return JSON.stringify(stable(out));
}

function hashString(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h);
}

function remoteHash(remote) {
  const parts = [];
  if (remote.user) parts.push("user:" + comparable(remote.user));
  COLLECTIONS.forEach((col) => {
    remote[col].forEach((data, id) => {
      parts.push(col + "/" + id + ":" + comparable(data) + "|" + [].concat(data.memberUids || data.participantUids || []).join(","));
    });
  });
  return hashString(parts.sort().join("\n"));
}

// ---- Canonical (backup format) -> Firestore payloads ----------------------

function playerPayload(p, uid) {
  return strip({
    ownerUid: uid,
    name: text(p.name, 60, "Player"),
    active: p.active !== false,
    createdAtMs: int(p.createdAt),
    statsResetAt: p.statsResetAt ? int(p.statsResetAt) : null,
  });
}

function sessionPayload(s, uid) {
  return strip({
    ownerUid: uid,
    status: ["active", "paused", "ended"].includes(s.status) ? s.status : "active",
    playerIds: (s.playerIds || []).filter(isId),
    nextPoolStart: int(s.nextPoolStart, 0, 2),
    pauseLog: (s.pauseLog || []).map((e) => ({ pausedAt: int(e.pausedAt), resumedAt: e.resumedAt ? int(e.resumedAt) : null })),
    startedAtMs: int(s.startedAt),
    endedAtMs: s.endedAt ? int(s.endedAt) : null,
  });
}

function gamePayload(g, uid, quick) {
  const teams = g.teams || [];
  const mode = ["quick", "fixed", "rotation", "threeTeams"].includes(g.mode) ? g.mode : "fixed";
  const team0 = (teams[0] || []).filter(isId);
  const team1 = (teams[1] || []).filter(isId);
  const team2 = (teams[2] || []).filter(isId);
  const fixedTeam = (g.fixedTeam || []).filter(isId);
  const pool = (g.pool || []).filter(isId);
  const fs = g.finalScores;
  return strip({
    ownerUid: uid,
    sessionId: quick ? null : g.sessionId,
    mode,
    playerIds: [...new Set([...team0, ...team1, ...team2, ...fixedTeam, ...pool])],
    team0, team1, team2, fixedTeam, pool,
    firstRestingTeam: typeof g.firstRestingTeam === "number" ? int(g.firstRestingTeam, 0, 2) : null,
    winThreshold: int(g.winThreshold || 500, 1, 100000),
    teamAName: text(g.teamAName, 60, "Team A"),
    teamBName: text(g.teamBName, 60, "Team B"),
    winner: ["A", "B", "C", "tie"].includes(g.winner) ? g.winner : null,
    pendingNextGame: !!g.pendingNextGame,
    finalScores: fs ? { teamA: int(fs.teamA, -1e9), teamB: int(fs.teamB, -1e9), teamC: fs.teamC === null || fs.teamC === undefined ? null : int(fs.teamC, -1e9) } : null,
    nextDealerPlayerId: isId(g.nextDealerPlayerId) ? g.nextDealerPlayerId : null,
    startedAtMs: int(g.startedAt),
    endedAtMs: g.endedAt ? int(g.endedAt) : null,
    rounds: (g.rounds || []).slice(0, 500).map((r) => ({
      roundNumber: int(r.roundNumber),
      scores: (r.scores || []).map((n) => int(n, -1e9)),
      activeTeams: (r.activeTeams || []).map((n) => int(n, 0, 2)),
      tichuMods: (r.tichuMods || []).map((n) => int(n, -200, 200)),
      doubleWins: (r.doubleWins || []).map(Boolean),
      sittingOutPlayerId: isId(r.sittingOutPlayerId) ? r.sittingOutPlayerId : null,
      dealerPlayerId: isId(r.dealerPlayerId) ? r.dealerPlayerId : null,
    })),
  });
}

function userPayload(canon, authUser, extra) {
  const p = canon.preferences || {};
  const sort = (v) => text(v, 40, "totalPoints");
  return strip({
    uid: authUser.uid,
    displayName: (authUser.displayName || authUser.email || "").slice(0, 80),
    themeMode: ["system", "light", "dark"].includes(p.themeMode) ? p.themeMode : "system",
    winThreshold: int(p.winThreshold || 500, 1, 100000),
    chipsVisible: p.chipsVisible !== false,
    modeHintDismissed: !!p.modeHintDismissed,
    playersRankingSort: sort(p.playersRankingSort),
    sessionRankingSort: sort(p.sessionRankingSort),
    quickTeamAName: text(p.quickTeamAName, 60, "Team A"),
    quickTeamBName: text(p.quickTeamBName, 60, "Team B"),
    currentSessionGameId: isId(p.currentSessionGameId) ? p.currentSessionGameId : null,
    quickGameId: isId(p.quickGameId) ? p.quickGameId : null,
    ...extra,
  });
}

function namesFor(ids, nameById) {
  const out = {};
  [...new Set(ids || [])].slice(0, 10).forEach((id) => {
    const n = nameById.get(id);
    if (n) out[id] = n;
  });
  return Object.keys(out).length ? out : undefined;
}

function buildDocs(canon, uid) {
  const quickId = "q_" + uid;
  const docs = { players: new Map(), sessions: new Map(), games: new Map() };
  const mine = (x) => !x.ownerUid || x.ownerUid === uid;
  const nameById = new Map();
  (canon.players || []).filter((p) => isId(p.id) && mine(p)).forEach((p) => {
    docs.players.set(p.id, playerPayload(p, uid));
    const n = typeof p.name === "string" ? p.name.trim().slice(0, 60) : "";
    if (n) nameById.set(p.id, n);
  });
  (canon.sessions || []).filter((s) => isId(s.id) && mine(s)).forEach((s) => {
    const payload = sessionPayload(s, uid);
    if (payload.playerIds.length >= 4 && payload.playerIds.length <= 6) {
      docs.sessions.set(s.id, strip({ ...payload, playerNames: namesFor(payload.playerIds, nameById) }));
    }
  });
  let quickRemapped = false;
  (canon.games || []).forEach((g) => {
    const isQuick = !g.sessionId && g.mode === "quick";
    if (isQuick) {
      if ((g.rounds || []).length) {
        docs.games.set(quickId, gamePayload(g, uid, true));
        quickRemapped = true;
      }
      return;
    }
    if (isId(g.id) && mine(g) && docs.sessions.has(g.sessionId)) {
      const payload = gamePayload(g, uid, false);
      docs.games.set(g.id, strip({ ...payload, playerNames: namesFor(payload.playerIds, nameById) }));
    }
  });
  const prefs = { ...canon.preferences, quickGameId: quickRemapped ? quickId : null };
  return { docs, prefs: { ...canon, preferences: prefs } };
}

// ---- Firestore -> canonical ------------------------------------------------

async function fetchRemote(uid) {
  const { db } = getServices();
  const byMember = (col) => getDocs(query(collection(db, col), where(col === "players" ? "memberUids" : "participantUids", "array-contains", uid)));
  const [u, p, s, g] = await Promise.all([getDoc(doc(db, "users", uid)), byMember("players"), byMember("sessions"), byMember("games")]);
  const toMap = (snap) => new Map(snap.docs.map((d) => [d.id, d.data()]));
  return { user: u.exists() ? u.data() : null, players: toMap(p), sessions: toMap(s), games: toMap(g) };
}

function remoteToCanonical(remote) {
  const u = remote.user || {};
  const players = [];
  remote.players.forEach((d, id) => players.push({
    id, name: d.name, active: d.active !== false, createdAt: d.createdAtMs, statsResetAt: d.statsResetAt || null,
    ownerUid: d.ownerUid, linkedUid: d.linkedUid || null, linkedLabel: d.linkedLabel || null,
  }));
  const sessions = [];
  remote.sessions.forEach((d, id) => sessions.push({
    ownerUid: d.ownerUid,
    id, status: d.status, playerIds: d.playerIds, nextPoolStart: d.nextPoolStart || 0,
    pauseLog: d.pauseLog || [], startedAt: d.startedAtMs, endedAt: d.endedAtMs || null,
  }));
  const games = [];
  remote.games.forEach((d, id) => {
    const fs = d.finalScores;
    games.push({
      ownerUid: d.ownerUid,
      id, sessionId: d.sessionId || null, mode: d.mode,
      teams: d.mode === "threeTeams" ? [d.team0, d.team1, d.team2] : d.mode === "rotation" ? [] : [d.team0, d.team1],
      fixedTeam: d.fixedTeam, pool: d.pool,
      firstRestingTeam: typeof d.firstRestingTeam === "number" ? d.firstRestingTeam : null,
      winThreshold: d.winThreshold, teamAName: d.teamAName, teamBName: d.teamBName,
      winner: d.winner || null, pendingNextGame: !!d.pendingNextGame,
      finalScores: fs ? { teamA: fs.teamA, teamB: fs.teamB, teamC: fs.teamC === undefined ? null : fs.teamC } : null,
      nextDealerPlayerId: d.nextDealerPlayerId || null, startedAt: d.startedAtMs, endedAt: d.endedAtMs || null,
      rounds: d.rounds || [],
    });
  });
  return {
    schemaVersion: 1,
    preferences: {
      themeMode: u.themeMode, winThreshold: u.winThreshold, chipsVisible: u.chipsVisible,
      modeHintDismissed: u.modeHintDismissed, playersRankingSort: u.playersRankingSort,
      sessionRankingSort: u.sessionRankingSort, currentSessionGameId: u.currentSessionGameId || null,
      quickGameId: u.quickGameId || null, quickTeamAName: u.quickTeamAName, quickTeamBName: u.quickTeamBName,
    },
    players, sessions, games,
  };
}

function applyCanonical(canon) {
  applying = true;
  try {
    backup().applyImport({ kind: "backup", data: canon });
  } finally {
    applying = false;
  }
}

function storeSharedNames(remote) {
  const names = {};
  [remote.sessions, remote.games].forEach((map) => map.forEach((d) => Object.assign(names, d.playerNames || {})));
  const json = JSON.stringify(names);
  if (localStorage.getItem("tichuSharedNames") !== json) localStorage.setItem("tichuSharedNames", json);
}

function setSynced(remote) {
  applying = true;
  try {
    storeSharedNames(remote);
    localStorage.setItem(HASH_KEY, remoteHash(remote));
    localStorage.removeItem(DIRTY_KEY);
  } finally {
    applying = false;
  }
}

// ---- Push -----------------------------------------------------------------

async function commit(ops) {
  const { db } = getServices();
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(batch, db));
    await batch.commit();
  }
}

// The local model has no per-game names or thresholds, so keep what the cloud has.
function reconcile(col, payload, existing) {
  if (col !== "games" || !existing || payload.mode === "quick") return payload;
  const out = { ...payload, teamAName: existing.teamAName, teamBName: existing.teamBName };
  if (existing.winner) out.winThreshold = existing.winThreshold;
  return out;
}

async function pushLocal(user, options = {}) {
  const uid = user.uid;
  const remote = await fetchRemote(uid);
  const canonical = backup().exportData({ cloud: true });
  const { docs, prefs } = buildDocs(canonical, uid);
  const linked = new Map();
  (canonical.players || []).forEach((p) => { if (p.linkedUid && (!p.ownerUid || p.ownerUid === uid)) linked.set(p.id, p.linkedUid); });
  const participantsFor = (payload) => [...new Set([uid, ...(payload.playerIds || []).map((id) => linked.get(id)).filter(Boolean)])].slice(0, 10);
  const removals = [];
  const writes = [];

  COLLECTIONS.forEach((col) => {
    remote[col].forEach((data, id) => {
      if (data.ownerUid !== uid) return;
      const local = docs[col].get(id);
      const recreate = local && IMMUTABLE[col].some((k) => JSON.stringify(stable(data[k] ?? null)) !== JSON.stringify(stable(local[k] ?? null)));
      if (!local || recreate) removals.push((b, db) => b.delete(doc(db, col, id)));
    });
  });

  COLLECTIONS.forEach((col) => {
    docs[col].forEach((rawPayload, id) => {
      const existing = remote[col].get(id);
      if (existing && existing.ownerUid !== uid) return;
      const payload = reconcile(col, rawPayload, existing);
      const created = !existing || existing.ownerUid !== uid || IMMUTABLE[col].some((k) => JSON.stringify(stable(existing[k] ?? null)) !== JSON.stringify(stable(payload[k] ?? null)));
      if (!created && comparable(existing) === comparable(payload)) return;
      if (created) {
        const extra = col === "players" ? { memberUids: [uid] } : { participantUids: participantsFor(payload) };
        writes.push((b, db) => b.set(doc(db, col, id), { ...payload, ...extra, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
      } else {
        const patch = { ...payload, updatedAt: serverTimestamp() };
        Object.keys(existing).forEach((k) => {
          if (!REMOTE_ONLY.has(k) && !(k in payload)) patch[k] = deleteField();
        });
        writes.push((b, db) => b.update(doc(db, col, id), patch));
      }
    });
  });

  await commit(removals);
  await commit(writes);

  const { db } = getServices();
  const userData = userPayload(prefs, user, {
    ...(options.migrated ? { localMigratedAt: Date.now() } : {}),
    ...(remote.user && remote.user.localMigratedAt ? { localMigratedAt: remote.user.localMigratedAt } : {}),
  });
  if (!remote.user) {
    await setDoc(doc(db, "users", uid), { ...userData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } else if (comparable(remote.user) !== comparable(userData)) {
    const patch = { ...userData, updatedAt: serverTimestamp() };
    ["currentSessionGameId", "quickGameId"].forEach((k) => { if (!(k in userData)) patch[k] = deleteField(); });
    await updateDoc(doc(db, "users", uid), patch);
  }
  setSynced(await fetchRemote(uid));
}

// ---- Pull -----------------------------------------------------------------

async function pullIfChanged(user) {
  const remote = await fetchRemote(user.uid);
  if (!remote.user) {
    await pushLocal(user);
    return false;
  }
  if (remoteHash(remote) === localStorage.getItem(HASH_KEY)) return false;
  applyCanonical(remoteToCanonical(remote));
  setSynced(remote);
  return true;
}

// ---- Guest -> cloud ---------------------------------------------------------

function hasMeaningfulData(canon) {
  return (canon.players || []).length > 0 || (canon.sessions || []).length > 0 ||
    (canon.games || []).some((g) => (g.rounds || []).length > 0);
}

function newId() {
  return "m" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

function remapForMerge(canon) {
  const ids = new Map();
  const map = (id) => {
    if (!id) return id;
    if (!ids.has(id)) ids.set(id, newId());
    return ids.get(id);
  };
  const mapAll = (list) => (list || []).map(map);
  return {
    ...canon,
    players: (canon.players || []).map((p) => ({ ...p, id: map(p.id) })),
    sessions: (canon.sessions || []).map((s) => ({ ...s, id: map(s.id), playerIds: mapAll(s.playerIds) })),
    games: (canon.games || []).filter((g) => g.sessionId).map((g) => ({
      ...g,
      id: map(g.id),
      sessionId: map(g.sessionId),
      teams: (g.teams || []).map(mapAll),
      fixedTeam: mapAll(g.fixedTeam),
      pool: mapAll(g.pool),
      nextDealerPlayerId: map(g.nextDealerPlayerId),
      rounds: (g.rounds || []).map((r) => ({ ...r, sittingOutPlayerId: map(r.sittingOutPlayerId), dealerPlayerId: map(r.dealerPlayerId) })),
    })),
  };
}

async function uploadMerge(user, remote, canon) {
  const uid = user.uid;
  const { docs } = buildDocs(remapForMerge(canon), uid);
  const ops = [];
  COLLECTIONS.forEach((col) => {
    docs[col].forEach((payload, id) => {
      const extra = col === "players" ? { memberUids: [uid] } : { participantUids: [uid] };
      ops.push((b, db) => b.set(doc(db, col, id), { ...payload, ...extra, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
    });
  });
  await commit(ops);
  const quick = (canon.games || []).find((g) => !g.sessionId && g.mode === "quick" && (g.rounds || []).length);
  if (quick && !remote.user.quickGameId) {
    const { db } = getServices();
    const quickId = "q_" + uid;
    await setDoc(doc(db, "games", quickId), {
      ...gamePayload(quick, uid, true), participantUids: [uid], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "users", uid), { quickGameId: quickId, updatedAt: serverTimestamp() });
  }
}

export async function onSignIn(user) {
  currentUser = user;
  const remote = await fetchRemote(user.uid);
  const canon = backup().exportData();
  const meaningful = hasMeaningfulData(canon);
  if (!remote.user) {
    await pushLocal(user, { migrated: meaningful });
    return;
  }
  if (meaningful && (await chooseMergeOrDiscard()) === "merge") {
    await uploadMerge(user, remote, canon);
  }
  const fresh = await fetchRemote(user.uid);
  applyCanonical(remoteToCanonical(fresh));
  setSynced(fresh);
}

// ---- Lifecycle ---------------------------------------------------------------

function enqueue(task) {
  busy = busy.then(task, task);
  return busy;
}

function markDirty(key) {
  if (applying || !WATCHED.has(key) || !localStorage.getItem(MARKER_KEY)) return;
  Storage.prototype.setItem.call(localStorage, DIRTY_KEY, "1");
  version += 1;
  schedulePush();
}

function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(flush, 1500);
}

export function flush() {
  if (!currentUser || !localStorage.getItem(DIRTY_KEY)) return Promise.resolve();
  const user = currentUser;
  const seen = version;
  return enqueue(async () => {
    try {
      await pushLocal(user);
      if (seen !== version) localStorage.setItem(DIRTY_KEY, "1");
    } catch (error) {
      console.warn("Cloud sync failed; will retry later.", error);
    }
  });
}

// ---- Player linking -----------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function makeCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function labelFor(user) {
  return text(user.displayName || user.email, 80, "Player");
}

async function settle() {
  await flush();
  await busy;
}

export async function refreshFromCloud(user) {
  await settle();
  const remote = await fetchRemote(user.uid);
  applyCanonical(remoteToCanonical(remote));
  setSynced(remote);
}

export async function linkSelf(user, playerId) {
  await settle();
  const { db } = getServices();
  const remote = await fetchRemote(user.uid);
  const player = remote.players.get(playerId);
  if (!player || player.ownerUid !== user.uid) throw new Error("Player isn't synced yet. Try again in a moment.");
  if (player.linkedUid) throw new Error("This player is already linked.");
  const taken = [...remote.players.values()].some((p) => p.ownerUid === user.uid && p.linkedUid === user.uid);
  if (taken) throw new Error("You are already linked to another player.");
  await updateDoc(doc(db, "players", playerId), {
    linkedUid: user.uid, linkedLabel: labelFor(user), memberUids: [user.uid], updatedAt: serverTimestamp(),
  });
  await refreshFromCloud(user);
}

export async function createInvite(user, playerId) {
  await settle();
  // Backfill playerNames on owned sessions/games before sharing them.
  await enqueue(() => pushLocal(user));
  const { db } = getServices();
  const remote = await fetchRemote(user.uid);
  const player = remote.players.get(playerId);
  if (!player || player.ownerUid !== user.uid) throw new Error("Player isn't synced yet. Try again in a moment.");
  if (player.linkedUid) throw new Error("This player is already linked.");
  const owned = (map) => [...map.entries()].filter(([, d]) => d.ownerUid === user.uid && (d.playerIds || []).includes(playerId)).map(([id]) => id);
  const code = makeCode();
  const expiresAtMs = Date.now() + INVITE_TTL_MS;
  await setDoc(doc(db, "playerInvites", code), {
    ownerUid: user.uid,
    playerId,
    playerName: text(player.name, 60, "Player"),
    sessionIds: owned(remote.sessions).slice(0, 500),
    gameIds: owned(remote.games).slice(0, 1000),
    status: "pending",
    expiresAtMs,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { code, expiresAtMs };
}

async function addParticipant(col, ids, uid, playerId) {
  const { db } = getServices();
  const patch = () => ({ participantUids: arrayUnion(uid), lastLinkedPlayerId: playerId, updatedAt: serverTimestamp() });
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    try {
      const batch = writeBatch(db);
      chunk.forEach((id) => batch.update(doc(db, col, id), patch()));
      await batch.commit();
    } catch (error) {
      for (const id of chunk) {
        try { await updateDoc(doc(db, col, id), patch()); } catch (e) { console.warn("Could not share " + col + "/" + id, e); }
      }
    }
  }
}

export async function claimInvite(user, rawCode) {
  const code = String(rawCode || "").trim().toUpperCase();
  if (!isId(code)) throw new Error("Enter a valid invite code.");
  await settle();
  const { db } = getServices();
  let snap;
  try {
    snap = await getDoc(doc(db, "playerInvites", code));
  } catch (error) {
    throw new Error("That invite code was not found.");
  }
  if (!snap.exists()) throw new Error("That invite code was not found.");
  const invite = snap.data();
  if (invite.ownerUid === user.uid) throw new Error("You can't claim your own invite.");
  if (invite.status !== "pending") throw new Error("This invite was already used or revoked.");
  if (invite.expiresAtMs <= Date.now()) throw new Error("This invite has expired.");
  const batch = writeBatch(db);
  batch.update(doc(db, "players", invite.playerId), {
    linkedUid: user.uid,
    linkedLabel: labelFor(user),
    memberUids: [invite.ownerUid, user.uid],
    lastClaimCode: code,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, "playerInvites", code), { status: "claimed", claimedByUid: user.uid, updatedAt: serverTimestamp() });
  await batch.commit();
  await addParticipant("sessions", invite.sessionIds || [], user.uid, invite.playerId);
  await addParticipant("games", invite.gameIds || [], user.uid, invite.playerId);
  await refreshFromCloud(user);
  return invite.playerName;
}

export async function unlinkPlayer(user, playerId) {
  await settle();
  const { db } = getServices();
  const remote = await fetchRemote(user.uid);
  const player = remote.players.get(playerId);
  if (!player) throw new Error("Player not found.");
  const isOwner = player.ownerUid === user.uid;
  if (!isOwner && player.linkedUid !== user.uid) throw new Error("You can't unlink this player.");
  await updateDoc(doc(db, "players", playerId), {
    linkedUid: deleteField(), linkedLabel: deleteField(), memberUids: [player.ownerUid], updatedAt: serverTimestamp(),
  });
  if (isOwner) {
    const linked = new Map();
    remote.players.forEach((p, id) => { if (p.ownerUid === user.uid && id !== playerId && p.linkedUid) linked.set(id, p.linkedUid); });
    const fix = async (col, map) => {
      for (const [id, d] of map) {
        if (d.ownerUid !== user.uid || !(d.playerIds || []).includes(playerId)) continue;
        const next = [...new Set([user.uid, ...(d.playerIds || []).map((pid) => linked.get(pid)).filter(Boolean)])].slice(0, 10);
        if (next.length === (d.participantUids || []).length && next.every((u) => d.participantUids.includes(u))) continue;
        await updateDoc(doc(db, col, id), { participantUids: next, updatedAt: serverTimestamp() });
      }
    };
    await fix("sessions", remote.sessions);
    await fix("games", remote.games);
  }
  await refreshFromCloud(user);
}

export function clearLocal() {
  applying = true;
  try {
    backup().clearAll();
    localStorage.removeItem(HASH_KEY);
    localStorage.removeItem(DIRTY_KEY);
  } finally {
    applying = false;
  }
}

function reloadOnce() {
  const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  if (Date.now() - last < 15000) return;
  sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  window.location.reload();
}

export function startAutoSync(onUser) {
  const proto = Storage.prototype;
  const set = proto.setItem;
  const remove = proto.removeItem;
  proto.setItem = function (key, value) {
    set.call(this, key, value);
    if (this === localStorage) markDirty(key);
  };
  proto.removeItem = function (key) {
    remove.call(this, key);
    if (this === localStorage) markDirty(key);
  };
  window.addEventListener("pagehide", () => { flush(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });

  onUser((user) => {
    if (!user) return;
    currentUser = user;
    enqueue(async () => {
      try {
        if (localStorage.getItem(DIRTY_KEY)) {
          await pushLocal(user);
        } else if (await pullIfChanged(user)) {
          reloadOnce();
        }
      } catch (error) {
        console.warn("Cloud sync failed; using cached data.", error);
      }
    });
  });
}
