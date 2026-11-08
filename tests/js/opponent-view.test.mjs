import assert from "node:assert/strict";
import { test } from "node:test";

import { renderOpponent } from "../../docs/opponent-view.js";

const TEAM = "OLIMPIA CAGLIARI";
const game = (n, date, home, away, score, extra = {}) => ({ n, home, away, date, time: "18:00", status: "omologata", score, sanctions: [], ...extra });
const ROUNDS = [
  { round: "A1", games: [game(2, "2026-10-04", "PALL. NUORO", TEAM, { home: 60, away: 70 }, { sanctions: ["soc. A.S.D. OLIMPIA CAGLIARI:Ammenda di Euro <50>"] })] },
  { round: "A2", games: [game(8, "2026-10-11", TEAM, "SEF TORRES", { home: 55, away: 65 }, { status: "ufficioso" })] },
];
const STANDINGS = [{ position: 4, team: TEAM, played: 2 }];
const side = (team, ...players) => ({ team, players: players.map(([id, name, pts]) => ({ id, number: "", name, role: "", age: "", pts })) });
const BOXSCORES = { 2: { fip_score: { home: 60, away: 70 }, home: side("Nuoro", ["n1", "Nuorese", 20]), away: side("Olimpia", ["o1", "Rossi Luca", 18], ["o2", "Bianchi", 4]) } };
const ctx = (overrides = {}) => ({ rounds: ROUNDS, standings: STANDINGS, logos: {}, boxscores: BOXSCORES, boxscoresLoad: "ready", ...overrides });

test("card: heading with title-cased name, position, record and averages", () => {
  const html = renderOpponent(TEAM, ctx());

  assert.match(html, /<h2 id="opp-title">Olimpia Cagliari<\/h2>/);
  assert.match(html, /4ª in classifica/);
  assert.match(html, /1 vinta, 1 persa/);
  assert.match(html, /62,5 fatti, 62,5 subiti di media/);
});

test("card: one row per game, newest first, score from the team's side, unofficial results tagged", () => {
  const html = renderOpponent(TEAM, ctx());

  assert.ok(html.indexOf("<td>2ª and.</td>") < html.indexOf("<td>1ª and.</td>"), "the latest round comes first");

  assert.match(html, /<td>1ª and\.<\/td><td>Pall\. Nuoro<\/td><td>Trasferta<\/td><td>70-60 <span class="vp win">V<\/span><\/td>/);
  assert.match(html, /<td>2ª and\.<\/td><td>SEF Torres<\/td><td>Casa<\/td><td>55-65 <span class="vp loss">P<\/span> <span class="tag prov">ufficioso<\/span><\/td>/);
});

test("card: before the first result, no table but a plain explanation", () => {
  const html = renderOpponent("POL. DINAMO", ctx());

  assert.match(html, /Nessuna partita giocata finora/);
  assert.doesNotMatch(html, /<table class="opp-games"/);
  assert.match(renderOpponent(TEAM, ctx()), /<table class="opp-games"/);
});

test("card: scorers say loading, then none, then list the team's players only", () => {
  assert.match(renderOpponent(TEAM, ctx({ boxscoresLoad: "loading" })), /Rosa in caricamento/);
  assert.match(renderOpponent(TEAM, ctx({ boxscores: {} })), /Nessun tabellino disponibile/);
  assert.match(renderOpponent(TEAM, ctx({ boxscores: {}, boxscoresLoad: "failed" })), /Tabellini non raggiungibili/);
  const html = renderOpponent(TEAM, ctx());
  assert.match(html, /<td>Rossi Luca<\/td><td>1<\/td><td>18<\/td><td>18,0<\/td><td>18<\/td>/);
  assert.doesNotMatch(html, /Nuorese/);
  assert.match(html, /playbasket\.it/);
});

test("card: the club's sanctions verbatim and escaped, the other block only when needed", () => {
  const html = renderOpponent(TEAM, ctx());

  assert.match(html, /1ª and\., gara 2: soc\. A\.S\.D\. OLIMPIA CAGLIARI:Ammenda di Euro &lt;50&gt;/);
  assert.doesNotMatch(html, /società non identificata/);
  const other = [{ round: "A1", games: [game(2, "2026-10-04", "PALL. NUORO", TEAM, { home: 60, away: 70 }, { sanctions: ["giocatore X:squalifica"] })] }];
  assert.match(renderOpponent(TEAM, ctx({ rounds: other })), /società non identificata/);
  assert.match(renderOpponent(TEAM, ctx({ rounds: other })), /Nessun provvedimento alla società/);
});

const CUS = "CUS CAGLIARI";
const SEASON = [
  { round: "A1", games: [game(1, "2026-10-04", TEAM, CUS, { home: 58, away: 66 }, { sanctions: ["soc. A.S.D. OLIMPIA CAGLIARI:MARIO ROSSI squalifica per 2 gare per proteste"] })] },
  { round: "A2", games: [game(2, "2026-10-11", "SEF TORRES", TEAM, { home: 60, away: 75 })] },
  { round: "A3", games: [game(3, "2026-10-18", TEAM, "SEF TORRES", null, { status: "" })] },
  { round: "R1", games: [game(4, "2027-01-10", CUS, TEAM, null, { status: "" })] },
];
const SEASON_STANDINGS = [{ position: 2, team: CUS, played: 1 }, { position: 4, team: TEAM, played: 2 }, { position: 7, team: "SEF TORRES", played: 1 }];
const full = (overrides = {}) => ctx({ rounds: SEASON, standings: SEASON_STANDINGS, boxscores: {}, fipTeam: CUS, ...overrides });

