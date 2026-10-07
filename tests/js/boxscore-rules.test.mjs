import assert from "node:assert/strict";
import { test } from "node:test";

import { boxscoreView, safeSourceUrl } from "../../docs/boxscore-rules.js";

const fipGame = { n: 6, home: "BASKET S. ORSOLA", away: "CUS CAGLIARI" };
const player = (id, pts) => ({ id, number: "7", name: "Rossi Mario", role: "ala piccola", age: "'08", pts });

const entry = (status, overrides = {}) => ({
  round: "A1",
  status,
  fip_score: { home: 62, away: 55 },
  mn: 6,
  url: "https://www.playbasket.it/sardegna/match.php?mn=6",
  home: { team: "S. Orsola Sassari", players: [player("173425", 9)] },
  away: { team: "Cus Cagliari", players: [player("195887", null)] },
  ...overrides,
});

test("complete box score: team names come from the FIP game, cells as published", () => {
  const view = boxscoreView(entry("complete"), fipGame);

  assert.equal(view.label, null);
  assert.equal(view.url, "https://www.playbasket.it/sardegna/match.php?mn=6");
  assert.deepEqual(view.home, { team: "BASKET S. ORSOLA", players: [player("173425", 9)] });
  assert.deepEqual(view.away, { team: "CUS CAGLIARI", players: [player("195887", "-")] });
});

test("partial box score: incomplete label, rows still shown", () => {
  const view = boxscoreView(entry("partial"), fipGame);

  assert.equal(view.label, "Tabellino incompleto");
  assert.deepEqual(view.home, { team: "BASKET S. ORSOLA", players: [player("173425", 9)] });
  assert.deepEqual(view.away, { team: "CUS CAGLIARI", players: [player("195887", "-")] });
});

test("incomplete box score: same incomplete label as partial", () => {
  assert.equal(boxscoreView(entry("incomplete"), fipGame).label, "Tabellino incompleto");
});

test("unmatched box score: no view at all, even though the entry exists", () => {
  assert.equal(boxscoreView(entry("unmatched", { home: null, away: null, mn: null, url: null }), fipGame), null);
});

test("no entry for the game: no view", () => {
  assert.equal(boxscoreView(undefined, fipGame), null);
});

test("a player entered with zero points keeps the 0, only a missing cell becomes a dash", () => {
  const view = boxscoreView(entry("complete", { home: { team: "x", players: [player("1", 0)] } }), fipGame);

  assert.equal(view.home.players[0].pts, 0);
});

test("safe source url accepts only a playbasket.it match page", () => {
  assert.equal(safeSourceUrl("https://www.playbasket.it/sardegna/match.php?mn=6"), "https://www.playbasket.it/sardegna/match.php?mn=6");
});

test("safe source url rejects a non-https, a different host and a script scheme", () => {
  assert.equal(safeSourceUrl("http://www.playbasket.it/sardegna/match.php?mn=6"), null);
  assert.equal(safeSourceUrl("https://evil.example/www.playbasket.it/"), null);
  assert.equal(safeSourceUrl("https://www.playbasket.it.evil.com/match.php"), null);
  assert.equal(safeSourceUrl("javascript:alert(1)"), null);
  assert.equal(safeSourceUrl(null), null);
});
