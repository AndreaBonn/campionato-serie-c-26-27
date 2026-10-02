# campionato-serie-c-26-27

Static page (GitHub Pages, `docs/`) for CUS Cagliari's Serie C 2026/27 games, kept in sync with fip.it by a scheduled GitHub Action.

## Data flow

`data/calendario-comunicato.json` (official baseline, hand-transcribed from the PDF) + fip.it/risultati pages (girone 85305, `codice_ar=1` andata, `0` ritorno) → `src/fip_calendar` → `docs/data.json` → `docs/index.html`.

- Games are matched by FIP game number (`n`), never by team name: FIP names include sponsors (e.g. "CAMPING LA SALINA CALASETTA").
- `changes` lists fields that differ from the baseline (`date`, `time`, `venue`, `home`).
- `docs/data.json` is generated; it is rewritten only when content changes (`updated_at` excluded from the comparison).
- A referee slot can contain the placeholder "Designazione in attesa di conferma.": it is filtered out.
- `docs/calendario.ics` (subscribable feed, `ics.py`) is regenerated only when data.json changes or the file is missing: after changing `ics.py`, delete the file and run `uv run fip-calendar`.
- `data.json` also carries every league game per round (`rounds`) and FIP Sardegna notices (`notices`, `notices.py`) from three sources, each tagged with `kind`: keyword searches on format/playoff (`formula`), the "C REGIONALE" category (`serie-c`) and the `comunicato` post type filtered on Serie C (`comunicato`, where other regions publish Giudice Sportivo decisions; empty for Sardegna as of 2026-10-02). If the WordPress API is down the previous notices are kept.
- The baseline PDF is `data/1-CM-calendario-definitivo.pdf`; `source_*` fields in the baseline JSON record where it was published and when it was last checked against the site.
- `docs/status.json` (`checked_at`) is written on every successful run, is gitignored and reaches the site only through the Pages artifact: a failed run skips the deploy, so the page keeps showing the last successful check. A FIP Sardegna posts outage does not count as a failure.
- Schedule: every 4 hours, plus hourly on Sat/Sun 15-23 UTC (covers 17-24 Italian time in both CEST and CET).

## Web app

- Installable: `docs/manifest.webmanifest`, icons in `docs/icons/` and `docs/favicon.ico`, service worker `docs/sw.js`.
- Icons are generated from `docs/logo-cus.png`: after replacing the crest run `uv run --script scripts/make_icons.py`. The apple-touch icon must stay opaque (iOS fills transparency with black).
- `sw.js` is network first: the cache answers only when the network fails, so fip.it data is never served stale while online.
- App version = hash of `docs/` minus FIP data (`appversion.py`), stamped into `sw.js` by `uv run fip-calendar-stamp-sw` in the workflow just before the Pages upload. The repo copy must keep `const VERSION = "dev";`: running the stamp locally rewrites it (restore it), and a second stamp fails on purpose. Not the commit SHA: the data commit every 4 hours would announce a new version each time.
- Update notice (`update.js`, rules in `update-rules.js`): a new worker waits; "Aggiorna" sends `SKIP_WAITING` and every open tab reloads once on `controllerchange`; "Più tardi" hides it until the next opening (startup or return to foreground, server checked at most every 10 minutes). Nothing is shown on a first visit.

## Commands

- `uv run fip-calendar`: fetch fip.it (22 requests, 1 s apart) and FIP Sardegna posts (3 searches), update `docs/data.json` and `docs/calendario.ics`
- `uv run pytest`, `uv run ruff check .`, `uv run mypy`; `npm test` for the page's JS rules (`node --test`, no dependencies)
- `scripts/make_icons.py` has its own environment (PEP 723) and is excluded from the project mypy: `uv run --no-project --with pillow --with mypy mypy --strict scripts/make_icons.py`
- Tests run against saved pages in `tests/fixtures/`: when fip.it changes layout, save the new page there and reproduce first.
