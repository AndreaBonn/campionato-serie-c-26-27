import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCard, renderForm, renderLast, renderList, renderNext } from "../../docs/games-view.js";
import { formSummary } from "../../docs/page-rules.js";

process.env.TZ = "Europe/Rome";

const CUS = "CUS CAGLIARI";
const TODAY = new Date("2026-10-08T00:00:00");
function game(n, date, overrides = {}) {
  return {
    round: "A" + n, n, home: "CUS Cagliari", away: "Avversario " + n, is_home: true, fip_opponent: "AVVERSARIO " + n,
    date, time: "18:00", venue: { name: "PALACUS", address: "Via Is Mirrionis 3 - 9 09123 CAGLIARI (CA)" },
    official: { date, time: "18:00", venue: { name: "PALACUS" } }, changes: [], status: "non-designata",
    status_text: "", referees: [], score: null, ...overrides,
  };
}
const played = (n, date, home, away, overrides = {}) => game(n, date, { score: { home, away }, status: "omologata", ...overrides });
const context = (games, overrides = {}) => ({
  games, rounds: [], standings: [], logos: {}, boxscores: {}, today: TODAY, fipTeam: CUS, breaks: [], ...overrides,
});
const gamesIn = (html) => [...html.matchAll(/Gara n\. (\d+)/g)].map((m) => Number(m[1]));

test("list: «Prossime» leaves out the next game, already in the hero box", () => {
  const ctx = context([played(1, "2026-10-03", 55, 62), game(2, "2026-10-11"), game(3, "2026-10-18")]);

  assert.deepEqual(gamesIn(renderList(ctx, "all", "upcoming")), [3]);
  assert.deepEqual(gamesIn(renderList(ctx, "all", "all")), [1, 2, 3]);
});

test("list: «Giocate» shows played games newest first", () => {
  const ctx = context([played(1, "2026-10-03", 55, 62), played(2, "2026-10-05", 70, 60), game(3, "2026-10-18")]);

  assert.deepEqual(gamesIn(renderList(ctx, "all", "played")), [2, 1]);
});

test("list: empty states say why, the next game alone points to the hero box", () => {
  const onlyNext = context([game(2, "2026-10-11")]);
  const none = context([game(2, "2026-10-11")]);

  assert.match(renderList(onlyNext, "all", "upcoming"), /L'unica partita da giocare con questo filtro è la prossima, in alto\./);
  assert.match(renderList(none, "all", "played"), /Nessuna partita giocata con questo filtro\./);
});

test("card: a result says «Vinta» or «Persa» in words, not only in colour", () => {
  const ctx = context([]);

  assert.match(renderCard(played(1, "2026-10-03", 70, 60), ctx), /<span class="score win">70-60<\/span><span class="vp win">Vinta<\/span>/);
  assert.match(renderCard(played(2, "2026-10-03", 55, 62), ctx), /<span class="vp loss">Persa<\/span>/);
});

test("card: round on top, game number at the bottom, a moved game tagged «Spostata»", () => {
  const html = renderCard(game(17, "2026-10-18", { round: "A3", changes: ["time"], official: { date: "2026-10-18", time: "17:00", venue: { name: "PALACUS" } } }), context([]));

  assert.match(html, /<div class="rnd">3ª giornata di andata<\/div>/);
  assert.match(html, /<span class="tag chg">Spostata<\/span>/);
  assert.match(html, /<div class="meta">Gara n\. 17, arbitri non ancora designati<\/div>/);
});

test("card: the CUS box score opens inside a played game's card, none before it exists", () => {
  const m = played(6, "2026-10-03", 55, 62);
  const boxscores = { 6: { status: "complete", url: null, home: { players: [{ id: "a", name: "Rossi", pts: 15 }] }, away: { players: [] } } };

  assert.match(renderCard(m, context([], { boxscores })), /<details class="cardbox"><summary>Tabellino<\/summary>.*<td>Rossi<\/td><td>15<\/td>/s);
  assert.doesNotMatch(renderCard(m, context([])), /cardbox/);
});

test("hero: countdown in words, directions and calendar links, a share button", () => {
  const html = renderNext(context([game(2, "2026-10-09")]));

  assert.match(html, /<div class="w"><b>Domani<\/b><small>ore 18:00<\/small><\/div>/);
  assert.match(html, /class="primary" href="https:\/\/www\.google\.com\/maps\/search\/[^"]*"[^>]*>.*Indicazioni<\/a>/);
  assert.match(html, /href="https:\/\/calendar\.google\.com\/[^"]*"[^>]*>.*Calendario<\/a>/);
  assert.match(html, /<button type="button" id="share">.*Condividi<\/button>/);
});

test("last result: the latest played game with its verdict, nothing before the first", () => {
  const html = renderLast(context([played(1, "2026-10-03", 55, 62), played(2, "2026-10-05", 70, 60), game(3, "2026-10-18")]));

  assert.match(html, /^<span class="vp win">Vinta<\/span>.*Ultimo risultato · 2ª giornata di andata.*<div class="res">70-60<\/div>/);
  assert.equal(renderLast(context([game(3, "2026-10-18")])), "");
});

test("form strip: «Ultima» for one game, no zero split for a side not played yet", () => {
  const html = renderForm(formSummary([played(1, "2026-10-03", 62, 55, { is_home: false })]));

  assert.match(html, /<b>0-1<\/b> vinte e perse/);
  assert.match(html, /Ultima: <span class="badge loss"/);
  assert.match(html, /<span class="meta">In trasferta 0-1<\/span>/);
  assert.doesNotMatch(html, /In casa/);
});

test("list: the hero hint only when the next game matches the home/away filter", () => {
  const ctx = context([game(2, "2026-10-11", { is_home: false })]);

  assert.match(renderList(ctx, "home", "upcoming"), /Nessuna partita con questo filtro\./);
  assert.match(renderList(ctx, "away", "upcoming"), /è la prossima, in alto/);
});
