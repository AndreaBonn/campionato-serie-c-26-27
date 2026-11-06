// Final positions still possible for each team, with FIP tie-breaks (Regolamento Esecutivo Gare,
// art. 62, 25 March 2026). Pure: no DOM, no browser API, tested with node --test.
//
// Games to play can only be enumerated as wins and losses: their scores are unknown. A tie whose
// order needs one of those scores (a points ratio) or the fouls (art. 62.3, not published) stays
// open, so either team may finish ahead. A position is therefore called decided only when it holds
// in every outcome, whatever the open ties turn out to be.

const WIN_POINTS = 2;
// art. 62.5: ratios count the integer part and the first four decimals
const RATIO_SCALE = 10_000;
// 2^16 outcomes per team at most; above it only the bound on standings points is used
export const MAX_ENUMERATED_GAMES = 16;

const isFinal = (g) => g.status === "omologata" && g.score !== null && g.score !== undefined;
const square = (n) => Array.from({ length: n }, () => new Array(n).fill(0));

// Teams by index, with the head-to-head data of the homologated games in n×n matrices:
// wins[i][j] games i won against j, scored[i][j] points i scored against j, pending[i][j] games
// between them still to play. Teams outside the standings are ignored.
function leagueState(standings, rounds) {
  const teams = standings.map((r) => r.team), n = teams.length;
  const index = new Map(teams.map((t, i) => [t, i]));
  const st = { teams, n, points: standings.map((r) => r.points), wins: square(n), scored: square(n),
    pending: square(n), scoredAll: new Array(n).fill(0), concededAll: new Array(n).fill(0),
    pendingAll: new Array(n).fill(0), remaining: [], playedCount: new Array(n).fill(0), consistent: true };
  const games = (rounds ?? []).flatMap((r) => r.games);
  // a game under a name the standings do not know would vanish, and a team's maximum with it
  if (!games.length) st.consistent = false;
  for (const g of games) {
    const h = index.get(g.home), a = index.get(g.away);
    if (h === undefined || a === undefined) { st.consistent = false; continue; }
    if (isFinal(g)) addPlayed(st, h, a, g.score);
    else addPending(st, h, a);
  }
  return st;
}

function addPlayed(st, h, a, score) {
  const [w, l] = score.home > score.away ? [h, a] : [a, h];
  st.wins[w][l] += 1;
  st.scored[h][a] += score.home;
  st.scored[a][h] += score.away;
  st.scoredAll[h] += score.home; st.concededAll[h] += score.away;
  st.scoredAll[a] += score.away; st.concededAll[a] += score.home;
  st.playedCount[h] += 1;
  st.playedCount[a] += 1;
}

// anything not homologated may still change: FIP standings do not count it either
function addPending(st, h, a) {
  st.pending[h][a] += 1;
  st.pending[a][h] += 1;
  st.pendingAll[h] += 1;
  st.pendingAll[a] += 1;
  st.remaining.push([h, a]);
}

// Groups of `group` by `keys` (aligned with it), highest first; null when the keys do not
// separate anyone: all equal, or one unknown (null), which may fall either side
function partitionBy(group, keys) {
  if (keys.includes(null) || keys.every((k) => k === keys[0])) return null;
  const order = group.map((_, i) => i).sort((a, b) => keys[b] - keys[a]);
  const parts = [];
  for (const i of order) {
    if (!parts.length || keys[i] !== keys[parts.at(-1).key]) parts.push({ key: i, teams: [] });
    parts.at(-1).teams.push(group[i]);
  }
  return parts.map((p) => p.teams);
}

function ratio(scored, conceded) {
  if (!scored && !conceded) return 0;
  return conceded === 0 ? Number.MAX_SAFE_INTEGER : Math.floor((scored * RATIO_SCALE) / conceded);
}

const sumOver = (group, f) => group.reduce((sum, u) => sum + f(u), 0);

function h2hRatios(group, st) {
  if (group.some((t) => group.some((u) => st.pending[t][u] > 0))) return group.map(() => null);
  return group.map((t) => ratio(sumOver(group, (u) => st.scored[t][u]), sumOver(group, (u) => st.scored[u][t])));
}

function overallRatios(group, st) {
  if (group.some((t) => st.pendingAll[t] > 0)) return group.map(() => null);
  return group.map((t) => ratio(st.scoredAll[t], st.concededAll[t]));
}

// Order of a tied group as tiers: a tier of one is placed, a longer tier is still open.
// Art. 62 A and B share one shape: head-to-head wins, head-to-head ratio, overall ratio; and
// art. 62.2 starts again from the top on any smaller group left level (two teams go back to A).
// A ratio over a game still to play is unknown (null): its score cannot be enumerated.
function resolve(group, st, sw) {
  if (group.length === 1) return [group];
  const parts = partitionBy(group, group.map((t) => sumOver(group, (u) => st.wins[t][u] + sw[t][u])))
    ?? partitionBy(group, h2hRatios(group, st))
    ?? partitionBy(group, overallRatios(group, st));
  return parts ? parts.flatMap((part) => resolve(part, st, sw)) : [group];
}

