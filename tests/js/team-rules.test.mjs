import assert from "node:assert/strict";
import { test } from "node:test";

import { headToHead, performance, remainingGames, scheduleStrength, suspensions } from "../../docs/team-rules.js";

const TEAM = "OLIMPIA CAGLIARI";
const game = (n, date, home, away, score = null, extra = {}) => ({ n, home, away, date, time: "18:00", status: score ? "omologata" : "", score, sanctions: [], ...extra });
const round = (name, ...games) => ({ round: name, games });
const STANDINGS = [
  { position: 1, team: "SEF TORRES", played: 2 },
  { position: 5, team: TEAM, played: 2 },
  { position: 9, team: "PALL. NUORO", played: 2 },
];

test("remaining: games without a result, oldest first, oriented on the team, opponent's position", () => {
  const rounds = [
    round("A1", game(1, "2026-10-04", TEAM, "PALL. NUORO", { home: 70, away: 60 })),
    round("A3", game(9, "2026-10-18", "SEF TORRES", TEAM)),
    round("A2", game(5, "2026-10-11", TEAM, "DINAMO"), game(6, "2026-10-11", "SEF TORRES", "PALL. NUORO")),
  ];

  const rows = remainingGames(TEAM, rounds, STANDINGS);

  assert.deepEqual(rows.map((g) => [g.n, g.round, g.opponent, g.isHome, g.opponentPosition]), [
    [5, "A2", "DINAMO", true, null],
    [9, "A3", "SEF TORRES", false, 1],
  ]);
  assert.equal(rows[0].time, "18:00");
});

test("remaining: none once every game has a result", () => {
  const rounds = [round("A1", game(1, "2026-10-04", TEAM, "PALL. NUORO", { home: 70, away: 60 }))];
  assert.deepEqual(remainingGames(TEAM, rounds, STANDINGS), []);
  assert.equal(remainingGames(TEAM, [round("A1", game(1, "2026-10-04", TEAM, "X"))], STANDINGS).length, 1);
});

test("head to head: played and still to play, oldest first, from the team's side", () => {
  const rounds = [
    round("R1", game(20, "2027-01-10", "CUS CAGLIARI", TEAM)),
    round("A1", game(1, "2026-10-04", TEAM, "CUS CAGLIARI", { home: 58, away: 66 })),
    round("A2", game(2, "2026-10-11", TEAM, "PALL. NUORO", { home: 70, away: 60 })),
  ];

  const rows = headToHead(TEAM, "CUS CAGLIARI", rounds);

  assert.deepEqual(rows.map((g) => [g.round, g.isHome, g.played, g.own, g.their, g.won]), [
    ["A1", true, true, 58, 66, false],
    ["R1", false, false, null, null, null],
  ]);
  assert.deepEqual(headToHead(TEAM, "DINAMO", rounds), []);
});

test("performance: home and away records, current streak, average margin, widest win and loss", () => {
  const rounds = [
    round("A1", game(1, "2026-10-04", TEAM, "A", { home: 80, away: 60 })),
    round("A2", game(2, "2026-10-11", "B", TEAM, { home: 70, away: 65 })),
    round("A3", game(3, "2026-10-18", "C", TEAM, { home: 50, away: 60 })),
    round("A4", game(4, "2026-10-25", TEAM, "D", { home: 71, away: 70 })),
    round("A5", game(5, "2026-11-01", TEAM, "E")),
  ];

  const p = performance(TEAM, rounds);

  assert.deepEqual(p.split, { home: { won: 2, lost: 0 }, away: { won: 1, lost: 1 } });
  assert.deepEqual(p.streak, { won: true, length: 2 });
  assert.equal(p.avgMargin, (20 - 5 + 10 + 1) / 4);
  assert.deepEqual([p.biggestWin.round, p.biggestWin.own, p.biggestWin.their], ["A1", 80, 60]);
  assert.deepEqual([p.biggestLoss.round, p.biggestLoss.own, p.biggestLoss.their], ["A2", 65, 70]);
});

test("performance: null before the first result, no loss when unbeaten", () => {
  assert.equal(performance(TEAM, [round("A1", game(1, "2026-10-04", TEAM, "A"))]), null);
  const unbeaten = performance(TEAM, [round("A1", game(1, "2026-10-04", TEAM, "A", { home: 2, away: 1 }))]);
  assert.equal(unbeaten.biggestLoss, null);
  assert.equal(unbeaten.biggestWin.own, 2);
});

test("schedule strength: average position of the remaining opponents, unknown ones left out", () => {
  assert.equal(scheduleStrength([{ opponentPosition: 1 }, { opponentPosition: 4 }, { opponentPosition: null }]), 2.5);
  assert.equal(scheduleStrength([{ opponentPosition: null }]), null);
  assert.equal(scheduleStrength([]), null);
});

const MURA = "soc. SEF TORRES A.S.D.:ANTONIO MURA squalifica per 2 gare per comportamento offensivo nei confronti degli arbitri";
const FINE = "soc. SEF TORRES A.S.D.:Ammenda di Euro 100.00 per offese";

test("suspensions: player and length read from the club's sanctions, games left counted from its later results", () => {
  const rounds = [
    round("A1", game(1, "2026-10-04", "SEF TORRES", "A", { home: 70, away: 60 }, { sanctions: [MURA, FINE] })),
    round("A2", game(2, "2026-10-11", "B", "SEF TORRES", { home: 60, away: 50 })),
    round("A3", game(3, "2026-10-18", "SEF TORRES", "C")),
  ];

  const rows = suspensions("SEF TORRES", rounds);

  assert.deepEqual(rows, [{ player: "ANTONIO MURA", games: 2, round: "A1", n: 1, served: 1, left: 1 }]);
});

test("suspensions: served in full once enough games have a result; other clubs' and other sanctions ignored", () => {
  const rounds = [
    round("A1", game(1, "2026-10-04", "SEF TORRES", "A", { home: 70, away: 60 }, { sanctions: [MURA] })),
    round("A2", game(2, "2026-10-11", "B", "SEF TORRES", { home: 60, away: 50 })),
    round("A3", game(3, "2026-10-18", "SEF TORRES", "C", { home: 60, away: 50 })),
    round("A4", game(4, "2026-10-25", "SEF TORRES", "D", { home: 60, away: 50 })),
  ];

  assert.deepEqual(suspensions("SEF TORRES", rounds).map((s) => [s.served, s.left]), [[2, 0]]);
  assert.deepEqual(suspensions("A", rounds), []);
  const single = [round("A1", game(1, "2026-10-04", "SEF TORRES", "A", { home: 1, away: 0 }, { sanctions: ["soc. SEF TORRES A.S.D.:LUCA ROSSI squalifica per 1 gara per proteste"] }))];
  assert.deepEqual(suspensions("SEF TORRES", single).map((s) => [s.player, s.games, s.left]), [["LUCA ROSSI", 1, 1]]);
});
