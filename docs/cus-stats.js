// Rendering of the "Giocatori del CUS" section: imperative shell over cus-stats-rules.js.
// No state here: boxscores, rounds and the FIP team name all come from the caller.
import { esc } from "./page-rules.js";
import { cusPlayerStats, rosterProfile } from "./cus-stats-rules.js";
import { displayTeamName } from "./view-rules.js";

const AVG_PLACEHOLDER = "-";
const COLUMNS = 8;

const fmtAvg = (avg) =>
  avg === null ? AVG_PLACEHOLDER : avg.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtShare = (share) => (share === null ? AVG_PLACEHOLDER : Math.round(share * 100) + "%");
const fmtDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

// The name is a button that opens the player's detail row right below (wired in index.html);
// "opt" columns are hidden on phones (styles.css).
function summaryRow(p, i, withBoxscore) {
  const meta = [p.role, p.age].filter(Boolean).join(", ");
  const name = `<button type="button" class="pl-btn" aria-expanded="false" aria-controls="pl-${i}">${esc(p.name)}</button>${meta ? `<small class="role">${esc(meta)}</small>` : ""}`;
  return `<tr><td>${name}</td><td>${p.points}</td><td>${fmtAvg(p.average)}</td><td class="opt">${fmtAvg(p.homeAverage)}</td><td class="opt">${fmtAvg(p.awayAverage)}</td><td>${p.entered}/${withBoxscore}</td><td class="opt">${p.doubleDigit}</td><td class="opt">${fmtShare(p.teamShare)}</td></tr>`;
}

function last5Item(g) {
  const val = g.pts === "ABS" ? "assente" : g.pts === null ? AVG_PLACEHOLDER : g.pts;
  return `<li>${fmtDate(g.date)} vs ${esc(displayTeamName(g.opponent))}: ${val}</li>`;
}

function detailRow(p, i) {
  const best = p.best
    ? `${p.best.points} punti contro ${esc(displayTeamName(p.best.opponent))}, ${fmtDate(p.best.date)}`
    : "nessuna partita con punti a referto";
  const last5 = p.last5.map(last5Item).join("");
  return `<tr class="pl-detail" id="pl-${i}" hidden><td colspan="${COLUMNS}"><p>Miglior partita: ${best}.</p><p>Media nelle vittorie: ${fmtAvg(p.winAverage)} · Media nelle sconfitte: ${fmtAvg(p.lossAverage)}.</p><ul class="last5">${last5}</ul></td></tr>`;
}

// Ages are the ones reached in the first year of the 2026/27 season
const SEASON_START_YEAR = 2026;
const ROLE_PLURALS = { guardia: "guardie", "ala piccola": "ali piccole", "ala forte": "ali forti", centro: "centri" };
const roleCount = ({ role, count }) => `${count} ${count === 1 ? role : ROLE_PLURALS[role] ?? role}`;
const playersCount = (n) => `${n} ${n === 1 ? "giocatore" : "giocatori"}`;

function missingNote({ withoutAge, withoutRole }) {
  if (!withoutAge && !withoutRole) return "";
  if (withoutAge === withoutRole) return ` Età e ruolo mancanti su playbasket.it per ${playersCount(withoutAge)}.`;
  const parts = [withoutAge && `età mancante per ${playersCount(withoutAge)}`, withoutRole && `ruolo per ${playersCount(withoutRole)}`];
  const text = parts.filter(Boolean).join(", ");
  return ` ${text[0].toUpperCase()}${text.slice(1)}.`;
}

// One line on the roster as a whole: every player listed in at least one CUS box score
function rosterLine(players) {
  const r = rosterProfile(players, SEASON_START_YEAR);
  const span = r.oldest === r.youngest ? `nati nel ${r.oldest}` : `nati fra il ${r.oldest} e il ${r.youngest}`;
  const age = r.averageAge === null ? "" : `, età media ${fmtAvg(r.averageAge).replace(/,0$/, "")} anni (${span})`;
  const roles = r.roles.length ? ` Ruoli: ${r.roles.map(roleCount).join(", ")}.` : "";
  return `<p class="roster">Rosa: ${playersCount(r.total)} a referto${age}.${roles}${missingNote(r)}</p>`;
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
  const head = '<tr><th>Giocatore</th><th>Punti</th><th>Media</th><th class="opt">Casa</th><th class="opt">Trasferta</th><th>Partite</th><th class="opt">Doppia cifra</th><th class="opt">% squadra</th></tr>';
  const rows = stats.players.map((p, i) => summaryRow(p, i, withBoxscore) + detailRow(p, i)).join("");
  const table = `<div class="scroll"><table class="cus-players"><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
  const note = `<details class="howto"><summary>Come leggere la tabella</summary><p>Tocca un nome per la miglior partita e le ultime gare. Le medie contano solo le partite in cui il giocatore è entrato in campo; un trattino indica un giocatore a referto che non è entrato. Sul telefono casa, trasferta, doppia cifra e quota dei punti di squadra si vedono girandolo in orizzontale.</p></details>`;
  return `<h2>Giocatori del CUS</h2><p>${intro}</p>${rosterLine(stats.players)}${table}${note}`;
}
