import assert from "node:assert/strict";
import { test } from "node:test";

import { crestHtml, renderRoundTable, renderStandings } from "../../docs/tables-view.js";

process.env.TZ = "Europe/Rome";

const CUS = "CUS CAGLIARI";
const row = (position, team, extra = {}) => ({
  position, team, points: 2, played: 1, won: 1, lost: 0, points_for: 70, points_against: 60, ...extra,
});
const table = (n) => Array.from({ length: n }, (_, i) => row(i + 1, i === 8 ? CUS : `TEAM ${i + 1}`));
const LOGOS = { [CUS]: { file: "logos/cus-cagliari.png" } };
const fipGame = (n, home, away, extra = {}) => ({
  n, date: "2026-10-03", time: "18:00", home, away, score: { home: 70, away: 60 }, status: "omologata", referees: [], ...extra,
});
const entry = { status: "complete", url: null, home: { players: [{ id: "a", name: "Rossi", pts: 10 }] }, away: { players: [] } };

test("standings: zone label rows open the playoff and the playout zone", () => {
  const html = renderStandings(table(12), CUS, LOGOS);
  const labels = [...html.matchAll(/<tr class="zone-row"><td colspan="9">([^<]+)</g)].map((m) => m[1]);

  assert.deepEqual(labels, ["Zona playoff: prime 8 (formula 2025/26)", "Zona playout: ultime 3 (formula 2025/26)"]);
  assert.ok(html.indexOf("Zona playout") < html.indexOf(">10</td>"));
  assert.ok(html.indexOf("Zona playout") > html.indexOf(">9</td>"));
});

test("standings: a crest when the club uploaded one, its initials otherwise", () => {
  const html = renderStandings(table(12), CUS, LOGOS);

  assert.match(html, /<img class="crest " src="logos\/cus-cagliari\.png"[^>]*><span>CUS Cagliari<\/span>/);
  assert.match(html, /<span class="initials" aria-hidden="true">T1<\/span><span>Team 1<\/span>/);
});

test("standings: points difference signed, PF and PS marked to hide on phones", () => {
  const rows = [row(1, "A", { points_for: 77, points_against: 61 }), row(2, "B", { points_for: 55, points_against: 62 }), row(3, "C", { points_for: 60, points_against: 60 })];
  const html = renderStandings(rows, CUS, {});

  assert.match(html, /<td class="pfps">77<\/td><td class="pfps">61<\/td><td>\+16<\/td>/);
  assert.match(html, /<td class="pfps">55<\/td><td class="pfps">62<\/td><td>-7<\/td>/);
  assert.match(html, /<td class="pfps">60<\/td><td class="pfps">60<\/td><td>0<\/td>/);
});

test("standings: before the first round only a sentence, no table", () => {
  const html = renderStandings(table(12).map((r) => ({ ...r, played: 0 })), CUS, LOGOS);

  assert.match(html, /disponibile dopo la prima giornata/);
  assert.doesNotMatch(html, /<table/);
});

test("crest: nothing for a team without a plain logos/ file", () => {
  assert.equal(crestHtml({ X: { file: "https://evil.example/x.png" } }, "X"), "");
});

test("round table: the winner in bold, team names in title case", () => {
  const html = renderRoundTable({ games: [fipGame(1, "POL. DINAMO", "BASKET ANTONIANUM", { score: { home: 66, away: 69 } })] }, CUS, {});

  assert.match(html, /<td>Pol\. Dinamo - <b>Basket Antonianum<\/b><\/td>/);
});

test("round table: referees and box score sit in a closed row opened by the result cell", () => {
  const game = fipGame(6, "BASKET S. ORSOLA", CUS, { referees: ["ROSSI MARIO di CAGLIARI (CA)"] });
  const html = renderRoundTable({ games: [game] }, CUS, { 6: entry });

  assert.match(html, /<button type="button" class="tbx" aria-expanded="false" aria-controls="gx-6">Tabellino<\/button>/);
  assert.match(html, /<tr class="gx-row" id="gx-6" hidden><td colspan="3"><p class="refs">Arbitri: ROSSI MARIO di CAGLIARI \(CA\)<\/p><div class="teams">/);
});

