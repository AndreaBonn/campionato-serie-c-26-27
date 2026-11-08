// Content of the team card dialog: profile, head to head, remaining and played games, performance,
// roster and sanctions of one team. Imperative shell over opponent-rules.js and team-rules.js;
// ctx = { rounds, standings, logos, boxscores, boxscoresLoad, fipTeam, ranges }.
import { PLAYOFF_SPOTS, PLAYOUT_SPOTS, esc, teamProfile, toDate } from "./page-rules.js";
import { resultNote } from "./result-rules.js";
import { displayTeamName, splitLine } from "./view-rules.js";
import { crestHtml, zoneWords } from "./tables-view.js";
import { badges, count, dec } from "./games-view.js";
import { SEASON_START_YEAR, rosterLine } from "./cus-stats.js";
import { birthYear } from "./cus-stats-rules.js";
import { decidedFacts } from "./standings-math.js";
import { opponentGames, opponentSanctions, scorersState } from "./opponent-rules.js";
import { headToHead, performance, remainingGames, scheduleStrength, suspensions } from "./team-rules.js";

const NEXT_SHOWN = 5;
const name = (team) => esc(displayTeamName(team));
const shortRound = (round) => esc(round.slice(1)) + "ª " + (round[0] === "A" ? "and." : "rit.");
const section = (title, body) => `<section><h3>${title}</h3>${body}</section>`;
const empty = (text) => `<p class="opp-empty">${text}</p>`;
const table = (cls, head, rows) => `<div class="scroll"><table class="${cls}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const day = (g) => toDate(g.date, g.time).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const vp = (won) => (won ? '<span class="vp win">V</span>' : '<span class="vp loss">P</span>');
const field = (isHome) => (isHome ? "Casa" : "Trasferta");
const signed = (n) => (n > 0 ? "+" : "") + dec(n);
const provTag = (status) => {
  const note = resultNote(status);
  return note ? ` <span class="tag prov">${esc(note.tag)}</span>` : "";
};

// Final positions still possible (standings-math.js), with what is already settled for the team;
// left out while every position is open, like the standings' "Poss." column
function rangeLine(team, ctx) {
  const range = ctx.ranges?.get(team);
  if (!range || (range.best === 1 && range.worst === ctx.ranges.size)) return "";
  const span = range.best === range.worst ? `${range.best}ª` : `fra la ${range.best}ª e la ${range.worst}ª`;
  const fact = decidedFacts(ctx.ranges, { playoff: PLAYOFF_SPOTS, playout: PLAYOUT_SPOTS }).find((f) => f.team === team);
  const words = fact ? zoneWords(fact).filter((w) => !/^\d/.test(w)) : [];
  const settled = words.length ? ` · matematicamente ${words.join(", ")}` : "";
  return `<p class="opp-range">Posizione finale possibile: ${span}${settled}</p>`;
}

function head(team, ctx) {
  const p = teamProfile(team, ctx.rounds, ctx.standings);
  const pos = p?.position ? `${p.position}ª in classifica` : "Non ancora in classifica";
  const record = p ? `<p>${count(p.won, "vinta", "vinte")}, ${count(p.lost, "persa", "perse")} · ${dec(p.avgFor)} fatti, ${dec(p.avgAgainst)} subiti di media</p><div class="badges">${badges(p.last)}</div>` : "";
  return `<header class="opp-head">${crestHtml(ctx.logos, team)}<div><h2 id="opp-title">${name(team)}</h2><p>${pos}</p>${record}${rangeLine(team, ctx)}</div></header>`;
}

// Head to head with the CUS, left out of the CUS's own card
function versusCus(team, ctx) {
  if (!ctx.fipTeam || team === ctx.fipTeam) return "";
  const rows = headToHead(ctx.fipTeam, team, ctx.rounds);
  if (!rows.length) return "";
  const row = (g) => {
    const result = g.played ? `${g.own}-${g.their} ${vp(g.won)}${provTag(g.status)}` : `${esc(day(g))}, ore ${esc(g.time)}`;
    return `<tr><td>${shortRound(g.round)}</td><td>${g.isHome ? "CUS in casa" : "CUS in trasferta"}</td><td>${result}</td></tr>`;
  };
  return section(`Contro ${name(ctx.fipTeam)}`, `<div class="opp-vs">${table("opp-h2h", ["Giornata", "Campo", "CUS-avversario"], rows.map(row))}</div>`);
}

function remaining(team, ctx) {
  const rows = remainingGames(team, ctx.rounds, ctx.standings);
  if (!rows.length) return section("Da giocare", empty("Nessuna partita da giocare: la stagione regolare è finita."));
  const opp = (g) => `${name(g.opponent)}${g.opponentPosition ? ` <small>(${g.opponentPosition}ª)</small>` : ""}`;
  const row = (g) => `<tr><td><span class="d">${esc(day(g))}</span><small>${shortRound(g.round)}</small></td><td>${opp(g)}</td><td>${field(g.isHome)}</td></tr>`;
  const head = ["Data", "Avversario", "Campo"];
  // the next few in view, the rest of the season one tap away
  const later = rows.length > NEXT_SHOWN ? `<details class="opp-more"><summary>Le altre ${rows.length - NEXT_SHOWN} partite</summary>${table("opp-next", head, rows.slice(NEXT_SHOWN).map(row))}</details>` : "";
  const strength = scheduleStrength(rows);
  const note = strength === null ? "" : `<p class="note">Avversari ancora da affrontare: in media ${dec(strength)}ª posizione nella classifica attuale.</p>`;
  return section("Da giocare", `${table("opp-next", head, rows.slice(0, NEXT_SHOWN).map(row))}${later}${note}`);
}

function games(team, ctx) {
  // newest first, like a results page: the last game says most about the team now
  const rows = opponentGames(team, ctx.rounds).reverse();
  if (!rows.length) return section("Partite giocate", empty("Nessuna partita giocata finora: i risultati compaiono qui dopo la prima giornata."));
  const row = (g) => `<tr><td>${shortRound(g.round)}</td><td>${name(g.opponent)}</td><td>${field(g.isHome)}</td><td>${g.own}-${g.their} ${vp(g.won)}${provTag(g.status)}</td></tr>`;
  return section("Partite giocate", table("opp-games", ["Giornata", "Avversario", "Campo", "Punti fatti-subiti"], rows.map(row)));
}

const gameRef = (g) => `${g.own}-${g.their} con ${name(g.opponent)} (${shortRound(g.round)})`;

function form(team, ctx) {
  const p = performance(team, ctx.rounds);
  if (!p) return "";
  const streak = p.streak.won ? count(p.streak.length, "vittoria", "vittorie") : count(p.streak.length, "sconfitta", "sconfitte");
  const items = [
    splitLine(p.split),
    `Serie in corso: ${streak}${p.streak.length > 1 ? " di fila" : ""}`,
    `Scarto medio: ${signed(p.avgMargin)} punti a partita`,
    p.biggestWin && `Vittoria più larga: ${gameRef(p.biggestWin)}`,
    p.biggestLoss && `Sconfitta più larga: ${gameRef(p.biggestLoss)}`,
  ].filter(Boolean);
  return `<details class="opp-more"><summary>Rendimento in casa e in trasferta</summary><ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul></details>`;
}

function roster(team, ctx) {
  const title = "Rosa e punti";
  const { state, rows } = scorersState(ctx.boxscores, ctx.rounds, team, ctx.boxscoresLoad);
  if (state === "loading") return section(title, empty("Rosa in caricamento…"));
  if (state === "failed") return section(title, empty("Tabellini non raggiungibili: controlla la connessione e riapri la scheda."));
  if (state === "empty") return section(title, empty("Nessun tabellino disponibile per questa squadra."));
  const avg = (r) => (r.average === null ? "-" : dec(r.average));
  const who = (r) => {
    const year = birthYear(r.age, SEASON_START_YEAR);
    const meta = [r.role, year && `classe ${year}`].filter(Boolean).map(esc).join(" · ");
    return `${esc(r.name)}${meta ? `<small>${meta}</small>` : ""}`;
  };
  const row = (r) => `<tr><td>${who(r)}</td><td>${r.entered}</td><td>${r.points}</td><td>${avg(r)}</td><td>${r.best ? r.best.points : "-"}</td></tr>`;
  const head = ["Giocatore", '<abbr title="Gare giocate">G</abbr>', "Punti", "Media", '<abbr title="Punti nella partita migliore">Max</abbr>'];
  return section(title, `${rosterLine(rows)}${table("opp-scorers", head, rows.map(row))}<p class="note">Punti dai tabellini inseriti dagli utenti di playbasket.it: rimbalzi, assist e falli non sono pubblicati.</p>`);
}

const sanctionItem = (s) => `<li>${shortRound(s.round)}, gara ${s.n}: ${esc(s.text)}</li>`;

function banItem(s) {
  const left = s.left ? `<b>ancora ${count(s.left, "gara", "gare")} da scontare</b>` : "scontata";
  return `<li>${name(s.player)}: ${count(s.games, "gara", "gare")} di squalifica (${shortRound(s.round)}), ${left}</li>`;
}

function bans(team, ctx) {
  const rows = suspensions(team, ctx.rounds);
  if (!rows.length) return "";
  return `<div class="opp-bans"><p><b>Squalifiche</b></p><ul>${rows.map(banItem).join("")}</ul><p class="note">Gare da scontare stimate contando le partite giocate dalla squadra dopo il provvedimento: la FIP non pubblica quando una squalifica è scontata.</p></div>`;
}

function sanctions(team, ctx) {
  const { own, unattributed } = opponentSanctions(team, ctx.rounds);
  const list = own.length ? `<ul>${own.map(sanctionItem).join("")}</ul>` : empty("Nessun provvedimento alla società nelle gare omologate.");
  const other = unattributed.length ? `<details class="sanc"><summary>Altri provvedimenti nelle sue gare (società non identificata)</summary><ul>${unattributed.map(sanctionItem).join("")}</ul></details>` : "";
  return section("Provvedimenti del Giudice Sportivo", `<div class="opp-sanc">${bans(team, ctx)}${list}${other}</div>`);
}

export function renderOpponent(team, ctx) {
  return [head, versusCus, remaining, games, form, roster, sanctions].map((part) => part(team, ctx)).join("");
}
