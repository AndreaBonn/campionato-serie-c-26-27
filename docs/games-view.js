// Rendering of the CUS games: hero box, last result, form strip and game list. Imperative shell
// over page-rules.js / view-rules.js. No state here: everything comes in a context object
// ctx = { games, rounds, standings, logos, boxscores, today, fipTeam, breaks }.
import { changeRows, esc, filterGames, firstLegOf, gcalUrl, isUpcoming, mapsUrl, daysUntil, onSide, roundLabel, statusLabel, teamProfile, toDate, withBreaks, won } from "./page-rules.js";
import { resultNote } from "./result-rules.js";
import { countdownText, lastPlayed, splitLine } from "./view-rules.js";
import { crestHtml } from "./tables-view.js";
import { renderBoxscoreBody } from "./boxscores.js";

const svg = (d) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
export const ICON = {
  pin: svg('<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  share: svg('<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>'),
};

const fmtDay = (d) => d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
export const fmtLong = (d) => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
export const fmtWhen = (d, t) => fmtLong(toDate(d, t)) + ", ore " + t;
const dec = (n) => n.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const count = (k, one, many) => k + " " + (k === 1 ? one : many);
const badges = (list) => list.map((w) => (w ? '<span class="badge win" title="Vittoria">V</span>' : '<span class="badge loss" title="Sconfitta">P</span>')).join("");
const ext = (href, inner, cls = "") => `<a class="${cls}" href="${href}" target="_blank" rel="noopener">${inner}</a>`;
const verdict = (m) => (won(m) ? '<span class="vp win">Vinta</span>' : '<span class="vp loss">Persa</span>');

export const nextGame = (ctx) => ctx.games.find((m) => isUpcoming(m, ctx.today));
// FIP names of the two teams, the keys of crests and box scores
const fipHome = (m, ctx) => (m.is_home ? ctx.fipTeam : m.fip_opponent);
const fipAway = (m, ctx) => (m.is_home ? m.fip_opponent : ctx.fipTeam);
const crest = (ctx, team, cls = "") => crestHtml(ctx.logos, team, cls);

// record of the opponent from every league result, for a game still to be played
function oppChips(m, ctx) {
  const p = m.score ? null : teamProfile(m.fip_opponent, ctx.rounds, ctx.standings);
  if (!p) return "";
  const pos = p.position ? `<span class="c">${p.position}ª in classifica</span>` : "";
  return `<div class="oppchips"><span class="lead">Avversario</span>${pos}<span class="c">${count(p.won, "vinta", "vinte")}, ${count(p.lost, "persa", "perse")}</span><span class="c">${dec(p.avgFor)} fatti, ${dec(p.avgAgainst)} subiti di media</span>${badges(p.last)}</div>`;
}

function sanctions(m) {
  if (!m.sanctions?.length) return "";
  return `<div class="sanc-card"><strong>Provvedimenti del Giudice Sportivo su questa gara</strong><ul>${m.sanctions.map((t) => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
}

function teams(m, ctx) {
  const h = m.is_home ? `<strong>${esc(m.home)}</strong>` : esc(m.home), a = m.is_home ? esc(m.away) : `<strong>${esc(m.away)}</strong>`;
  return `<span class="teams"><span>${crest(ctx, fipHome(m, ctx))}${h}</span><em>-</em><span>${a}${crest(ctx, fipAway(m, ctx), "away")}</span></span>`;
}

function score(m) {
  if (!m.score) return "";
  const note = resultNote(m.status), prov = note ? ` <span class="tag prov${note.warn ? " alert" : ""}">${esc(note.tag)}</span>` : "";
  return ` <span class="score ${won(m) ? "win" : "loss"}">${m.score.home}-${m.score.away}</span>${verdict(m)}${prov}`;
}

// new value in bold, the official calendar's one struck through, both spelled out
function was(m) {
  const rows = changeRows(m, fmtWhen);
  if (!rows.length) return "";
  const line = (r) => `<div class="chg-row"><span class="chg-lbl">${esc(r.label)}</span><span>Adesso: <strong>${esc(r.now)}</strong></span><span>Prima: <del>${esc(r.before)}</del></span></div>`;
  return `<div class="was"><strong>Spostata dalla FIP rispetto al comunicato ufficiale</strong>${rows.map(line).join("")}</div>`;
}

function referees(m) {
  if (m.referees.length) return `<div class="ref">Arbitri: ${m.referees.map(esc).join("; ")}</div>`;
  if (m.status === "designata-nonvisibile") return `<div class="ref pend">Arbitri designati; i nomi non sono ancora stati pubblicati.</div>`;
  return "";
}

function firstLeg(m, ctx) {
  const a = firstLegOf(m, ctx.games);
  return a ? `<div class="leg">All'andata: ${esc(a.home)} - ${esc(a.away)} ${a.score.home}-${a.score.away}</div>` : "";
}

// the CUS game's box score from playbasket.it, unchanged, in a disclosure
function cardBoxscore(m, ctx) {
  const box = renderBoxscoreBody(ctx.boxscores, { n: m.n, home: fipHome(m, ctx), away: fipAway(m, ctx) });
  return box ? `<details class="cardbox"><summary>Tabellino${box.label}</summary>${box.html}</details>` : "";
}

export function renderCard(m, ctx) {
  const dt = toDate(m.date, m.time), tag = m.changes.length ? `<span class="tag chg">Spostata</span>` : "", st = statusLabel(m);
  return `<article class="g ${m.is_home ? "home" : ""} ${dt < ctx.today ? "past" : ""} ${m.score ? "played" : ""}">
 <div class="d"><span>${fmtDay(dt)}</span><b>${dt.getDate()}</b><i>${esc(m.time)}</i></div>
 <div><div class="rnd">${roundLabel(m)}</div><div class="t"><span class="tag">${m.is_home ? "Casa" : "Trasferta"}</span>${tag}${teams(m, ctx)}${score(m)}</div>
 <div class="v"><strong>${esc(m.venue.name)}</strong>, ${esc(m.venue.address)}</div>
 ${was(m)}${referees(m)}${oppChips(m, ctx)}${firstLeg(m, ctx)}${sanctions(m)}${cardBoxscore(m, ctx)}
 <div class="acts">${ext(mapsUrl(m), ICON.pin + "Mappa")}${ext(gcalUrl(m), ICON.cal + "Calendario")}</div>
 <div class="meta">Gara n. ${m.n}${st ? ", " + esc(st) : ""}</div></div></article>`;
}

function emptyList(ctx, side, mode) {
  if (mode === "played") return "Nessuna partita giocata con questo filtro.";
  const next = nextGame(ctx);
  // point to the hero box only if the game it shows passes the home/away filter
  if (mode === "upcoming" && next && onSide(next, side))
    return "L'unica partita da giocare con questo filtro è la prossima, in alto.";
  return "Nessuna partita con questo filtro.";
}

// side: "all" | "home" | "away"; mode: "upcoming" | "played" | "all"
export function renderList(ctx, side, mode) {
  let out = "", mon = "";
  const head = (d) => {
    const k = d.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
    if (k !== mon) { mon = k; out += `<h2>${k}</h2>`; }
  };
  // the next game is already in the hero box: the upcoming list starts from the one after
  const next = nextGame(ctx);
  const games = filterGames(ctx.games, side, mode, ctx.today).filter((m) => mode !== "upcoming" || m !== next);
  const items = withBreaks(games, ctx.breaks, ctx.today, mode === "upcoming");
  // played games newest first, like a results page
  for (const { game: m, date, text } of mode === "played" ? items.reverse() : items) {
    if (!m) { head(new Date(date + "T12:00:00")); out += `<p class="sosta">${text}</p>`; continue; }
    head(toDate(m.date, m.time));
    out += renderCard(m, ctx);
  }
  return out || `<p class="state">${emptyList(ctx, side, mode)}</p>`;
}

export function renderNext(ctx) {
  const m = nextGame(ctx);
  if (!m) return "<div class='m'>Stagione regolare conclusa</div>";
  const c = countdownText(daysUntil(m, ctx.today), m.time);
  const refs = m.referees.length ? `<small>Arbitri: ${m.referees.map(esc).join("; ")}</small>` : "";
  const rows = changeRows(m, fmtWhen), moved = rows.length ? `<small>Spostata dalla FIP. ${rows.map((r) => `${esc(r.label)} prima: <del>${esc(r.before)}</del>`).join("; ")}</small>` : "";
  return `<small>Prossima partita</small><div class="m">${crest(ctx, fipHome(m, ctx))}${esc(m.home)} - ${esc(m.away)}${crest(ctx, fipAway(m, ctx), "away")}</div>
 <div class="info"><small>${fmtLong(toDate(m.date, m.time))}, ore ${esc(m.time)}</small><small>${esc(m.venue.name)}</small>${moved}${refs}${oppChips(m, ctx)}</div>
 <div class="w">${c.lead ? `<small>${c.lead}</small>` : ""}<b>${c.main}</b>${c.sub ? `<small>${c.sub}</small>` : ""}</div>
 <div class="hero-acts">${ext(mapsUrl(m), ICON.pin + "Indicazioni", "primary")}${ext(gcalUrl(m), ICON.cal + "Calendario")}<button type="button" id="share">${ICON.share}Condividi</button></div>
 <p class="shared" id="shared" aria-live="polite"></p>`;
}

// "" before the first result: the caller hides the box
export function renderLast(ctx) {
  const m = lastPlayed(ctx.games);
  if (!m) return "";
  const note = resultNote(m.status), prov = note ? `<small class="prov">${esc(note.tag)}</small>` : "";
  return `${verdict(m)}<div><small>Ultimo risultato · ${roundLabel(m)}, ${fmtLong(toDate(m.date, m.time))}</small><strong>${esc(m.home)} - ${esc(m.away)}</strong></div><div class="res">${m.score.home}-${m.score.away}${prov}</div>${cardBoxscore(m, ctx)}`;
}

// f: formSummary() of the CUS games, never null here
export function renderForm(f) {
  const n = f.last.length;
  return `<span class="lbl">Andamento</span><span><b>${f.won}-${f.lost}</b> vinte e perse</span><span><b>${dec(f.avgFor)}</b> punti fatti a partita</span><span><b>${dec(f.avgAgainst)}</b> subiti</span>
 <span class="badges">${n === 1 ? "Ultima" : "Ultime " + n}: ${badges(f.last)}</span><span class="meta">${splitLine(f)}</span>`;
}
