// Pure rules of the scorers' league table: no DOM, no browser API, tested with node --test.

// A1 (plan.md): the average divides points by games where pts is set, not games at referto.
const entered = (p) => p.pts !== null;

function findFipGame(rounds, n) {
  for (const r of rounds) {
    const game = r.games.find((g) => g.n === n);
    if (game) return game;
  }
  return null;
}

// Every player seen in a matched box score, across both sides of every game.
function* rosterEntries(boxscores, rounds) {
  for (const [n, entry] of Object.entries(boxscores)) {
    if (!entry.home || !entry.away) continue; // unmatched: no players to read
    const fipGame = findFipGame(rounds, Number(n));
    if (!fipGame) continue; // game dropped from the published schedule
    for (const side of ["home", "away"]) {
      for (const player of entry[side].players) yield { player, team: fipGame[side], date: fipGame.date };
    }
  }
}

// League scorers table: points, games entered and average per player, newest team kept
// last (a player who moves team mid-season is shown under the one they played for most
// recently). Sorted by points desc, then average desc (never-entered last), then name.
export function scorers(boxscores, rounds) {
  const byId = new Map();
  for (const { player, team, date } of rosterEntries(boxscores, rounds)) {
    const row = byId.get(player.id) ?? { id: player.id, name: player.name, team, date, points: 0, played: 0 };
    if (date >= row.date) {
      row.team = team;
      row.date = date;
    }
    if (entered(player)) {
      row.points += player.pts;
      row.played += 1;
    }
    byId.set(player.id, row);
  }
  return [...byId.values()]
    .map(({ date, ...row }) => ({ ...row, average: row.played ? row.points / row.played : null }))
    .sort((a, b) => b.points - a.points || (b.average ?? -1) - (a.average ?? -1) || a.name.localeCompare(b.name));
}
