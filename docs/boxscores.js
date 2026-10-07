// Rendering of a game's box score inside the "Risultati del girone" round table, and of the
// league scorers table: imperative shell over boxscore-rules.js / scorer-rules.js. No state
// here: boxscores, rounds and the FIP team name all come from the caller.
import { esc } from "./page-rules.js";
import { boxscoreView, INCOMPLETE_STATUSES } from "./boxscore-rules.js";
import { scorers } from "./scorer-rules.js";

// Rows shown before the "Mostra tutti" disclosure (plan.md T018)
const SCORERS_VISIBLE = 20;
const AVG_PLACEHOLDER = "-";

function playerRow(p) {
  const meta = [p.role, p.age].filter(Boolean).join(", ");
  return `<tr><td>${esc(p.name)}${meta ? `<small class="role">${esc(meta)}</small>` : ""}</td><td>${esc(p.pts)}</td></tr>`;
}

function teamTable(team) {
  const rows = team.players.map(playerRow).join("") || `<tr><td colspan="2">Nessun giocatore a referto.</td></tr>`;
  return `<table class="bx"><caption>${esc(team.team)}</caption><thead><tr><th>Giocatore</th><th>Punti</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// One extra <tr> under the game's own row, or "" when there is nothing to show for it
// (no box score yet, or playbasket.it never matched a page to this game).
export function renderGameBoxscore(boxscores, game) {
  const view = boxscoreView(boxscores[String(game.n)], game);
  if (!view) return "";
  const label = view.label ? ` <span class="incomplete">${esc(view.label)}</span>` : "";
  const link = view.url
    ? `<a class="src" href="${esc(view.url)}" target="_blank" rel="noopener">Tabellino su playbasket.it</a>`
    : "";
  return `<tr class="boxscore-row"><td colspan="3"><details class="boxscore"><summary>Tabellino${label}</summary><div class="teams"><div>${teamTable(view.home)}</div><div>${teamTable(view.away)}</div></div>${link}</details></td></tr>`;
}

const fmtAvg = (avg) =>
  avg === null ? AVG_PLACEHOLDER : avg.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// CUS rows get the same "me" highlight as the rest of the page (team is the FIP name).
function scorerRow(r, position, fipTeam) {
  return `<tr class="${r.team === fipTeam ? "me" : ""}"><td>${position}</td><td>${esc(r.name)}</td><td>${esc(r.team)}</td><td>${r.points}</td><td>${r.played}</td><td>${fmtAvg(r.average)}</td></tr>`;
}

function scorersTable(rows, offset, fipTeam) {
  const head = "<tr><th>#</th><th>Giocatore</th><th>Squadra</th><th>Punti</th><th>Partite</th><th>Media</th></tr>";
  const body = rows.map((r, i) => scorerRow(r, offset + i + 1, fipTeam)).join("");
  return `<div class="scroll"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// Matched box scores still short of the FIP score, for the note under the table (plan.md A6)
const incompleteCount = (boxscores) => Object.values(boxscores).filter((e) => INCOMPLETE_STATUSES.has(e.status)).length;

// League scorers table, rendered after "Risultati del girone". The caller decides when to show
// the section (hidden until boxscores.json loads); here only the empty state before the first
// box score, or the first SCORERS_VISIBLE rows plus a "Mostra tutti" disclosure for the rest.
export function renderScorers(boxscores, rounds, fipTeam) {
  const rows = scorers(boxscores, rounds);
  if (!rows.length) {
    return "<h2>Classifica marcatori</h2><p>La classifica marcatori sarà disponibile dopo il primo tabellino.</p>";
  }
  const top = rows.slice(0, SCORERS_VISIBLE);
  const rest = rows.slice(SCORERS_VISIBLE);
  const more = rest.length
    ? `<details class="scorers-more"><summary>Mostra tutti</summary>${scorersTable(rest, top.length, fipTeam)}</details>`
    : "";
  const n = incompleteCount(boxscores);
  const note = `<p class="meta">Punti dai tabellini inseriti dagli utenti di playbasket.it. Le partite contano solo se il giocatore è entrato in campo (punti indicati, anche 0).${n ? ` ${n} tabellini incompleti.` : ""}</p>`;
  return `<h2>Classifica marcatori</h2>${scorersTable(top, 0, fipTeam)}${more}${note}`;
}

// Loaded after the first render (plan.md A10): a missing or broken file leaves the round
// table without box scores, the rest of the page is unaffected. `apply` gets the parsed
// boxscores dict so the page can re-render the round table it has open.
export async function loadBoxscores(apply) {
  try {
    const r = await fetch("boxscores.json", { cache: "no-cache" });
    if (!r.ok) {
      console.warn(`boxscores.json non disponibile: HTTP ${r.status}`);
      return;
    }
    const data = await r.json();
    apply(data.boxscores || {});
  } catch (err) {
    console.warn("boxscores.json non disponibile", err);
  }
}
