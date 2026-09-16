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
5. `public/index.html` non e' una copia del template: la pipeline
   (`.github/scripts/prepara-public.sh`) ne ricava lo **scheletro dell'edizione
   del giorno** — testata con la data di oggi, metadati aggiornati, nessun
   contenuto di esempio, `.griglia` vuota e niente `data-edizione`. L'agente
   parte da li' e lo **riempie**: non lo riscrive da zero e non ci ricopia
   dentro `template/index.html`.
6. I riquadri si scrivono **uno alla volta, man mano**: cercata una categoria,
   il suo riquadro va inserito subito in `.griglia` prima di passare alla
   successiva. Accumulare tutto per scriverlo con un'unica operazione finale e'
   il modo piu' rapido per perdere l'intera edizione se il turno si interrompe.
7. Se una fonte non risponde o una ricerca fallisce, si scrive un riquadro con
   meno notizie, o si salta la categoria. Quello che a fine turno si trova in
   `public/index.html` e' quello che viene pubblicato: un'edizione ridotta va
   online lo stesso, una pagina senza notizie e' un giorno saltato.

## Come si legge `details.info`

Righe che iniziano con `#` sono commenti. Le intestazioni sono tra parentesi
quadre, le voci iniziano con `-`.

- **`[NOTIZIE]`** — ogni voce genera **un riquadro** (`<section class="riquadro">`)
  dentro `.griglia`, nell'ordine in cui compare nel file. Il titolo del riquadro
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

`data-ruolo="conteggio"` viene riempito dal JavaScript: lasciare lo `<span>` vuoto.
Gli elementi con `hidden` (tema, ricerca, torna su, `data-ruolo="aggiornato"`)
vanno lasciati così: li attiva `js/main.js`.

La testata la compila la pipeline: `<title>`, `<meta name="description">`,
`og:title`, `og:description`, il `<time datetime="AAAA-MM-GG">` con la data
estesa in italiano e il `datetime` di `data-ruolo="aggiornato"` arrivano gia'
con la data di oggi. L'agente non deve toccarli.

## Sviluppo locale

```bash
# anteprima del template
python -m http.server 8000 --directory template

# anteprima dell'edizione pubblicata
python -m http.server 8000 --directory public
```
