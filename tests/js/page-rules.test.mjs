import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calendarStamp,
  changeSummary,
  daysUntil,
  esc,
  filterGames,
  firstLegOf,
  formSummary,
  gcalUrl,
  isUpcoming,
  listIt,
  mapsUrl,
  pickRound,
  place,
  roundLabel,
  statusLabel,
  withBreaks,
  won,
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

test("Italian list joins the last item with 'e'", () => {
  assert.equal(listIt([]), "");
  assert.equal(listIt(["giorno"]), "giorno");
  assert.equal(listIt(["giorno", "orario", "campo"]), "giorno, orario e campo");
});

test("change summary uses page wording, unknown fields and inherited keys verbatim", () => {
  assert.equal(changeSummary(["date", "home"]), "giorno e inversione di campo");
  assert.equal(changeSummary(["referee", "toString"]), "referee e toString");
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
