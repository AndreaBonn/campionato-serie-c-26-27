// Pure rules of a playbasket.it box score: no DOM, no browser API, tested with node --test.

// Statuses where the box score is matched but still short of the FIP score (boxscores.py)
export const INCOMPLETE_STATUSES = new Set(["partial", "incomplete"]);
const INCOMPLETE_LABEL = "Tabellino incompleto";
// A player at referto who never entered the game (boxscores.py's None cell)
const PTS_PLACEHOLDER = "-";
// Only playbasket.it match pages are linked: never an arbitrary href from the source data
const PLAYBASKET_PREFIX = "https://www.playbasket.it/";

export const safeSourceUrl = (url) => (typeof url === "string" && url.startsWith(PLAYBASKET_PREFIX) ? url : null);

// A team's published roster, with the FIP name (fipTeam) instead of the playbasket.it one
const teamRows = (team, fipTeam) => ({
  team: fipTeam,
  players: team.players.map((p) => ({ ...p, pts: p.pts === null ? PTS_PLACEHOLDER : p.pts })),
});

// View of one game's box score, or null when there is nothing to show: no matched page
// (status "unmatched") or no entry at all. fipGame carries the FIP home/away names (rounds[].games[]).
export function boxscoreView(entry, fipGame) {
  if (!entry || !entry.home || !entry.away) return null;
  return {
    label: INCOMPLETE_STATUSES.has(entry.status) ? INCOMPLETE_LABEL : null,
    url: safeSourceUrl(entry.url),
    home: teamRows(entry.home, fipGame.home),
    away: teamRows(entry.away, fipGame.away),
  };
}
