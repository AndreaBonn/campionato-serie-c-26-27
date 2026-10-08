import assert from "node:assert/strict";
import { test } from "node:test";

import {
  countdownText,
  displayTeamName,
  lastPlayed,
  relativeAge,
  splitLine,
  teamInitials,
  zoneStarts,
} from "../../docs/view-rules.js";

const NOW = new Date("2026-10-08T12:00:00Z");
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;

test("countdown: two days or more read «tra N giorni»", () => {
  assert.deepEqual(countdownText(3, "18:00"), { lead: "tra", main: "3 giorni", sub: "" });
  assert.deepEqual(countdownText(2, "18:00"), { lead: "tra", main: "2 giorni", sub: "" });
});

test("countdown: the day before is «Domani» with the time", () => {
  assert.deepEqual(countdownText(1, "18:00"), { lead: "", main: "Domani", sub: "ore 18:00" });
});

test("countdown: game day is «Stasera» from 17:00 on, «Oggi» earlier", () => {
  assert.deepEqual(countdownText(0, "17:00"), { lead: "", main: "Stasera", sub: "ore 17:00" });
  assert.deepEqual(countdownText(0, "16:30"), { lead: "", main: "Oggi", sub: "ore 16:30" });
});

test("relative age: minutes, hours, yesterday, days", () => {
  assert.equal(relativeAge(ago(20e3), NOW), "adesso");
  assert.equal(relativeAge(ago(MIN), NOW), "1 minuto fa");
  assert.equal(relativeAge(ago(45 * MIN), NOW), "45 minuti fa");
  assert.equal(relativeAge(ago(HOUR), NOW), "1 ora fa");
  assert.equal(relativeAge(ago(5 * HOUR + 50 * MIN), NOW), "5 ore fa");
  assert.equal(relativeAge(ago(DAY + HOUR), NOW), "ieri");
  assert.equal(relativeAge(ago(3 * DAY), NOW), "3 giorni fa");
});

test("relative age: a clock slightly ahead of the device still reads «adesso»", () => {
  assert.equal(relativeAge(new Date(NOW.getTime() + 30e3).toISOString(), NOW), "adesso");
});

test("team name: FIP upper case becomes title case, acronyms and initials stay", () => {
  assert.equal(displayTeamName("C.M.B. PORTO TORRES"), "C.M.B. Porto Torres");
  assert.equal(displayTeamName("BASKET S. ORSOLA"), "Basket S. Orsola");
  assert.equal(displayTeamName("POL. DINAMO"), "Pol. Dinamo");
  assert.equal(displayTeamName("CUS CAGLIARI"), "CUS Cagliari");
  assert.equal(displayTeamName("SEF TORRES"), "SEF Torres");
  assert.equal(displayTeamName("CAMPING LA SALINA CALASETTA"), "Camping La Salina Calasetta");
});

test("team name: hyphens and apostrophes start a new capital", () => {
  assert.equal(displayTeamName("SANT'ANDREA ALTO-MARE"), "Sant'Andrea Alto-Mare");
});

test("team initials: first letters of the first and last word", () => {
  assert.equal(teamInitials("BASKET FERRINI"), "BF");
  assert.equal(teamInitials("CAMPING LA SALINA CALASETTA"), "CC");
  assert.equal(teamInitials("PALL. NUORO"), "PN");
  assert.equal(teamInitials("OLIMPIA"), "O");
});

test("zone starts: the positions where a zone label goes, one per zone", () => {
  assert.deepEqual(zoneStarts(12), new Map([[1, "playoff"], [10, "playout"]]));
  assert.deepEqual(zoneStarts(13), new Map([[1, "playoff"], [11, "playout"]]));
});

test("zone starts: none when the playoff and playout spots would touch or overlap", () => {
  assert.deepEqual(zoneStarts(11), new Map());
});

test("split line: home and away records, a side with no games left out", () => {
  assert.equal(splitLine({ home: { won: 0, lost: 0 }, away: { won: 0, lost: 1 } }), "In trasferta 0-1");
  assert.equal(splitLine({ home: { won: 2, lost: 1 }, away: { won: 1, lost: 1 } }), "In casa 2-1 · In trasferta 1-1");
});

test("last played: the latest game with a result, null before the first", () => {
  const g = (n, score) => ({ n, score });
  assert.equal(lastPlayed([g(1, { home: 1, away: 0 }), g(2, { home: 2, away: 1 }), g(3, null)]).n, 2);
  assert.equal(lastPlayed([g(1, null)]), null);
});
