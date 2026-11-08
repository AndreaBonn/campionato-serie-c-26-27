import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCusPlayers } from "../../docs/cus-stats.js";

// the page runs in Italian browsers: dates are local wall-clock times in Rome
process.env.TZ = "Europe/Rome";

const TEAM = "CUS CAGLIARI";
const SCORE = { home: 80, away: 60 };
const player = (id, pts) => ({ id, name: id, role: "play", age: "'07", pts });
const side = (...players) => ({ team: "Playbasket name", players });
const round = (n, date) => ({ round: "A" + n, games: [{ n, date, home: TEAM, away: "OPPONENT " + n, score: SCORE }] });
const boxscore = (players, status = "complete") => ({ status, fip_score: SCORE, home: side(...players), away: side() });

test("CUS players: before the first CUS box score the section explains when the stats appear", () => {
  const html = renderCusPlayers({}, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /disponibili dopo il primo tabellino del CUS/);
  assert.doesNotMatch(html, /<table/);
});

test("CUS players: the intro uses the singular for one game and leaves out a zero incomplete count", () => {
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", 10)]) }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /Tabellini disponibili per 1 partita su 1 giocata dal CUS\./);
  assert.doesNotMatch(html, /di cui/);
});

test("CUS players: the intro uses the plural and counts incomplete box scores in its own number", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const one = { 1: boxscore([player("Rossi", 10)]), 2: boxscore([player("Rossi", 8)], "partial") };
  const two = { ...one, 3: boxscore([player("Rossi", 8)], "incomplete") };

  assert.match(renderCusPlayers(one, rounds, TEAM), /per 2 partite su 3 giocate dal CUS, di cui 1 incompleto\./);
  assert.match(renderCusPlayers(two, rounds, TEAM), /per 3 partite su 3 giocate dal CUS, di cui 2 incompleti\./);
});

test("CUS players: summary row with Italian averages, entered/with box score and team share", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("Rossi", 12), player("Verdi", 68)]), 2: boxscore([player("Rossi", 1)]),
    3: boxscore([player("Rossi", null)]) };
  const html = renderCusPlayers(boxscores, rounds, TEAM);

  // 13 points over 2 games entered out of 3 box scores; 13 of the 81 CUS points in Rossi's box scores
  assert.match(html, /<td><button[^>]*>Rossi<\/button><small class="role">play, &#39;07<\/small><\/td><td>13<\/td><td>6,5<\/td>.*?<td>2\/3<\/td><td class="opt">1<\/td><td class="opt">16%<\/td>/);
});

test("CUS players: last games show «assente», a dash for listed but not entered, the points otherwise", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("Rossi", 12)]), 2: boxscore([player("Rossi", null)]),
    3: boxscore([player("Verdi", 4)]) };
  const html = renderCusPlayers(boxscores, rounds, TEAM);
  const rossi = html.match(/>Rossi<\/button>.*?<tr class="pl-detail"[^>]*>(.*?)<\/tr>/)[1];

  assert.match(rossi, /<li>sab 3 ott vs Opponent 1: 12<\/li>/);
  assert.match(rossi, /<li>sab 10 ott vs Opponent 2: -<\/li>/);
  assert.match(rossi, /<li>sab 17 ott vs Opponent 3: assente<\/li>/);
});

test("CUS players: best game named, or a sentence when the player never scored", () => {
  const rounds = [round(1, "2026-10-03")];
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", 12), player("Neri", null)]) }, rounds, TEAM);

  assert.match(html, />Rossi<\/button>.*?<p>Miglior partita: 12 punti contro Opponent 1, sab 3 ott\.<\/p>/);
  assert.match(html, />Neri<\/button>.*?<p>Miglior partita: nessuna partita con punti a referto\.<\/p>/);
});

test("CUS players: a dash for an average with no game behind it, no role line when none is published", () => {
  const html = renderCusPlayers({ 1: boxscore([{ id: "Rossi", name: "Rossi", role: "", age: "", pts: 9 }]) },
    [round(1, "2026-10-03")], TEAM);

  // home games only: the away average has no game to divide by
  assert.match(html, /<td><button[^>]*>Rossi<\/button><\/td><td>9<\/td><td>9,0<\/td><td class="opt">9,0<\/td><td class="opt">-<\/td>/);
});

