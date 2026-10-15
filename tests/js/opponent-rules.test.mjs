import assert from "node:assert/strict";
import { test } from "node:test";

import { attributeSanction, opponentGames, opponentSanctions, scorersState } from "../../docs/opponent-rules.js";

const game = (n, date, home, away, score = null, extra = {}) => ({ n, home, away, date, time: "18:00", status: "omologata", score, sanctions: [], ...extra });
const round = (name, ...games) => ({ round: name, games });

// The twelve FIP names of girone 85305, as data.json spells them on 2026-10-15
const LEAGUE = [
  "BASKET ANTONIANUM", "BASKET S. ORSOLA", "C.M.B. PORTO TORRES", "CAMPING LA SALINA CALASETTA", "CUS CAGLIARI",
  "FERRINI PISANO ARREDAMENTI", "FISIOKONS AUREA SASSARI", "OLIMPIA CAGLIARI", "PALL. NUORO", "POL. DINAMO",
  "SCUOLA BASKET CARBONIA", "SEF TORRES",
];
// Verbatim Giudice Sportivo texts of rounds A1 and A2
const PORTO_TORRES_FINE = "soc. CENTRO MINIBK P.TORRES A. DIL.:Ammenda di Euro 250.00 ritardato riconoscimento del responsabile dell’Ambulanza di servizio [art. 38,1b RG - art. 34 comma 4 R.E. gare]";
const NUORO_FINE = "soc. A.S.D. PALL. NUORO:Ammenda di Euro 250.00 ritardato riconoscimento del Medico di Servizio [art. 38,1b RG - art. 34 comma 4 R.E. gare]";
const CARBONIA_FINE = "soc. A.S.D. SCUOLA BASKET CARBONIA:Ammenda di Euro 125.00 per mancata designazione del dirigente accompagnatore [art. 38,1f RG]";

test("opponent games: one row per played game, oriented on the team, oldest first", () => {
  const rounds = [
    round("A2", game(8, "2026-10-11", "OLIMPIA CAGLIARI", "SEF TORRES", { home: 58, away: 71 })),
    round("A1", game(2, "2026-10-04", "PALL. NUORO", "OLIMPIA CAGLIARI", { home: 60, away: 75 }, { status: "ufficioso" })),
  ];

  assert.deepEqual(opponentGames("OLIMPIA CAGLIARI", rounds), [
    { round: "A1", n: 2, date: "2026-10-04", opponent: "PALL. NUORO", isHome: false, own: 75, their: 60, won: true, status: "ufficioso" },
    { round: "A2", n: 8, date: "2026-10-11", opponent: "SEF TORRES", isHome: true, own: 58, their: 71, won: false, status: "omologata" },
  ]);
});

test("opponent games: games without a score and other teams' games are left out", () => {
  const rounds = [round("A1", game(1, "2026-10-03", "OLIMPIA CAGLIARI", "SEF TORRES"), game(2, "2026-10-03", "PALL. NUORO", "POL. DINAMO", { home: 70, away: 60 }))];

  assert.deepEqual(opponentGames("OLIMPIA CAGLIARI", rounds), []);
  assert.equal(opponentGames("PALL. NUORO", rounds).length, 1);
});

test("scorers state: loading until boxscores.json is settled, then the list, empty, or failed with nothing to show", () => {
  const rounds = [round("A1", game(1, "2026-10-03", "TEAM A", "TEAM B"))];
  const side = (id, pts) => ({ team: "x", players: [{ id, number: "", name: "P " + id, role: "", age: "", pts }] });
  const boxscores = { 1: { home: side("a1", 12), away: side("b1", 9) } };

  assert.deepEqual(scorersState({}, rounds, "TEAM A", "loading"), { state: "loading", rows: [] });
  assert.deepEqual(scorersState({}, rounds, "TEAM A", "ready"), { state: "empty", rows: [] });
  assert.deepEqual(scorersState({}, rounds, "TEAM A", "failed"), { state: "failed", rows: [] });
  // a failed reload keeps the box scores already on the page
  assert.equal(scorersState(boxscores, rounds, "TEAM A", "failed").state, "list");
  const list = scorersState(boxscores, rounds, "TEAM A", "ready");
  assert.equal(list.state, "list");
  assert.deepEqual(list.rows.map((r) => [r.id, r.points]), [["a1", 12]]);
});

