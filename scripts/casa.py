#!/usr/bin/env python3
"""
Scrive la fascia "Casa" (temperature delle stanze da Home Assistant) nello
scheletro dell'edizione, subito dopo la fascia meteo.

Prende il posto del report mattutino che Home Assistant mandava su Telegram
alle 6:45. I dati li legge la routine quotidiana con il connettore Home
Assistant: passa scripts/casa.jinja al tool ha_eval_template e salva la
risposta, cosi' com'e', in un file JSON. Questo script scrive l'HTML: i
numeri non passano dall'AI.

Il file JSON puo' contenere la risposta intera del tool (con la chiave
"result") oppure solo il risultato del template.

Sostituisce la riga <!-- FASCIA-CASA --> lasciata da scripts/prepara-public.sh.
In caso di errore (dati mancanti, vecchi o non validi) esce con codice
diverso da zero senza toccare la pagina: l'edizione esce senza fascia casa.

Uso: casa.py public/index.html .cache/casa.json
"""

import html
import json
import re
import sys
from datetime import datetime, timezone

SEGNAPOSTO = "<!-- FASCIA-CASA -->"
VERSIONE = 2

# Dati piu' vecchi di cosi' non si pubblicano: vorrebbe dire che la routine
# ha riusato una lettura di un altro giorno.
ETA_MASSIMA_ORE = 6

NON_DISPONIBILE = {"unavailable", "unknown", "none", ""}


def numero(valore):
    if valore is None or str(valore).strip().lower() in NON_DISPONIBILE:
        return None
    try:
        return float(valore)
    except (TypeError, ValueError):
        return None


def carica(percorso):
    with open(percorso, encoding="utf-8") as f:
        dati = json.load(f)
    if isinstance(dati, dict) and "result" in dati and "stanze" not in dati:
        dati = dati["result"]
    if isinstance(dati, str):  # risultato del template rimasto come stringa JSON
        dati = json.loads(dati)
    if not isinstance(dati, dict) or dati.get("versione") != VERSIONE:
        raise ValueError("formato non riconosciuto (atteso il risultato di scripts/casa.jinja)")

    stanze = [{"nome": s["nome"], "temperatura": numero(s.get("temperatura"))}
              for s in dati.get("stanze", [])]
    if not any(s["temperatura"] is not None for s in stanze):
        raise ValueError("nessuna temperatura disponibile")

    letto = datetime.fromisoformat(dati["letto_alle"])
    eta = (datetime.now(timezone.utc) - letto).total_seconds() / 3600
    if eta > ETA_MASSIMA_ORE or eta < -0.5:
        raise ValueError(f"dati letti alle {dati['letto_alle']}: troppo vecchi o nel futuro")
    return stanze, letto


def e(testo):
    return html.escape(str(testo), quote=True)


def fascia(stanze, ora):
    righe = [
        '<section class="casa" aria-labelledby="casa-titolo">',
        '  <h2 class="casa__titolo" id="casa-titolo">Casa &middot; temperature</h2>',
        '  <ul class="casa__stanze">',
    ]
    for s in stanze:
        t = s["temperatura"]
        valore = f"{t:.1f}°".replace(".", ",") if t is not None else "n.d."
        righe.append(
            f'    <li class="casa__stanza"><span class="casa__nome">{e(s["nome"])}</span>'
            f'<span class="casa__valore">{e(valore)}</span></li>'
        )
    righe += [
        '  </ul>',
        f'  <p class="casa__fonte">Sensori Tado via Home Assistant, letti alle {e(ora)}</p>',
        '</section>',
    ]
    return righe


def main():
    if len(sys.argv) != 3:
        sys.exit("uso: casa.py public/index.html .cache/casa.json")
    pagina, percorso_dati = sys.argv[1], sys.argv[2]

    with open(pagina, encoding="utf-8") as f:
        documento = f.read()

    segnaposto = re.search(rf"^( *){re.escape(SEGNAPOSTO)}\n", documento, re.M)
    if not segnaposto:
        sys.exit(f"{pagina}: segnaposto {SEGNAPOSTO} non trovato (fascia gia' scritta o scheletro non aggiornato)")

    try:
        stanze, letto = carica(percorso_dati)
    except (OSError, ValueError, KeyError, TypeError) as errore:
        sys.exit(f"Dati di casa non utilizzabili: {errore}")

    # Orario locale di Home Assistant (Europe/Rome), non del runner in UTC.
    ora = letto.strftime("%H:%M")

    rientro = segnaposto.group(1)
    markup = "".join(f"{rientro}{r}\n" for r in fascia(stanze, ora))
    documento = documento[:segnaposto.start()] + markup + documento[segnaposto.end():]
    with open(pagina, "w", encoding="utf-8", newline="\n") as f:
        f.write(documento)

    lette = [s["temperatura"] for s in stanze if s["temperatura"] is not None]
    print(f"Casa: {len(lette)} stanze su {len(stanze)}, tra {min(lette):.1f} e {max(lette):.1f} °C.")


if __name__ == "__main__":
    main()
