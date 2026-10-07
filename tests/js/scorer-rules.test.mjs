import assert from "node:assert/strict";
import { test } from "node:test";

import { scorers } from "../../docs/scorer-rules.js";

const round = (n, date, home, away) => ({ round: "A" + n, games: [{ n, home, away, date }] });
const side = (...players) => ({ team: "ignored, the FIP name wins", players });
const player = (id, name, pts) => ({ id, number: "", name, role: "", age: "", pts });

test("scorers: points desc, ties broken by average then by name, a never-entered player ranks last", () => {
  const rounds = [
    round(1, "2026-10-03", "TEAM A", "TEAM B"),
    round(2, "2026-10-10", "TEAM C", "TEAM A"),
    round(3, "2026-10-17", "TEAM A", "TEAM D"),
  ];
  const boxscores = {
    1: { home: side(player("p1", "Ambra", 15), player("p2", "Neri", null)), away: side(player("p3", "Costa", 8)) },
    2: { home: side(player("p4", "Deri", 8)), away: side(player("p1", "Ambra", 5)) },
    3: { home: side(player("p1", "Ambra", 0)), away: side(player("p4", "Deri", 12)) },
  };

  assert.deepEqual(scorers(boxscores, rounds), [
    { id: "p4", name: "Deri", team: "TEAM D", points: 20, played: 2, average: 10 },
    { id: "p1", name: "Ambra", team: "TEAM A", points: 20, played: 3, average: 20 / 3 },
    { id: "p3", name: "Costa", team: "TEAM B", points: 8, played: 1, average: 8 },
    { id: "p2", name: "Neri", team: "TEAM A", points: 0, played: 0, average: null },
  ]);
});

test("scorers: equal points and equal average fall back to the player's name", () => {
  const rounds = [round(1, "2026-10-03", "TEAM A", "TEAM B")];
  const boxscores = { 1: { home: side(player("z", "Zeta", 5)), away: side(player("a", "Alfa", 5)) } };

  assert.deepEqual(scorers(boxscores, rounds).map((r) => r.id), ["a", "z"]);
});

test("scorers: a player who moves team mid-season is credited to the most recent one", () => {
  const rounds = [round(10, "2026-09-01", "OLD CLUB", "X"), round(11, "2026-10-01", "X", "NEW CLUB")];
  const boxscores = {
    10: { home: side(player("m1", "Moved", 4)), away: side() },
    11: { home: side(), away: side(player("m1", "Moved", 6)) },
  };

  assert.deepEqual(scorers(boxscores, rounds)[0], { id: "m1", name: "Moved", team: "NEW CLUB", points: 10, played: 2, average: 5 });
});

test("scorers: an unmatched or unknown game contributes no players", () => {
  const rounds = [round(1, "2026-10-03", "TEAM A", "TEAM B")];
  const boxscores = { 1: { home: null, away: null }, 99: { home: side(player("x", "X", 1)), away: side() } };

  assert.deepEqual(scorers(boxscores, rounds), []);
});

test("scorers: on equal points a player who entered with 0 ranks above one who never entered, whatever the roster order", () => {
  const rounds = [round(1, "2026-10-03", "TEAM A", "TEAM B")];
  const bench = player("n", "Bench", null);
  const zero = player("z", "Zeta", 0);

  for (const [home, away] of [[bench, zero], [zero, bench]]) {
    const boxscores = { 1: { home: side(home), away: side(away) } };
    assert.deepEqual(scorers(boxscores, rounds).map((r) => r.id), ["z", "n"]);
  }
});

test("scorers: a game recovered out of number order does not move a player back to an older team", () => {
  const rounds = [round(5, "2026-10-20", "X", "NEW CLUB"), round(9, "2026-09-15", "OLD CLUB", "Y")];
  const boxscores = {
    5: { home: side(), away: side(player("m1", "Moved", 6)) },
    9: { home: side(player("m1", "Moved", 4)), away: side() },
  };

  assert.equal(scorers(boxscores, rounds)[0].team, "NEW CLUB");
});
