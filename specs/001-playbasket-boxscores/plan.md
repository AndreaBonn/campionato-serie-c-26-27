# Piano 001: tabellini giocatori da playbasket.it

Data: 2026-10-07. Stato: proposto, da approvare prima dell'implementazione.

## Obiettivo

La sync programmata scarica da playbasket.it i punti per giocatore delle partite del girone già
giocate, li abbina alle partite FIP senza mai inventarne uno, e la pagina mostra tre cose: il
tabellino di ogni partita così come pubblicato, la classifica marcatori del campionato e
un'analisi dei giocatori del CUS. Un guasto di playbasket non ferma mai la sync con fip.it.

## Definition of Done

Fase 1 (dati, nessuna UI)

- [ ] D1. Dopo `uv run fip-calendar` con le 6 partite di A1 giocate, `jq '.boxscores | length' docs/data.json` vale 6 e ogni voce ha `status: "complete"`, `mn` e `url` uguale all'URL costruito per quel `mn`. Esempio: partita FIP `n=6` (BASKET S. ORSOLA - CUS CAGLIARI 62-55) → `mn=6`, somma dei punti di casa 62 e di trasferta 55.
- [ ] D2. Una seconda esecuzione subito dopo non fa nessuna richiesta a playbasket (riga di log `playbasket: 0 pages requested`) e lascia `docs/data.json` invariato.
- [ ] D3. Partita con punteggio FIP, tabellino parziale e data entro 14 giorni: rimane `partial` e viene richiesta a ogni esecuzione. Oltre i 14 giorni diventa `incomplete` senza nuova richiesta e non viene più richiesta.
- [ ] D4. Partita `complete` il cui punteggio FIP cambia (es. da 62-55 a 0-20 per omologazione a tavolino): alla sync successiva torna in lavorazione e lo stato si ricalcola sul nuovo punteggio.
- [ ] D5. Nessuna voce senza abbinamento: se su playbasket nessuna pagina della giornata ha lo stesso punteggio, o il punteggio coincide ma i nomi non passano la tabella alias, la partita ha `status: "unmatched"`, `players` vuoti, e il log nomina la pagina e il nome sconosciuto.
- [ ] D6. playbasket irraggiungibile (URLError su ogni pagina): la sync con fip.it scrive comunque `data.json`, `boxscores` resta identico all'esecuzione precedente, exit code 0, un `WARNING` per pagina fallita.
- [ ] D7. Fra due richieste a playbasket passano almeno 5 secondi (test con `sleep` iniettato: N richieste, N-1 pause da 5.0).
- [ ] D8. Nessuna esecuzione supera il budget di pagine per run (`PLAYBASKET_MAX_PAGES_PER_RUN = 40`): con 15 giornate giocate e stato perso, la prima run chiede 40 pagine e le restanti arrivano nelle run successive.
- [ ] D9. Ogni URL playbasket viene costruito dal codice con `&gtn=` letterale; nessun URL è letto da un `href` (test sull'URL esatto).

Fase 2 (tabellini e marcatori)

- [ ] D10. Nella sezione "Risultati del girone", ogni partita con tabellino apre (pulsante/`<details>`) le due liste giocatori con i punti come pubblicati, le celle vuote mostrate come "-", e un link "Tabellino su playbasket.it" all'URL della partita (solo se inizia con `https://www.playbasket.it/`).
- [ ] D11. Tabellino `partial` o `incomplete`: la dicitura "Tabellino incompleto" è visibile accanto alla partita; `unmatched` non mostra nessun tabellino.
- [ ] D12. Nuova sezione "Classifica marcatori": un giocatore per riga (chiave = id profilo playbasket), squadra col nome FIP, punti totali, partite giocate, media; ordinata per punti decrescenti, a parità per media. Dato verificabile su A1: primo in classifica = il giocatore con più punti fra i 12 tabellini.
- [ ] D13. Footer con attribuzione: dati dei tabellini inseriti dagli utenti di playbasket.it, link a playbasket.it e ai termini d'uso.
- [ ] D14. `npm test` verde, incluso `sw.test.mjs` con i nuovi moduli nella SHELL; render osservato a 375 e 1280 px, `a11y-gate` verde, click-through registrato.

Fase 3 (analisi CUS)

- [ ] D15. Sezione "Giocatori del CUS" con, per ogni giocatore apparso in almeno un tabellino CUS: punti totali, media punti, media in casa, media in trasferta, partite a referto su partite CUS con tabellino (e partite CUS giocate), partite entrato su partite a referto, miglior partita (punti, avversario, data), partite in doppia cifra, quota dei punti di squadra, media in vittorie e in sconfitte, punti nelle ultime 5 partite CUS con tabellino.
- [ ] D16. Ogni metrica ha un test con valori concreti in `tests/js/cus-stats-rules.test.mjs`. Esempio: giocatore con referti 12, null, 0 nelle tre partite → entrato 2 su 3 a referto, media 6.0, doppia cifra 1.

## Assunzioni

- A1. Cella Pts vuota = giocatore a referto ma non entrato in campo; "0" = entrato senza segnare. Non verificabile dalla fonte (le altre colonne, minuti compresi, sono "-"). Conseguenza: le medie dividono per le partite con Pts valorizzato, non per quelle a referto. La pagina lo dichiara in una nota. Se l'utente intende diversamente cambia solo `cus-stats-rules.js` e `scorer-rules.js`.
- A2. Identità del giocatore = parametro `obj` dell'href `profile.php` (es. `obj=195887` in m6), con fallback sul nome normalizzato se il parametro manca. Nessun URL di navigazione viene ricostruito da quell'href: se ne legge solo un parametro numerico. Da verificare in T005 sui fixture che `obj` sia stabile fra partite diverse dello stesso giocatore (servono due fixture con lo stesso giocatore; se non disponibili si usa il nome e si annota).
- A3. "Partita giocata" = `score` non nullo nella partita di `rounds` (FIP), qualunque sia lo `status`.
- A4. Finestra di 14 giorni contata sulla data FIP della partita, in ora italiana (`Europe/Rome`). Una partita mai tentata (nessuna voce in `boxscores`) viene tentata una volta anche se è già oltre i 14 giorni: serve a recuperare l'intero campionato (D4 dell'utente) se la funzione arriva in produzione tardi o se lo stato si perde. Dopo quel tentativo valgono le regole normali.
- A5. Orientamento casa/ospite uguale fra FIP e playbasket. Una partita a campo invertito su playbasket non si abbina (finisce `unmatched` col log); non si gestisce lo scambio finché non succede.
- A6. Su un tabellino `partial`/`incomplete` le statistiche usano i punti presenti e la pagina lo dice ("di cui N tabellini incompleti"). Le statistiche non escludono i parziali: un giocatore mancante non deve azzerare i punti degli altri.
- A7. Le statistiche si calcolano nel JS della pagina con regole pure testate (motivazione in Disambiguazione). `data.json` conserva solo i tabellini come pubblicati e lo stato di abbinamento.
- A8. Verificato in T001 (2026-10-07): `Content-type: text/html; charset=UTF-8`. Pagine playbasket in UTF-8: nessun `<meta charset>` nel fixture, da confermare in T001 con l'header `Content-Type` della risposta reale; se diverso si decodifica col charset dichiarato.
- A9. Nessun campo che cambia a ogni run (niente `checked_at` per tabellino): altrimenti `data.json` cambierebbe ogni 4 ore e il workflow farebbe un commit dati a ogni run.
- A10. Decisione utente (R6, 2026-10-07): i tabellini vivono in un file separato `docs/boxscores.json` fin dalla fase 1, non in `data.json`. `data.json` blocca il primo render, i tabellini si caricano dopo; i commit dati restano leggibili; nessuna migrazione futura. Conseguenze: `boxscores.json` va in `DATA_FILES` di `appversion.py`, nel `git add`/`git status` del workflow e caricato dalla pagina con un fetch separato (assente o rotto → sezioni tabellini nascoste, il resto della pagina funziona). Scritto con la stessa regola di `write_if_changed` (timestamp escluso dal confronto).

