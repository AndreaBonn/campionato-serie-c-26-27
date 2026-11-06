import assert from "node:assert/strict";
import { test } from "node:test";

import { birthYear, rosterProfile } from "../../docs/cus-stats-rules.js";

const SEASON = 2026;
const p = (role, age) => ({ role, age });

test("birthYear: a two-digit year up to the season belongs to the 2000s, a later one to the 1900s", () => {
  assert.equal(birthYear("'07", SEASON), 2007);
  assert.equal(birthYear("'26", SEASON), 2026);
  assert.equal(birthYear("'27", SEASON), 1927);
  assert.equal(birthYear("'91", SEASON), 1991);
  assert.equal(birthYear("'00", SEASON), 2000);
});

test("birthYear: an empty or malformed value has no year", () => {
  assert.equal(birthYear("", SEASON), null);
  assert.equal(birthYear(undefined, SEASON), null);
  assert.equal(birthYear("1991", SEASON), null);
  assert.equal(birthYear("'9", SEASON), null);
});

test("rosterProfile: average age in the season year, birth-year range and roles in court order", () => {
  const players = [p("centro", "'91"), p("play", "'04"), p("ala piccola", "'07"), p("play", "'03")];

  const profile = rosterProfile(players, SEASON);

  // ages 35, 22, 19, 23
  assert.equal(profile.averageAge, 24.75);
  assert.deepEqual([profile.oldest, profile.youngest], [1991, 2007]);
  assert.deepEqual(profile.roles, [
    { role: "play", count: 2 }, { role: "ala piccola", count: 1 }, { role: "centro", count: 1 },
  ]);
  assert.deepEqual([profile.total, profile.withoutAge, profile.withoutRole], [4, 0, 0]);
});

test("rosterProfile: players without age or role are counted apart and left out of the figures", () => {
  const players = [p("play", "'00"), p("", ""), p("guardia", "")];

  const profile = rosterProfile(players, SEASON);

  assert.equal(profile.averageAge, 26);
  assert.deepEqual([profile.oldest, profile.youngest], [2000, 2000]);
  assert.deepEqual(profile.roles, [{ role: "play", count: 1 }, { role: "guardia", count: 1 }]);
  assert.deepEqual([profile.total, profile.withoutAge, profile.withoutRole], [3, 2, 1]);
});

test("rosterProfile: a role outside the known five keeps its count after them", () => {
  const profile = rosterProfile([p("pivot", "'01"), p("centro", "'01")], SEASON);

  assert.deepEqual(profile.roles, [{ role: "centro", count: 1 }, { role: "pivot", count: 1 }]);
});

test("rosterProfile: no ages at all gives no average instead of NaN", () => {
  const profile = rosterProfile([p("play", "")], SEASON);

  assert.deepEqual([profile.averageAge, profile.oldest, profile.youngest], [null, null, null]);
});
