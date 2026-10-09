# CUS Cagliari Basket, calendario Serie C 2026/27

Pagina web con le 22 partite del CUS Cagliari nella Serie C regionale sarda, aggiornata in automatico dal sito della FIP.

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-%3E%3D3.12-3776ab)
![Sync](https://github.com/AndreaBonn/campionato-serie-c-26-27/actions/workflows/sync-fip.yml/badge.svg)

La pagina è pubblicata su **https://andreabonn.github.io/campionato-serie-c-26-27/** e si può installare sul telefono come app.

Un job di GitHub Actions legge le pagine dei risultati di fip.it ogni 4 ore, e ogni ora il sabato e la domenica dalle 17 a mezzanotte. A ogni lettura aggiorna:

- giorno, ora e campo di ogni gara, segnalando cosa è cambiato rispetto al comunicato ufficiale;
- gli arbitri, appena la FIP li pubblica;
- risultati e classifica ufficiale, con i risultati di tutto il girone giornata per giornata;
- il calendario in abbonamento `calendario.ics`, da aggiungere a Google Calendar o all'app Calendario;
- le comunicazioni della FIP Sardegna su formula, playoff e playout.

La pagina mostra anche la prossima partita, le soste, i link a Google Maps e Google Calendar, l'andamento del CUS, il risultato dell'andata nelle gare di ritorno e l'orario dell'ultimo controllo riuscito su fip.it.

## In pratica

Ogni gara in `docs/data.json` porta i dati correnti di fip.it accanto a quelli del comunicato ufficiale. Questo è l'estratto della gara n. 17, spostata dalla FIP di un giorno e di un'ora:

```json
{
  "round": "A3",
  "n": 17,
  "home": "Olimpia Cagliari",
  "away": "CUS Cagliari",
  "date": "2026-10-18",
  "time": "19:00",
  "official": { "date": "2026-10-17", "time": "18:00" },
  "changes": ["date", "time"],
  "status": "non-designata"
}
```

La pagina legge `changes` e mostra sotto la gara "Modificata dalla FIP", con data, ora e campo del comunicato.

## Architettura

```mermaid
flowchart LR
    comunicato["data/calendario-comunicato.json"] --> sync["uv run fip-calendar"]
    fip["fip.it/risultati"] --> sync
    posts["sardegna.fip.it (WordPress API)"] --> sync
    sync --> data["docs/data.json"]
    sync --> ics["docs/calendario.ics"]
    data --> page["docs/index.html su GitHub Pages"]
    ics --> page
```

Lo scraper gira solo dentro GitHub Actions; la pagina è statica ed è il browser a scaricare `data.json`.

- Le gare si abbinano per numero di gara FIP (`n`), mai per nome della squadra: su fip.it i nomi includono gli sponsor.
- `docs/data.json` e `docs/calendario.ics` vengono riscritti e committati solo quando il contenuto cambia, quindi la cronologia git registra ogni variazione decisa dalla FIP.
- `docs/status.json` (ultimo controllo riuscito) non è versionato: arriva al sito solo con l'artefatto di Pages. Se una sincronizzazione fallisce, il deploy salta e la pagina continua a mostrare l'ultimo controllo andato a buon fine.
- Se l'API della FIP Sardegna non risponde, restano le comunicazioni già note e la sincronizzazione non fallisce.

## Stack tecnologico

- **Sincronizzazione**: Python 3.12+, `beautifulsoup4`, `urllib` della libreria standard
- **Pagina**: HTML e JavaScript senza framework né build, web app manifest, service worker
- **Pubblicazione**: GitHub Actions e GitHub Pages
- **Sviluppo**: uv, pytest, ruff, mypy in modalità strict, `node --test`

## Prerequisiti

- [uv](https://docs.astral.sh/uv/)
- Python 3.12 o successivo (uv lo installa se manca)
- Node.js, solo per i test JavaScript

## Installazione

```bash
git clone https://github.com/AndreaBonn/campionato-serie-c-26-27.git
cd campionato-serie-c-26-27
uv sync
```

## Esecuzione locale

```bash
uv run fip-calendar                                   # legge fip.it e aggiorna docs/data.json e docs/calendario.ics
uv run python -m http.server 8765 --directory docs    # apri http://127.0.0.1:8765
```

`fip-calendar` fa 22 richieste a fip.it, a un secondo di distanza l'una dall'altra, più 3 ricerche sulle comunicazioni della FIP Sardegna.

La pagina va aperta via HTTP: da file locale il browser blocca la lettura di `data.json`.

Non c'è configurazione tramite variabili d'ambiente: girone, URL e tempi di attesa sono costanti in `src/fip_calendar/config.py`.

### Web app

La pagina si installa grazie a `docs/manifest.webmanifest` e al service worker `docs/sw.js`. Il service worker lavora in modalità network first: la cache risponde solo quando la rete non c'è, così online i dati FIP non sono mai vecchi.

Quando esce una nuova versione della pagina compare un avviso con due scelte: "Aggiorna" ricarica tutte le schede aperte, "Più tardi" lo nasconde fino alla prossima apertura. La versione è un hash dei file di `docs/` esclusi i dati FIP, calcolato da `uv run fip-calendar-stamp-sw` durante il deploy. La copia nel repository deve mantenere `const VERSION = "dev";`: se lanci il comando in locale, ripristina il file.

Le icone si generano dallo stemma `docs/logo-cus.png`:

```bash
uv run --script scripts/make_icons.py
```

## Struttura del repository

```text
.
├── data/                 # calendario del Comunicato Ufficiale n. 1 del 23/09/2026 (JSON trascritto e PDF originale)
├── docs/                 # sito pubblicato: pagina, dati generati, calendario .ics, manifest, service worker, icone
├── scripts/              # generazione delle icone (script PEP 723 con ambiente proprio)
├── src/fip_calendar/     # lettura di fip.it, confronto con il comunicato, .ics, comunicazioni FIP Sardegna
├── tests/                # test pytest, pagine fip.it salvate in fixtures/, test JS in js/
└── .github/workflows/    # sincronizzazione programmata e deploy su Pages
```

`docs/data.json` e `docs/calendario.ics` sono generati: non vanno modificati a mano.

## Testing

```bash
uv run pytest        # test Python
uv run ruff check .  # lint
uv run mypy          # type check strict su src/ e tests/
npm test             # regole dell'avviso di aggiornamento (node --test, nessuna dipendenza)
```

I test girano sulle pagine di fip.it salvate in `tests/fixtures/`, senza rete. Quando fip.it cambia struttura, salva lì la nuova pagina e riproduci il problema in un test prima di correggere lo scraper.

## Deploy e CI/CD

Un solo workflow, `.github/workflows/sync-fip.yml`, parte a ogni push su `main`, su richiesta manuale e secondo questo calendario:

| Quando | Cron (UTC) |
|---|---|
| Ogni 4 ore | `17 */4 * * *` |
| Sabato e domenica, ogni ora dalle 17 a mezzanotte ora italiana | `47 15-23 * * 0,6` |

Il job esegue i test Python e JavaScript, lancia `fip-calendar`, committa `data.json` e `calendario.ics` se sono cambiati, marca la versione del service worker e pubblica `docs/` su GitHub Pages.

Se fip.it non risponde o la struttura delle pagine è cambiata, il job si ferma senza toccare `data.json` e GitHub invia un'email di notifica. Il log indica cosa non è stato trovato.

## Limiti

- fip.it non ha un'API pubblica documentata: lo scraper legge l'HTML delle pagine dei risultati e va aggiornato quando la FIP cambia il layout.
- La formula di playoff e playout mostrata nella pagina è quella della stagione 2025/26.
- GitHub sospende i workflow programmati dopo 60 giorni senza attività sul repository.

## Sicurezza

La pagina non ha login, form né segreti: mostra dati pubblici della FIP. Per segnalare una vulnerabilità, consulta [SECURITY.md](./SECURITY.md).

## Licenza

Il codice è rilasciato con licenza MIT, vedi [LICENSE](./LICENSE). Lo stemma del CUS Cagliari (`docs/logo-cus.png`) e il comunicato ufficiale FIP (`data/1-CM-calendario-definitivo.pdf`) restano dei rispettivi titolari e non sono coperti dalla licenza.

## Sostieni il progetto

Se questo progetto ti è stato utile, lascia una stella su [GitHub](https://github.com/AndreaBonn/campionato-serie-c-26-27): aiuta altri a scoprirlo.

Il calendario CUS Cagliari Basket è gratuito. Se ti è utile e vuoi contribuire, puoi lasciare un'offerta tramite PayPal. L'importo lo scegli tu ed è del tutto facoltativo.

<p align="center">
  <a href="https://paypal.me/AndreaBonacci19"><img src="https://img.shields.io/badge/Dona-PayPal-00457C?logo=paypal&logoColor=white&style=for-the-badge" alt="Dona con PayPal"></a>
</p>
