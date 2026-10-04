// Pure rules of the games page: no DOM, no browser API, tested with node --test.
import { resultNote } from "./result-rules.js";

const CHANGE_LABEL = { date: "giorno", time: "orario", venue: "campo", home: "inversione di campo" };
// Page wording for fip.it statuses; designated referees are shown on their own line
const STATUS_LABEL = {
  "non-designata": "arbitri non ancora designati",
  designata: "",
  "designata-nonvisibile": "",
  omologata: "risultato omologato",
};
const HTML_ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const DAY_MS = 864e5;
const GAME_HOURS = 2;
const FORM_GAMES = 5;

const pad = (n) => String(n).padStart(2, "0");
const ownLabel = (labels, key) => (Object.hasOwn(labels, key) ? labels[key] : undefined);

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
export const toDate = (d, t) => new Date(d + "T" + t + ":00");

// Local wall-clock stamp for TZID=Europe/Rome; Date handles the rollover past midnight
export function calendarStamp(m, plusHours = 0) {
  const d = toDate(m.date, m.time);
  d.setHours(d.getHours() + plusHours);
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + "T" + pad(d.getHours()) + pad(d.getMinutes()) + "00";
}

// FIP publishes some venues without an address: no dangling comma then
export const place = (m) => [m.venue.name, m.venue.address].filter(Boolean).join(", ");
export const roundLabel = (m) => m.round.slice(1) + "ª giornata di " + (m.round[0] === "A" ? "andata" : "ritorno");
export const listIt = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " e " + a[a.length - 1]);
export const changeSummary = (changes) => listIt(changes.map((c) => ownLabel(CHANGE_LABEL, c) ?? c));
export const statusLabel = (m) =>
  resultNote(m.status)?.label ?? ownLabel(STATUS_LABEL, m.status) ?? m.status_text.toLowerCase();

export const mapsUrl = (m) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(place(m));
export const gcalUrl = (m) =>
  "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(m.home + " - " + m.away) +
  "&dates=" + calendarStamp(m) + "/" + calendarStamp(m, GAME_HOURS) + "&ctz=Europe/Rome&location=" + encodeURIComponent(place(m)) +
  "&details=" + encodeURIComponent("Serie C, " + roundLabel(m) + ", gara n. " + m.n);

// Still to be played: no result yet and scheduled from today on (a recovery keeps its new date)
export const isUpcoming = (m, today) => !m.score && toDate(m.date, m.time) >= today;

export const filterGames = (games, filter, onlyUpcoming, today) =>
  games.filter((m) => (filter === "all" || (filter === "home") === m.is_home) && (!onlyUpcoming || isUpcoming(m, today)));

// Breaks [first day with no games, text] go before the first game after them; with only
// upcoming games shown, breaks already behind us are skipped together with the past games.
export function withBreaks(games, breaks, today, onlyUpcoming) {
  const items = [];
  let s = 0;
  if (onlyUpcoming) while (s < breaks.length && new Date(breaks[s][0] + "T00:00:00") < today) s++;
  for (const game of games) {
    for (; s < breaks.length && breaks[s][0] < game.date; s++) items.push({ date: breaks[s][0], text: breaks[s][1] });
    items.push({ game });
  }
  return items;
}

// calendar days, not hours: a game tonight is 0; round() absorbs the 23/25 h DST days
export const daysUntil = (m, today) => Math.round((toDate(m.date, "00:00") - today) / DAY_MS);

const opponent = (m) => (m.is_home ? m.away : m.home);
const ownPoints = (m) => (m.is_home ? m.score.home : m.score.away);
const theirPoints = (m) => (m.is_home ? m.score.away : m.score.home);
export const won = (m) => ownPoints(m) > theirPoints(m);

// Result of the first-leg game against the same opponent, for a second-leg game
export function firstLegOf(m, games) {
  if (m.round[0] !== "R") return null;
  const first = games.find((x) => x.round[0] === "A" && opponent(x) === opponent(m));
  return first?.score ? first : null;
}

// CUS record over played games, in the order given (chronological on the page)
export function formSummary(games) {
  const played = games.filter((m) => m.score);
  if (!played.length) return null;
  const record = (list) => ({ won: list.filter(won).length, lost: list.filter((m) => !won(m)).length });
  const sum = (points) => played.reduce((total, m) => total + points(m), 0);
  return {
    ...record(played),
    played: played.length,
    avgFor: sum(ownPoints) / played.length,
    avgAgainst: sum(theirPoints) / played.length,
    home: record(played.filter((m) => m.is_home)),
    away: record(played.filter((m) => !m.is_home)),
    last: played.slice(-FORM_GAMES).map(won),
  };
}

