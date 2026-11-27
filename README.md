# 3Gtrade CRM

CRM multi-tenant ispirato a [vtenext](https://www.vtenext.com/), scritto da zero in TypeScript.
Questo è il **primo nucleo**: anagrafiche, permessi e motore dei moduli guidato da metadati.
I workflow configurabili girano sul sistema di eventi; il BPM (processi a più passi) arriverà sopra lo stesso motore.

| Strato        | Tecnologia                                   |
| ------------- | -------------------------------------------- |
| API           | Node.js 22, NestJS 10, `pg` (SQL esplicito)  |
| Database      | PostgreSQL 16, JSONB, Row Level Security     |
| Interfaccia   | React 18, Vite, React Router                 |
| Test          | Jest + Supertest su PostgreSQL reale         |

## Cosa c'è

- **Multi-tenant dal primo giorno**: ogni tabella ha `tenant_id` e una policy RLS. Il tenant viene
  impostato per transazione (`app.tenant_id`); senza tenant le query non restituiscono righe.
- **Utenti, ruoli e profili** come in vtenext:
  - i *ruoli* formano una gerarchia: un utente vede i record dei ruoli sottostanti;
  - i *profili* danno i permessi per modulo (vedere, creare, modificare, eliminare) e per campo
    (visibile, modificabile); un ruolo può avere più profili, i permessi si sommano;
  - la *condivisione* per modulo può essere privata, pubblica in lettura o in lettura e scrittura.
- **Moduli guidati da metadati**: moduli e campi sono righe in `modules` e `fields`; i valori stanno in
  `records.data` (JSONB, indice GIN). Liste, schede e moduli di modifica dell'interfaccia si
  costruiscono dai metadati, quindi un campo o un modulo nuovo è subito utilizzabile.
- **Campi personalizzati** di 16 tipi (testo, email, importo, data, elenco, collegamento a record, …)
  e **moduli personalizzati** creati dall'amministrazione.
- **Moduli standard**: Lead, Clienti, Contatti, Opportunità, Attività, Prodotti e servizi e PDA, con relazioni e
  liste correlate.
- **Cliente unico B2B/B2C**: un solo modulo Clienti per aziende e privati (tipo cliente), con codice SDI, ATECO,
  condominio, cliente principale (gerarchia), blocchi per persona fisica, legale rappresentante, indirizzo di
  spedizione e mandato SEPA. Il blocco **Statistiche** (PDA attive e loro valore, ultima PDA, opportunità aperte)
  è aggiornato dal sistema.
- **Lead e conversione** come in vtenext: numero automatico (`LEA-2026-00001`), primo contatto, qualificazione
  (bollette, consumi, budget, tipo di installazione), esito dell'appuntamento e dati dell'azienda. Il pulsante
  **Converti** crea l'azienda (per i privati prende il nome della persona) oppure collega un'azienda esistente,
  crea il contatto e, se richiesto, l'opportunità "Cliente - Prodotto". Il lead resta come storico con lo stato
  "Convertito" e i collegamenti ai record creati; le sue attività passano al nuovo cliente.
- **Viste salvate delle liste** come in vtenext: oltre a "Tutti", viste personali o pubbliche con colonne,
  filtri e ordinamento; filtro "Assegnato a" (a me, agli altri, a un collega) e ricerca. Una vista pubblica
  può essere modificata solo da chi l'ha creata o dall'amministratore.
- **Vista a colonne** per opportunità (fase di vendita), lead (stato) e PDA (stato), con totale per colonna:
  trascinando una scheda si aggiorna il campo, con gli stessi permessi e controlli della modifica.
- **Commenti** dei colleghi su ogni scheda (come le "Conversazioni" di vtenext): li legge e scrive chi vede il
  record, ognuno elimina i propri.
- **Automatismi al salvataggio**: opportunità chiusa vinta = probabilità 100%, chiusa persa = 0%; PDA annullata
  senza data = data di annullamento di oggi; una PDA che ne sostituisce un'altra porta quella vecchia allo stato
  "Sostituita"; le statistiche del cliente si ricalcolano a ogni PDA o opportunità salvata.
- **Workflow** configurabili dall'amministrazione, come in vtenext: *quando* (alla creazione, a ogni
  salvataggio, al cambio di un campo, la prima volta che le condizioni sono vere, a una scadenza come "7 giorni
  dopo l'ultimo cambio di Stato" o "7 giorni prima della data di chiusura", oppure con un pulsante sulla scheda),
  *se* (condizioni sui campi, come nei rapporti) e *allora* (aggiornare un campo, creare un'attività collegata,
  preparare un'email con segnaposto `$campo$` e `$relazione.campo$`). Ogni esecuzione finisce nel registro del
  workflow, errori compresi. **Al cliente non parte mai nulla in automatico**: le email per i clienti restano
  bozze sulla scheda, che l'utente controlla e invia con il pulsante **Invia**; partono da sole solo gli avvisi
  interni agli utenti del CRM. Ogni azienda nuova parte con quattro workflow di esempio (Welcome Letter alla
  firma della PDA, sollecito dei documenti dopo 7 giorni, promemoria di chiusura delle opportunità, follow-up).
- **Attività e calendario**: chiamate, appuntamenti, compiti ed email collegati ad aziende, contatti e
  opportunità; calendario mensile e settimanale filtrabile per utente; "Le mie attività" in panoramica
  (in ritardo, oggi, prossimi giorni) con completamento in un clic.
- **Aggiornamento dei tenant esistenti**: all'avvio e con `npm run migrate` i moduli e campi standard
  nuovi vengono aggiunti ai tenant già creati, con i permessi ereditati da un modulo simile.
- **Rapporti** come in vtenext: su qualunque modulo, con colonne a scelta, filtri (anche su periodi come
  "questo mese" o "l'anno scorso"), raggruppamento per campo o per giorno/mese/anno, somme, medie, minimi e
  massimi, grafico a barre o a torta ed esportazione per Excel (CSV) del dettaglio o del riepilogo.
  Un rapporto può essere privato o condiviso: chi lo apre vede solo i record e i campi consentiti dal suo
  profilo. Ogni azienda nuova parte con cinque rapporti di esempio.
- **PDA (proposta di acquisto)** con i campi del modello vtenext: numero progressivo automatico
  per anno (es. `2026-00001`), cliente, stato (dalla bozza all'incasso degli acconti, con sospesa, non approvata
  e sostituita), tipo, divisione, partner e segnalatore, documentazione, pagamento e finanziamento (percentuali
  di acconto e saldo controllate, esito della finanziaria, IBAN), sopralluogo e installazione, luce e gas,
  comunicazioni al cliente e amministrazione (recupero crediti). Le righe prendono prodotti dal catalogo (prezzo e IVA di listino modificabili) con quantità
  e sconto; imponibile, IVA e totale sono calcolati dal server, con un arrotondamento modificabile a mano.
  Versione stampabile con spazio per la firma del cliente. Il catalogo **Prodotti e servizi** è in sola
  lettura per i profili diversi dall'amministratore.
- **Storico modifiche** di ogni record (chi, quando, valore prima e dopo).
- **Eventi in background** con outbox transazionale: ogni creazione, modifica o eliminazione scrive un
  evento nella stessa transazione; un worker li processa (`FOR UPDATE SKIP LOCKED`) e li passa ai
  gestori registrati. È l'aggancio per workflow, notifiche e BPM.

## Usarlo sul proprio computer

Per chi vuole solo usare il CRM: segui la [guida di avvio](GUIDA-AVVIO.md). Serve soltanto Docker
Desktop; un doppio clic su `avvia-crm-windows.bat` o `avvia-crm-mac.command` avvia database e
applicazione e apre **http://localhost:8080**. Lo stesso si ottiene con:

```bash
docker compose up -d --build     # CRM completo su http://localhost:8080
docker compose stop              # ferma, i dati restano nel volume db-data
```

Variabili utili: `CRM_PORT` (porta sul computer, predefinita 8080), `JWT_SECRET`, `SEED_DEMO`
(`true` crea l'azienda demo al primo avvio), `SMTP_URL` e `MAIL_FROM` (server di posta per inviare le
email; `SMTP_URL=json` simula l'invio senza spedire nulla), `WORKFLOW_INTERVAL_MS` (ogni quanto si
controllano i workflow a tempo, predefinito 5 minuti).

## Pubblicarlo online

Il file [`render.yaml`](render.yaml) descrive servizio e database su Render (Francoforte). I passaggi,
senza conoscenze tecniche, sono nella [guida di pubblicazione](PUBBLICAZIONE-ONLINE.md). In produzione
`SEED_DEMO` è spento e al primo avvio le variabili `INIT_TENANT_SLUG`, `INIT_TENANT_NAME`,
`INIT_ADMIN_EMAIL` e `INIT_ADMIN_PASSWORD` creano l'azienda reale con il suo amministratore.
L'accesso si blocca per 15 minuti dopo 10 tentativi falliti e ogni utente può cambiare la propria
password (`POST /auth/password`).

## Sviluppo

Requisiti: Node.js 22 e Docker (oppure un PostgreSQL 16 già installato).

```bash
npm run db:up          # PostgreSQL in Docker, con utente applicativo "crm" e database crm / crm_test
npm run install:all    # dipendenze di API e interfaccia
npm run seed           # migrazioni + tenant dimostrativo "demo" con dati di esempio
npm run dev:api        # API su http://localhost:3000/api
npm run dev:web        # interfaccia su http://localhost:5173
```

Accessi del tenant `demo` (password `demo1234`):

| Email                          | Ruolo                 |
| ------------------------------ | --------------------- |
| `admin@3gtrade.local`          | Direzione, amministratore |
| `giulia.bianchi@3gtrade.local` | Responsabile vendite  |
| `marco.rossi@3gtrade.local`    | Commerciale           |
| `luca.verdi@3gtrade.local`     | Commerciale           |

Accedendo come Marco Rossi si vedono solo i suoi record; come Giulia Bianchi anche quelli dei
commerciali sotto di lei.

> **Importante:** l'applicazione deve collegarsi a PostgreSQL con un utente **non superuser** e senza
> `BYPASSRLS`, altrimenti la Row Level Security viene ignorata. All'avvio l'API lo verifica: in
> sviluppo mostra un avviso, in produzione (`NODE_ENV=production`) si rifiuta di partire.

Configurazione dell'API: vedi [`apps/api/.env.example`](apps/api/.env.example).

## Test

```bash
npm test        # test unitari + end-to-end (richiede il database crm_test)
npm run typecheck
```

I test end-to-end ricreano lo schema di `crm_test` e verificano login, isolamento tra tenant,
gerarchia dei ruoli, condivisione, permessi su moduli e campi, validazione, relazioni, storico,
campi e moduli personalizzati, outbox. La CI di GitHub li esegue a ogni pull request.

## Struttura

```
apps/
  api/
    migrations/          schema SQL (tabelle, indici, policy RLS)
    src/
      auth/              login JWT, guard, utente corrente
      security/          contesto di sicurezza: profili, gerarchia, condivisione
      metadata/          tipi di campo e validazione, moduli standard
      records/           CRUD generico, liste correlate, storico
      events/            outbox e worker in background
      admin/             utenti, ruoli, profili, moduli e campi
      tenants/           creazione di un nuovo tenant
      cli/               migrate, seed
    test/                test end-to-end
  web/
    src/
      pages/             panoramica, liste, schede, modifica, amministrazione
      components/        input e visualizzazione dei campi guidati dai metadati
docs/ARCHITETTURA.md     scelte tecniche e prossimi passi
```

## API principali

Tutte sotto `/api`, autenticate con `Authorization: Bearer <token>`.

| Metodo e percorso                          | Descrizione                                   |
| ------------------------------------------ | --------------------------------------------- |
| `POST /auth/login`                         | `{ tenant, email, password }` → token          |
| `GET /auth/me`                             | utente corrente e permessi                     |
| `POST /auth/password`                      | `{ currentPassword, newPassword }`             |
| `GET /modules`                             | moduli visibili con campi e permessi           |
| `GET /records/:module`                     | lista con `q`, `filter[campo]`, `after[campo]`, `before[campo]`, `sort`, `dir`, `page` |
| `POST /records/:module`                    | crea `{ data, ownerId? }`                      |
| `GET/PATCH/DELETE /records/:module/:id`    | scheda, modifica parziale, eliminazione        |
| `GET /records/:module/:id/related`         | liste correlate                                |
| `GET /records/:module/:id/history`         | storico modifiche                              |
| `GET/PUT /records/:module/:id/lines`       | righe della PDA (la PUT le sostituisce tutte e ricalcola i totali) |
| `GET/POST/DELETE /records/:module/:id/comments` | commenti sulla scheda (`DELETE .../comments/:commentId`) |
| `POST /leads/:id/convert`                  | converte il lead in cliente, contatto e opportunità |
| `GET /list-views?module=`, `POST /list-views`, `GET/PATCH/DELETE /list-views/:id` | viste salvate delle liste |
| `POST /list-views/query`                   | esegue una vista (`viewId` o `config`) con `q`, `owner`, `sort`, `page` |
| `GET/POST /workflows`, `GET/PATCH/DELETE /workflows/:id`, `GET /workflows/:id/runs` | workflow e registro (solo amministratori) |
| `POST /workflows/run-scheduled`            | esegue subito i controlli dei workflow a tempo |
| `GET /records/:module/:id/workflows`, `POST .../workflows/:wid/run` | pulsanti dei workflow manuali sulla scheda |
| `GET/POST /records/:module/:id/emails`, `PATCH .../emails/:eid`, `POST .../emails/:eid/send\|discard` | email della scheda: bozze, invio deciso dall'utente |
| `GET/POST /reports`, `GET/PATCH/DELETE /reports/:id` | rapporti salvati                  |
| `GET /reports/:id/run`, `POST /reports/run` | esegue un rapporto salvato o un'anteprima      |
| `GET /reports/:id/export?part=rows\|summary` | CSV per Excel (dettaglio o riepilogo)       |
| `GET /calendar?from=&to=&ownerId=`         | attività che iniziano nell'intervallo (max 45 giorni) |
| `/admin/...`                               | utenti, ruoli, profili, moduli, campi (solo amministratori) |
