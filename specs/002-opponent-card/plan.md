# Piano: scheda avversario

Requisiti in `spec.md`, scomposizione in `tasks.md`.

## Approccio

- Regole pure in `docs/opponent-rules.js` (righe partita orientate, marcatori filtrati, attribuzione sanzioni), testate con `node --test`.
- Rendering in `docs/opponent-view.js`: `renderOpponent(team, ctx)` restituisce l'HTML del contenuto del dialog. È il contratto usato dal wiring.
- Trigger in `renderNext` (`docs/games-view.js`): `<button class="opp-btn" data-opponent="<nome FIP>" aria-haspopup="dialog">`, solo nell'hero e solo per gara non giocata.
- `<dialog>` statico in `docs/index.html`, apertura per delega di click su `[data-opponent]`, re-render all'arrivo di boxscores se aperto. Se il wiring supera ~15 righe va in un modulo `opponent.js`.

## Decisioni

- D1. Le sanzioni vengono attribuite in JS, nella pagina, non nel sync Python: `data.json` resta una copia fedele della FIP.
- D2. Regola di attribuzione (`attributeSanction(text, home, away, teams)`):
  1. Il testo deve iniziare con "soc."; la ragione sociale è il tratto fino al primo ":". In caso contrario la sanzione non è attribuita.
  2. Prima si consulta l'alias esplicito `SANCTION_CLUB_ALIASES` (costante JS), con match per prefisso normalizzato. Contiene `C.M.B. PORTO TORRES -> CENTRO MINIBK P.TORRES`, perché "TORRES" è condiviso con SEF TORRES.
  3. Poi l'euristica: nomi normalizzati, senza stopword (ASD, SSD, DIL, POL, SOC, BASKET, PALL, PALLACANESTRO) e senza parole sotto le 3 lettere (`MIN_TOKEN = 3`: SS, DI, LA sono forme giuridiche o particelle), confrontati sui soli token distintivi fra le squadre del girone. Vince il lato con overlap strettamente maggiore. Un pareggio o uno zero lasciano la sanzione non attribuita.
- D3. Le sanzioni non attribuite si mostrano a parte e non si escludono: escluderle nasconderebbe una possibile multa, attribuirle a caso mentirebbe.
- D4. Lo stato del caricamento è `ctx.boxscoresLoad` (`loading` | `ready` | `failed`), perché `ctx.boxscores` vale `{}` sia prima sia dopo un caricamento vuoto. `loadBoxscores` restituisce `true`/`false` e `scorersState(boxscores, rounds, team, load)` ne deriva lo stato della sezione.
- D5. La tabella per partita include i risultati non omologati, marcati, coerente con `teamProfile`, e le gare contro CUS.

## Rischi

- La FIP rinomina una squadra: l'alias stantio porta la sanzione a "non attribuita", senza errore.
- Il click sul backdrop chiude anche cliccando nel padding del dialog: serve un wrapper interno, da verificare nel click-through.
- Il bottone inline nella riga `.m` dell'hero può rompere l'allineamento a 375 px.
- `index.html` è vicino al limite di 300 righe.

## Verifica

Test JS e Python verdi, click-through Playwright su HTTP (mai `file://`), `a11y-gate` e render a 375/1280 in light e dark, `code-reviewer` (Tier 2), `/analyze 002-opponent-card`.