## Disambiguazione

Approcci per il calcolo delle statistiche (elencati prima di valutarli):

- Opzione A: statistiche pre-calcolate in Python e scritte in `data.json`.
- Opzione B: `data.json` porta solo i tabellini, le statistiche si calcolano nel JS della pagina con regole pure.

Implicazioni:

- A: tipi statici e mypy strict, ma ogni metrica è un dato derivato duplicato in `data.json`, ogni cambio di formula riscrive `data.json` e genera un commit dati; aggiungere una metrica richiede una sync.
- B: stesso pattern già usato per `formSummary`, `teamProfile`, `zoneStatus` (`docs/page-rules.js`), test con `node --test` senza dipendenze, `data.json` resta la copia fedele della fonte (coerente con "senza alterare l'opera"), una metrica nuova è una release della app e non tocca i dati. Costo: calcolo nel browser su circa 3000 righe, trascurabile.
- Raccomandata: B. A2/A1 (identità e semantica delle celle) restano in un solo punto, le regole JS.

Nessun'altra disambiguazione cambia l'architettura.

## Schema JSON proposto (`docs/boxscores.json`)

File separato (A10) con chiave di primo livello `boxscores`, oggetto indicizzato dal numero di gara FIP `n` (stringa, unico in tutta la stagione):

