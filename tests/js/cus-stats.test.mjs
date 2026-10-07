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
  assert.match(html, /<td>Rossi<small class="role">play, &#39;07<\/small><\/td><td>13<\/td><td>6,5<\/td>.*?<td>2\/3<\/td><td>1<\/td><td>16%<\/td>/);
});

test("CUS players: last games show «assente», a dash for listed but not entered, the points otherwise", () => {
  const rounds = [round(1, "2026-10-03"), round(2, "2026-10-10"), round(3, "2026-10-17")];
  const boxscores = { 1: boxscore([player("Rossi", 12)]), 2: boxscore([player("Rossi", null)]),
    3: boxscore([player("Verdi", 4)]) };
  const html = renderCusPlayers(boxscores, rounds, TEAM);
  const rossi = html.match(/<details class="cus-player"><summary>Rossi<\/summary>.*?<\/details>/)[0];

  assert.match(rossi, /<li>sab 3 ott vs OPPONENT 1: 12<\/li>/);
  assert.match(rossi, /<li>sab 10 ott vs OPPONENT 2: -<\/li>/);
  assert.match(rossi, /<li>sab 17 ott vs OPPONENT 3: assente<\/li>/);
});

test("CUS players: best game named, or a sentence when the player never scored", () => {
  const rounds = [round(1, "2026-10-03")];
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", 12), player("Neri", null)]) }, rounds, TEAM);

  assert.match(html, /<summary>Rossi<\/summary><p>Miglior partita: 12 punti contro OPPONENT 1, sab 3 ott\.<\/p>/);
  assert.match(html, /<summary>Neri<\/summary><p>Miglior partita: nessuna partita con punti a referto\.<\/p>/);
});

test("CUS players: a dash for an average with no game behind it, no role line when none is published", () => {
  const html = renderCusPlayers({ 1: boxscore([{ id: "Rossi", name: "Rossi", role: "", age: "", pts: 9 }]) },
    [round(1, "2026-10-03")], TEAM);

  // home games only: the away average has no game to divide by
  assert.match(html, /<tr><td>Rossi<\/td><td>9<\/td><td>9,0<\/td><td>9,0<\/td><td>-<\/td>/);
});

test("CUS players: team share is a dash when no CUS point is recorded in the player's box scores", () => {
  const html = renderCusPlayers({ 1: boxscore([player("Rossi", null)], "partial") }, [round(1, "2026-10-03")], TEAM);

  assert.match(html, /<td>0\/1<\/td><td>0<\/td><td>-<\/td><\/tr>/);
});
