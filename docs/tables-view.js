// Rendering of the standings and of a round's results table: imperative shell over page-rules.js
// and view-rules.js. No state here: rows, logos and box scores all come from the caller.
import { esc, isStandingsCut, logoOf, safeFipPdfUrl, toDate, zoneLines, zoneStatus } from "./page-rules.js";
import { resultNote } from "./result-rules.js";
import { displayTeamName, teamInitials, zoneStarts } from "./view-rules.js";
import { renderBoxscoreBody } from "./boxscores.js";

const STANDINGS_COLUMNS = 9;
const ZONE_LABEL = { playoff: "Zona playoff: prime 8 (formula 2025/26)", playout: "Zona playout: ultime 3 (formula 2025/26)" };

export function crestHtml(logos, team, cls = "") {
  const file = logoOf(logos, team);
  return file ? `<img class="crest ${cls}" src="${esc(file)}" alt="" width="28" height="28" loading="lazy">` : "";
}

const signed = (n) => (n > 0 ? "+" + n : String(n));
const abbr = (short, long) => `<th><abbr title="${long}">${short}</abbr></th>`;

function standingsRow(r, rows, fipTeam, logos, starts) {
  const zone = starts.has(r.position) ? `<tr class="zone-row"><td colspan="${STANDINGS_COLUMNS}">${ZONE_LABEL[starts.get(r.position)]}</td></tr>` : "";
  const cls = `${r.team === fipTeam ? "me" : ""} ${isStandingsCut(r.position, rows.length) ? "cut" : ""}`;
  const mark = crestHtml(logos, r.team) || `<span class="initials" aria-hidden="true">${esc(teamInitials(r.team))}</span>`;
  return `${zone}<tr class="${cls}"><td>${r.position}</td><td><span class="tm">${mark}<span>${esc(displayTeamName(r.team))}</span></span></td><td>${r.points}</td><td>${r.played}</td><td>${r.won}</td><td>${r.lost}</td><td class="pfps">${r.points_for}</td><td class="pfps">${r.points_against}</td><td>${signed(r.points_for - r.points_against)}</td></tr>`;
}

export function renderStandings(rows, fipTeam, logos) {
  if (!rows.some((r) => r.played > 0)) return "<h2>Classifica</h2><p>La classifica sarà disponibile dopo la prima giornata.</p>";
  const z = zoneStatus(rows, fipTeam), zone = z ? `<ul class="zone">${zoneLines(z).map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : "";
  const starts = zoneStarts(rows.length);
  const body = rows.map((r) => standingsRow(r, rows, fipTeam, logos, starts)).join("");
  const head = `<tr><th>#</th><th>Squadra</th><th>Punti</th>${abbr("G", "Gare giocate")}${abbr("V", "Vinte")}${abbr("P", "Perse")}<th class="pfps"><abbr title="Punti fatti">PF</abbr></th><th class="pfps"><abbr title="Punti subiti">PS</abbr></th><th><abbr title="Differenza punti">+/-</abbr></th></tr>`;
  return `<h2>Classifica</h2>${zone}<div class="scroll"><table class="standings"><thead>${head}</thead><tbody>${body}</tbody></table></div>
 <p class="legend-mini">G giocate · V vinte · P perse · PF punti fatti · PS punti subiti · +/- differenza punti</p>
 <details class="howto"><summary>Come leggere la classifica</summary><p>Classifica ufficiale FIP: conta solo i risultati omologati dal Giudice Sportivo. Le linee separano le prime 8 e le ultime 3: nel 2025/26 erano le squadre ammesse a playoff e playout, la formula 2026/27 non è ancora nota. Le squadre compaiono con la denominazione registrata dalla FIP, che può includere lo sponsor; gli stemmi sono quelli caricati dalle società sul sito FIP, le iniziali stanno al posto di quelli mancanti.</p></details>`;
}

const day = (g) => toDate(g.date, g.time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const byTime = (a, b) => (a.date + a.time).localeCompare(b.date + b.time);

function winnerOf(g) {
  if (!g.score || g.score.home === g.score.away) return null;
  return g.score.home > g.score.away ? "home" : "away";
}

// One game: its row, plus a closed row with referees and box score opened from the result cell
function gameRows(g, fipTeam, boxscores) {
  const me = g.home === fipTeam || g.away === fipTeam, note = resultNote(g.status), win = winnerOf(g);
  const name = (side) => (side === win ? `<b>${esc(displayTeamName(g[side]))}</b>` : esc(displayTeamName(g[side])));
  const box = renderBoxscoreBody(boxscores, g);
  const refs = g.referees?.length ? `<p class="refs">Arbitri: ${g.referees.map(esc).join("; ")}</p>` : "";
  const id = `gx-${g.n}`;
  const btn = box || refs ? `<button type="button" class="tbx" aria-expanded="false" aria-controls="${id}">${box ? "Tabellino" + box.label : "Arbitri"}</button>` : "";
  const res = g.score ? `${g.score.home}-${g.score.away}` + (note ? `<small class="prov${note.warn ? " alert" : ""}">${esc(note.tag)}</small>` : "") : esc(g.time);
  const more = btn ? `<tr class="gx-row" id="${id}" hidden><td colspan="3">${refs}${box ? box.html : ""}</td></tr>` : "";
  return `<tr class="${me ? "me" : ""}"><td>${esc(day(g))}</td><td>${name("home")} - ${name("away")}</td><td>${res}${btn}</td></tr>${more}`;
}

function sanctionsBlock(games) {
  const items = games.flatMap((g) => (g.sanctions ?? []).map((t) => `<li><b>${esc(displayTeamName(g.home))} - ${esc(displayTeamName(g.away))}:</b> ${esc(t)}</li>`));
  return items.length ? `<details class="sanc"><summary>Provvedimenti del Giudice Sportivo (${items.length})</summary><ul>${items.join("")}</ul></details>` : "";
}

export function renderRoundTable(round, fipTeam, boxscores) {
  const rows = [...round.games].sort(byTime).map((g) => gameRows(g, fipTeam, boxscores)).join("");
  const pdfUrl = safeFipPdfUrl(round.pdf_url);
  const pdf = pdfUrl ? `<p class="meta round-pdf"><a href="${esc(pdfUrl)}" target="_blank" rel="noopener">Giornata nel PDF ufficiale FIP</a></p>` : "";
  return `<div class="scroll"><table class="results"><thead><tr><th>Data</th><th>Partita</th><th>Risultato</th></tr></thead><tbody>${rows}</tbody></table></div>${sanctionsBlock(round.games)}${pdf}`;
}
