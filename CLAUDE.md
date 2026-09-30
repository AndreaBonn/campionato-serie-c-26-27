# campionato-serie-c-26-27

Static page (GitHub Pages, `docs/`) for CUS Cagliari's Serie C 2026/27 games, kept in sync with fip.it by a scheduled GitHub Action.

## Data flow

`data/calendario-comunicato.json` (official baseline, hand-transcribed from the PDF) + fip.it/risultati pages (girone 85305, `codice_ar=1` andata, `0` ritorno) → `src/fip_calendar` → `docs/data.json` → `docs/index.html`.

- Games are matched by FIP game number (`n`), never by team name: FIP names include sponsors (e.g. "CAMPING LA SALINA CALASETTA").
- `changes` lists fields that differ from the baseline (`date`, `time`, `venue`, `home`).
- `docs/data.json` is generated; it is rewritten only when content changes (`updated_at` excluded from the comparison).
- A referee slot can contain the placeholder "Designazione in attesa di conferma.": it is filtered out.
- `docs/calendario.ics` (subscribable feed, `ics.py`) is regenerated only when data.json changes or the file is missing: after changing `ics.py`, delete the file and run `uv run fip-calendar`.
- `data.json` also carries every league game per round (`rounds`) and FIP Sardegna posts about format/playoff (`notices`, `notices.py`); if the WordPress API is down the previous notices are kept.
- `docs/status.json` (`checked_at`) is written on every successful run, is gitignored and reaches the site only through the Pages artifact: a failed run skips the deploy, so the page keeps showing the last successful check. A FIP Sardegna posts outage does not count as a failure.
- Schedule: every 4 hours, plus hourly on Sat/Sun 15-23 UTC (covers 17-24 Italian time in both CEST and CET).

## Commands

- `uv run fip-calendar`: fetch fip.it (22 requests, 1 s apart) and FIP Sardegna posts (3 searches), update `docs/data.json` and `docs/calendario.ics`
- `uv run pytest`, `uv run ruff check .`, `uv run mypy`
- Tests run against saved pages in `tests/fixtures/`: when fip.it changes layout, save the new page there and reproduce first.
