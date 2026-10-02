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
