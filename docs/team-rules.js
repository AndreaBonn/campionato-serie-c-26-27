// Pure rules of the team card sections added to the opponent card: remaining games, head to
// head, home/away performance, schedule strength and suspensions. No DOM, tested with node --test.
import { opponentGames, opponentSanctions } from "./opponent-rules.js";

const byStart = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);
const leagueGames = (rounds) => rounds.flatMap((r) => r.games.map((g) => ({ ...g, round: r.round })));
const plays = (team) => (g) => g.home === team || g.away === team;

// Games of the team still without a result, oldest first, with the opponent's current position
// (null before the standings list it). A postponed game stays here until FIP enters its score.
export function remainingGames(team, rounds, standings) {
  const position = new Map(standings.filter((r) => r.played > 0).map((r) => [r.team, r.position]));
  return leagueGames(rounds)
    .filter((g) => !g.score && plays(team)(g))
    .sort(byStart)
    .map((g) => {
      const isHome = g.home === team, opponent = isHome ? g.away : g.home;
      return { round: g.round, n: g.n, date: g.date, time: g.time, opponent, isHome, opponentPosition: position.get(opponent) ?? null };
    });
}

// Every game between the two teams, played or not, oldest first, scores from `team`'s side
export function headToHead(team, other, rounds) {
  return leagueGames(rounds)
    .filter((g) => plays(team)(g) && plays(other)(g))
    .sort(byStart)
    .map((g) => {
      const isHome = g.home === team, played = Boolean(g.score);
      const own = played ? (isHome ? g.score.home : g.score.away) : null;
      const their = played ? (isHome ? g.score.away : g.score.home) : null;
      return { round: g.round, n: g.n, date: g.date, time: g.time, isHome, played, own, their, won: played ? own > their : null, status: g.status };
    });
}

const margin = (g) => g.own - g.their;
const widest = (games) => games.reduce((best, g) => (!best || Math.abs(margin(g)) > Math.abs(margin(best)) ? g : best), null);

function currentStreak(games) {
  const last = games.at(-1);
  let length = 0;
  for (const g of [...games].reverse()) {
    if (g.won !== last.won) break;
    length += 1;
  }
  return { won: last.won, length };
}

// Home/away records, current streak, average margin and widest win and loss over the played
// games (unofficial results included, as in the card's heading); null before the first result.
// Ties of margin keep the earliest game.
export function performance(team, rounds) {
  const games = opponentGames(team, rounds);
  if (!games.length) return null;
  const record = (list) => ({ won: list.filter((g) => g.won).length, lost: list.filter((g) => !g.won).length });
  return {
    split: { home: record(games.filter((g) => g.isHome)), away: record(games.filter((g) => !g.isHome)) },
    streak: currentStreak(games),
    avgMargin: games.reduce((sum, g) => sum + margin(g), 0) / games.length,
    biggestWin: widest(games.filter((g) => g.won)),
    biggestLoss: widest(games.filter((g) => !g.won)),
  };
}

// Average current position of the opponents still to play: lower means a harder run-in
export function scheduleStrength(remaining) {
  const known = remaining.map((g) => g.opponentPosition).filter((p) => p !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
}

// "soc. CLUB:FIRST LAST squalifica per 2 gare per ...": the Giudice Sportivo's wording for a
// player banned for a number of games. Bans by date or for officials are not matched.
const BAN = /^soc\.[^:]+:\s*(.+?)\s+squalifica per (\d+) gar[ae]\b/i;

// Game bans of the team's players, oldest first. `served` counts the team's games with a result
// after the sanctioned one: an estimate, since FIP does not publish when a ban is served and a
// game in another competition can count towards it.
export function suspensions(team, rounds) {
  const games = leagueGames(rounds).filter(plays(team)).sort(byStart);
  return opponentSanctions(team, rounds).own.flatMap((s) => {
    const match = BAN.exec(s.text);
    if (!match) return [];
    const at = games.findIndex((g) => g.n === s.n);
    const served = games.slice(at + 1).filter((g) => g.score).length;
    const length = Number(match[2]);
    return [{ player: match[1], games: length, round: s.round, n: s.n, served: Math.min(served, length), left: Math.max(length - served, 0) }];
  });
}