test("CUS players: team share is a dash when no CUS point is recorded in the player's box scores", () => {
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", null)], "partial") }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /<td>0\/1<\/td><td class="opt">0<\/td><td class="opt">-<\/td><\/tr>/);
});

test("CUS players: each name toggles its own detail row, closed until opened", () => {
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", 12), player("Neri", 3)]) }, [round(1, "2026-10-03")], TEAM);
  const buttons = [...html.matchAll(/<button type="button" class="pl-btn" aria-expanded="false" aria-controls="(pl-\d+)">/g)].map((m) => m[1]);
  const details = [...html.matchAll(/<tr class="pl-detail" id="(pl-\d+)" hidden>/g)].map((m) => m[1]);

  assert.deepEqual(buttons, ["pl-0", "pl-1"]);
  assert.deepEqual(details, buttons);
  assert.doesNotMatch(html, /<details class="cus-player">/);
});

test("CUS players: a roster line gives average age, birth-year range and roles with Italian plurals", () => {
  const players = [
    { id: "a", name: "a", role: "ala piccola", age: "'91", pts: 4 },
    { id: "b", name: "b", role: "ala piccola", age: "'07", pts: 6 },
    { id: "c", name: "c", role: "play", age: "'04", pts: 8 },
  ];
  const html = renderCusPlayers({ 1: boxscore(players) }, [round(1, "2026-10-03")], TEAM);

  // ages in 2026: 35, 19, 22
  assert.match(html, /<p class="roster">Rosa: 3 giocatori a referto, età media 25,3 anni \(nati fra il 1991 e il 2007\)\. Ruoli: 1 play, 2 ali piccole\.<\/p>/);
});

test("CUS players: the roster line says how many players lack age or role, and leaves out a zero count", () => {
  const players = [
    { id: "a", name: "a", role: "centro", age: "'00", pts: 4 },
    { id: "b", name: "b", role: "", age: "", pts: 6 },
  ];
  const html = renderCusPlayers({ 1: boxscore(players) }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /Ruoli: 1 centro\. Età e ruolo mancanti su playbasket\.it per 1 giocatore\.<\/p>/);

  const full = renderCusPlayers({ 1: boxscore([players[0]]) }, [round(1, "2026-10-03")], TEAM);
  assert.match(full, /Ruoli: 1 centro\.<\/p>/);
  assert.doesNotMatch(full, /mancant/);
});

test("CUS players: different missing counts for age and role are given separately", () => {
  const players = [
    { id: "a", name: "a", role: "", age: "'00", pts: 4 },
    { id: "b", name: "b", role: "", age: "", pts: 6 },
  ];
  const html = renderCusPlayers({ 1: boxscore(players) }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /età media 26 anni \(nati nel 2000\)\. Età mancante per 1 giocatore, ruolo per 2 giocatori\.<\/p>/);
});

test("CUS players: a player name from playbasket.it is escaped in the table", () => {
  const hostile = "<img src=x onerror=alert(1)>";
  const html = renderCusPlayers({ 1: boxscore([player(hostile, 12), player("Rossi", 4)]) }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /<button type="button" class="pl-btn"[^>]*>&lt;img src=x onerror=alert\(1\)&gt;<\/button>/);
  assert.match(html, />Rossi<\/button>/);
  assert.doesNotMatch(html, /<img/);
});

test("CUS players: the detail row gives the average in wins and in losses, each in its own place", () => {
  const lost = { round: "A2", games: [{ n: 2, date: "2026-10-10", home: TEAM, away: "OPPONENT 2", score: { home: 50, away: 60 } }] };
  const rounds = [round(1, "2026-10-03"), lost, round(3, "2026-10-17")];
  const boxscores = {
    1: boxscore([player("Rossi", 20)]),
    2: { status: "complete", fip_score: { home: 50, away: 60 }, home: side(player("Rossi", 6)), away: side() },
    3: boxscore([player("Rossi", 10)]),
  };

  const html = renderCusPlayers(boxscores, rounds, TEAM);

  assert.match(html, /<p>Media nelle vittorie: 15,0 · Media nelle sconfitte: 6,0\.<\/p>/);
});

test("CUS players: a dash for the average in losses of a player who never lost", () => {
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", 12)]) }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /<p>Media nelle vittorie: 12,0 · Media nelle sconfitte: -\.<\/p>/);
});