test("sanction: the three real A1/A2 fines go to the club that was fined", () => {
  assert.equal(attributeSanction(PORTO_TORRES_FINE, "C.M.B. PORTO TORRES", "FISIOKONS AUREA SASSARI", LEAGUE), "home");
  assert.equal(attributeSanction(NUORO_FINE, "PALL. NUORO", "SEF TORRES", LEAGUE), "home");
  assert.equal(attributeSanction(CARBONIA_FINE, "SCUOLA BASKET CARBONIA", "PALL. NUORO", LEAGUE), "home");
  // same texts with the sides swapped: the side follows the club, not the position
  assert.equal(attributeSanction(NUORO_FINE, "SEF TORRES", "PALL. NUORO", LEAGUE), "away");
});

test("sanction: Porto Torres needs its alias, «TORRES» alone also names SEF Torres", () => {
  assert.equal(attributeSanction(PORTO_TORRES_FINE, "SEF TORRES", "C.M.B. PORTO TORRES", LEAGUE), "away");
  assert.equal(attributeSanction("soc. TORRES:Ammenda", "SEF TORRES", "C.M.B. PORTO TORRES", LEAGUE), null);
});

test("sanction: a text without «soc.» or that names neither club stays unattributed", () => {
  assert.equal(attributeSanction("giocatore ROSSI MARIO:squalifica per 1 gara", "PALL. NUORO", "SEF TORRES", LEAGUE), null);
  assert.equal(attributeSanction("soc. A.S.D. ALTRA SOCIETA:Ammenda", "PALL. NUORO", "SEF TORRES", LEAGUE), null);
});

test("sanction: two-letter words are not distinctive, «SS» names no club", () => {
  const league = ["SS LAZIO", "PALL. NUORO"];
  assert.equal(attributeSanction("soc. SS DILETTANTISTICA ALTRA:Ammenda", "PALL. NUORO", "SS LAZIO", league), null);
  assert.equal(attributeSanction("soc. SS LAZIO:Ammenda", "PALL. NUORO", "SS LAZIO", league), "away");
});

test("opponent sanctions: the club's own fines are listed, the other club's are not", () => {
  const rounds = [
    round("A1", game(3, "2026-10-03", "PALL. NUORO", "SEF TORRES", { home: 70, away: 60 }, { sanctions: [NUORO_FINE] })),
    round("A2", game(8, "2026-10-11", "SCUOLA BASKET CARBONIA", "PALL. NUORO", { home: 66, away: 64 }, { sanctions: [CARBONIA_FINE] })),
  ];

  const nuoro = opponentSanctions("PALL. NUORO", rounds);
  assert.deepEqual(nuoro.own, [{ round: "A1", n: 3, text: NUORO_FINE }]);
  assert.deepEqual(nuoro.unattributed, []);
  assert.deepEqual(opponentSanctions("SCUOLA BASKET CARBONIA", rounds).own, [{ round: "A2", n: 8, text: CARBONIA_FINE }]);
});

test("opponent sanctions: an unattributed text in the team's games is kept apart, not dropped", () => {
  const text = "giocatore ROSSI MARIO:squalifica per 1 gara";
  const rounds = [round("A1", game(3, "2026-10-03", "PALL. NUORO", "SEF TORRES", { home: 70, away: 60 }, { sanctions: [text] }))];

  assert.deepEqual(opponentSanctions("SEF TORRES", rounds), { own: [], unattributed: [{ round: "A1", n: 3, text }] });
});
