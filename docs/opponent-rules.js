// Pure rules of the opponent card: no DOM, no browser API, tested with node --test.
import { scorers } from "./scorer-rules.js";

const byStart = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const leagueGames = (rounds) => rounds.flatMap((r) => r.games.map((g) => ({ ...g, round: r.round })));

// Every played game of the team, oriented on it ("own" are its points), oldest first.
// Unofficial results are kept, like teamProfile does, and carry their status for the tag.
export function opponentGames(team, rounds) {
  return leagueGames(rounds)
    .filter((g) => g.score && (g.home === team || g.away === team))
    .sort(byStart)
    .map((g) => {
      const isHome = g.home === team;
      const own = isHome ? g.score.home : g.score.away, their = isHome ? g.score.away : g.score.home;
      return { round: g.round, n: g.n, date: g.date, opponent: isHome ? g.away : g.home, isHome, own, their, won: own > their, status: g.status };
    });
}

// load: "loading" until boxscores.json is fetched, then "ready" or "failed". A failed
// fetch is an error, not an empty list: it says so unless earlier box scores are still shown.
export function scorersState(boxscores, rounds, team, load) {
  if (load === "loading") return { state: "loading", rows: [] };
  const rows = scorers(boxscores, rounds).filter((r) => r.team === team);
  if (rows.length) return { state: "list", rows };
  return { state: load === "failed" ? "failed" : "empty", rows };
}

// The Giudice Sportivo names a fined club by its legal name ("soc. A.S.D. PALL. NUORO:..."),
// not by its FIP team name. Legal names that share no distinctive word with the team name
// are listed here, FIP team name -> legal name prefixes.
export const SANCTION_CLUB_ALIASES = {
  "C.M.B. PORTO TORRES": ["CENTRO MINIBK P.TORRES"],
};
// Legal forms and generic words that name no club in particular
const STOPWORDS = new Set(["ASD", "SSD", "DIL", "POL", "SOC", "BASKET", "PALL", "PALLACANESTRO"]);
// two-letter words (SS, DI, LA) are legal forms or particles, not club names
const MIN_TOKEN = 3;
const normalize = (name) => name.toUpperCase().replace(/[.'’]/g, " ").split(/\s+/).filter(Boolean);
const tokens = (name) => normalize(name).filter((w) => w.length >= MIN_TOKEN && !STOPWORDS.has(w));
const clubOf = (text) => /^soc\.\s*([^:]+):/i.exec(text)?.[1] ?? null;

function aliasSide(club, home, away) {
  const name = normalize(club).join(" ");
  const named = (team) => (SANCTION_CLUB_ALIASES[team] ?? []).some((a) => name.startsWith(normalize(a).join(" ")));
  if (named(home)) return "home";
  return named(away) ? "away" : null;
}

// "home" | "away" for the club the sanction names, null when it cannot be told: no "soc."
// prefix (never seen for this league), no alias and no word found in only one team name of
// the league ("TORRES" is in two), or as many such words on both sides.
export function attributeSanction(text, home, away, teams) {
  const club = clubOf(text);
  if (!club) return null;
  const alias = aliasSide(club, home, away);
  if (alias) return alias;
  const counts = new Map();
  for (const w of teams.flatMap((t) => [...new Set(tokens(t))])) counts.set(w, (counts.get(w) ?? 0) + 1);
  const distinctive = tokens(club).filter((w) => counts.get(w) === 1);
  const score = (team) => distinctive.filter((w) => tokens(team).includes(w)).length;
  const h = score(home), a = score(away);
  if (h === a) return null;
  return h > a ? "home" : "away";
}

// Sanctions in the team's games: own = fined club is the team; unattributed = the club
// could not be told, shown apart rather than dropped. The other club's sanctions are left out.
export function opponentSanctions(team, rounds) {
  const games = leagueGames(rounds);
  const teams = [...new Set(games.flatMap((g) => [g.home, g.away]))];
  const out = { own: [], unattributed: [] };
  for (const g of games.filter((x) => x.home === team || x.away === team).sort(byStart)) {
    for (const text of g.sanctions ?? []) {
      const side = attributeSanction(text, g.home, g.away, teams);
      if (side === null) out.unattributed.push({ round: g.round, n: g.n, text });
      else if (g[side] === team) out.own.push({ round: g.round, n: g.n, text });
    }
  }
  return out;
}
