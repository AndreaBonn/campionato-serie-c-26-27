# Scheda avversario (popup dalla "Prossima partita")

Nell'hero "Prossima partita", nome e stemma dell'avversario aprono un `<dialog>` con il profilo della squadra, le sue partite, i marcatori e i provvedimenti alla sua società.

## Requisiti (Definition of Done)

- R1. Nell'hero l'avversario (stemma + nome) è un `<button type="button">` con nome accessibile "Scheda avversario: <nome>"; lato CUS e card della lista invariati.
- R2. Click o Invio aprono il dialog con `showModal()`; Esc, bottone "Chiudi" e click sul backdrop lo chiudono; il focus torna sul trigger.
- R3. Testata: stemma, nome title-case, posizione (o "non ancora in classifica"), vinte/perse, medie fatti/subiti a 1 decimale, badge forma; fonte unica `teamProfile`.
- R4. Tabella per partita in ordine cronologico: giornata, avversario, Casa/Trasferta, punteggio orientato propri-altrui, V/P; gare non omologate con il tag di `resultNote`.
- R5. Con 0 gare giocate: stato Empty "Nessuna partita giocata finora" con spiegazione, nessuna tabella vuota.
- R6. Marcatori dell'avversario (punti, gare, media) da `scorers()` filtrato per squadra; stati distinti "in caricamento", "nessun tabellino disponibile", "tabellini non raggiungibili" (boxscores.json fallito e nessun tabellino già caricato), lista; il dialog aperto si aggiorna all'arrivo di boxscores.json.
- R7. Provvedimenti attribuiti alla società dell'avversario, testo verbatim escapato con giornata e gara; le 3 sanzioni reali di A1/A2 attribuite al lato giusto (Porto Torres, Nuoro, Carbonia), la sanzione di Carbonia non compare sulla scheda di Nuoro.
- R8. Sanzioni non attribuibili mostrate in un blocco separato "Altri provvedimenti nelle sue gare (società non identificata)", mai assegnate né scartate.
- R9. Layout corretto a 375 e 1280 px, light e dark, senza scroll orizzontale della pagina; `a11y-gate` verde sul dialog aperto. Eccezione: il gate focus-trap presuppone un dialog ARIA su `div` e fallisce sul `<dialog>` nativo, dove il focus passa per la UI del browser; misurato che non raggiunge mai la pagina sotto il modale (inert).
- R10. `npm test`, `uv run pytest`, ruff, mypy verdi; moduli nuovi nella SHELL di `sw.js`; nessun file oltre 300 righe, nessuna funzione oltre 30.

## Fuori scope

- Scheda aperta dalle card della lista o dalla classifica (estensione successiva).
- Deduzione di squalifiche in corso o interpretazione di sanzioni a tesserati.
- Modifiche al sync Python, a `data.json` o a `boxscores.json`.
