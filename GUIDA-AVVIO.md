# Come usare 3Gtrade CRM sul tuo computer

Questa guida serve per far funzionare il CRM sul tuo computer, senza conoscenze tecniche.
Quando è avviato lo apri dal browser all'indirizzo **http://localhost:8080**.

## 1. Installa Docker Desktop (solo la prima volta)

Docker Desktop è il programma gratuito che fa girare il CRM e il suo database.

1. Vai su <https://www.docker.com/products/docker-desktop/> e scarica la versione per il tuo
   sistema (Windows oppure Mac, scegli "Apple Silicon" se il Mac ha un chip M1, M2, M3 o M4).
2. Installalo come un normale programma. Su Windows, se te lo chiede, accetta l'installazione di
   "WSL" e riavvia il computer.
3. Apri Docker Desktop e aspetta che in basso a sinistra compaia la scritta verde
   **Engine running**. Puoi saltare la registrazione dell'account.

## 2. Scarica il CRM (solo la prima volta)

1. Apri <https://github.com/webproadv/3gtrade-crm> (devi aver fatto l'accesso a GitHub).
2. Premi il pulsante verde **Code** e poi **Download ZIP**.
3. Estrai lo ZIP in una cartella comoda, ad esempio `Documenti\3gtrade-crm`.

## 3. Avvia il CRM

Con Docker Desktop aperto:

- **Windows:** nella cartella del CRM fai doppio clic su **`avvia-crm-windows.bat`**.
  Se compare l'avviso blu di Windows, scegli "Ulteriori informazioni" e poi "Esegui comunque".
- **Mac:** nella cartella del CRM fai clic destro su **`avvia-crm-mac.command`** e scegli **Apri**
  (solo la prima volta, poi basta il doppio clic).

La prima volta servono alcuni minuti perché il programma viene preparato; le volte successive
bastano pochi secondi. Alla fine si apre da solo il browser su **http://localhost:8080**.

## 4. Accedi

Al primo avvio viene creata un'azienda dimostrativa con dati di esempio.

| Campo     | Valore                  |
| --------- | ----------------------- |
| Azienda   | `demo`                  |
| Email     | `admin@3gtrade.local`   |
| Password  | `demo1234`              |

Altri utenti di prova, con la stessa password, per vedere come cambiano i permessi:

- `giulia.bianchi@3gtrade.local`: responsabile vendite, vede anche i record dei suoi commerciali
- `marco.rossi@3gtrade.local` e `luca.verdi@3gtrade.local`: commerciali, vedono solo i propri record

Come amministratore puoi creare i veri utenti da **Impostazioni → Utenti**.

## 5. Ferma il CRM

Fai doppio clic su **`ferma-crm-windows.bat`** (Windows) o **`ferma-crm-mac.command`** (Mac).
I dati restano salvati e li ritrovi al prossimo avvio. Puoi anche lasciarlo acceso: si riavvia da
solo insieme a Docker Desktop.

## Domande frequenti

**Il browser dice "Impossibile raggiungere il sito".**
Controlla che Docker Desktop sia aperto con la scritta *Engine running*, poi rilancia lo script
di avvio.

**La porta 8080 è già usata da un altro programma.**
Apri il file `docker-compose.yml` con il Blocco note, cerca `8080:8080` e cambia solo il primo
numero, ad esempio `8090:8080`. Poi apri il CRM su http://localhost:8090.

**Come aggiorno il CRM a una versione nuova?**
Scarica di nuovo lo ZIP, estrailo **sopra** la cartella esistente e lancia lo script di avvio.
I dati non si perdono: sono conservati da Docker, non nella cartella.

**Come cancello tutto e riparto da zero?**
In Docker Desktop, sezione *Volumes*, elimina il volume `3gtrade-crm_db-data`, poi rilancia lo
script di avvio. Attenzione: questo cancella tutti i dati inseriti.

**Posso usarlo da altri computer dell'ufficio?**
Questa versione è pensata per un solo computer. Per usarlo da più postazioni o da fuori ufficio
serve la pubblicazione online, che è il passo successivo.
