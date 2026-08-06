# 🇮🇹 Italian News

> Rassegna stampa generata e aggiornata **ogni giorno** da un'intelligenza artificiale.
> Due edizioni: una nazionale/internazionale e una locale.

[![Aggiornamento giornaliero](https://img.shields.io/badge/aggiornamento-giornaliero-brightgreen)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Ultimo commit](https://img.shields.io/github/last-commit/mauro-midolo/italian_news)](https://github.com/mauro-midolo/italian_news/commits/main)
[![Generato da AI](https://img.shields.io/badge/generato%20da-AI-blueviolet)](#-come-funziona)

---

## 📰 Le edizioni

| Edizione | File | Contenuto |
| -------- | ---- | --------- |
| 🌍 **Globale** | **[`news_global.md`](./news_global.md)** | Principali notizie nazionali e internazionali della giornata |
| 📍 **San Lazzaro di Savena** | **[`news_san_lazzaro_di_savena.md`](./news_san_lazzaro_di_savena.md)** | Cronaca, amministrazione ed eventi del territorio di San Lazzaro di Savena (BO) |

Ogni file viene **riscritto da zero** a ogni aggiornamento. Poiché ogni edizione
corrisponde a un commit, lo
[storico dei commit](https://github.com/mauro-midolo/italian_news/commits/main)
funziona da archivio consultabile: permette di rileggere le edizioni passate e
di confrontare come una notizia è stata raccontata nei giorni successivi.

---

## 🎯 Obiettivo del progetto

`italian_news` è un esperimento di **rassegna stampa automatizzata e versionata**:

- ottenere ogni mattina una sintesi leggibile e leggera dell'attualità, in puro Markdown;
- affiancare a una panoramica generale un **taglio iperlocale**, quello di solito
  più difficile da seguire con i normali aggregatori di notizie;
- sfruttare Git per conservare uno **storico immutabile** e tracciabile delle edizioni;
- sperimentare l'impiego di un'intelligenza artificiale in un flusso editoriale
  interamente automatico.

---

## ⚙️ Come funziona

Ogni giorno, a orario fisso, un'intelligenza artificiale raccoglie le notizie
della giornata, seleziona quelle rilevanti, le sintetizza e le impagina in
Markdown. Le due edizioni vengono poi pubblicate nel repository con un nuovo
commit. L'intero processo avviene senza alcun intervento umano.

---

## ⚠️ Disclaimer

- I contenuti sono **generati automaticamente da un'intelligenza artificiale** e
  **non sono verificati da un redattore umano**.
- Il modello può commettere errori, omettere contesto o riportare informazioni
  inesatte (*hallucination*). **Verifica sempre le notizie sulle fonti originali**
  prima di considerarle attendibili o di ricondividerle. L'avvertenza vale a
  maggior ragione per l'edizione locale, dove le fonti sono poche e un singolo
  errore pesa di più.
- Questo repository non è una testata giornalistica registrata ai sensi della
  legge italiana e non ha finalità informative ufficiali.
- I diritti sui contenuti originali restano dei rispettivi editori: qui sono
  presenti solo sintesi e rimandi.

---

## 🤝 Contribuire

Segnalazioni e suggerimenti sono benvenuti: apri una
[Issue](https://github.com/mauro-midolo/italian_news/issues) per segnalare errori
nei contenuti, proporre fonti da aggiungere o suggerire nuove località da coprire.

I file `news_*.md` non vanno modificati a mano: verrebbero sovrascritti alla
prossima edizione.

---

<p align="center">
  Realizzato da <a href="https://github.com/mauro-midolo">Mauro Midolo</a> · aggiornato ogni giorno da un'AI 🤖
</p>