// Round opened by default: the last one with a result, else the first still to come
export function pickRound(rounds, today) {
  const lastPlayed = rounds.map((r) => r.games.some((g) => g.score)).lastIndexOf(true);
  const upcoming = rounds.findIndex((r) => r.games.some((g) => toDate(g.date, g.time) >= today));
  return lastPlayed >= 0 ? lastPlayed : Math.max(upcoming, 0);
}

const byStart = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

// Any team's record from the league results, including results not homologated yet (like the
// CUS form): FIP standings only count homologated games. Position stays null until FIP ranks one.
export function teamProfile(team, rounds, standings) {
  const games = rounds.flatMap((r) => r.games).filter((g) => g.score && (g.home === team || g.away === team)).sort(byStart);
  if (!games.length) return null;
  const own = (g) => (g.home === team ? g.score.home : g.score.away);
  const their = (g) => (g.home === team ? g.score.away : g.score.home);
  const wins = games.map((g) => own(g) > their(g));
  const sum = (points) => games.reduce((total, g) => total + points(g), 0);
  const row = standings.some((r) => r.played > 0) ? standings.find((r) => r.team === team) : undefined;
  return {
    position: row ? row.position : null,
    won: wins.filter(Boolean).length,
    lost: wins.filter((w) => !w).length,
    avgFor: sum(own) / games.length,
    avgAgainst: sum(their) / games.length,
    last: wins.slice(-FORM_GAMES),
  };
}

// 2025/26 format (the 2026/27 one is not published yet): the top 8 to the playoffs, the last 3 to the playout
const PLAYOFF_SPOTS = 8;
const PLAYOUT_SPOTS = 3;

// Standings-point margins from the official table. Positive: ahead of the first team on the other
// side of the line; negative: behind the last team on the good side.
export function zoneStatus(standings, team) {
  const rows = [...standings].sort((a, b) => a.position - b.position);
  const i = rows.findIndex((r) => r.team === team);
  if (i < 0 || !rows.some((r) => r.played > 0) || rows.length <= PLAYOFF_SPOTS + PLAYOUT_SPOTS) return null;
  const gap = (k) => rows[i].points - rows[k].points;
  const lastSafe = rows.length - PLAYOUT_SPOTS - 1;
  return {
    position: i + 1,
    playoff: i < PLAYOFF_SPOTS ? { inside: true, margin: gap(PLAYOFF_SPOTS) } : { inside: false, margin: gap(PLAYOFF_SPOTS - 1) },
    // firstOut: 1-based position of the first playout team, which moves with the number of teams
    playout: { inside: i > lastSafe, margin: i > lastSafe ? gap(lastSafe) : gap(lastSafe + 1), firstOut: lastSafe + 2 },
  };
}

const standingPoints = (n) => n + (n === 1 ? " punto" : " punti") + " in classifica";

function playoffLine({ inside, margin }) {
  if (inside) return margin > 0 ? `In zona playoff, con ${standingPoints(margin)} di vantaggio sulla 9ª.` : "In zona playoff, a pari punti con la 9ª.";
  return margin < 0 ? `Fuori dalla zona playoff, a ${standingPoints(-margin)} dall'8ª.` : "Fuori dalla zona playoff, a pari punti con l'8ª.";
}

function playoutLine({ inside, margin, firstOut }) {
  const safe = `${firstOut - 1}ª`, out = `${firstOut}ª`;
  if (inside) return margin < 0 ? `In zona playout, a ${standingPoints(-margin)} dalla ${safe}.` : `In zona playout, a pari punti con la ${safe}.`;
  return margin > 0 ? `Fuori dalla zona playout, con ${standingPoints(margin)} di vantaggio sulla ${out}.` : `Fuori dalla zona playout, a pari punti con la ${out}.`;
}

export const zoneLines = (z) => [playoffLine(z.playoff), playoutLine(z.playout)];

// Crest copied into docs/logos by the sync; anything but a plain file there is ignored
const LOGO_FILE = /^logos\/[a-z0-9-]+\.png$/;
export function logoOf(logos, team) {
  const file = logos && Object.hasOwn(logos, team) ? logos[team].file : null;
  return typeof file === "string" && LOGO_FILE.test(file) ? file : null;
}
