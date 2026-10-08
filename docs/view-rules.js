// Pure display rules of the page (wording, names, zones): no DOM, no browser API, tested with node --test.
import { PLAYOFF_SPOTS, PLAYOUT_SPOTS } from "./page-rules.js";

// From this hour on, a game on the same day is "tonight"
const EVENING_HOUR = 17;
const MINUTE_MS = 60e3;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
// FIP spells some club acronyms without dots: they stay upper case
const ACRONYMS = new Set(["CUS", "SEF"]);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Countdown of the next game: { lead, main, sub } as shown in the hero box
export function countdownText(days, time) {
  if (days >= 2) return { lead: "tra", main: `${days} giorni`, sub: "" };
  if (days === 1) return { lead: "", main: "Domani", sub: `ore ${time}` };
  const evening = Number(time.slice(0, 2)) >= EVENING_HOUR;
  return { lead: "", main: evening ? "Stasera" : "Oggi", sub: `ore ${time}` };
}

// "2 ore fa" for an ISO timestamp; a device clock a little behind the server reads "adesso"
export function relativeAge(iso, now) {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < MINUTE_MS) return "adesso";
  if (ms < HOUR_MS) return plural(Math.floor(ms / MINUTE_MS), "minuto", "minuti") + " fa";
  if (ms < DAY_MS) return plural(Math.floor(ms / HOUR_MS), "ora", "ore") + " fa";
  const days = Math.floor(ms / DAY_MS);
  return days === 1 ? "ieri" : `${days} giorni fa`;
}

// Title case of a word, also after an apostrophe or a hyphen ("SANT'ANDREA" -> "Sant'Andrea")
const titleWord = (w) => w.toLowerCase().replace(/(^|['-])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
// Dotted acronyms (C.M.B.), single initials (S.) and known acronyms keep FIP's capitals
const keepsCapitals = (w) => /^(\p{L}\.){2,}$/u.test(w) || /^\p{L}\.$/u.test(w) || ACRONYMS.has(w);

// FIP registers names in capitals: same name, only the capitals change
export const displayTeamName = (name) => name.split(" ").map((w) => (keepsCapitals(w) ? w : titleWord(w))).join(" ");

// Fallback for a club without a crest: first letters of its first and last word
export function teamInitials(name) {
  const words = name.split(" ").filter(Boolean);
  const first = words[0][0], last = words.length > 1 ? words.at(-1)[0] : "";
  return (first + last).toUpperCase();
}

// Position -> zone for the rows that open a zone, where its label goes (2025/26 format, like the
// cut lines of the table); no labels when the table is too short for the two zones to be apart
export function zoneStarts(total) {
  if (total <= PLAYOFF_SPOTS + PLAYOUT_SPOTS) return new Map();
  return new Map([[1, "playoff"], [total - PLAYOUT_SPOTS + 1, "playout"]]);
}

// "In casa 2-1 · In trasferta 1-1", a side without games left out
export function splitLine({ home, away }) {
  const side = (label, r) => (r.won + r.lost ? `${label} ${r.won}-${r.lost}` : "");
  return [side("In casa", home), side("In trasferta", away)].filter(Boolean).join(" · ");
}

// The latest game with a result, from a chronological list
export const lastPlayed = (games) => games.findLast((m) => m.score) ?? null;
