#!/usr/bin/env python3
"""
Scrive la fascia "Casa" (temperature di casa da Home Assistant) nello
scheletro dell'edizione, subito dopo la fascia meteo.

Prende il posto del report mattutino che Home Assistant mandava su Telegram
alle 6:45. I dati li legge la routine quotidiana con il connettore Home
Assistant: passa scripts/casa.jinja al tool ha_eval_template e salva la
risposta, cosi' com'e', in un file JSON. Questo script calcola soglie e
anomalie e scrive l'HTML: i numeri non passano dall'AI.

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

# Stesse regole del vecchio report Telegram.
SCARTO_DESIDERATA = 1.5      # °C sotto la desiderata oltre i quali segnalare
UMIDITA_MAX = 65             # %
UMIDITA_MIN = 35             # %
BAGNO_FREDDO = 18.0          # °C: avviso per il bagno, suggerimento anche per il bagnetto
MODALITA_SOLO_PDC = "Solo pompe di calore"
MODALITA_CONSIGLIATA = "Pompe di calore e caldaia"

# Dati piu' vecchi di cosi' non si pubblicano: vorrebbe dire che la routine
# ha riusato una lettura di un altro giorno.
ETA_MASSIMA_ORE = 6

NON_DISPONIBILE = {"unavailable", "unknown", "none", ""}

STATI_DAIKIN = {
    "off": "spento",
    "heat": "riscaldamento",
    "cool": "raffrescamento",
    "heat_cool": "automatico",
    "auto": "automatico",
    "dry": "deumidificazione",
    "fan_only": "ventilazione",
}


# --- Dati -------------------------------------------------------------------

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
    if not isinstance(dati, dict) or dati.get("versione") != 1:
        raise ValueError("formato non riconosciuto (atteso il risultato di scripts/casa.jinja)")
    if not dati.get("stanze"):
        raise ValueError("nessuna stanza nei dati")

    letto = datetime.fromisoformat(dati["letto_alle"])
    eta = (datetime.now(timezone.utc) - letto).total_seconds() / 3600
    if eta > ETA_MASSIMA_ORE or eta < -0.5:
        raise ValueError(f"dati letti alle {dati['letto_alle']}: troppo vecchi o nel futuro")
    dati["_letto"] = letto
    return dati


def analizza(dati):
    stanze = []
    for s in dati["stanze"]:
        stanze.append({
            "id": s.get("id", ""),
            "nome": s["nome"],
            "temperatura": numero(s.get("temperatura")),
            "umidita": numero(s.get("umidita")),
            "desiderata": numero(s.get("desiderata")),
            "finestra": str(s.get("finestra", "")).lower(),
            "problemi": [],
        })

    for s in stanze:
        t, u, d = s["temperatura"], s["umidita"], s["desiderata"]
        if t is None:
            s["problemi"].append("sensore di temperatura non disponibile")
        else:
            # Come nel vecchio report: "bagno freddo" vale solo per il bagno;
            # il bagnetto conta solo per il suggerimento sulla modalita'.
            if s["id"] == "bagno" and t < BAGNO_FREDDO:
                s["problemi"].append(f"freddo, sotto i {gradi(BAGNO_FREDDO, 0)}")
            if d is not None and t < d - SCARTO_DESIDERATA:
                s["problemi"].append(f"{decimale(d - t)} °C sotto la desiderata ({gradi(d)})")
        if s["finestra"] == "on":
            s["problemi"].append("finestra aperta")
        elif s["finestra"] in NON_DISPONIBILE:
            s["problemi"].append("sensore finestra non disponibile")
        if u is None:
            s["problemi"].append("sensore di umidità non disponibile")
        elif u > UMIDITA_MAX:
            s["problemi"].append(f"umidità alta ({u:.0f}%)")
        elif u < UMIDITA_MIN:
            s["problemi"].append(f"umidità bassa ({u:.0f}%)")

    daikin = [{"nome": d["nome"], "stato": str(d.get("stato", "")).lower()} for d in dati.get("daikin", [])]
    daikin_ko = [d["nome"] for d in daikin if d["stato"] in NON_DISPONIBILE]

    modalita = dati.get("modalita") or ""
    freddi = [s for s in stanze
              if s["id"] in ("bagno", "bagnetto")
              and s["temperatura"] is not None and s["temperatura"] < BAGNO_FREDDO]
    suggerimento = None
    if modalita == MODALITA_SOLO_PDC and freddi:
        elenco = " e ".join(f"{s['nome'].lower()} a {gradi(s['temperatura'])}" for s in freddi)
        suggerimento = (f"Modalità {MODALITA_SOLO_PDC.lower()} con {elenco}: "
                        f"valuta di passare a {MODALITA_CONSIGLIATA.lower()}.")

    lette = [s["temperatura"] for s in stanze if s["temperatura"] is not None]
    if not lette:
        raise ValueError("nessuna temperatura disponibile")

    return {
        "stanze": stanze,
        "daikin": daikin,
        "daikin_ko": daikin_ko,
        "suggerimento": suggerimento,
        "minima": min(lette),
        "massima": max(lette),
        "esterna": numero(dati.get("esterna")),
        "modalita": modalita,
    }


# --- Markup -----------------------------------------------------------------

def decimale(valore, cifre=1):
    return f"{valore:.{cifre}f}".replace(".", ",")


def gradi(valore, cifre=1):
    return f"{decimale(valore, cifre)} °C"


def e(testo):
    return html.escape(str(testo), quote=True)


ICONA_CASA = (
    '<svg class="casa__icona" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h14V9"/>'
    '<path d="M12 11.5v5"/><circle cx="12" cy="17.5" r="1.5"/></svg>'
)


def riga_daikin(daikin):
    accesi = [d for d in daikin if d["stato"] not in NON_DISPONIBILE and d["stato"] != "off"]
    if not daikin:
        return None
    if not accesi:
        return "tutti spenti"
    parti = [f"{d['nome']} in {STATI_DAIKIN.get(d['stato'], d['stato'])}" for d in accesi]
    return ", ".join(parti)


def fascia(a, ora):
    anomalie = [s for s in a["stanze"] if s["problemi"]]
    n_segnalazioni = len(anomalie) + (1 if a["daikin_ko"] else 0)
    regolare = n_segnalazioni == 0 and not a["suggerimento"]

    sintesi = f"Tra {gradi(a['minima'])} e {gradi(a['massima'])}"
    righe = [
        '<section class="casa" aria-labelledby="casa-titolo">',
        '  <h2 class="casa__titolo" id="casa-titolo">Casa &middot; temperature</h2>',
        '  <div class="casa__corpo">',
        '    <div class="casa__oggi">',
        f'      {ICONA_CASA}',
        '      <div>',
        '        <p class="casa__etichetta">Dentro casa</p>',
        f'        <p class="casa__sintesi">{e(sintesi)}</p>',
        '        <p class="casa__dati">',
    ]
    if a["esterna"] is not None:
        righe.append(f'          <span><abbr title="temperatura esterna">fuori</abbr> {gradi(a["esterna"])}</span>')
    if a["modalita"] and a["modalita"].lower() not in NON_DISPONIBILE:
        righe.append(f'          <span><abbr title="modalità di riscaldamento">modalità</abbr> {e(a["modalita"])}</span>')
    daikin = riga_daikin(a["daikin"])
    if daikin:
        righe.append(f'          <span><abbr title="climatizzatori Daikin">daikin</abbr> {e(daikin)}</span>')
    righe += [
        '        </p>',
        '      </div>',
        '    </div>',
        "",
        f'    <div class="casa__controlli" data-anomalie="{"no" if regolare else "si"}">',
        '      <p class="casa__etichetta">Controlli del mattino</p>',
    ]
    if regolare:
        righe.append('      <p class="casa__esito">Tutto regolare</p>')
    else:
        conta = n_segnalazioni
        esito = ("Da controllare" if conta == 0
                 else f"{conta} {'cosa' if conta == 1 else 'cose'} da controllare")
        righe.append(f'      <p class="casa__esito">{esito}</p>')
        righe.append('      <ul class="casa__anomalie">')
        for s in anomalie:
            valore = f" ({gradi(s['temperatura'])})" if s["temperatura"] is not None else ""
            righe.append(
                f'        <li><strong>{e(s["nome"])}</strong>{e(valore)}: {e("; ".join(s["problemi"]))}</li>'
            )
        if a["daikin_ko"]:
            nomi = ", ".join(a["daikin_ko"])
            righe.append(f'        <li><strong>Daikin non disponibili</strong>: {e(nomi)}</li>')
        righe.append('      </ul>')
        if a["suggerimento"]:
            righe.append(f'      <p class="casa__consiglio">{e(a["suggerimento"])}</p>')
    righe += [
        '    </div>',
        '  </div>',
        "",
        '  <ul class="casa__stanze">',
    ]
    for s in a["stanze"]:
        stato = "anomalia" if s["problemi"] else "ok"
        valore = decimale(s["temperatura"]) + "°" if s["temperatura"] is not None else "n.d."
        dettagli = []
        if s["umidita"] is not None:
            dettagli.append(f"{s['umidita']:.0f}%")
        if s["desiderata"] is not None:
            dettagli.append(f"obiettivo {decimale(s['desiderata'])}°")
        righe.append(
            f'    <li class="casa__stanza" data-stato="{stato}">'
            f'<span class="casa__nome">{e(s["nome"])}</span>'
            f'<span class="casa__valore">{e(valore)}</span>'
            f'<span class="casa__dettaglio">{e(" · ".join(dettagli))}</span></li>'
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
        dati = carica(percorso_dati)
        analisi = analizza(dati)
    except (OSError, ValueError, KeyError, TypeError) as errore:
        sys.exit(f"Dati di casa non utilizzabili: {errore}")

    # L'orario mostrato e' quello locale di Home Assistant (Europe/Rome), non
    # quello del runner, che gira in UTC.
    ora = dati["_letto"].strftime("%H:%M")

    rientro = segnaposto.group(1)
    markup = "".join(f"{rientro}{r}\n" if r else "\n" for r in fascia(analisi, ora))
    documento = documento[:segnaposto.start()] + markup + documento[segnaposto.end():]
    with open(pagina, "w", encoding="utf-8", newline="\n") as f:
        f.write(documento)

    anomalie = [s["nome"] for s in analisi["stanze"] if s["problemi"]] + analisi["daikin_ko"]
    print(
        f"Casa: tra {gradi(analisi['minima'])} e {gradi(analisi['massima'])}, "
        f"da controllare: {', '.join(anomalie) or 'niente'}."
    )


if __name__ == "__main__":
    main()