function rangeIn(team, pts, st, sw) {
  let before = 0;
  const group = [];
  for (let u = 0; u < st.n; u++) {
    if (pts[u] > pts[team]) before += 1;
    else if (pts[u] === pts[team]) group.push(u);
  }
  for (const tier of resolve(group, st, sw)) {
    if (tier.includes(team)) return [before + 1, before + tier.length];
    before += tier.length;
  }
  throw new Error(`team ${st.teams[team]} missing from its own tie group`);
}

// Moves the win of a remaining game [h, a] to `winner` in points and scenario wins
function award(pts, sw, [h, a], toHome, sign) {
  const [w, l] = toHome ? [h, a] : [a, h];
  pts[w] += sign * WIN_POINTS;
  sw[w][l] += sign;
}

// Every outcome of the games that can move `team`, the others settled any way (home wins).
// Gray-code order: from one outcome to the next exactly one game changes winner. Stops once
// the range reaches `limit`, the bound no outcome can go past.
function enumerate(team, relevant, fixed, st, limit) {
  const pts = st.points.slice(), sw = square(st.n);
  for (const g of fixed) award(pts, sw, g, true, 1);
  const toHome = relevant.map(() => false);
  for (const g of relevant) award(pts, sw, g, false, 1);
  let best = Infinity, worst = 0;
  for (let step = 0; step < 2 ** relevant.length; step++) {
    if (step > 0) {
      const i = 31 - Math.clz32(step & -step);
      award(pts, sw, relevant[i], toHome[i], -1);
      toHome[i] = !toHome[i];
      award(pts, sw, relevant[i], toHome[i], 1);
    }
    const [b, w] = rangeIn(team, pts, st, sw);
    best = Math.min(best, b);
    worst = Math.max(worst, w);
    if (best === limit.best && worst === limit.worst) break;
  }
  return { best, worst };
}

function teamRange(team, st, maxEnumerated) {
  const max = (u) => st.points[u] + WIN_POINTS * st.pendingAll[u];
  // only strict inequalities: a team that can draw level might still win the tie-break
  const settled = new Set();
  let above = 0, below = 0;
  for (let u = 0; u < st.n; u++) {
    if (st.points[u] > max(team)) { above += 1; settled.add(u); }
    if (st.points[team] > max(u)) { below += 1; settled.add(u); }
  }
  // a game between two teams already above or below cannot change this team's position
  const moves = ([h, a]) => !settled.has(h) || !settled.has(a);
  const relevant = st.remaining.filter(moves);
  const bound = { best: above + 1, worst: st.n - below };
  if (relevant.length > maxEnumerated) return bound;
  return enumerate(team, relevant, st.remaining.filter((g) => !moves(g)), st, bound);
}

/**
 * Best and worst final position each team can still reach.
 *
 * @param {Array<{team: string, points: number}>} standings FIP standings: their points include any penalty
 * @param {Array<{games: object[]}>} rounds every league game; only homologated ones count as played
 * @param {{maxEnumerated?: number}} [options] games enumerated per team before falling back to the bound
 * @returns {Map<string, {best: number, worst: number}>} empty when `rounds` and `standings` disagree
 *   (an unknown team name, homologated games not matching `played`, no games at all)
 */
export function positionRanges(standings, rounds, { maxEnumerated = MAX_ENUMERATED_GAMES } = {}) {
  const st = leagueState(standings, rounds);
  // games missing from `rounds` would make ranges too narrow, i.e. wrong: better none at all
  const counted = standings.every((r, i) => typeof r.played !== "number" || r.played === st.playedCount[i]);
  if (!st.consistent || !counted) return new Map();
  return new Map(st.teams.map((t, i) => [t, teamRange(i, st, maxEnumerated)]));
}

/**
 * What is already settled, team by team, in standings order; teams with nothing settled are left out.
 * `playoff`/`playout`: true in that zone whatever happens, false out of it, null still open.
 * No zone facts when the league is too short for the two zones to be apart; `playout: 0` (a league
 * without playout) leaves `playout` null, and `playoff: 0` (format not known) `playoff`.
 */
export function decidedFacts(ranges, { playoff, playout }) {
  const total = ranges.size, firstPlayout = total - playout + 1, zones = total > playoff + playout;
  const facts = [...ranges].map(([team, { best, worst }]) => ({
    team,
    position: best === worst ? best : null,
    playoff: !zones || !playoff ? null : worst <= playoff ? true : best > playoff ? false : null,
    playout: !zones || !playout ? null : best >= firstPlayout ? true : worst < firstPlayout ? false : null,
  }));
  return facts.filter((f) => f.position !== null || f.playoff !== null || f.playout !== null);
}
