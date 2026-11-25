# 3Gtrade CRM

CRM multi-tenant ispirato a [vtenext](https://www.vtenext.com/), scritto da zero in TypeScript.
Questo è il **primo nucleo**: anagrafiche, permessi e motore dei moduli guidato da metadati.
Workflow e BPM arriveranno sopra il sistema di eventi già presente.

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
- **Moduli standard**: Aziende, Contatti, Opportunità e Attività, con relazioni e liste correlate.
- **Attività e calendario**: chiamate, appuntamenti, compiti ed email collegati ad aziende, contatti e
  opportunità; calendario mensile e settimanale filtrabile per utente; "Le mie attività" in panoramica
  (in ritardo, oggi, prossimi giorni) con completamento in un clic.
- **Aggiornamento dei tenant esistenti**: all'avvio e con `npm run migrate` i moduli e campi standard
  nuovi vengono aggiunti ai tenant già creati, con i permessi ereditati da un modulo simile.
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
(`true` crea l'azienda demo al primo avvio).

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
| `GET /calendar?from=&to=&ownerId=`         | attività che iniziano nell'intervallo (max 45 giorni) |
| `/admin/...`                               | utenti, ruoli, profili, moduli, campi (solo amministratori) |
