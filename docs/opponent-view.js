// Content of the opponent card dialog: profile, games, scorers and sanctions of one team.
// Imperative shell over opponent-rules.js; ctx = { rounds, standings, logos, boxscores, boxscoresLoad }.
import { esc, teamProfile } from "./page-rules.js";
import { resultNote } from "./result-rules.js";
import { displayTeamName } from "./view-rules.js";
import { crestHtml } from "./tables-view.js";
import { badges, count, dec } from "./games-view.js";
import { opponentGames, opponentSanctions, scorersState } from "./opponent-rules.js";

const name = (team) => esc(displayTeamName(team));
const shortRound = (round) => esc(round.slice(1)) + "ª " + (round[0] === "A" ? "and." : "rit.");
const section = (title, body) => `<section><h3>${title}</h3>${body}</section>`;
const empty = (text) => `<p class="opp-empty">${text}</p>`;

function head(team, ctx) {
  const p = teamProfile(team, ctx.rounds, ctx.standings);
  const pos = p?.position ? `${p.position}ª in classifica` : "Non ancora in classifica";
  const record = p ? `<p>${count(p.won, "vinta", "vinte")}, ${count(p.lost, "persa", "perse")} · ${dec(p.avgFor)} fatti, ${dec(p.avgAgainst)} subiti di media</p><div class="badges">${badges(p.last)}</div>` : "";
  return `<header class="opp-head">${crestHtml(ctx.logos, team)}<div><h2 id="opp-title">${name(team)}</h2><p>${pos}</p>${record}</div></header>`;
}

function gameRow(g) {
  const note = resultNote(g.status), tag = note ? ` <span class="tag prov">${esc(note.tag)}</span>` : "";
  const vp = g.won ? '<span class="vp win">V</span>' : '<span class="vp loss">P</span>';
  return `<tr><td>${shortRound(g.round)}</td><td>${name(g.opponent)}</td><td>${g.isHome ? "Casa" : "Trasferta"}</td><td>${g.own}-${g.their} ${vp}${tag}</td></tr>`;
}

function games(team, ctx) {
  const rows = opponentGames(team, ctx.rounds);
  if (!rows.length) return section("Partite giocate", empty("Nessuna partita giocata finora: i risultati compaiono qui dopo la prima giornata."));
  const headRow = "<tr><th>Giornata</th><th>Avversario</th><th>Campo</th><th>Punti fatti-subiti</th></tr>";
  return section("Partite giocate", `<div class="scroll"><table class="opp-games"><thead>${headRow}</thead><tbody>${rows.map(gameRow).join("")}</tbody></table></div>`);
}

function scorers(team, ctx) {
  const { state, rows } = scorersState(ctx.boxscores, ctx.rounds, team, ctx.boxscoresLoad);
  if (state === "loading") return section("Marcatori", empty("Marcatori in caricamento…"));
  if (state === "failed") return section("Marcatori", empty("Tabellini non raggiungibili: controlla la connessione e riapri la scheda."));
  if (state === "empty") return section("Marcatori", empty("Nessun tabellino disponibile per questa squadra."));
  const avg = (r) => (r.average === null ? "-" : dec(r.average));
  const body = rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.points}</td><td>${r.played}</td><td>${avg(r)}</td></tr>`).join("");
  const table = `<div class="scroll"><table class="opp-scorers"><thead><tr><th>Giocatore</th><th>Punti</th><th>Gare</th><th>Media</th></tr></thead><tbody>${body}</tbody></table></div>`;
  return section("Marcatori", `${table}<p class="note">Punti dai tabellini inseriti dagli utenti di playbasket.it.</p>`);
}

const sanctionItem = (s) => `<li>${shortRound(s.round)}, gara ${s.n}: ${esc(s.text)}</li>`;

function sanctions(team, ctx) {
  const { own, unattributed } = opponentSanctions(team, ctx.rounds);
  const list = own.length ? `<ul>${own.map(sanctionItem).join("")}</ul>` : empty("Nessun provvedimento alla società nelle gare omologate.");
  const other = unattributed.length ? `<details class="sanc"><summary>Altri provvedimenti nelle sue gare (società non identificata)</summary><ul>${unattributed.map(sanctionItem).join("")}</ul></details>` : "";
  return section("Provvedimenti del Giudice Sportivo", `<div class="opp-sanc">${list}${other}</div>`);
}

export function renderOpponent(team, ctx) {
  return `${head(team, ctx)}${games(team, ctx)}${scorers(team, ctx)}${sanctions(team, ctx)}`;
}
