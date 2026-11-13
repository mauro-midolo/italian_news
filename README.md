# 📰 Il Quotidiano — giornale personale generato da un'AI

> Un giornale su misura, scritto ogni mattina da un'intelligenza artificiale a
> partire da un solo file di configurazione, e pubblicato come sito statico su
> Cloudflare Pages.

[![Aggiornamento giornaliero](https://img.shields.io/badge/aggiornamento-giornaliero-brightgreen)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Ultimo commit](https://img.shields.io/github/last-commit/mauro-midolo/italian_news)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Generato da AI](https://img.shields.io/badge/generato%20da-AI-blueviolet)](#-come-funziona)

---

## 🧭 Come funziona

Ogni mattina una [routine di Claude Code](https://code.claude.com/docs/en/claude-code-on-the-web)
combina due ingredienti e ne produce un terzo:

```
details.info      che cosa voglio sapere
      +
template/         come il giornale deve essere fatto
      ↓
public/           il giornale di oggi, pronto per il deploy
```

L'agente legge le richieste, cerca sul web, verifica le condizioni da
monitorare e riempie `public/index.html`, che uno script gli prepara già
impaginato e datato. CSS, JavaScript e asset vengono
copiati invariati dal template, così la grafica resta stabile e l'agente si
occupa solo dei contenuti. Il risultato viene committato: lo
[storico dei commit](https://github.com/mauro-midolo/italian_news/commits/main)
funziona da archivio delle edizioni passate.

---

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


## ✏️ Modificare le richieste dal sito

Oltre che a mano, `details.info` si modifica dalla pagina **`/modifica/`**
del giornale (link "modifica le richieste" in fondo a ogni edizione): ogni
sezione è una scheda con titolo e testo, i pulsanti **+ Nuova sezione** e
**+ Nuovo avviso** aggiungono voci, le frecce cambiano l'ordine, il cestino
elimina. **Salva** crea un commit su `main` e la modifica vale dall'edizione
del mattino dopo. Le modifiche non salvate restano come bozza nel browser.

Come funziona: il sito gira su un Cloudflare Worker con asset statici.
`worker/index.js` gestisce solo `/modifica/api/…`, che controlla la password e
legge e scrive il file con l'API di GitHub; tutto il resto è servito da
`public/` senza passare dal codice.

L'accesso è protetto da una password: una volta inserita, il browser resta
collegato per 30 giorni (pulsante **Esci** per chiudere prima). Sono ammessi
al massimo 5 tentativi al minuto per indirizzo; cambiare la password chiude
tutte le sessioni aperte.

### Configurazione (una volta sola)

1. **Token GitHub**: GitHub → Settings → Developer settings →
   *Personal access tokens* → *Fine-grained tokens* → *Generate new token*.
   *Repository access*: **Only select repositories** → `italian_news`.
   *Permissions → Repository permissions → Contents*: **Read and write**.
2. **Segreti del Worker**: dashboard Cloudflare → Workers & Pages →
   `italian_news` → Settings → *Variables and Secrets* → *Add*, tipo
   **Secret**:
   - `GITHUB_TOKEN` — il token del punto 1;
   - `EDITOR_PASSWORD` — la password dell'editor, **almeno 12 caratteri**.

Senza questi due valori l'editor resta chiuso e non modifica nulla.

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