```json
"boxscores": {
  "6": {
    "round": "A1",
    "status": "complete",
    "fip_score": {"home": 62, "away": 55},
    "mn": 6,
    "url": "https://www.playbasket.it/sardegna/match.php?lt=2&lr=SA&lp=CA&lc=C%2FM&lg=1&season=2027&lf=M&gtt=1&gtn=1&mn=6",
    "home": {
      "team": "S. Orsola Sassari",
      "players": [
        {"id": "195887", "number": "7", "name": "Rossi Mario", "role": "ala piccola", "age": "'08", "pts": 12},
        {"id": "177124", "number": "10", "name": "Bianchi Luca", "role": "", "age": "U19", "pts": null}
      ]
    },
    "away": {"team": "Cus Cagliari", "players": []}
  },
  "1": {"round": "A1", "status": "unmatched", "fip_score": {"home": 77, "away": 61}, "mn": null, "url": null, "home": null, "away": null}
}
```

- `status`: `complete` (somma punti = punteggio FIP per entrambe, congelata), `partial` (abbinata, somme diverse, entro 14 giorni), `incomplete` (abbinata, somme diverse, oltre 14 giorni, congelata), `unmatched` (nessuna pagina abbinata; ritentata entro 14 giorni, congelata dopo).
- `fip_score`: punteggio FIP al momento dell'ultimo controllo. Se diverge da quello corrente in `rounds` la voce torna in lavorazione (D3 utente).
- `pts`: intero o `null` (cella vuota, vedi A1). `team`: nome come scritto su playbasket; la pagina usa il nome FIP prendendolo da `rounds` via `n`.
- Valori di `status` esposti come costanti sia in Python sia in JS (`boxscore-rules.js`).

## Tempo di esecuzione (vincolo: `timeout-minutes: 10`)

Costo per pagina: 5 s di pausa + circa 1-2 s di download (pagine da circa 210 KB). La sync fip.it già esistente: 22 richieste con 1 s di pausa, circa 45 s; più notizie e stemmi.

| Scenario | Pagine playbasket | Tempo stimato |
|---|---|---|
| Regime (nessuna partita pendente) | 0 | 0 |
| Weekend di gara, giornata appena giocata | 6 (meno se si parte dal `mn` atteso e ci si ferma quando tutte le pendenti sono abbinate) | circa 40 s |
| Caso peggiore realistico in finestra 14 giorni: 2-3 giornate pendenti | 12-18 | circa 2 min |
| Prima esecuzione oggi (solo A1 giocata) | 6 | circa 40 s |
| Stato perso a fine stagione (22 giornate mai tentate) | 132 senza limite | circa 15 min: oltre il timeout |

