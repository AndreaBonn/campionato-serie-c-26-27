# campionato-serie-c-26-27

Static page (GitHub Pages, `docs/`) for CUS Cagliari's Serie C 2026/27 games, kept in sync with fip.it by a scheduled GitHub Action.

## Data flow

`data/calendario-comunicato.json` (official baseline, hand-transcribed from the PDF) + fip.it/risultati pages (girone 85305, `codice_ar=1` andata, `0` ritorno) → `src/fip_calendar` → `docs/data.json` → `docs/index.html`.

- Games are matched by FIP game number (`n`), never by team name: FIP names include sponsors (e.g. "CAMPING LA SALINA CALASETTA").
- `changes` lists fields that differ from the baseline (`date`, `time`, `venue`, `home`).
- `docs/data.json` is generated; it is rewritten only when content changes (`updated_at` excluded from the comparison).
- A referee slot can contain the placeholder "Designazione in attesa di conferma.": it is filtered out.
- `docs/calendario.ics` (subscribable feed, `ics.py`) is regenerated only when data.json changes or the file is missing: after changing `ics.py`, delete the file and run `uv run fip-calendar`.
- Each round in `rounds` carries `pdf_url`, FIP's printable round report (`backend.fip.it/api/v1/giornata.pdf`, the "Scarica giornata" button); the page links it under the round table. Box scores, quarter scores and player stats are not published by FIP for this league (checked 2026-10-06).
- `data.json` also carries every league game per round (`rounds`) and FIP Sardegna notices (`notices`, `notices.py`) from three sources, each tagged with `kind`: keyword searches on format/playoff (`formula`), the "C REGIONALE" category (`serie-c`) and the `comunicato` post type filtered on Serie C (`comunicato`, where other regions publish Giudice Sportivo decisions; empty for Sardegna as of 2026-10-02). If the WordPress API is down the previous notices are kept.
- Club crests (`logos.py`): the sync copies every crest fip.it shows (only `https://backend.fip.it/` URLs) into `docs/logos/<slug>.png`, cropped from FIP's white A4 scans and resized to 128 px; `data.json` `logos` maps the FIP team name to `{file, source}`. A crest is downloaded again only when its source URL changes or the file is missing, a failed download keeps the old file, files no team uses are deleted. Committed by the workflow with the data; excluded from the app version. As of 2026-10-04 only 4 of 12 clubs had uploaded one.
- CUS games also carry `fip_opponent` (FIP spelling, the key into `rounds`, `standings` and `logos`) and `sanctions` (Giudice Sportivo "Provvedimenti", published on homologated games). FIP standings count only homologated results: the page takes records from `rounds`, positions and playoff/playout margins from `standings`.
- The baseline PDF is `data/1-CM-calendario-definitivo.pdf`; `source_*` fields in the baseline JSON record where it was published and when it was last checked against the site.
- Player box scores (`playbasket_sync.py`) come from playbasket.it, not FIP: points only, entered by its users, reusable non-commercially with attribution and without altering them (terms checked 2026-10-07). Written to `docs/boxscores.json` (kept out of data.json so the page renders first), keyed by FIP game number. A page is matched to a FIP game by round and oriented final score, confirmed by `PLAYBASKET_TEAM_ALIASES` in `config.py`; no match, no box score. `complete` (points add up to the FIP score) is frozen; `partial`/`unmatched` are retried for 14 days, then frozen (`incomplete`); a FIP score change reopens a game. 5 s between pages, at most 40 pages per run. Match URLs are always built with `urlencode`: playbasket's hrefs contain an unescaped `&gtn=` that html.parser decodes as `&gt`. A blank points cell means listed but did not play.
- `docs/status.json` (`checked_at`) is written on every successful run, is gitignored and reaches the site only through the Pages artifact: a failed run skips the deploy, so the page keeps showing the last successful check. A FIP Sardegna posts outage does not count as a failure.
- Schedule: every 4 hours, plus hourly on Sat/Sun 15-23 UTC (covers 17-24 Italian time in both CEST and CET).
- Tests never read `docs/data.json` (CI runs them before the sync, so a FIP correction would block it): they use frozen copies in `tests/fixtures/` (`rounds-a1.json`, `standings-teams.json`). The live standings are checked against `PLAYBASKET_TEAM_ALIASES` by the `alias-check` job (`uv run fip-calendar-check-aliases`), which runs after the sync and fails on its own without holding back the deploy: a failed run means a team changed its FIP name.

## Web app

- Box scores, league scorers and the CUS players section load `boxscores.json` after the first render (`boxscores.js`, `cus-stats.js`); statistics are computed in the page from pure rules (`scorer-rules.js`, `cus-stats-rules.js`), so `boxscores.json` stays a faithful copy of playbasket.it. Averages count only games a player entered (points set, 0 included). Every new module imported by the page goes into the `SHELL` of `sw.js`.
- Installable: `docs/manifest.webmanifest`, icons in `docs/icons/` and `docs/favicon.ico`, service worker `docs/sw.js`.
- Icons are generated from `docs/logo-cus.png`: after replacing the crest run `uv run --script scripts/make_icons.py`. The apple-touch icon must stay opaque (iOS fills transparency with black).
- `sw.js` is network first: the cache answers only when the network fails, so fip.it data is never served stale while online.
- App version = hash of `docs/` minus FIP data (`appversion.py`), stamped into `sw.js` by `uv run fip-calendar-stamp-sw` in the workflow just before the Pages upload. The repo copy must keep `const VERSION = "dev";`: running the stamp locally rewrites it (restore it), and a second stamp fails on purpose. Not the commit SHA: the data commit every 4 hours would announce a new version each time.
- Update notice (`update.js`, rules in `update-rules.js`): a new worker waits; "Aggiorna" sends `SKIP_WAITING` and every open tab reloads once on `controllerchange`; "Più tardi" hides it until the next opening (startup or return to foreground, server checked at most every 10 minutes). Nothing is shown on a first visit.

## Commands

- `uv run fip-calendar`: fetch fip.it (22 requests, 1 s apart) and FIP Sardegna posts (3 searches), update `docs/data.json` and `docs/calendario.ics`
- `uv run pytest` (`--cov` for line and branch coverage), `uv run ruff check .`, `uv run mypy`; `npm test` for the page's JS rules (`node --test`, no dependencies)
- `scripts/make_icons.py` has its own environment (PEP 723) and is excluded from the project mypy: `uv run --no-project --with pillow --with mypy mypy --strict scripts/make_icons.py`
- Tests run against saved pages in `tests/fixtures/`: when fip.it changes layout, save the new page there and reproduce first.
