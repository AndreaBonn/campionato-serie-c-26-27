import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarStamp,
  changeRows,
  daysUntil,
  esc,
  filterGames,
  firstLegOf,
  formSummary,
  gcalUrl,
  isFipNoticeLink,
  isStandingsCut,
  isUpcoming,
  logoOf,
  mapsUrl,
  pickRound,
  place,
  roundLabel,
  safeFipPdfUrl,
  statusLabel,
  teamProfile,
  withBreaks,
  won,
  zoneLines,
  zoneStatus,
} from "../../docs/page-rules.js";

// the page runs in Italian browsers: dates are local wall-clock times in Rome
process.env.TZ = "Europe/Rome";

const TODAY = new Date("2026-11-10T00:00:00");

function game(overrides = {}) {
  return {
    round: "A3",
    n: 17,
    home: "Olimpia Cagliari",
    away: "CUS Cagliari",
    is_home: false,
    date: "2026-11-15",
    time: "19:00",
    venue: { name: "Palestra Esperia", address: "Via Pessagno snc 09126 CAGLIARI (CA)" },
    status: "non-designata",
    status_text: "Gara non ancora designata",
    score: null,
    ...overrides,
  };
}

const played = (home, away, overrides = {}) => game({ score: { home, away }, status: "omologata", ...overrides });