Il budget `PLAYBASKET_MAX_PAGES_PER_RUN = 40` (circa 4-5 min) chiude l'ultimo caso: il recupero si spalma su 4 run, cioè circa 16 ore. Il timeout del workflow non si tocca. Ordine di priorità dentro il budget: prima le partite ancora nella finestra di 14 giorni, dalla più vecchia (è quella che scade per prima), poi le mai tentate fuori finestra, in ordine di giornata. Pagine già legate a una partita congelata (`mn` noto) non si richiedono.

## Fasi

Tutte indipendentemente mergiabili: dopo la fase 1 `data.json` accumula i tabellini senza che la pagina cambi (e la raccolta parte prima che i 14 giorni di A1 scadano il 2026-10-17); dopo la fase 2 la pagina è completa per tabellini e marcatori anche se la fase 3 non arriva mai.

### Fase 1: raccolta e abbinamento (Python, nessuna UI)

Moduli nuovi, ciascuno sotto le 300 righe:

- `src/fip_calendar/playbasket.py`: parsing puro della pagina partita (titolo → squadre e punteggio; tabelle `#tableStandingsTeam0/1` → giocatori). Eccezione `PlaybasketParseError`.
- `src/fip_calendar/boxscores.py`: logica pura: selezione delle partite pendenti, abbinamento per punteggio con verifica alias, calcolo dello stato, fusione con lo stato precedente.
- `src/fip_calendar/playbasket_sync.py`: orchestrazione con `fetch` e `sleep` iniettati (testabile senza rete), budget pagine, gestione guasti per pagina.
- `config.py`: costanti e tabella alias (12 voci, chiave = nome playbasket, valore = nome FIP).
- `fetch.py`: `playbasket_match_url()` e `fetch_playbasket_match()`.
- `cli.py`: chiamata, lettura dello stato precedente da `docs/boxscores.json` e scrittura con `write_if_changed`.
- `appversion.py`: `boxscores.json` in `DATA_FILES`. Workflow: `docs/boxscores.json` nel `git status`/`git add` del commit dati.

### Fase 2: tabellini e classifica marcatori (UI)

- `docs/boxscore-rules.js` (puro): vista del tabellino, etichetta di stato, validazione del link.
- `docs/scorer-rules.js` (puro): classifica marcatori.
- `docs/boxscores.js`: rendering (tabellino nella tabella della giornata, sezione marcatori). `index.html` cresce di poche righe (import, una `<section>`, una chiamata): resta circa 410 righe, già oltre 300 e non va peggiorata oltre.
- `docs/sw.js`: nuovi file nella SHELL (`sw.test.mjs` lo verifica). `appversion.py` non cambia: i nuovi JS sono file della app e finiscono nell'hash; `data.json` è già escluso (`DATA_FILES`).

### Fase 3: analisi giocatori CUS (UI)

- `docs/cus-stats-rules.js` (puro) e `docs/cus-stats.js` (rendering), sezione `#cus-players`.

## Sub-task

Dettaglio, dipendenze e requisito tracciato in `tasks.md`. Stima: fase 1 circa 5-6 h, fase 2 circa 3-4 h, fase 3 circa 2.5-3 h; totale 10.5-13 h più 20% di buffer per imprevisti sulla fonte (layout playbasket, dati utente sporchi): 12.5-15.5 h.

## File impattati

