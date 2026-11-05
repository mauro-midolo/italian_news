#!/usr/bin/env python3
"""
Fascia "Casa" de Il Quotidiano: impagina il breve testo sullo stato della casa,
subito dopo la fascia meteo.

Questo script non sa niente della casa: niente stanze, dispositivi o entita'.
Il repository e' pubblico, quindi tutto quello che riguarda la casa lo scopre
l'agente ogni mattina, a runtime, con il connettore Home Assistant (vedi
CLAUDE.md, "Fascia casa"), e lo scrive in un file JSON:

    {
      "letto_alle": "2026-11-05T05:04:00+01:00",
      "frasi": ["La temperatura del ... questa notte e' stata molto fredda: 16,5 °C.", ...]
    }

"frasi" contiene solo le cose da segnalare; se e' vuota la fascia dice che in
casa e' tutto in ordine. Lo script le impagina e fa da ultima rete di
sicurezza sulla privacy: rifiuta le frasi che parlano di persone, presenza,
vacanze o allarme, perche' la pagina e' pubblica.

Sostituisce la riga <!-- FASCIA-CASA --> lasciata da scripts/prepara-public.sh.
In caso di errore esce con codice diverso da zero senza toccare la pagina.

Uso: casa.py public/index.html .cache/casa.json
"""

import html
import json
import re
import sys
from datetime import datetime, timezone

SEGNAPOSTO = "<!-- FASCIA-CASA -->"

ETA_MASSIMA_ORE = 6     # dati piu' vecchi non si pubblicano
MAX_FRASI = 8
MAX_CARATTERI = 300

# Parole che in una pagina pubblica direbbero qualcosa su di noi o su dove
# siamo. Una frase che ne contiene una viene rifiutata.
VIETATE = [
    r"vacanz\w*", r"ferie", r"viaggi\w*", r"allarm\w*", r"antifurto",
    r"fuori casa", r"in casa siamo", r"siamo (?:via|fuori|in casa|a casa)",
    r"assen\w*", r"presen\w*", r"rientr\w*", r"partit[oiae]", r"partenz\w*",
    r"nessuno in casa", r"casa vuota", r"disarmat\w*", r"armat[oiae]",
    r"posizione", r"geolocalizz\w*", r"telefon\w*", r"smartphone",
]
VIETATE_RE = re.compile(r"\b(?:" + "|".join(VIETATE) + r")\b", re.I)


def e(testo):
    return html.escape(str(testo), quote=False)


def carica(percorso):
    with open(percorso, encoding="utf-8") as f:
        dati = json.load(f)
    if not isinstance(dati, dict) or not isinstance(dati.get("frasi"), list):
        raise ValueError('atteso un oggetto con "letto_alle" e "frasi"')

    letto = datetime.fromisoformat(dati["letto_alle"])
    if letto.tzinfo is None:
        raise ValueError('"letto_alle" deve avere il fuso orario')
    eta = (datetime.now(timezone.utc) - letto).total_seconds() / 3600
    if eta > ETA_MASSIMA_ORE or eta < -0.5:
        raise ValueError(f"dati letti alle {dati['letto_alle']}: troppo vecchi o nel futuro")

    frasi = [" ".join(str(f).split()) for f in dati["frasi"] if str(f).strip()]
    if len(frasi) > MAX_FRASI:
        raise ValueError(f"{len(frasi)} frasi: al massimo {MAX_FRASI}, raggruppa le segnalazioni")
    for frase in frasi:
        if len(frase) > MAX_CARATTERI:
            raise ValueError(f"frase troppo lunga ({len(frase)} caratteri): {frase[:60]}...")
        vietata = VIETATE_RE.search(frase)
        if vietata:
            raise ValueError(
                f'la frase "{frase}" contiene "{vietata.group(0)}": la pagina e\' pubblica, '
                "niente informazioni su di noi o su dove siamo. Riscrivila o toglila."
            )
    return frasi, letto


ICONA_CASA = (
    '<svg class="casa__icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/><path d="M10 20v-5h4v5"/></svg>'
)


def fascia(frasi, ora):
    righe = [
        f'<section class="casa" aria-labelledby="casa-titolo" data-anomalie="{"si" if frasi else "no"}">',
        '  <h2 class="casa__titolo" id="casa-titolo">Casa</h2>',
        '  <div class="casa__corpo">',
        f'    {ICONA_CASA}',
        '    <div>',
    ]
    if frasi:
        righe.append('      <p class="casa__testo">Questa mattina in casa c\'è qualcosa da controllare.</p>')
        righe.append('      <ul class="casa__voci">')
        righe += [f'        <li>{e(f)}</li>' for f in frasi]
        righe.append('      </ul>')
    else:
        righe.append('      <p class="casa__testo">In casa è tutto in ordine: nessuna stanza fredda '
                     'stanotte, nessuna batteria da cambiare e nessuna faccenda in scadenza.</p>')
    righe += [
        '    </div>',
        '  </div>',
        f'  <p class="casa__fonte">Da Home Assistant, controllo delle {e(ora)}</p>',
        '</section>',
    ]
    return righe


def main():
    if len(sys.argv) != 3:
        sys.exit("uso: casa.py public/index.html .cache/casa.json")
    pagina, percorso = sys.argv[1], sys.argv[2]

    with open(pagina, encoding="utf-8") as f:
        documento = f.read()
    segnaposto = re.search(rf"^( *){re.escape(SEGNAPOSTO)}\n", documento, re.M)
    if not segnaposto:
        sys.exit(f"{pagina}: segnaposto {SEGNAPOSTO} non trovato (fascia gia' scritta o scheletro non aggiornato)")

    try:
        frasi, letto = carica(percorso)
    except (OSError, ValueError, KeyError, TypeError) as errore:
        sys.exit(f"Fascia casa non scritta: {errore}")

    rientro = segnaposto.group(1)
    markup = "".join(f"{rientro}{r}\n" for r in fascia(frasi, letto.strftime("%H:%M")))
    documento = documento[:segnaposto.start()] + markup + documento[segnaposto.end():]
    with open(pagina, "w", encoding="utf-8", newline="\n") as f:
        f.write(documento)
    print(f"Casa: {len(frasi)} segnalazioni." if frasi else "Casa: tutto in ordine.")


if __name__ == "__main__":
    main()