test("esc neutralises every HTML-special character of FIP text", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("esc turns non-strings into text", () => {
  assert.equal(esc(17), "17");
});

test("calendar stamp is the local wall-clock start", () => {
  assert.equal(calendarStamp(game()), "20261115T190000");
});

test("calendar stamp of a late game end rolls over to the next day", () => {
  assert.equal(calendarStamp(game({ time: "22:30" }), 2), "20261116T003000");
});

test("place joins venue name and address", () => {
  assert.equal(place(game()), "Palestra Esperia, Via Pessagno snc 09126 CAGLIARI (CA)");
});

test("place of a venue published without address has no dangling comma", () => {
  assert.equal(place(game({ venue: { name: "PALACUS", address: "" } })), "PALACUS");
});

test("maps link searches the encoded place", () => {
  const url = new URL(mapsUrl(game({ venue: { name: "PALACUS", address: "" } })));

  assert.equal(url.searchParams.get("query"), "PALACUS");
});

test("Google Calendar link carries title, two-hour slot in Rome time, place and round", () => {
  const params = new URL(gcalUrl(game())).searchParams;

  assert.deepEqual(Object.fromEntries(params), {
    action: "TEMPLATE",
    text: "Olimpia Cagliari - CUS Cagliari",
    dates: "20261115T190000/20261115T210000",
    ctz: "Europe/Rome",
    location: "Palestra Esperia, Via Pessagno snc 09126 CAGLIARI (CA)",
    details: "Serie C, 3ª giornata di andata, gara n. 17",
  });
});

test("round label names round number and half", () => {
  assert.equal(roundLabel({ round: "A1" }), "1ª giornata di andata");
  assert.equal(roundLabel({ round: "R11" }), "11ª giornata di ritorno");
});

const when = (d, t) => d + " " + t;
const official = { date: "2026-11-14", time: "18:00", venue: { name: "Palestra Esperia", address: "Via Pessagno, Cagliari" } };

test("change rows put the new value first and the official one second", () => {
  const moved = game({ official, changes: ["date", "time"] });
  assert.deepEqual(changeRows(moved, when), [{ label: "Data e ora", now: "2026-11-15 19:00", before: "2026-11-14 18:00" }]);
});

test("change rows: time alone, venue and home swap each get their own row", () => {
  const m = game({ official: { ...official, date: "2026-11-15", venue: { name: "PalaPirastu", address: "" } }, changes: ["time", "venue", "home"] });
  assert.deepEqual(changeRows(m, when), [
    { label: "Orario", now: "2026-11-15 19:00", before: "2026-11-15 18:00" },
    { label: "Campo", now: "Palestra Esperia", before: "PalaPirastu" },
    { label: "Squadra di casa", now: "Olimpia Cagliari", before: "CUS Cagliari" },
  ]);
});

test("change rows: a new day alone still shows day and time", () => {
  const m = game({ official: { ...official, time: "19:00" }, changes: ["date"] });
  assert.deepEqual(changeRows(m, when), [{ label: "Data e ora", now: "2026-11-15 19:00", before: "2026-11-14 19:00" }]);
});

test("change rows are empty for a game played as scheduled", () => {
  assert.deepEqual(changeRows(game({ official, changes: [] }), when), []);
});

test("status label: result notes first, then page wording, then FIP text", () => {
  assert.equal(statusLabel(game({ status: "ufficioso" })), "risultato ufficioso, in attesa di omologazione");
  assert.equal(statusLabel(game()), "arbitri non ancora designati");
  assert.equal(statusLabel(game({ status: "designata" })), "");
  assert.equal(statusLabel(game({ status: "rinviata", status_text: "Gara RINVIATA" })), "gara rinviata");
  assert.equal(statusLabel(game({ status: "toString", status_text: "X" })), "x");
});

test("a game is upcoming from its day on until it has a result", () => {
  assert.equal(isUpcoming(game({ date: "2026-11-10", time: "00:00" }), TODAY), true);
  assert.equal(isUpcoming(game({ date: "2026-11-09", time: "21:00" }), TODAY), false);
  assert.equal(isUpcoming(played(70, 60), TODAY), false);
});

test("filter keeps home, away or all games, optionally only upcoming ones", () => {
  const home = game({ n: 1, is_home: true });
  const away = game({ n: 2 });
  const past = game({ n: 3, is_home: true, date: "2026-10-01" });
  const games = [home, away, past];

  assert.deepEqual(filterGames(games, "home", false, TODAY), [home, past]);
  assert.deepEqual(filterGames(games, "away", false, TODAY), [away]);
  assert.deepEqual(filterGames(games, "all", true, TODAY), [home, away]);
});

const BREAKS = [
  ["2026-11-01", "past break"],
  ["2026-12-21", "christmas"],
  ["2027-02-15", "february"],
];

test("a break goes right before the first game after it", () => {
  const before = game({ n: 1, date: "2026-12-20" });
  const after = game({ n: 2, date: "2027-01-10" });

  const items = withBreaks([before, after], BREAKS.slice(1), TODAY, false);

  assert.deepEqual(items, [{ game: before }, { date: "2026-12-21", text: "christmas" }, { game: after }]);
});

test("breaks after the last game shown are left out", () => {
  const only = game({ date: "2026-12-20" });

  assert.deepEqual(withBreaks([only], BREAKS.slice(1), TODAY, false), [{ game: only }]);
});

test("only upcoming: breaks already behind us are skipped, otherwise they stay", () => {
  const next = game({ date: "2026-11-15" });

  assert.deepEqual(withBreaks([next], BREAKS, TODAY, true), [{ game: next }]);
  assert.deepEqual(withBreaks([next], BREAKS, TODAY, false), [{ date: "2026-11-01", text: "past break" }, { game: next }]);
});

test("days until counts calendar days: tonight is 0, tomorrow 1", () => {
  assert.equal(daysUntil(game({ date: "2026-11-10", time: "21:00" }), TODAY), 0);
  assert.equal(daysUntil(game({ date: "2026-11-11", time: "00:30" }), TODAY), 1);
});

test("days until absorbs the 23-hour day when summer time starts", () => {
  const today = new Date("2027-03-27T00:00:00");

  assert.equal(daysUntil(game({ date: "2027-03-29" }), today), 2);
});

test("won reads the score from CUS's side", () => {
  assert.equal(won(played(64, 71)), true);
  assert.equal(won(played(64, 71, { is_home: true })), false);
});

test("first leg: the played andata game against the same opponent", () => {
  const andata = played(64, 71, { round: "A3" });
  const ritorno = game({ round: "R3", home: "CUS Cagliari", away: "Olimpia Cagliari", is_home: true });
  const other = played(80, 50, { round: "A4", home: "Altra Squadra" });

  assert.equal(firstLegOf(ritorno, [other, andata, ritorno]), andata);
});

test("first leg: none for an andata game or an andata not played yet", () => {
  const andata = game({ round: "A3" });
  const ritorno = game({ round: "R3", home: "CUS Cagliari", away: "Olimpia Cagliari", is_home: true });

  const playedAndata = played(64, 71, { round: "A3" });

  assert.equal(firstLegOf(playedAndata, [playedAndata]), null);
  assert.equal(firstLegOf(ritorno, [andata, ritorno]), null);
});

test("form summary: record, averages from CUS's side, home/away split, last five", () => {
  const games = [
    played(60, 70, { is_home: true }), // lost at home
    played(64, 71), // won away
    played(80, 75, { is_home: true }), // won at home
    played(90, 60), // lost away
    played(70, 68, { is_home: true }), // won at home
    played(50, 55), // won away
    game(), // not played yet
  ];

  assert.deepEqual(formSummary(games), {
    won: 4,
    lost: 2,
    played: 6,
    avgFor: (60 + 71 + 80 + 60 + 70 + 55) / 6,
    avgAgainst: (70 + 64 + 75 + 90 + 68 + 50) / 6,
    home: { won: 2, lost: 1 },
    away: { won: 2, lost: 1 },
    last: [true, true, false, true, true],
  });
});

test("form summary is null before the first result", () => {
  assert.equal(formSummary([game()]), null);
});

const round = (code, ...games) => ({ round: code, games });

test("round picked: the last one with a result", () => {
  const rounds = [round("A1", played(1, 0)), round("A2", played(2, 0)), round("A3", game())];

  assert.equal(pickRound(rounds, TODAY), 1);
});

test("round picked before any result: the first still to come, else the first", () => {
  const rounds = [round("A1", game({ date: "2026-11-01" })), round("A2", game({ date: "2026-11-15" }))];

  assert.equal(pickRound(rounds, TODAY), 1);
  assert.equal(pickRound([round("A1", game({ date: "2026-11-01" }))], TODAY), 0);
});


const leagueGame = (home, away, score, date = "2026-10-03") => ({ n: 1, home, away, date, time: "18:00", status: "ufficioso", score });
const row = (position, team, points, played = 1) => ({ position, team, points, played, won: 0, lost: 0, points_for: 0, points_against: 0 });

test("team profile: record, averages and last results of any team, oldest first", () => {
  const rounds = [
    round("A1", leagueGame("POL. DINAMO", "PALL. NUORO", { home: 80, away: 70 }, "2026-10-03")),
    round("A2", leagueGame("SEF TORRES", "POL. DINAMO", { home: 75, away: 60 }, "2026-10-10")),
    round("A3", leagueGame("POL. DINAMO", "CUS CAGLIARI", null, "2026-10-17")),
  ];
  const standings = [row(1, "SEF TORRES", 2), row(2, "POL. DINAMO", 2, 2)];

  assert.deepEqual(teamProfile("POL. DINAMO", rounds, standings), {
    position: 2,
    won: 1,
    lost: 1,
    avgFor: 70,
    avgAgainst: 72.5,
    last: [true, false],
  });
});

test("team profile: position unknown while FIP has not ranked any game", () => {
  const rounds = [round("A1", leagueGame("POL. DINAMO", "PALL. NUORO", { home: 80, away: 70 }))];

  assert.equal(teamProfile("POL. DINAMO", rounds, [row(5, "POL. DINAMO", 0, 0)]).position, null);
});

test("team profile is null before the team's first result", () => {
  const rounds = [round("A1", leagueGame("POL. DINAMO", "PALL. NUORO", null))];

  assert.equal(teamProfile("POL. DINAMO", rounds, []), null);
});

const table = (cusIndex, points) => points.map((p, i) => row(i + 1, i === cusIndex ? "CUS CAGLIARI" : "T" + i, p));
const POINTS = [20, 18, 16, 14, 12, 10, 8, 8, 6, 4, 2, 0];

test("zone status inside the playoff spots: margin over the 9th and over the playout", () => {
  assert.deepEqual(zoneStatus(table(5, POINTS), "CUS CAGLIARI"), {
    position: 6,
    playoff: { inside: true, margin: 4 },
    playout: { inside: false, margin: 6, firstOut: 10 },
  });
});

test("zone status in the playout: negative margins to the 8th and to safety", () => {
  assert.deepEqual(zoneStatus(table(10, POINTS), "CUS CAGLIARI"), {
    position: 11,
    playoff: { inside: false, margin: -6 },
    playout: { inside: true, margin: -4, firstOut: 10 },
  });
});

test("zone status reads positions, not the order of the rows", () => {
  const shuffled = table(7, POINTS).reverse();

  assert.deepEqual(zoneStatus(shuffled, "CUS CAGLIARI").playoff, { inside: true, margin: 2 });
});

test("zone status is null before FIP ranks any game or for a team not in the table", () => {
  assert.equal(zoneStatus(table(0, POINTS).map((r) => ({ ...r, played: 0 })), "CUS CAGLIARI"), null);
  assert.equal(zoneStatus(table(0, POINTS), "OTHER"), null);
});

test("zone lines: margins in standings points, singular for one point, ties named", () => {
  assert.deepEqual(zoneLines({ position: 6, playoff: { inside: true, margin: 4 }, playout: { inside: false, margin: 1, firstOut: 10 } }), [
    "In zona playoff, con 4 punti in classifica di vantaggio sulla 9ª.",
    "Fuori dalla zona playout, con 1 punto in classifica di vantaggio sulla 10ª.",
  ]);
  assert.deepEqual(zoneLines({ position: 9, playoff: { inside: false, margin: 0 }, playout: { inside: false, margin: 0, firstOut: 10 } }), [
    "Fuori dalla zona playoff, a pari punti con l'8ª.",
    "Fuori dalla zona playout, a pari punti con la 10ª.",
  ]);
  assert.deepEqual(zoneLines({ position: 11, playoff: { inside: false, margin: -6 }, playout: { inside: true, margin: -2, firstOut: 10 } }), [
    "Fuori dalla zona playoff, a 6 punti in classifica dall'8ª.",
    "In zona playout, a 2 punti in classifica dalla 9ª.",
  ]);
  assert.deepEqual(zoneLines({ position: 8, playoff: { inside: true, margin: 0 }, playout: { inside: true, margin: 0, firstOut: 10 } }), [
    "In zona playoff, a pari punti con la 9ª.",
    "In zona playout, a pari punti con la 9ª.",
  ]);
});

test("logo of a team: the copied crest, only for a plain logos/ file name", () => {
  const logos = {
    "CUS CAGLIARI": { file: "logos/cus-cagliari.png", source: "https://backend.fip.it/x" },
    EVIL: { file: "https://evil.example/x.png" },
    UP: { file: "logos/../index.html" },
  };

  assert.equal(logoOf(logos, "CUS CAGLIARI"), "logos/cus-cagliari.png");
  assert.equal(logoOf(logos, "EVIL"), null);
  assert.equal(logoOf(logos, "UP"), null);
  assert.equal(logoOf(logos, "POL. DINAMO"), null);
  assert.equal(logoOf(undefined, "CUS CAGLIARI"), null);
});


test("zone status with 13 teams: the playout starts at the 11th, the line names it", () => {
  const z = zoneStatus(table(9, [...POINTS, 0]), "CUS CAGLIARI");

  assert.deepEqual(z.playout, { inside: false, margin: 2, firstOut: 11 });
  assert.equal(zoneLines(z)[1], "Fuori dalla zona playout, con 2 punti in classifica di vantaggio sulla 11ª.");
});

test("zone lines in the playout name the last safe position of the table", () => {
  const z = zoneStatus(table(11, [...POINTS, 0]), "CUS CAGLIARI");

  assert.equal(zoneLines(z)[1], "In zona playout, a 4 punti in classifica dalla 10ª.");
});

test("only upcoming: a break starting today is still ahead and stays", () => {
  const next = game({ date: "2026-11-15" });

  const items = withBreaks([next], [["2026-11-10", "today"]], TODAY, true);

  assert.deepEqual(items, [{ date: "2026-11-10", text: "today" }, { game: next }]);
});

test("round picked: with only the first round played, the first round", () => {
  const rounds = [round("A1", played(1, 0, { date: "2026-11-01" })), round("A2", game({ date: "2026-11-15" }))];

  assert.equal(pickRound(rounds, TODAY), 0);
});

test("team profile: last results in date order, also when a postponed game is played later", () => {
  const rounds = [
    round("A1", leagueGame("POL. DINAMO", "PALL. NUORO", { home: 60, away: 70 }, "2026-10-24")),
    round("A2", leagueGame("POL. DINAMO", "SEF TORRES", { home: 80, away: 70 }, "2026-10-10")),
  ];

  assert.deepEqual(teamProfile("POL. DINAMO", rounds, []).last, [true, false]);
});

test("zone status is null when every team of the table is in a zone", () => {
  assert.equal(zoneStatus(table(5, POINTS.slice(0, 11)), "CUS CAGLIARI"), null);
});

test("logo of a team: nothing before logos/ and nothing after .png", () => {
  const logos = { NESTED: { file: "x/logos/a.png" }, SUFFIXED: { file: "logos/a.png.svg" } };

  assert.deepEqual([logoOf(logos, "NESTED"), logoOf(logos, "SUFFIXED")], [null, null]);
});

test("standings cut: a line under the last playoff spot and above the last three", () => {
  const cuts = (total) => Array.from({ length: total }, (_, i) => i + 1).filter((pos) => isStandingsCut(pos, total));

  assert.deepEqual(cuts(12), [8, 9]);
  assert.deepEqual(cuts(13), [8, 10]);
});

test("FIP round PDF: only a backend.fip.it address is linked", () => {
  const pdf = "https://backend.fip.it/api/v1/giornata.pdf?girone=85305";

  assert.equal(safeFipPdfUrl(pdf), pdf);
  for (const bad of ["https://backend.fip.it.evil.example/x.pdf", "http://backend.fip.it/x.pdf",
    "javascript:alert(1)//https://backend.fip.it/", "", null, undefined]) {
    assert.equal(safeFipPdfUrl(bad), null, String(bad));
  }
});

test("FIP Sardegna notice: only a sardegna.fip.it post is listed", () => {
  assert.equal(isFipNoticeLink("https://sardegna.fip.it/2026/10/01/comunicato/"), true);
  for (const bad of ["https://sardegna.fip.it.evil.example/", "http://sardegna.fip.it/x",
    "https://www.fip.it/x", null, undefined]) {
    assert.equal(isFipNoticeLink(bad), false, String(bad));
  }
});
