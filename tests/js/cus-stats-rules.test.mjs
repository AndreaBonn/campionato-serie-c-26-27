import assert from "node:assert/strict";
import { test } from "node:test";

import { cusPlayerStats } from "../../docs/cus-stats-rules.js";

const TEAM = "CUS CAGLIARI";
const SCORE = { home: 80, away: 60 };
const player = (id, pts, details = {}) => ({ id, name: id, role: "play", age: "'07", pts, ...details });
const side = (...players) => ({ team: "Playbasket name", players });
const round = (n, date, options = {}) => ({ round: "A" + n, games: [{
  n, date, home: TEAM, away: "OPPONENT " + n, score: SCORE, ...options,
}] });
const boxscore = (players, options = {}) => ({
  status: "complete", fip_score: SCORE, home: side(...players), away: side(), ...options,
});
const stats = (boxscores, rounds) => cusPlayerStats(boxscores, rounds, TEAM);

test("D16: null is listed but zero counts as entered", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("p", 12)]), 2: boxscore([player("p", null)]),
    3: boxscore([player("p", 0)]) };

  const result = stats(boxscores, rounds);

  assert.deepEqual(result.games, { played: 3, withBoxscore: 3, incomplete: 0 });
  assert.deepEqual(result.players, [{
    id: "p", name: "p", role: "play", age: "'07", points: 12, listed: 3, entered: 2,
    average: 6, homeAverage: 6, awayAverage: null,
    best: { points: 12, opponent: "OPPONENT 1", date: "2026-10-03", n: 1 },
    doubleDigit: 1, teamShare: 1, winAverage: 6, lossAverage: null,
    last5: [{ date: "2026-10-03", opponent: "OPPONENT 1", pts: 12 },
      { date: "2026-10-10", opponent: "OPPONENT 2", pts: null },
      { date: "2026-10-17", opponent: "OPPONENT 3", pts: 0 }],
  }]);
});

test("home and away averages divide by entries on the corresponding side", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10", { home: "HOST", away: TEAM }),
    round(3, "2026-10-17"), round(4, "2026-10-24")];
  const boxscores = { 1: boxscore([player("p", 12)]),
    2: boxscore([], { away: side(player("p", 4)) }),
    3: boxscore([player("p", null)]), 4: boxscore([player("p", 0)]) };

  const [row] = stats(boxscores, rounds).players;

  assert.deepEqual([row.homeAverage, row.awayAverage, row.average], [6, 4, 16 / 3]);
});

test("outcome averages use boxscore FIP scores and orient both sides", () => {
  const reversed = { home: 60, away: 80 };
  const rounds = [round(1, "2026-10-03", { score: reversed }), round(2, "2026-10-10"),
    round(3, "2026-10-17", { home: "HOST", away: TEAM }),
    round(4, "2026-10-24", { home: "HOST", away: TEAM }), round(5, "2026-10-31")];
  const boxscores = { 1: boxscore([player("p", 10)]),
    2: boxscore([player("p", 2)], { fip_score: reversed }),
    3: boxscore([], { away: side(player("p", 20)), fip_score: reversed }),
    4: boxscore([], { away: side(player("p", 6)) }), 5: boxscore([player("p", null)]) };

  const [row] = stats(boxscores, rounds).players;

  assert.deepEqual([row.winAverage, row.lossAverage], [15, 4]);
});

test("never-entered players and zero team totals never divide by zero", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10", { home: "HOST", away: TEAM })];
  const boxscores = { 1: boxscore([player("bench", null), player("zero", 0)]),
    2: boxscore([], { away: side(player("bench", null), player("zero", 0)) }) };

  const [bench, zero] = stats(boxscores, rounds).players;

  assert.deepEqual([bench.average, bench.homeAverage, bench.awayAverage, bench.teamShare,
    bench.winAverage, bench.lossAverage, bench.best], [null, null, null, null, null, null, null]);
  assert.deepEqual([bench.points, bench.listed, bench.entered, bench.doubleDigit], [0, 2, 0, 0]);
  assert.deepEqual([zero.average, zero.homeAverage, zero.awayAverage, zero.teamShare,
    zero.winAverage, zero.lossAverage], [0, 0, 0, null, 0, 0]);
  assert.deepEqual(zero.best, { points: 0, opponent: "HOST", date: "2026-10-10", n: 2 });
  assert.equal(stats({ 1: boxscore([player("p", 5)]) }, rounds).players[0].teamShare, 1);
});

test("coverage excludes unmatched, missing, unrelated and unknown games", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17"),
    round(4, "2026-10-24", { score: null }), round(5, "2026-10-31", { home: "OTHER" })];
  const boxscores = { 1: boxscore([player("p", 7)]),
    2: boxscore([], { status: "unmatched", home: null, away: null }),
    5: boxscore([player("other", 90)]), 99: boxscore([player("unknown", 100)]) };

  const result = stats(boxscores, rounds);

  assert.deepEqual(result.games, { played: 3, withBoxscore: 1, incomplete: 0 });
  assert.deepEqual(result.players.map(({ id, points, listed }) => ({ id, points, listed })),
    [{ id: "p", points: 7, listed: 1 }]);
  assert.deepEqual(result.players[0].last5, [{ date: "2026-10-03", opponent: "OPPONENT 1", pts: 7 }]);
});