| File | Tipo | Scopo |
|---|---|---|
| `tests/fixtures/playbasket-a1-m{1..6}.html`, `playbasket-a2-m1-unplayed.html`, `playbasket-r1-m1-unplayed.html` | nuovo | pagine reali dalla scratchpad |
| `src/fip_calendar/config.py` | modifica | URL base, query, pausa 5 s, 14 giorni, budget, alias |
| `src/fip_calendar/fetch.py` | modifica | URL costruito e download |
| `src/fip_calendar/playbasket.py` | nuovo | parsing |
| `src/fip_calendar/boxscores.py` | nuovo | selezione, abbinamento, stato |
| `src/fip_calendar/playbasket_sync.py` | nuovo | orchestrazione, budget, guasti |
| `src/fip_calendar/cli.py` | modifica | `data["boxscores"]` |
| `tests/test_playbasket.py`, `tests/test_boxscores.py`, `tests/test_playbasket_sync.py`, `tests/test_fetch.py`, `tests/test_cli.py`, `tests/test_config.py` | nuovo/modifica | test |
| `docs/boxscore-rules.js`, `docs/scorer-rules.js`, `docs/boxscores.js` | nuovo | fase 2 |
| `docs/cus-stats-rules.js`, `docs/cus-stats.js` | nuovo | fase 3 |
| `tests/js/boxscore-rules.test.mjs`, `scorer-rules.test.mjs`, `cus-stats-rules.test.mjs` | nuovo | test JS |
| `docs/index.html` | modifica | import, sezioni, footer attribuzione |
| `docs/sw.js` | modifica | SHELL |
| `CLAUDE.md` | modifica | data flow e comandi |

## Rischi e mitigazioni

- R1 (critico, già noto): `&gtn=` negli href viene decodificato da html.parser come `&gt` → `>n=`. Mitigazione: URL solo costruiti con `urlencode` (test sulla stringa esatta, D9); dagli href si legge solo `obj`.
- R2: dati inseriti da utenti, punteggio su playbasket diverso da FIP → nessun abbinamento. Mitigazione: `unmatched` con log; mai abbinamento per soli nomi. Effetto: tabellino mancante, accettato da D1 utente.
- R3: due partite della stessa giornata con lo stesso punteggio e alias assente o ambiguo. Mitigazione: tie-break alias; se resta ambiguo nessuna delle due viene abbinata (test dedicato).
- R4: playbasket cambia layout o titolo. Mitigazione: `PlaybasketParseError` per pagina, la pagina conta come fallita, lo stato precedente resta; il procedimento è quello del CLAUDE.md (salvare la pagina nuova in fixture e riprodurre).
- R5: timeout del workflow nel recupero massivo. Mitigazione: budget 40 pagine (D8), tabella sopra.
- R6: churn di commit dati se lo stato contiene campi volatili. Mitigazione: A9, test che due run identiche producono `data.json` identico (D2).
- R7: un tabellino con un giocatore in più sul referto di playbasket (errore utente) supera il punteggio FIP: resta `partial` per sempre fino ai 14 giorni. Accettato, è il comportamento previsto da D2 utente.
- R8: termini d'uso: classifica e analisi sono elaborazioni dei dati, non l'opera riprodotta. Scelta già presa dall'utente; il tabellino per partita resta identico alla fonte e ogni partita linka la pagina originale.
- R9: verificato in T001 (2026-10-07): `User-agent: *` vieta solo error.php, denied.php, denied.htm, db_error.htm, ext_link.php, emoticons.php; `match.php` ammesso. Mitigazione: T001 lo controlla prima della prima richiesta automatica; se `match.php` è escluso ci si ferma e si riporta all'utente (bloccante).
- R10: `index.html` già a 401 righe e `cli.py` a 192: tutta la logica nuova sta in moduli separati.

## Criteri di verifica

- `uv run pytest --cov` verde, copertura dei moduli nuovi almeno 80% righe e rami; `uv run ruff check .`, `uv run mypy` verdi; `npm test` verde.
- Run reale: `uv run fip-calendar > run.log 2>&1`, poi `grep "playbasket" run.log` mostra 6 pagine richieste e 6 `complete`; `jq '.boxscores["6"].status' docs/data.json` = `"complete"`; seconda run: `0 pages requested` e `git status --porcelain docs/data.json` vuoto.
- Pagina servita con `python3 -m http.server -d docs` (via `uv run`): tabellino di S. Orsola - CUS apribile con 62 e 55 come somme, link a playbasket funzionante, marcatori e sezione CUS visibili a 375 e 1280 px, `a11y-gate` verde.
