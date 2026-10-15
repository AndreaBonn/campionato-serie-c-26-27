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
const BOXSCORES = { 2: { home: side("Nuoro", ["n1", "Nuorese", 20]), away: side("Olimpia", ["o1", "Rossi Luca", 18], ["o2", "Bianchi", 4]) } };
const ctx = (overrides = {}) => ({ rounds: ROUNDS, standings: STANDINGS, logos: {}, boxscores: BOXSCORES, boxscoresLoad: "ready", ...overrides });

test("card: heading with title-cased name, position, record and averages", () => {
  const html = renderOpponent(TEAM, ctx());

  assert.match(html, /<h2 id="opp-title">Olimpia Cagliari<\/h2>/);
  assert.match(html, /4ª in classifica/);
  assert.match(html, /1 vinta, 1 persa/);
  assert.match(html, /62,5 fatti, 62,5 subiti di media/);
});

test("card: one row per game, score from the team's side, unofficial results tagged", () => {
  const html = renderOpponent(TEAM, ctx());

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
  assert.match(renderOpponent(TEAM, ctx({ boxscoresLoad: "loading" })), /Marcatori in caricamento/);
  assert.match(renderOpponent(TEAM, ctx({ boxscores: {} })), /Nessun tabellino disponibile/);
  assert.match(renderOpponent(TEAM, ctx({ boxscores: {}, boxscoresLoad: "failed" })), /Tabellini non raggiungibili/);
  const html = renderOpponent(TEAM, ctx());
  assert.match(html, /<td>Rossi Luca<\/td><td>18<\/td><td>1<\/td><td>18,0<\/td>/);
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
