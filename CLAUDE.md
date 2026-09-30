# campionato-serie-c-26-27

Static page (GitHub Pages, `docs/`) for CUS Cagliari's Serie C 2026/27 games, kept in sync with fip.it by a scheduled GitHub Action.

## Data flow

`data/calendario-comunicato.json` (official baseline, hand-transcribed from the PDF) + fip.it/risultati pages (girone 85305, `codice_ar=1` andata, `0` ritorno) → `src/fip_calendar` → `docs/data.json` → `docs/index.html`.

- Games are matched by FIP game number (`n`), never by team name: FIP names include sponsors (e.g. "CAMPING LA SALINA CALASETTA").
- `changes` lists fields that differ from the baseline (`date`, `time`, `venue`, `home`).
- `docs/data.json` is generated; it is rewritten only when content changes (`updated_at` excluded from the comparison).
- A referee slot can contain the placeholder "Designazione in attesa di conferma.": it is filtered out.

## Commands

- `uv run fip-calendar`: fetch fip.it (22 requests, 1 s apart) and update `docs/data.json`
- `uv run pytest`, `uv run ruff check .`, `uv run mypy`
- Tests run against saved pages in `tests/fixtures/`: when fip.it changes layout, save the new page there and reproduce first.
