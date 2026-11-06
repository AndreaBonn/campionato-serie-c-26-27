import assert from "node:assert/strict";
import { test } from "node:test";

import { decidedFacts, positionRanges } from "../../docs/standings-math.js";

// played (homologated) game and game still to play
const g = (home, away, hs, as) => ({ home, away, score: { home: hs, away: as }, status: "omologata" });
const todo = (home, away, status = "non-designata") => ({ home, away, score: null, status });
const rounds = (...games) => [{ round: "A1", games }];
const table = (points) => Object.entries(points).map(([team, pts]) => ({ team, points: pts }));
const range = (ranges, team) => { const r = ranges.get(team); return [r.best, r.worst]; };

test("a leader no one can reach any more is first whatever happens", () => {
  const ranges = positionRanges(table({ A: 10, B: 6, C: 4, D: 0 }), rounds(todo("B", "C"), todo("A", "D")));

  assert.deepEqual(range(ranges, "A"), [1, 1]);
  assert.deepEqual(range(ranges, "D"), [4, 4]);
  assert.deepEqual(range(ranges, "B"), [2, 3]);
});

test("with every game still to play every position stays open", () => {
  const all = ["A", "B", "C", "D"].flatMap((h) => ["A", "B", "C", "D"].filter((a) => a !== h).map((a) => todo(h, a)));
  const ranges = positionRanges(table({ A: 0, B: 0, C: 0, D: 0 }), rounds(...all));

  for (const team of ["A", "B", "C", "D"]) assert.deepEqual(range(ranges, team), [1, 4]);
});

test("two chasers that play each other cannot both catch the leader, who holds the head-to-head", () => {
  // A has finished on 8 and beat both B and C; only one of B and C can reach 8
  const games = rounds(g("A", "B", 80, 70), g("A", "C", 80, 70), g("B", "A", 70, 80), g("C", "A", 70, 80), todo("B", "C"));
  const standings = table({ A: 8, B: 6, C: 6 });

  assert.deepEqual(range(positionRanges(standings, games), "A"), [1, 1]);
  // the simple bound alone cannot see it: B and C may each reach 8
  assert.deepEqual(range(positionRanges(standings, games, { maxEnumerated: 0 }), "A"), [1, 3]);
});

test("a two-team tie with a split head-to-head goes to the head-to-head points ratio", () => {
  const games = rounds(g("A", "B", 80, 70), g("B", "A", 75, 70));
  const ranges = positionRanges(table({ A: 2, B: 2 }), games);

  // A 150-145, B 145-150
  assert.deepEqual(range(ranges, "A"), [1, 1]);
  assert.deepEqual(range(ranges, "B"), [2, 2]);
});

test("a tie that depends on the score of a game still to play stays open", () => {
  // if B wins the return game the head-to-head is split and the ratio needs its score
  const games = rounds(g("A", "B", 80, 70), todo("B", "A"));
  const ranges = positionRanges(table({ A: 2, B: 0 }), games);

  assert.deepEqual(range(ranges, "A"), [1, 2]);
  assert.deepEqual(range(ranges, "B"), [1, 2]);
});

test("a game played but not yet homologated counts as still to play", () => {
  const games = rounds(g("A", "B", 80, 70), { ...g("B", "A", 60, 90), status: "ufficioso" });
  const ranges = positionRanges(table({ A: 2, B: 0 }), games);

  assert.deepEqual(range(ranges, "B"), [1, 2]);
});

test("a three-team tie with equal head-to-head wins goes to the ratio over the three teams' games", () => {
  // A beat B twice, B beat C twice, C beat A twice: 2 wins each among themselves
  const games = rounds(
    g("A", "B", 80, 70), g("B", "A", 70, 80), g("B", "C", 80, 70), g("C", "B", 70, 80),
    g("C", "A", 90, 70), g("A", "C", 70, 90),
  );
  const ranges = positionRanges(table({ A: 4, B: 4, C: 4 }), games);

  // A 300-320, B 300-300, C 320-300
  assert.deepEqual([range(ranges, "C"), range(ranges, "B"), range(ranges, "A")], [[1, 1], [2, 2], [3, 3]]);
});

