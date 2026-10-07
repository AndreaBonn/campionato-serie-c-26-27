import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { loadBoxscores, renderGameBoxscore, renderScorers } from "../../docs/boxscores.js";

const CUS = "CUS CAGLIARI";
const player = (id, name, pts) => ({ id, number: "", name, role: "", age: "", pts });
const side = (...players) => ({ team: "playbasket name", players });
const game = (n, home = CUS, away = "OPPONENT") => ({ n, home, away, date: "2026-10-03" });
const entry = (overrides = {}) => ({
  round: "A1",
  status: "complete",
  fip_score: { home: 62, away: 55 },
  mn: 1,
  url: "https://www.playbasket.it/sardegna/match.php?mn=1",
  home: side(player("h1", "Rossi", 10)),
  away: side(player("a1", "Bianchi", null)),
  ...overrides,
});
// n players of the home side of game 1, each with a different score so the order is fixed
const manyScorers = (n) => ({
  rounds: [{ round: "A1", games: [game(1)] }],
  boxscores: { 1: entry({ home: side(...Array.from({ length: n }, (_, i) => player(`p${i}`, `P${i}`, 100 - i))), away: side() }) },
});
const rowsOf = (html) => html.match(/<tr class="[^"]*"><td>\d+<\/td>/g) ?? [];

test("scorers: before the first box score the section explains when the table appears", () => {
  const html = renderScorers({}, [], CUS);

  assert.match(html, /disponibile dopo il primo tabellino/);
  assert.doesNotMatch(html, /<table/);
});

test("scorers: the first 20 rows are visible, the rest go under «Mostra tutti» numbered from 21", () => {
  const { boxscores, rounds } = manyScorers(21);
  const html = renderScorers(boxscores, rounds, CUS);
  const [visible, more] = html.split('<details class="scorers-more">');

  assert.equal(rowsOf(visible).length, 20);
  assert.equal(rowsOf(more).length, 1);
  assert.match(more, /<td>21<\/td><td>P20<\/td>/);
});

test("scorers: with exactly 20 players there is no «Mostra tutti»", () => {
  const { boxscores, rounds } = manyScorers(20);
  const html = renderScorers(boxscores, rounds, CUS);

  assert.equal(rowsOf(html).length, 20);
  assert.doesNotMatch(html, /Mostra tutti/);
});

test("scorers: the note counts the incomplete box scores, and is silent when there are none", () => {
  const rounds = [{ round: "A1", games: [game(1), game(2, "X", "Y")] }];
  const partial = { 1: entry({ status: "partial" }), 2: entry({ status: "incomplete" }) };
  const complete = { 1: entry(), 2: entry() };

  assert.match(renderScorers(partial, rounds, CUS), / 2 tabellini incompleti\./);
  assert.match(renderScorers(complete, rounds, CUS), /anche 0\)\.<\/p>/);
  assert.doesNotMatch(renderScorers(complete, rounds, CUS), /incompleti/);
});

test("scorers: CUS rows are highlighted, averages in Italian format, a dash for a player who never entered", () => {
  const rounds = [{ round: "A1", games: [game(1)] }, { round: "A2", games: [game(2, "X", CUS)] }];
  const boxscores = {
    1: entry({ home: side(player("p", "Rossi", 10)), away: side(player("o", "Other", null)) }),
    2: entry({ home: side(), away: side(player("p", "Rossi", 3)) }),
  };
  const html = renderScorers(boxscores, rounds, CUS);

  assert.match(html, /<tr class="me"><td>1<\/td><td>Rossi<\/td><td>CUS CAGLIARI<\/td><td>13<\/td><td>2<\/td><td>6,5<\/td>/);
  assert.match(html, /<tr class=""><td>2<\/td><td>Other<\/td><td>OPPONENT<\/td><td>0<\/td><td>0<\/td><td>-<\/td>/);
});

test("scorers: names from playbasket.it are escaped", () => {
  const rounds = [{ round: "A1", games: [game(1)] }];
  const boxscores = { 1: entry({ home: side(player("x", "<img src=x onerror=alert(1)>", 5)), away: side() }) };
  const html = renderScorers(boxscores, rounds, CUS);

  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test("game box score: nothing for a game without an entry or with an unmatched one", () => {
  assert.equal(renderGameBoxscore({}, game(1)), "");
  assert.equal(renderGameBoxscore({ 1: entry({ status: "unmatched", home: null, away: null, url: null }) }, game(1)), "");
});

test("game box score: both rosters under the FIP names, a dash for who never entered, the source linked", () => {
  const html = renderGameBoxscore({ 1: entry() }, game(1));

  assert.match(html, /<caption>CUS CAGLIARI<\/caption>.*<td>Rossi<\/td><td>10<\/td>/);
  assert.match(html, /<caption>OPPONENT<\/caption>.*<td>Bianchi<\/td><td>-<\/td>/);
  assert.match(html, /href="https:\/\/www\.playbasket\.it\/sardegna\/match\.php\?mn=1"/);
  assert.doesNotMatch(html, /Tabellino incompleto/);
});

test("game box score: an incomplete one is labelled, an empty roster says so, a foreign link is dropped", () => {
  const html = renderGameBoxscore({ 1: entry({ status: "partial", away: side(), url: "https://evil.example/" }) }, game(1));

  assert.match(html, /Tabellino incompleto/);
  assert.match(html, /Nessun giocatore a referto\./);
  assert.doesNotMatch(html, /evil\.example|Tabellino su playbasket/);
});

const realFetch = globalThis.fetch;
const realWarn = console.warn;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});
const stubFetch = (respond) => {
  const warnings = [];
  globalThis.fetch = async () => respond();
  console.warn = (...args) => warnings.push(args.join(" "));
  return warnings;
};

test("load box scores: the parsed dict reaches the page, an empty one when the key is missing", async () => {
  const applied = [];
  stubFetch(() => new Response(JSON.stringify({ boxscores: { 1: entry() } })));
  await loadBoxscores((b) => applied.push(b));
  stubFetch(() => new Response("{}"));
  await loadBoxscores((b) => applied.push(b));

  assert.deepEqual(applied, [{ 1: entry() }, {}]);
});

test("load box scores: an HTTP error or a network failure leaves the page untouched and logs why", async () => {
  const applied = [];
  const httpWarnings = stubFetch(() => new Response("missing", { status: 404 }));
  await loadBoxscores((b) => applied.push(b));
  const networkWarnings = stubFetch(() => { throw new TypeError("offline"); });
  await loadBoxscores((b) => applied.push(b));

  assert.deepEqual(applied, []);
  assert.deepEqual(httpWarnings, ["boxscores.json non disponibile: HTTP 404"]);
  assert.match(networkWarnings[0], /offline/);
});

test("game box score: role and age under the name when published, nothing when both are missing", () => {
  const withMeta = { ...player("h1", "Rossi", 10), role: "play", age: "'07" };
  const html = renderGameBoxscore({ 1: entry({ home: side(withMeta) }) }, game(1));

  assert.match(html, /<td>Rossi<small class="role">play, &#39;07<\/small><\/td>/);
  assert.match(html, /<td>Bianchi<\/td>/);
});
