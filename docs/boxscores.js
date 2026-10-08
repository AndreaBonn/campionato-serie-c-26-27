// Rendering of a game's box score (round table and CUS game card) and of the league scorers
// table: imperative shell over boxscore-rules.js / scorer-rules.js. No state here: boxscores,
// rounds, the FIP team name and the scorers filter all come from the caller.
import { esc } from "./page-rules.js";
import { displayTeamName } from "./view-rules.js";
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
  return `<table class="bx"><caption>${esc(displayTeamName(team.team))}</caption><thead><tr><th>Giocatore</th><th>Punti</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// { label, html } of a game's box score, or null when there is nothing to show for it (no box
// score yet, or playbasket.it never matched a page to this game). The caller wraps it: an
// expandable row in the round table, a disclosure in the CUS game card.
export function renderBoxscoreBody(boxscores, game) {
  const view = boxscoreView(boxscores[String(game.n)], game);
  if (!view) return null;
  const link = view.url
    ? `<a class="src" href="${esc(view.url)}" target="_blank" rel="noopener">Tabellino su playbasket.it</a>`
    : "";
  return {
    label: view.label ? ` <span class="incomplete">${esc(view.label)}</span>` : "",
    html: `<div class="teams"><div>${teamTable(view.home)}</div><div>${teamTable(view.away)}</div></div>${link}`,
  };
}

const fmtAvg = (avg) =>
  avg === null ? AVG_PLACEHOLDER : avg.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// CUS rows get the same "me" highlight as the rest of the page (team is the FIP name). The team
// is written twice: its own column on wide screens, a line under the name on phones (styles.css).
function scorerRow(r, position, fipTeam) {
  const team = esc(displayTeamName(r.team));
  return `<tr class="${r.team === fipTeam ? "me" : ""}"><td>${position}</td><td>${esc(r.name)}<small class="team-sm">${team}</small></td><td class="team-col">${team}</td><td>${r.points}</td><td>${r.played}</td><td>${fmtAvg(r.average)}</td></tr>`;
}

function scorersTable(rows, fipTeam) {
  const head = '<tr><th>#</th><th>Giocatore</th><th class="team-col">Squadra</th><th>Punti</th><th>Partite</th><th>Media</th></tr>';
  const body = rows.map((r) => scorerRow(r, r.rank, fipTeam)).join("");
  return `<div class="scroll"><table class="scorers"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

// Filter chips and team menu; the page re-renders the section on change (data-scorers*)
function scorersFilter(rows, fipTeam, only) {
  const chip = (team, text) => `<button type="button" data-scorers="${esc(team)}" aria-pressed="${only === (team || null)}">${text}</button>`;
  const teams = [...new Set(rows.map((r) => r.team))].sort((a, b) => displayTeamName(a).localeCompare(displayTeamName(b)));
  const options = teams.map((t) => `<option value="${esc(t)}"${t === only ? " selected" : ""}>${esc(displayTeamName(t))}</option>`).join("");
  return `<div class="fchips" role="group" aria-label="Filtra i marcatori">${chip("", "Tutto il girone")}${chip(fipTeam, "Solo CUS")}<select data-scorers-team aria-label="Marcatori di una squadra"><option value="">Per squadra</option>${options}</select></div>`;
}

// Matched box scores still short of the FIP score, for the note under the table (plan.md A6)
const incompleteCount = (boxscores) => Object.values(boxscores).filter((e) => INCOMPLETE_STATUSES.has(e.status)).length;

// League scorers table, rendered after "Risultati del girone". The caller decides when to show
// the section (hidden until boxscores.json loads); here only the empty state before the first
// box score, or the first SCORERS_VISIBLE rows plus a "Mostra tutti" disclosure for the rest.
// With `only` (a FIP team name) every player of that team is listed, ranked in the whole league.
export function renderScorers(boxscores, rounds, fipTeam, only = null) {
  const all = scorers(boxscores, rounds).map((r, i) => ({ ...r, rank: i + 1 }));
  if (!all.length) {
    return "<h2>Classifica marcatori</h2><p>La classifica marcatori sarà disponibile dopo il primo tabellino.</p>";
  }
  const rows = only ? all.filter((r) => r.team === only) : all;
  const top = only ? rows : rows.slice(0, SCORERS_VISIBLE);
  const rest = only ? [] : rows.slice(SCORERS_VISIBLE);
  const more = rest.length
    ? `<details class="scorers-more"><summary>Mostra tutti</summary>${scorersTable(rest, fipTeam)}</details>`
    : "";
  const n = incompleteCount(boxscores);
  const note = `<details class="howto"><summary>Come si calcola</summary><p>Punti dai tabellini inseriti dagli utenti di playbasket.it. Le partite contano solo se il giocatore è entrato in campo (punti indicati, anche 0).${n ? ` ${n} tabellini incompleti.` : ""}</p></details>`;
  return `<h2>Classifica marcatori</h2>${scorersFilter(all, fipTeam, only)}${scorersTable(top, fipTeam)}${more}${note}`;
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
