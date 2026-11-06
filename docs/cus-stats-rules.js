// Pure rules of CUS player statistics: no DOM, no browser API, tested with node --test.

import { INCOMPLETE_STATUSES } from "./boxscore-rules.js";

const DOUBLE_DIGIT_THRESHOLD = 10;
const LAST_N_GAMES = 5;
const ABSENT = "ABS";
const entered = ({ player }) => player.pts !== null;
const sumPoints = (players) => players.reduce((sum, player) => sum + (player.pts ?? 0), 0);
const ratio = (points, count) => count === 0 ? null : points / count;

function matchedGames(boxscores, games, team) {
  return games.flatMap((game) => {
    const entry = boxscores[game.n];
    if (!entry?.home || !entry.away) return [];
    const side = game.home === team ? "home" : "away";
    const otherSide = side === "home" ? "away" : "home";
    return [{
      n: game.n, date: game.date, opponent: game[otherSide], side,
      status: entry.status, players: entry[side].players,
      margin: entry.fip_score[side] - entry.fip_score[otherSide],
      teamPoints: sumPoints(entry[side].players),
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

function appearancesById(games) {
  const byId = new Map();
  for (const game of games) {
    for (const player of game.players) {
      const appearances = byId.get(player.id) ?? [];
      byId.set(player.id, [...appearances, { game, player }]);
    }
  }
  return byId;
}

function average(appearances) {
  const entries = appearances.filter(entered);
  return ratio(sumPoints(entries.map(({ player }) => player)), entries.length);
}

function bestGame(appearances) {
  const best = appearances.filter(entered).reduce((best, appearance) => {
    if (!best || appearance.player.pts >= best.player.pts) return appearance;
    return best;
  }, null);
  if (!best) return null;
  const { player, game } = best;
  return { points: player.pts, opponent: game.opponent, date: game.date, n: game.n };
}

function recentGames(games, id) {
  return games.slice(-LAST_N_GAMES).map((game) => {
    const player = game.players.find((player) => player.id === id);
    // Three states distinguish roster absence from a bench appearance and a scored zero.
    return { date: game.date, opponent: game.opponent, pts: player ? player.pts : ABSENT };
  });
}

function playerStats(appearances, games) {
  const { id, name, role, age } = appearances.at(-1).player;
  const points = sumPoints(appearances.map(({ player }) => player));
  const teamPoints = appearances.reduce((sum, { game }) => sum + game.teamPoints, 0);
  return {
    id, name, role, age, points,
    listed: appearances.length,
    entered: appearances.filter(entered).length,
    average: average(appearances),
    homeAverage: average(appearances.filter(({ game }) => game.side === "home")),
    awayAverage: average(appearances.filter(({ game }) => game.side === "away")),
    best: bestGame(appearances),
    doubleDigit: appearances.filter(({ player }) => player.pts >= DOUBLE_DIGIT_THRESHOLD).length,
    teamShare: ratio(points, teamPoints),
    winAverage: average(appearances.filter(({ game }) => game.margin > 0)),
    lossAverage: average(appearances.filter(({ game }) => game.margin < 0)),
    last5: recentGames(games, id),
  };
}

// playbasket.it gives the birth year as two digits ("'04"): one not after the season's is a 2000s
// year, the rest are 1900s (no Serie C player is over 99 or born after the season starts).
const TWO_DIGIT_YEAR = /^'(\d{2})$/;
export function birthYear(age, seasonYear) {
  const match = TWO_DIGIT_YEAR.exec(age ?? "");
  if (!match) return null;
  const yy = Number(match[1]);
  return yy <= seasonYear % 100 ? 2000 + yy : 1900 + yy;
}

// Court order, from the ball handler to the post; any other wording follows in first-seen order
const ROLE_ORDER = ["play", "guardia", "ala piccola", "ala forte", "centro"];
const roleRank = (role) => (ROLE_ORDER.includes(role) ? ROLE_ORDER.indexOf(role) : ROLE_ORDER.length);

// Age profile and role split of a roster; `players` carry playbasket's `role` and `age` strings.
// Age is the one reached in `seasonYear`: playbasket publishes the birth year only.
export function rosterProfile(players, seasonYear) {
  const years = players.map((player) => birthYear(player.age, seasonYear)).filter((year) => year !== null);
  const counts = new Map();
  for (const { role } of players.filter((player) => player.role)) counts.set(role, (counts.get(role) ?? 0) + 1);
  const roles = [...counts].map(([role, count]) => ({ role, count }));
  return {
    total: players.length,
    averageAge: ratio(years.reduce((sum, year) => sum + seasonYear - year, 0), years.length),
    oldest: years.length ? Math.min(...years) : null,
    youngest: years.length ? Math.max(...years) : null,
    // stable sort: unknown roles keep their first-seen order
    roles: roles.sort((a, b) => roleRank(a.role) - roleRank(b.role)),
    withoutAge: players.length - years.length,
    withoutRole: players.filter((player) => !player.role).length,
  };
}

export function cusPlayerStats(boxscores, rounds, team) {
  const games = rounds.flatMap((round) => round.games)
    .filter((game) => game.home === team || game.away === team);
  const matched = matchedGames(boxscores, games, team);
  return {
    games: {
      played: games.filter((game) => game.score !== null).length,
      withBoxscore: matched.length,
      incomplete: matched.filter((game) => INCOMPLETE_STATUSES.has(game.status)).length,
    },
    players: [...appearancesById(matched).values()]
      .map((appearances) => playerStats(appearances, matched))
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name)),
  };
}