test("card: head to head with the CUS, played result from the CUS side and the date still to come", () => {
  const html = renderOpponent(TEAM, full());

  assert.match(html, /<h3>Contro CUS Cagliari<\/h3>/);
  assert.match(html, /<td>1ª and\.<\/td><td>CUS in trasferta<\/td><td>66-58 <span class="vp win">V<\/span><\/td>/);
  assert.match(html, /<td>1ª rit\.<\/td><td>CUS in casa<\/td><td>[^<]*10 gen[^<]*, ore 18:00<\/td>/);
  assert.doesNotMatch(renderOpponent(CUS, full()), /Contro CUS Cagliari/);
});

test("card: games still to play with the opponent's position and the average of the run-in", () => {
  const html = renderOpponent(TEAM, full());

  assert.match(html, /<td><span class="d">[^<]+<\/span><small>3ª and\.<\/small><\/td><td>SEF Torres <small>\(7ª\)<\/small><\/td><td>Casa<\/td>/);
  assert.doesNotMatch(html, /Le altre/);
  assert.match(html, /<td>CUS Cagliari <small>\(2ª\)<\/small><\/td><td>Trasferta<\/td>/);
  assert.match(html, /in media 4,5ª posizione/);
  assert.match(renderOpponent(TEAM, ctx()), /Nessuna partita da giocare/);
});

test("card: the first five games still to play in view, the others in a closed block", () => {
  const many = Array.from({ length: 7 }, (_, i) => ({ round: `A${i + 1}`, games: [game(i + 1, `2026-10-0${i + 1}`, TEAM, `T${i}`, null, { status: "" })] }));
  const html = renderOpponent(TEAM, full({ rounds: many }));

  const [shown, rest] = html.split('<details class="opp-more"><summary>Le altre 2 partite</summary>');
  assert.equal((shown.match(/<td><span class="d">/g) ?? []).length, 5);
  assert.equal((rest.match(/<td><span class="d">/g) ?? []).length, 2);
  assert.match(rest, /T6/);
});

test("card: possible final positions and settled zones, nothing without ranges", () => {
  const ranges = new Map([[CUS, { best: 1, worst: 3 }], [TEAM, { best: 2, worst: 2 }], ["SEF TORRES", { best: 1, worst: 3 }]]);
  assert.match(renderOpponent(TEAM, full({ ranges })), /Posizione finale possibile: 2ª<\/p>/);
  // every position still open: nothing to say
  assert.doesNotMatch(renderOpponent(CUS, full({ ranges })), /Posizione finale possibile/);
  const zoned = new Map(Array.from({ length: 12 }, (_, i) => [`T${i}`, { best: i < 6 ? 1 : 10, worst: i < 6 ? 6 : 12 }]));
  assert.match(renderOpponent("T0", full({ ranges: zoned })), /fra la 1ª e la 6ª · matematicamente ai playoff/);
  assert.match(renderOpponent("T9", full({ ranges: zoned })), /matematicamente ai playout/);
  assert.doesNotMatch(renderOpponent(TEAM, full()), /Posizione finale possibile/);
});

test("card: performance block with home/away records, streak, margin and widest games", () => {
  const html = renderOpponent(TEAM, full());

  assert.match(html, /<summary>Rendimento in casa e in trasferta<\/summary>/);
  assert.match(html, /<li>In casa 0-1 · In trasferta 1-0<\/li>/);
  assert.match(html, /<li>Serie in corso: 1 vittoria<\/li>/);
  assert.match(html, /<li>Scarto medio: \+3,5 punti a partita<\/li>/);
  assert.match(html, /Vittoria più larga: 75-60 con SEF Torres \(2ª and\.\)/);
  assert.match(html, /Sconfitta più larga: 58-66 con CUS Cagliari \(1ª and\.\)/);
  assert.doesNotMatch(renderOpponent("POL. DINAMO", full()), /Rendimento in casa/);
});

test("card: a game ban with the games left, marked as an estimate", () => {
  const html = renderOpponent(TEAM, full());

  assert.match(html, /<li>Mario Rossi: 2 gare di squalifica \(1ª and\.\), <b>ancora 1 gara da scontare<\/b><\/li>/);
  assert.match(html, /stimate contando le partite giocate/);
  assert.doesNotMatch(renderOpponent("SEF TORRES", full()), /Squalifiche/);
});

test("card: roster with role and birth year under the name, games, points, average and best game", () => {
  const players = [["o1", "Rossi Luca", 18], ["o2", "Bianchi", null]].map(([id, nm, pts]) => ({ id, number: "", name: nm, role: id === "o1" ? "play" : "", age: id === "o1" ? "'04" : "", pts }));
  const boxscores = { 1: { fip_score: { home: 58, away: 66 }, home: { team: "Olimpia", players }, away: { team: "CUS", players: [] } } };
  const html = renderOpponent(TEAM, full({ boxscores }));

  assert.match(html, /<td>Rossi Luca<small>play · classe 2004<\/small><\/td><td>1<\/td><td>18<\/td><td>18,0<\/td><td>18<\/td>/);
  assert.match(html, /<td>Bianchi<\/td><td>0<\/td><td>0<\/td><td>-<\/td><td>-<\/td>/);
  assert.match(html, /<p class="roster">Rosa: 2 giocatori a referto/);
});

test("card: playbasket roles are escaped in the roster line and in the table", () => {
  const players = [{ id: "x1", number: "", name: "Ostile", role: "<img src=x onerror=alert(1)>", age: "", pts: 2 }];
  const boxscores = { 1: { fip_score: { home: 58, away: 66 }, home: { team: "Olimpia", players }, away: { team: "CUS", players: [] } } };
  const html = renderOpponent(TEAM, full({ boxscores }));

  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /1 &lt;img src=x onerror=alert\(1\)&gt;/);
});
