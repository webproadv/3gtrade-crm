# Architettura

Riferimento: documento di analisi di vtenext e architettura proposta (monolite modulare,
PostgreSQL con JSONB, multi-tenant, eventi in background, moduli guidati da metadati).

## Scelte principali

**Monolite modulare.** Una sola API NestJS divisa in moduli con confini chiari (`auth`, `security`,
`metadata`, `records`, `events`, `admin`). Più semplice da sviluppare e distribuire dei
microservizi; i confini permettono di separare pezzi in futuro se servirà.

**Una tabella `records` per tutti i moduli.** vtenext usa `crmentity` più una tabella per modulo e
una per i campi personalizzati. Qui i campi comuni (proprietario, date, etichetta, cancellazione
logica) sono colonne, tutto il resto è in `data` JSONB. Vantaggi: aggiungere campi o moduli non
richiede migrazioni né deploy. Limiti noti: i vincoli di integrità sui campi sono applicati
dall'applicazione (validazione per tipo, verifica dei collegamenti) e non dal database.
Per moduli con volumi molto alti si potranno aggiungere colonne generate o indici di espressione
sui campi più filtrati.

**Isolamento tra tenant con Row Level Security.** Tutte le query passano da
`DatabaseService.withTenant`, che imposta `app.tenant_id` nella transazione. Le policy sono
`FORCE`, quindi valgono anche per il proprietario delle tabelle. Anche un errore nel codice che
dimentica un filtro non può mostrare dati di un altro tenant.

**Sicurezza in tre livelli, come vtenext.**
1. Profilo → azioni consentite sul modulo e visibilità/modificabilità dei campi.
2. Condivisione del modulo → privato, pubblico in lettura, pubblico in lettura e scrittura.
3. Gerarchia dei ruoli → con condivisione privata si vedono i propri record e quelli degli utenti
   dei ruoli subordinati (`roles.path` del tipo `id1::id2::id3`).

Non sono ancora presenti le regole di condivisione personalizzate e i gruppi.

**Moduli standard versionati nel codice.** `STANDARD_MODULES` è la fonte di verità dei moduli e campi
di base. `ensureStandardModules` (all'avvio e in `npm run migrate`) aggiunge ai tenant esistenti
moduli e campi standard mancanti senza modificare quelli presenti; un modulo nuovo copia i permessi
dei profili da un modulo indicato (`inheritPermissionsFrom`).

**Regole tra campi.** Le validazioni che coinvolgono più campi dello stesso record (es. fine
attività successiva all'inizio) sono in `records/module-rules.ts` e valgono su creazione e modifica.

**Outbox transazionale.** Ogni scrittura su un record inserisce un evento in `outbox_events` nella
stessa transazione. `OutboxWorker` li legge a lotti con `FOR UPDATE SKIP LOCKED` (più istanze
possono lavorare in parallelo), imposta il tenant dell'evento e chiama i gestori registrati
(`EventHandler`). Un errore in un gestore viene registrato e l'evento viene ritentato fino a 5 volte.

## Prossimi passi suggeriti

1. Workflow: condizioni sui campi + azioni (aggiorna campo, crea record, invia email) come
   `EventHandler`, configurabili dall'amministrazione.
2. Promemoria delle attività (notifica prima dell'inizio) come gestore di eventi pianificato.
3. Lead con conversione in Azienda, Contatto e Opportunità.
4. Prodotti, preventivi e ordini con righe di dettaglio.
5. Import ed export CSV, viste di lista salvate con filtri.
6. Motore BPM: modellazione con bpmn-js e un sottoinsieme di BPMN eseguito sugli stessi eventi.
7. Gruppi, regole di condivisione e assegnazione a gruppi.
