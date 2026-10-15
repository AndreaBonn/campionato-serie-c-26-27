# Tasks: scheda avversario

| Id | Task | Stima | Verify | Dip | Req | Par | Rollback |
|---|---|---|---|---|---|---|---|
| T0 | `git pull --ff-only`, baseline `npm test` + `uv run pytest` | 5 min | entrambi verdi, `git log main..origin/main` vuoto | - | R10 | seq | n/a |
| T1 | `opponentGames(team, rounds)`: righe orientate e cronologiche, test-first | 30-45 min | `node --test tests/js/opponent-rules.test.mjs` rosso poi verde (casa, trasferta, 0 gare, senza score esclusa) | T0 | R4 R5 | ok | revert |
| T2 | `scorersState(boxscores, rounds, team, load)` con stati loading/empty/failed/list, `ctx.boxscoresLoad` | 30 min | test sui 4 stati e sul filtro squadra | T1 | R6 | seq | revert |
| T3 | `attributeSanction`, `SANCTION_CLUB_ALIASES`, `opponentSanctions(team, rounds)` | 45-60 min | test sulle 3 stringhe reali, caso senza "soc.", pareggio, negativo appaiato Nuoro/Carbonia; alias rotto → test rosso | T1 | R7 R8 | seq | revert |
| T4 | `renderOpponent(team, ctx)` in `opponent-view.js` | 45-60 min | test a stringhe su testata, Empty, stati marcatori, blocco non attribuite, escape | T1-T3 | R3-R6 R8 | contratto | revert |
| T5 | Trigger `opp-btn` in `renderNext` | 20 min | test: button in renderNext, assente in renderCard e sul lato CUS | T0 | R1 | ok | revert |
| T6 | `<dialog>` + wiring in `index.html`, SHELL di `sw.js` | 30-45 min | `npm test` (sw.test), `index.html` sotto 300 righe | T4 T5 | R2 R6 R10 | seq | revert |
| T7 | Stili dialog in `styles.css` (mobile-first, backdrop, z-index 400, dark, focus-visible) | 30-45 min | render a 375 e 1280, light e dark | T6 | R9 | seq | revert |
| T8 | Click-through Playwright su HTTP, `a11y-gate`, `code-reviewer` | 45 min | elenco controllo → esito, a11y-gate exit 0, console pulita | T7 | R2 R6 R9 R10 | seq | n/a |