test("art. 62.2: when the head-to-head table leaves two teams level, their own games decide, not the three-team ratio", () => {
  // A, B and C end on 8. Among them A has 4 wins, B and C 1 each (they split).
  // Over the three teams' games C's ratio is better (it lost narrowly to A, B heavily),
  // over B-C alone B's is: the rules want the second.
  const games = rounds(
    g("A", "B", 100, 60), g("B", "A", 60, 100), g("A", "C", 71, 70), g("C", "A", 70, 71),
    g("B", "C", 80, 70), g("C", "B", 75, 70),
    g("D", "A", 80, 70), g("A", "D", 70, 80), g("E", "A", 80, 70), g("A", "E", 70, 80),
    g("B", "D", 80, 70), g("D", "B", 70, 80), g("B", "E", 80, 70),
    g("C", "E", 80, 70), g("E", "C", 70, 80), g("C", "D", 80, 70),
  );
  const ranges = positionRanges(table({ A: 8, B: 8, C: 8, D: 4, E: 4 }), games);

  // B-C: B 150-145, C 145-150
  assert.deepEqual([range(ranges, "A"), range(ranges, "B"), range(ranges, "C")], [[1, 1], [2, 2], [3, 3]]);
});

test("a tie that no criterion with known data separates stays open", () => {
  const games = rounds(g("A", "B", 80, 70), g("B", "A", 80, 70));
  const ranges = positionRanges(table({ A: 2, B: 2 }), games);

  assert.deepEqual(range(ranges, "A"), [1, 2]);
});

test("decidedFacts: an exact position, a clinched zone and a team with nothing decided", () => {
  const ranges = new Map([["A", { best: 1, worst: 1 }], ["B", { best: 2, worst: 4 }], ["C", { best: 2, worst: 6 }],
    ["D", { best: 5, worst: 6 }], ["E", { best: 5, worst: 6 }], ["F", { best: 6, worst: 6 }]]);

  const facts = decidedFacts(ranges, { playoff: 4, playout: 1 });

  assert.deepEqual(facts, [
    { team: "A", position: 1, playoff: true, playout: false },
    { team: "B", position: null, playoff: true, playout: false },
    { team: "D", position: null, playoff: false, playout: null },
    { team: "E", position: null, playoff: false, playout: null },
    { team: "F", position: 6, playoff: false, playout: true },
  ]);
});

test("decidedFacts: no zone facts when the league is too short for the two zones", () => {
  const ranges = new Map([["A", { best: 1, worst: 2 }], ["B", { best: 1, worst: 2 }]]);

  assert.deepEqual(decidedFacts(ranges, { playoff: 1, playout: 1 }), []);
});

test("a game naming a team missing from the standings makes every range unknown instead of too narrow", () => {
  // B's last game is listed with the opponent under another name: without it B could not reach A
  const ranges = positionRanges(table({ A: 10, B: 8, C: 0 }), rounds(todo("B", "C SPONSOR")));

  assert.equal(ranges.size, 0);
});

test("homologated games that do not add up to the standings' played count make every range unknown", () => {
  const standings = [{ team: "A", points: 2, played: 2 }, { team: "B", points: 0, played: 1 }];

  assert.equal(positionRanges(standings, rounds(g("A", "B", 80, 70))).size, 0);
  assert.equal(positionRanges(standings.map((r) => ({ ...r, played: 1 })), rounds(g("A", "B", 80, 70))).size, 2);
});

test("no games at all, or no rounds, give no ranges rather than every position decided", () => {
  assert.equal(positionRanges(table({ A: 0, B: 0 }), []).size, 0);
  assert.equal(positionRanges(table({ A: 0, B: 0 }), undefined).size, 0);
});

test("decidedFacts: a league without playout never calls a team safe from it", () => {
  const ranges = new Map([["A", { best: 1, worst: 2 }], ["B", { best: 1, worst: 4 }], ["C", { best: 3, worst: 4 }], ["D", { best: 4, worst: 4 }]]);

  assert.deepEqual(decidedFacts(ranges, { playoff: 2, playout: 0 }), [
    { team: "A", position: null, playoff: true, playout: null },
    { team: "C", position: null, playoff: false, playout: null },
    { team: "D", position: 4, playoff: false, playout: null },
  ]);
});

test("decidedFacts: with no zones at all (playoff and playout 0) only exact positions are reported", () => {
  const ranges = new Map([["A", { best: 1, worst: 1 }], ["B", { best: 2, worst: 3 }], ["C", { best: 2, worst: 3 }]]);

  assert.deepEqual(decidedFacts(ranges, { playoff: 0, playout: 0 }), [
    { team: "A", position: 1, playoff: null, playout: null },
  ]);
});