test("partial and incomplete boxscores retain their available points", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("p", 10)], { status: "partial" }),
    2: boxscore([player("p", 4)], { status: "incomplete" }), 3: boxscore([player("p", 6)]) };

  const result = stats(boxscores, rounds);

  assert.deepEqual(result.games, { played: 3, withBoxscore: 3, incomplete: 2 });
  assert.deepEqual([result.players[0].points, result.players[0].entered], [20, 3]);
});

test("team share uses roster totals only in games where the player is listed", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("p", 10), player("q", 30)]),
    2: boxscore([player("p", null), player("q", 10)]), 3: boxscore([player("q", 50)]) };

  const result = stats(boxscores, rounds);

  assert.deepEqual(result.players.map(({ id, teamShare }) => ({ id, teamShare })),
    [{ id: "q", teamShare: 0.9 }, { id: "p", teamShare: 0.2 }]);
});

test("last5 preserves absence, bench and scored zero when fewer than five games exist", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("p", null)]), 2: boxscore([]), 3: boxscore([player("p", 0)]) };

  const [row] = stats(boxscores, rounds).players;

  assert.deepEqual(row.last5, [{ date: "2026-10-03", opponent: "OPPONENT 1", pts: null },
    { date: "2026-10-10", opponent: "OPPONENT 2", pts: "ABS" },
    { date: "2026-10-17", opponent: "OPPONENT 3", pts: 0 }]);
});

test("last5 selects by date and includes games after the final roster appearance", () => {
  const rounds = [round(1, "2026-11-07"), round(2, "2026-10-31"), round(3, "2026-10-24"),
    round(4, "2026-10-17"), round(5, "2026-10-10"), round(6, "2026-10-03")];
  const boxscores = { 1: boxscore([]), 2: boxscore([player("p", 2)]), 3: boxscore([player("p", 3)]),
    4: boxscore([player("p", 4)]), 5: boxscore([player("p", 5)]), 6: boxscore([player("p", 6)]) };

  const [row] = stats(boxscores, rounds).players;

  assert.deepEqual(row.last5, [{ date: "2026-10-10", opponent: "OPPONENT 5", pts: 5 },
    { date: "2026-10-17", opponent: "OPPONENT 4", pts: 4 },
    { date: "2026-10-24", opponent: "OPPONENT 3", pts: 3 },
    { date: "2026-10-31", opponent: "OPPONENT 2", pts: 2 },
    { date: "2026-11-07", opponent: "OPPONENT 1", pts: "ABS" }]);
});

test("best ties and metadata use the latest date rather than game number", () => {
  const rounds = [round(1, "2026-10-17", { home: "HOST", away: TEAM }),
    round(2, "2026-10-03"), round(3, "2026-10-24")];
  const boxscores = { 1: boxscore([], { away: side(player("p", 12)) }),
    2: boxscore([player("p", 12, { name: "Old" })]),
    3: boxscore([player("p", null, { name: "New", role: "ala", age: "U19" })]) };

  const [row] = stats(boxscores, rounds).players;

  assert.deepEqual(row.best, { points: 12, opponent: "HOST", date: "2026-10-17", n: 1 });
  assert.deepEqual([row.id, row.name, row.role, row.age, row.points], ["p", "New", "ala", "U19", 24]);
});

test("double digits include exactly ten but exclude nine, zero and null", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17"),
    round(4, "2026-10-24"), round(5, "2026-10-31")];
  const boxscores = { 1: boxscore([player("p", 10)]), 2: boxscore([player("p", 9)]),
    3: boxscore([player("p", 20)]), 4: boxscore([player("p", 0)]), 5: boxscore([player("p", null)]) };

  assert.equal(stats(boxscores, rounds).players[0].doubleDigit, 2);
});

test("players are grouped by id and sorted by points then name, not average", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10")];
  const boxscores = { 1: boxscore([player("z", 10, { name: "Zeta" }),
    player("a", 5, { name: "Alfa" }), player("b", 20, { name: "Alfa" })]),
    2: boxscore([player("a", 5, { name: "Alfa" })]) };

  assert.deepEqual(stats(boxscores, rounds).players.map((row) => row.id), ["b", "a", "z"]);
});

test("empty input has zero coverage and the team parameter is configurable", () => {
  const rounds = [round(1, "2026-10-03", { home: "CUSTOM" })];
  const boxscores = { 1: boxscore([player("p", 4)]) };

  assert.deepEqual(cusPlayerStats({}, [], "CUSTOM"), {
    games: { played: 0, withBoxscore: 0, incomplete: 0 }, players: [],
  });
  const result = cusPlayerStats(boxscores, rounds, "CUSTOM");
  assert.deepEqual(result.games, { played: 1, withBoxscore: 1, incomplete: 0 });
  assert.deepEqual(result.players.map((row) => row.points), [4]);
});

function freezeDeep(value) {
  if (value === null || typeof value !== "object") return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

test("inputs remain unchanged even when deeply frozen and dates need sorting", () => {
  const rounds = freezeDeep([round(1, "2026-10-10"), round(2, "2026-10-03")]);
  const boxscores = freezeDeep({ 1: boxscore([player("p", 4)]), 2: boxscore([player("p", 8)]) });
  const before = structuredClone({ boxscores, rounds });

  const result = stats(boxscores, rounds);

  assert.deepEqual({ boxscores, rounds }, before);
  assert.deepEqual([result.players[0].points, result.players[0].average], [12, 6]);
});
