# 📰 Il Quotidiano — giornale personale generato da un'AI

> Un giornale su misura, scritto ogni mattina da un'intelligenza artificiale a
> partire da un solo file di configurazione, e pubblicato come sito statico su
> Cloudflare Pages.

[![Aggiornamento giornaliero](https://img.shields.io/badge/aggiornamento-giornaliero-brightgreen)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Ultimo commit](https://img.shields.io/github/last-commit/mauro-midolo/italian_news)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Generato da AI](https://img.shields.io/badge/generato%20da-AI-blueviolet)](#-come-funziona)

---

## 🧭 Come funziona

Ogni giorno alle 6:30 (ora italiana) un agente AI combina due ingredienti e ne
produce un terzo:

```
details.info      che cosa voglio sapere
      +
template/         come il giornale deve essere fatto
      ↓
public/           il giornale di oggi, pronto per il deploy
```

L'agente legge le richieste, cerca sul web, verifica le condizioni da
monitorare e riempie `public/index.html`, che la pipeline gli consegna già
impaginato e datato. CSS, JavaScript e asset vengono
copiati invariati dal template, così la grafica resta stabile e l'agente si
occupa solo dei contenuti. Il risultato viene committato: lo
[storico dei commit](https://github.com/mauro-midolo/italian_news/commits/main)
funziona da archivio delle edizioni passate.

---

## 📁 Struttura

```
.
├── details.info              # cosa cercare e cosa monitorare (lo modifichi tu)
├── CLAUDE.md                 # contratto di generazione per l'agente
├── template/                 # modello di riferimento del giornale
│   ├── index.html            #   struttura e segnaposto commentati
│   ├── css/style.css
│   ├── js/main.js
│   ├── assets/favicon.svg
│   ├── _headers              #   regole di cache per Cloudflare Pages
│   └── robots.txt
└── public/                   # edizione del giorno, deployabile così com'è
    ├── index.html
    ├── css/ js/ assets/
    ├── _headers
    └── robots.txt
```

`public/` è **autosufficiente**: non dipende da nulla fuori dalla propria
cartella. `template/` non viene mai modificato dalla generazione quotidiana.

---

## ✍️ Configurare il giornale

Tutto passa da [`details.info`](./details.info). Due sezioni:

```text
[NOTIZIE]

- Notizie su San Lazzaro di Savena
- Notizie dal mondo


[INFORMAZIONI]

- Avvisami quando il film "Odissea" del 2026 diventa disponibile su una piattaforma di streaming
```

### `[NOTIZIE]` — un riquadro per voce

Ogni riga genera un riquadro nella pagina, con le notizie più rilevanti e
recenti sull'argomento. Vuoi una nuova rubrica? Aggiungi una riga:

```text
- Notizie di ciclismo
- Novità sulle politiche europee per l'energia
```

Il riquadro compare da solo alla generazione successiva. Non c'è codice da
toccare: le categorie non sono cablate da nessuna parte.

### `[INFORMAZIONI]` — condizioni da sorvegliare

Ogni riga è una domanda che l'agente si pone ogni giorno. La regola è il
silenzio: **se non c'è niente da dire, non compare nulla**. Nessun "non ancora
disponibile" quotidiano, nessuna sezione vuota.

Quando invece una condizione si verifica, in cima alla pagina — prima delle
notizie — compare un riquadro d'avviso, graficamente distinto dal resto del
giornale:

```text
⚠ Informazione importante

"Odissea" è ora disponibile in streaming su [piattaforma].
```

Più avvisi nello stesso giorno vengono raccolti nella stessa area, separati e
leggibili.

---

## 🎨 Modificare la grafica

La grafica si cambia **solo** in `template/`, mai in `public/` (che viene
rigenerato). Dopo una modifica al template, la prima esecuzione dell'agente la
propaga all'edizione pubblicata.

Anteprima locale:

```bash
python -m http.server 8000 --directory template   # il modello
python -m http.server 8000 --directory public     # l'edizione di oggi
```

La pagina si adatta al tema chiaro e scuro del sistema, ha un selettore di tema,
una ricerca fra le notizie e un foglio di stile dedicato alla stampa. Senza
JavaScript resta perfettamente leggibile.

---

## ☁️ Deploy su Cloudflare Pages

Il progetto non richiede build. Nella dashboard di Cloudflare Pages, collegando
il repository:

| Impostazione | Valore |
| --- | --- |
| Framework preset | *None* |
| Build command | *(vuoto)* |
| Build output directory | `public` |
| Production branch | `main` |

A ogni commit dell'edizione, Cloudflare pubblica automaticamente il sito. Le
regole di cache stanno in [`public/_headers`](./public/_headers): l'HTML non
viene messo in cache (cambia ogni giorno), gli asset sì.

---

## 🤖 La pipeline

[`.github/workflows/claude.yml`](./.github/workflows/claude.yml) esegue ogni
giorno:

1. copia l'edizione di ieri in `.cache/` (serve all'agente per non ripetersi);
2. ricrea `public/` da `template/` e ne ricava lo **scheletro del giorno** con
   [`.github/scripts/prepara-public.sh`](./.github/scripts/prepara-public.sh):
   testata con la data di oggi, metadati aggiornati, niente `data-edizione`,
   niente contenuti di esempio, griglia delle notizie vuota;
3. lancia l'agente, che riempie lo scheletro **un riquadro alla volta**,
   scrivendo su disco man mano che finisce una categoria;
4. controlla il risultato con
   [`.github/scripts/verifica-edizione.sh`](./.github/scripts/verifica-edizione.sh)
   — niente residui del template, data di oggi, asset identici al template e un
   riquadro per ogni voce di `[NOTIZIE]`;
5. se manca qualcosa, rilancia l'agente una seconda volta **senza buttare via
   il lavoro già fatto**: completa i riquadri mancanti;
6. ricontrolla con `verifica-edizione.sh --minimo` e committa l'edizione.

Il secondo controllo è volutamente più permissivo del primo: un'edizione con
meno riquadri del previsto viene pubblicata lo stesso — meglio poche notizie
che il sito fermo a ieri — e la notifica Telegram lo segnala come *edizione
ridotta*. Non viene pubblicato nulla solo se la pagina non contiene neanche una
notizia: in quel caso l'edizione precedente resta online e la pagina scartata
viene allegata al run come artefatto `edizione-non-valida`, per capire dove si
è fermato l'agente. Il workflow si può lanciare a mano da *Actions → Edizione
giornaliera → Run workflow*.

Le regole editoriali e strutturali che l'agente deve rispettare sono in
[`CLAUDE.md`](./CLAUDE.md).

---

## ⚠️ Disclaimer

- I contenuti sono **generati automaticamente da un'intelligenza artificiale** e
  **non sono verificati da un redattore umano**.
- Il modello può commettere errori, omettere contesto o riportare informazioni
  inesatte (*hallucination*). **Verifica sempre le notizie sulle fonti
  originali** prima di considerarle attendibili o di ricondividerle. L'avvertenza
  vale a maggior ragione per l'edizione locale, dove le fonti sono poche e un
  singolo errore pesa di più.
- Questo repository non è una testata giornalistica registrata ai sensi della
  legge italiana e non ha finalità informative ufficiali.
- I diritti sui contenuti originali restano dei rispettivi editori: qui sono
  presenti solo sintesi e rimandi.

---

## 🤝 Contribuire

Segnalazioni e suggerimenti sono benvenuti: apri una
[Issue](https://github.com/mauro-midolo/italian_news/issues) per segnalare errori
nei contenuti, proporre fonti da aggiungere o suggerire miglioramenti al
template.

I file dentro `public/` non vanno modificati a mano: verrebbero sovrascritti
alla prossima edizione.

---

<p align="center">
  Realizzato da <a href="https://github.com/mauro-midolo">Mauro Midolo</a> · scritto ogni giorno da un'AI 🤖
</p>
