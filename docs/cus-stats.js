// Rendering of the "Giocatori del CUS" section: imperative shell over cus-stats-rules.js.
// No state here: boxscores, rounds and the FIP team name all come from the caller.
import { esc } from "./page-rules.js";
import { cusPlayerStats } from "./cus-stats-rules.js";

const AVG_PLACEHOLDER = "-";

const fmtAvg = (avg) =>
  avg === null ? AVG_PLACEHOLDER : avg.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtShare = (share) => (share === null ? AVG_PLACEHOLDER : Math.round(share * 100) + "%");
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

function summaryRow(p, withBoxscore) {
  const meta = [p.role, p.age].filter(Boolean).join(", ");
  const name = `${esc(p.name)}${meta ? `<small class="role">${esc(meta)}</small>` : ""}`;
  return `<tr><td>${name}</td><td>${p.points}</td><td>${fmtAvg(p.average)}</td><td>${fmtAvg(p.homeAverage)}</td><td>${fmtAvg(p.awayAverage)}</td><td>${p.entered}/${withBoxscore}</td><td>${p.doubleDigit}</td><td>${fmtShare(p.teamShare)}</td></tr>`;
}

function last5Item(g) {
  const val = g.pts === "ABS" ? "assente" : g.pts === null ? AVG_PLACEHOLDER : g.pts;
  return `<li>${fmtDate(g.date)} vs ${esc(g.opponent)}: ${val}</li>`;
}

function playerDetail(p) {
  const best = p.best
    ? `${p.best.points} punti contro ${esc(p.best.opponent)}, ${fmtDate(p.best.date)}`
    : "nessuna partita con punti a referto";
  const last5 = p.last5.map(last5Item).join("");
  return `<details class="cus-player"><summary>${esc(p.name)}</summary><p>Miglior partita: ${best}.</p><p>Media nelle vittorie: ${fmtAvg(p.winAverage)} · Media nelle sconfitte: ${fmtAvg(p.lossAverage)}.</p><ul class="last5">${last5}</ul></details>`;
}

// "Giocatori del CUS" section, rendered after the league scorers table. The caller decides
// when to show the section (hidden until boxscores.json loads); here only the empty state
// before the first CUS box score, or the summary table plus one detail per player.
export function renderCusPlayers(boxscores, rounds, fipTeam) {
  const stats = cusPlayerStats(boxscores, rounds, fipTeam);
  const { played, withBoxscore, incomplete } = stats.games;
  if (!withBoxscore) {
    return "<h2>Giocatori del CUS</h2><p>Le statistiche dei giocatori saranno disponibili dopo il primo tabellino del CUS.</p>";
  }
  const games = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const intro = `Tabellini disponibili per ${games(withBoxscore, "partita", "partite")} su ${games(played, "giocata", "giocate")} dal CUS${incomplete ? `, di cui ${games(incomplete, "incompleto", "incompleti")}` : ""}.`;
  const head = "<tr><th>Giocatore</th><th>Punti</th><th>Media</th><th>Casa</th><th>Trasferta</th><th>Partite</th><th>Doppia cifra</th><th>% squadra</th></tr>";
  const rows = stats.players.map((p) => summaryRow(p, withBoxscore)).join("");
  const table = `<div class="scroll"><table class="cus-players"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  const details = stats.players.map(playerDetail).join("");
  const note = `<p class="meta">Le medie contano solo le partite in cui il giocatore è entrato in campo. Un trattino indica un giocatore a referto che non è entrato.</p>`;
  return `<h2>Giocatori del CUS</h2><p>${intro}</p>${table}${details}${note}`;
}