test("round table: referees alone open as «Arbitri», a game with neither has no button", () => {
  const withRefs = fipGame(1, "A", "B", { referees: ["X"] });
  const bare = fipGame(2, "C", "D", { score: null });
  const html = renderRoundTable({ games: [withRefs, bare] }, CUS, {});

  assert.match(html, /aria-controls="gx-1">Arbitri<\/button>/);
  assert.doesNotMatch(html, /gx-2/);
  assert.match(html, /<td>C - D<\/td><td>18:00<\/td>/);
});

test("round table: sanctions closed under a count, each with its game", () => {
  const fined = fipGame(1, "A", "B", { sanctions: ["Ammenda 1", "Ammenda 2"] });
  const html = renderRoundTable({ games: [fined, fipGame(2, "C", "D")] }, CUS, {});

  assert.match(html, /<details class="sanc"><summary>Provvedimenti del Giudice Sportivo \(2\)<\/summary><ul><li><b>A - B:<\/b> Ammenda 1<\/li>/);
});

const fullRanges = (rows) => new Map(rows.map((r) => [r.team, { best: 1, worst: rows.length }]));

test("standings: with every position still open, no 'Possibile' column and no 'Già deciso' block", () => {
  const rows = table(12);
  const html = renderStandings(rows, CUS, LOGOS, fullRanges(rows));

  assert.equal(html, renderStandings(rows, CUS, LOGOS));
  assert.doesNotMatch(html, /Possibile|Già deciso/);
});

test("standings: once a range narrows, every row shows its possible positions and zone rows span the new column", () => {
  const rows = table(12);
  const ranges = fullRanges(rows);
  ranges.set("TEAM 1", { best: 1, worst: 1 }).set("TEAM 2", { best: 2, worst: 5 });
  const html = renderStandings(rows, CUS, LOGOS, ranges);

  assert.match(html, /<th class="poss"><abbr title="Posizioni finali ancora possibili">Poss\.<\/abbr><\/th><\/tr>/);
  assert.match(html, /<td>\+10<\/td><td class="poss">1ª<\/td><\/tr>/);
  assert.match(html, /<td class="poss">2ª-5ª<\/td>/);
  assert.match(html, /<td class="poss">1ª-12ª<\/td>/);
  assert.match(html, /<tr class="zone-row"><td colspan="10">Zona playoff/);
});

test("standings: 'Già deciso' groups teams by what is settled, in standings order, the CUS name marked", () => {
  const rows = table(12);
  const ranges = fullRanges(rows);
  ranges.set("TEAM 1", { best: 1, worst: 1 }).set("TEAM 2", { best: 2, worst: 6 }).set("TEAM 3", { best: 2, worst: 8 })
    .set(CUS, { best: 9, worst: 9 }).set("TEAM 12", { best: 10, worst: 12 }).set("TEAM 11", { best: 9, worst: 12 });
  const html = renderStandings(rows, CUS, LOGOS, ranges);
  const items = [...html.matchAll(/<li><b>([^<]+)<\/b>: (.+?)<\/li>/g)].map((m) => [m[1], m[2]]);

  assert.deepEqual(items, [
    ["Matematicamente 1ª, ai playoff", "Team 1."],
    ["Matematicamente ai playoff", "Team 2, Team 3."],
    ["Matematicamente 9ª, fuori dai playoff, salva dai playout", '<span class="me">CUS Cagliari</span>.'],
    ["Matematicamente fuori dai playoff", "Team 11."],
    ["Matematicamente ai playout", "Team 12."],
  ]);
  assert.ok(html.indexOf("Già deciso") < html.indexOf("<table"));
  assert.match(html, /art\. 62 del Regolamento Esecutivo Gare/);
});

test("standings: on phones the possible positions move under the team name", () => {
  const rows = table(12);
  const ranges = fullRanges(rows).set("TEAM 1", { best: 1, worst: 2 });
  const html = renderStandings(rows, CUS, LOGOS, ranges);

  assert.match(html, /<span>Team 1<small class="poss-sm">Possibile 1ª-2ª<\/small><\/span>/);
  assert.match(html, /<th class="poss"><abbr title="Posizioni finali ancora possibili">Poss\.<\/abbr><\/th>/);
  assert.doesNotMatch(renderStandings(rows, CUS, LOGOS), /poss-sm/);
});
