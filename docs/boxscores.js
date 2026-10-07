// Rendering of a game's box score inside the "Risultati del girone" round table: imperative
// shell over boxscore-rules.js. No state here: boxscores and the game both come from the caller.
import { esc } from "./page-rules.js";
import { boxscoreView } from "./boxscore-rules.js";

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

// Loaded after the first render (plan.md A10): a missing or broken file leaves the round
// table without box scores, the rest of the page is unaffected. `apply` gets the parsed
// boxscores dict so the page can re-render the round table it has open.
export async function loadBoxscores(apply) {
  try {
    const r = await fetch("boxscores.json", { cache: "no-cache" });
    if (!r.ok) return;
    const data = await r.json();
    apply(data.boxscores || {});
  } catch (err) {
    console.warn("boxscores.json non disponibile", err);
  }
}
