# Pubblicare 3Gtrade CRM online (Render, server in Europa)

Con questi passaggi il CRM diventa raggiungibile da qualsiasi computer o telefono, con un
indirizzo del tipo `https://3gtrade-crm.onrender.com`. Il server e il database stanno a
Francoforte. Non servono conoscenze tecniche: si fa tutto dal sito di Render.

## Prima di iniziare

- Le modifiche del CRM devono essere unite nel ramo **main** del repository GitHub
  `webproadv/3gtrade-crm` (le pull request aperte vanno unite in ordine).
- Tieni a portata di mano una carta di pagamento. Costo previsto: **circa 13,30 $ al mese**:
  CRM sempre acceso 7 $, database 6 $, 1 GB di spazio 0,30 $.
- Il database gratuito di Render non va usato: viene cancellato dopo 30 giorni e non ha backup.

## 1. Crea l'account Render

1. Vai su <https://dashboard.render.com/register>.
2. Scegli **GitHub** come metodo di registrazione e accedi con l'account `webproadv`.
3. Inserisci la carta in **Billing** quando te lo chiede.

## 2. Collega il repository e crea tutto in un colpo

1. In alto a destra premi **New** e scegli **Blueprint**.
2. Se il repository non compare, premi **Configure GitHub**, scegli l'account `webproadv` e dai
   accesso a `3gtrade-crm`.
3. Seleziona `webproadv/3gtrade-crm` e premi **Connect**.
4. Render legge il file `render.yaml` e mostra cosa creerà: il servizio **3gtrade-crm** e il
   database **3gtrade-crm-db**, entrambi a Frankfurt.
5. Ti chiede quattro valori. Sono l'azienda e l'amministratore che vengono creati al primo avvio:

   | Campo                  | Cosa scrivere                                                     |
   | ---------------------- | ----------------------------------------------------------------- |
   | `INIT_TENANT_SLUG`     | codice breve dell'azienda, minuscolo senza spazi, es. `3gtrade`   |
   | `INIT_TENANT_NAME`     | nome per esteso, es. `3Gtrade Srl`                                |
   | `INIT_ADMIN_EMAIL`     | la tua email di accesso al CRM                                    |
   | `INIT_ADMIN_PASSWORD`  | una password di almeno 10 caratteri (la cambi dopo dal CRM)       |

6. Premi **Deploy Blueprint**. La prima volta servono 5–10 minuti.

## 3. Apri il CRM

1. In **Dashboard** apri il servizio **3gtrade-crm**: quando lo stato è **Live**, in alto c'è il
   suo indirizzo `https://...onrender.com`. Aprilo.
2. Accedi con:
   - **Azienda**: il codice scritto in `INIT_TENANT_SLUG`
   - **Email** e **Password**: quelle scritte in `INIT_ADMIN_EMAIL` e `INIT_ADMIN_PASSWORD`
3. In basso a sinistra premi **Cambia password** e scegline una nuova.
4. Da **Impostazioni → Utenti** crea gli utenti dei colleghi.

I valori `INIT_*` servono solo al primo avvio: se li cambi in seguito non succede nulla
all'azienda già creata.

## Invio delle email (facoltativo)

Le email preparate dai workflow (es. la Welcome Letter) si inviano dalla scheda con il pulsante
**Invia**. Per farle partire serve la casella da cui spedirle: nel servizio apri **Environment** e
compila

| Variabile   | Cosa scrivere                                                                 |
| ----------- | ----------------------------------------------------------------------------- |
| `SMTP_URL`  | dati del server di posta, es. `smtps://info%403gtrade.it:password@smtp.tuoprovider.it:465` (la `@` dell'utente si scrive `%40`) |
| `MAIL_FROM` | il mittente, es. `3Gtrade <info@3gtrade.it>`                                  |

I dati del server (indirizzo e porta SMTP) li trovi nelle istruzioni del tuo provider di posta.
Finché non sono impostati il CRM prepara comunque le bozze, ma non le invia.

## Aggiornamenti

Ogni volta che una modifica viene unita su **main**, Render ripubblica il CRM da solo in pochi
minuti. I dati restano nel database.

## Se qualcosa non va

- **Lo stato resta "Deploy failed"**: apri il servizio, sezione **Logs**, e copia le ultime righe
  in chat.
- **"Credenziali non valide"**: controlla il codice azienda (è quello di `INIT_TENANT_SLUG`, in
  minuscolo).
- **"Troppi tentativi falliti"**: dopo 10 errori di fila l'accesso si blocca per 15 minuti.

## Dominio personalizzato (facoltativo)

Per usare un indirizzo come `crm.3gtrade.it`: nel servizio apri **Settings → Custom Domains**,
aggiungi il dominio e copia il record DNS indicato nel pannello del tuo provider del dominio.
Il certificato HTTPS è automatico.

