# Il Quotidiano — contratto di generazione

Giornale personale statico, rigenerato ogni mattina da un agente AI e pubblicato
su Cloudflare Pages.

```
details.info   ->  che cosa l'utente vuole sapere
template/      ->  come il giornale deve essere visualizzato
public/        ->  il giornale del giorno, pronto per il deploy
```

## Regole invarianti

1. **`template/` non si tocca** durante la generazione quotidiana. Si modifica
   solo quando viene chiesto esplicitamente di cambiare la grafica del giornale;
   in quel caso la modifica va fatta in `template/` e si rigenera `public/`.
2. **`details.info` non si tocca**: lo modifica solo l'utente.
3. **`public/` deve essere autosufficiente**: nessun riferimento a file fuori da
   `public/`. Percorsi relativi (`css/style.css`, `js/main.js`, `assets/…`).
4. Nella generazione quotidiana l'agente scrive **solo `public/index.html`**.
   Gli altri file di `public/` sono copie identiche di `template/` fatte dalla
   pipeline. Se servono asset nuovi vanno aggiunti prima a `template/`.
5. `public/index.html` non deve contenere l'attributo `data-edizione="TEMPLATE-DEMO"`:
   la pipeline fallisce se lo trova.

## Come si legge `details.info`

Righe che iniziano con `#` sono commenti. Le intestazioni sono tra parentesi
quadre, le voci iniziano con `-`.

- **`[NOTIZIE]`** — ogni voce genera **un riquadro** (`<section class="riquadro">`)
  dentro `.griglia`, nell'ordine in cui compare nel file. `.griglia` impagina i
  riquadri su colonne di giornale e le bilancia da sola: riquadri di lunghezza
  molto diversa non lasciano buchi, quindi non servono classi di larghezza. Il titolo del riquadro
  riprende il testo della voce. Da 3 a 8 notizie per riquadro, ordinate per
  rilevanza, ciascuna con titolo, riassunto di 2-4 frasi e link alla fonte.
  Niente hardcoding delle categorie esistenti: aggiungere una voce deve bastare
  a far comparire un nuovo riquadro.
- **`[INFORMAZIONI]`** — ogni voce è una **condizione da verificare**, non un
  contenuto da mostrare per forza.
  - Se non c'è nulla da segnalare, **la sezione `.avvisi` va omessa del tutto**.
    Non scrivere mai messaggi come "il film non è ancora disponibile".
  - Se una o più condizioni risultano soddisfatte, inserire `.avvisi` **in cima
    alla pagina**, prima delle notizie, con un `<article class="avviso">` per
    ogni novità: che cosa è successo, dettagli utili, fonte.
  - `.cache/edizione-precedente.html`, se presente, è l'edizione del giorno
    prima: va consultata per non ripetere ogni giorno lo stesso avviso e per
    variare le notizie già pubblicate.

## Priorità visiva della pagina

1. Avvisi da `[INFORMAZIONI]` (se ce ne sono)
2. Notizie
3. Eventuali sezioni future

## Regole redazionali

- Italiano, tono sobrio e informativo.
- Riassumere sempre con parole proprie: niente copia-incolla dagli originali,
  niente virgolettati estesi.
- Citare solo notizie effettivamente trovate tramite ricerca web, con la fonte.
  **Non inventare nulla**: se le notizie locali scarseggiano, scriverne meno.
- Registro neutrale sui temi controversi: riportare i fatti, non prendere
  posizione.
- Niente calcio, salvo i mondiali.

## Struttura HTML da rispettare

Classi e ruoli definiti in `template/index.html` e `template/css/style.css`:

| Elemento | Classe |
| --- | --- |
| Area avvisi (opzionale) | `.avvisi` > `.avviso` |
| Riquadro di categoria | `.riquadro` > `.riquadro__testata` + `.notizia` |
| Notizia | `.notizia__titolo`, `.notizia__testo`, `.notizia__meta`, `.notizia__fonte` |
| Etichetta categoria (facoltativa) | `.notizia__categoria` |
| Foto della notizia (facoltativa) | `.notizia__foto` |
| Dati strutturati (facoltativi) | `.notizia__dati` |

### Elementi facoltativi

- **`.notizia__foto`** — `<img class="notizia__foto" … loading="lazy" decoding="async">`
  subito dopo `.notizia__titolo`, con `alt` descrittivo. Usare l'URL originale
  dell'immagine della fonte; il CSS la ritaglia in 4:3, quindi non servono
  dimensioni. Se la foto non c'è, omettere l'elemento: niente segnaposto.
- **`.notizia__dati`** — `<dl class="notizia__dati">` con un `<div><dt>…</dt><dd>…</dd></div>`
  per voce, da due a cinque righe. Serve per prezzi, scadenze, luoghi: dati
  brevi che nel testo diventerebbero un elenco faticoso. Il testo discorsivo
  resta in `.notizia__testo` e non li ripete.
- **`.notizia__categoria`** — etichetta breve (una o due parole) per l'ambito
  della notizia o per il suo stato: «Esteri», «Economia», «Gratis ora»,
  «In arrivo». Non deve ripetere un dato già presente in `.notizia__dati`:
  se la scadenza è fra i dati, l'etichetta dice che cos'è l'oggetto, non
  quando scade.

La prima `.notizia` di ogni riquadro è l'apertura e riceve dal CSS un titolo
più grande: metterci la notizia più rilevante.

### Elementi riempiti dal JavaScript

`data-ruolo="conteggio"` (per riquadro), `data-ruolo="totale"` (nel titolo di
sezione) e `.indice` (`data-ruolo="indice"`, l'indice dei riquadri) vanno
lasciati vuoti così come sono nel template. Gli elementi con `hidden` (tema,
ricerca, indice, conteggio totale, torna su, `data-ruolo="aggiornato"`) vanno
lasciati nascosti: li attiva `js/main.js`.

Nella testata vanno aggiornati titolo `<title>`, `<meta name="description">`,
`og:title`, `og:description`, il `<time datetime="AAAA-MM-GG">` con la data
estesa in italiano e il `datetime` di `data-ruolo="aggiornato"`.

## Sviluppo locale

```bash
# anteprima del template
python -m http.server 8000 --directory template

# anteprima dell'edizione pubblicata
python -m http.server 8000 --directory public
```
