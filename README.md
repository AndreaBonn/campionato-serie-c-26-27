# CUS Cagliari Basket, calendario Serie C 2026/27

Pagina web con le 22 partite del CUS Cagliari nella Serie C regionale sarda, che si aggiorna da sola leggendo il sito della FIP.

Ogni 4 ore un job di GitHub Actions legge le pagine dei risultati su fip.it e aggiorna:

- giorno, ora e campo di ogni gara, segnalando quando cambiano rispetto al comunicato ufficiale;
- gli arbitri, appena la FIP li pubblica;
- i risultati e la classifica ufficiale.

La pagina mostra anche la prossima partita, le soste e i link per Google Maps e Google Calendar, e permette di scaricare tutte le gare in un file `.ics`.

## Come è fatto

| Percorso | Contenuto |
|---|---|
| `data/calendario-comunicato.json` | Calendario del Comunicato Ufficiale n. 1 del 23/09/2026 (fonte: `data/1-CM-calendario-definitivo.pdf`) |
| `src/fip_calendar/` | Lettura di fip.it e confronto con il comunicato |
| `docs/index.html` | La pagina pubblicata |
| `docs/data.json` | Dati generati dal job: non modificarlo a mano |
| `.github/workflows/sync-fip.yml` | Job programmato e pubblicazione su GitHub Pages |

`docs/data.json` viene riscritto e committato solo quando i dati FIP cambiano, quindi la cronologia git mostra ogni variazione.

## Uso in locale

```bash
uv sync
uv run fip-calendar          # aggiorna docs/data.json da fip.it
uv run pytest                # test
uv run python -m http.server 8765 --directory docs   # apri http://127.0.0.1:8765
```

La pagina va aperta via HTTP: da file locale il browser blocca la lettura di `data.json`.

## Se il job fallisce

Il job si ferma e non tocca `data.json` se fip.it non risponde o se la struttura delle pagine è cambiata. GitHub invia una email di notifica. Nel log del job l'errore indica cosa non è stato trovato. Le pagine salvate in `tests/fixtures/` servono a riprodurre il caso nei test.

## Limiti

- fip.it non ha un'API pubblica documentata: lo scraper legge l'HTML delle pagine dei risultati.
- La formula di playoff e playout indicata nella pagina è quella della stagione 2025/26.
- GitHub sospende i job programmati dopo 60 giorni senza attività sul repository.
