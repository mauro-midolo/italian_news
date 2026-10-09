#!/usr/bin/env python3
"""
Scrive la fascia meteo di San Lazzaro di Savena nello scheletro dell'edizione.

Prende le previsioni da Open-Meteo (gratuito, senza chiave) e sostituisce il
blocco delimitato da SCHELETRO:METEO-INIZIO / SCHELETRO:METEO-FINE nella
pagina passata come argomento. I numeri arrivano dall'API, non dall'agente:
non possono essere trascritti male ne' inventati.

Mostra il tempo di oggi (icona, condizione, massima e minima) e, fra i tre
giorni successivi, solo quelli in cui e' prevista pioggia.

In caso di errore (rete, API, risposta inattesa) esce con codice diverso da
zero senza toccare la pagina: e' scripts/prepara-public.sh a togliere il blocco, cosi'
l'edizione esce senza fascia meteo invece di fermarsi.

Uso: meteo.py public/index.html HH:MM
     (l'orario dell'edizione, gia' nel fuso Europe/Rome)
"""

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import date

LOCALITA = "San Lazzaro di Savena"
LATITUDINE = 44.4708
LONGITUDINE = 11.4086

# Un giorno conta come piovoso se la probabilita' massima di pioggia o la
# quantita' prevista superano queste soglie.
SOGLIA_PROBABILITA = 50  # %
SOGLIA_MM = 1.0

GIORNI_SUCCESSIVI = 3

GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]

API = "https://api.open-meteo.com/v1/forecast"
FONTE = "https://open-meteo.com/"

INIZIO = "<!-- SCHELETRO:METEO-INIZIO -->"
FINE = "<!-- SCHELETRO:METEO-FINE -->"


# --- Icone ------------------------------------------------------------------
# SVG inline a tratto, colorati con currentColor: seguono il tema chiaro/scuro.

_SOLE = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'
_NUVOLA = '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.5 4.5 0 0 0 7 18Z"/>'
_NUVOLA_ALTA = '<path d="M7 15h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 6.2 4.5 4.5 0 0 0 7 15Z"/>'

ICONE = {
    "sereno": _SOLE,
    "variabile": '<path d="M8 2v1.5M3.3 4.3l1 1M2 9h1.5M12.7 4.3l-1 1"/><path d="M5.2 11.3A3.5 3.5 0 1 1 11 7.2"/>'
                 '<path d="M9 20h8a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 8 12.3 3.9 3.9 0 0 0 9 20Z"/>',
    "nuvoloso": _NUVOLA,
    "nebbia": '<path d="M4 9h16M3 13h18M5 17h14M8 5h8"/>',
    "pioviggine": _NUVOLA_ALTA + '<path d="M9 18.5v.5M12 19.5v.5M15 18.5v.5"/>',
    "pioggia": _NUVOLA_ALTA + '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
    "neve": _NUVOLA_ALTA + '<path d="M9 19h.01M12 21h.01M15 19h.01M10.5 22h.01M13.5 22h.01"/>',
    "temporale": _NUVOLA_ALTA + '<path d="M13 15l-2.5 4h3L11 23"/>',
}

# Codici WMO restituiti da Open-Meteo -> (icona, descrizione).
def condizione(codice):
    if codice == 0:
        return "sereno", "Sereno"
    if codice == 1:
        return "variabile", "Prevalentemente sereno"
    if codice == 2:
        return "variabile", "Poco nuvoloso"
    if codice == 3:
        return "nuvoloso", "Nuvoloso"
    if codice in (45, 48):
        return "nebbia", "Nebbia"
    if 51 <= codice <= 57:
        return "pioviggine", "Pioviggine"
    if codice in (61, 80):
        return "pioggia", "Pioggia debole"
    if codice in (63, 81):
        return "pioggia", "Pioggia"
    if codice in (65, 82):
        return "pioggia", "Pioggia forte"
    if codice in (66, 67):
        return "pioggia", "Pioggia gelata"
    if 71 <= codice <= 77 or codice in (85, 86):
        return "neve", "Neve"
    if codice >= 95:
        return "temporale", "Temporale"
    return "nuvoloso", "Nuvoloso"


def icona(nome, classe):
    return (
        f'<svg class="{classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
        f"{ICONE[nome]}</svg>"
    )


# --- Dati -------------------------------------------------------------------

def scarica():
    parametri = urllib.parse.urlencode({
        "latitude": LATITUDINE,
        "longitude": LONGITUDINE,
        "daily": ",".join([
            "weather_code",
            "temperature_2m_max",
            "temperature_2m_min",
            "precipitation_sum",
            "precipitation_probability_max",
        ]),
        "timezone": "Europe/Rome",
        "forecast_days": GIORNI_SUCCESSIVI + 1,
    })
    ultimo_errore = None
    for tentativo in range(3):
        try:
            with urllib.request.urlopen(f"{API}?{parametri}", timeout=20) as risposta:
                return json.load(risposta)
        except Exception as errore:  # rete, HTTP, JSON: si riprova comunque
            ultimo_errore = errore
            time.sleep(3 * (tentativo + 1))
    raise RuntimeError(f"Open-Meteo non risponde: {ultimo_errore}")


def giorni(dati):
    d = dati["daily"]
    elenco = []
    for i, giorno in enumerate(d["time"]):
        probabilita = d["precipitation_probability_max"][i]
        mm = d["precipitation_sum"][i] or 0.0
        elenco.append({
            "data": date.fromisoformat(giorno),
            "codice": d["weather_code"][i],
            "max": d["temperature_2m_max"][i],
            "min": d["temperature_2m_min"][i],
            "probabilita": probabilita,
            "mm": mm,
            "pioggia": (probabilita or 0) >= SOGLIA_PROBABILITA or mm >= SOGLIA_MM,
        })
    if len(elenco) < GIORNI_SUCCESSIVI + 1:
        raise RuntimeError(f"Open-Meteo ha restituito {len(elenco)} giorni invece di {GIORNI_SUCCESSIVI + 1}")
    if elenco[0]["max"] is None or elenco[0]["min"] is None or elenco[0]["codice"] is None:
        raise RuntimeError("Open-Meteo non ha restituito i dati di oggi")
    return elenco


# --- Markup -----------------------------------------------------------------

def gradi(valore):
    return f"{round(valore)}°"


def dettaglio_pioggia(g):
    parti = []
    if g["probabilita"] is not None:
        parti.append(f"{g['probabilita']}%")
    if g["mm"] >= 0.1:
        parti.append(f"{g['mm']:.1f} mm".replace(".", ","))
    return " · ".join(parti)


def nome_giorno(g, oggi):
    if (g["data"] - oggi).days == 1:
        return "Domani"
    return f"{GIORNI[g['data'].weekday()].capitalize()} {g['data'].day}"


def elenca(nomi):
    nomi = [n[0].lower() + n[1:] for n in nomi]
    if len(nomi) == 1:
        return nomi[0]
    return ", ".join(nomi[:-1]) + " e " + nomi[-1]


def fascia(elenco, ora):
    oggi = elenco[0]
    successivi = elenco[1:GIORNI_SUCCESSIVI + 1]
    piovosi = [g for g in successivi if g["pioggia"]]
    nome_icona, descrizione = condizione(oggi["codice"])

    righe = [
        '<section class="meteo" aria-labelledby="meteo-titolo">',
        f'  <h2 class="meteo__titolo" id="meteo-titolo">Meteo &middot; {LOCALITA}</h2>',
        '  <div class="meteo__corpo">',
        '    <div class="meteo__oggi">',
        f'      {icona(nome_icona, "meteo__icona")}',
        '      <div>',
        '        <p class="meteo__etichetta">Oggi</p>',
        f'        <p class="meteo__condizione">{descrizione}</p>',
        '        <p class="meteo__temperature">',
        f'          <span class="meteo__max"><abbr title="massima">max</abbr> {gradi(oggi["max"])}</span>',
        f'          <span class="meteo__min"><abbr title="minima">min</abbr> {gradi(oggi["min"])}</span>',
        '        </p>',
    ]
    if oggi["pioggia"]:
        righe.append(f'        <p class="meteo__nota">Pioggia oggi: {dettaglio_pioggia(oggi)}</p>')
    righe += [
        '      </div>',
        '    </div>',
        "",
        f'    <div class="meteo__pioggia" data-pioggia="{"si" if piovosi else "no"}">',
        f'      <p class="meteo__etichetta">Pioggia nei prossimi {GIORNI_SUCCESSIVI} giorni</p>',
    ]
    if piovosi:
        nomi = [nome_giorno(g, oggi["data"]) for g in piovosi]
        righe.append(f'      <p class="meteo__sintesi">Prevista {elenca(nomi)}</p>')
        righe.append('      <ul class="meteo__giorni">')
        for g, nome in zip(piovosi, nomi):
            righe.append(
                f'        <li class="meteo__giorno">{icona("pioggia", "meteo__goccia")}'
                f'<strong>{nome}</strong> <span>{dettaglio_pioggia(g)}</span></li>'
            )
        righe.append('      </ul>')
    else:
        righe.append('      <p class="meteo__sintesi">Nessuna pioggia prevista</p>')
    righe += [
        '    </div>',
        '  </div>',
        f'  <p class="meteo__fonte">Previsioni <a href="{FONTE}" rel="noopener">Open-Meteo</a> delle {ora}</p>',
        '</section>',
    ]
    return righe


def main():
    if len(sys.argv) != 3:
        sys.exit("uso: meteo.py public/index.html HH:MM")
    pagina, ora = sys.argv[1], sys.argv[2]

    with open(pagina, encoding="utf-8") as f:
        html = f.read()

    blocco = re.search(
        rf"^( *){re.escape(INIZIO)}\n.*?^ *{re.escape(FINE)}\n", html, re.S | re.M
    )
    if not blocco:
        sys.exit(f"{pagina}: marcatori {INIZIO} / {FINE} non trovati")

    dati = scarica()
    elenco = giorni(dati)
    rientro = blocco.group(1)
    markup = "".join(f"{rientro}{r}\n" if r else "\n" for r in fascia(elenco, ora))

    html = html[:blocco.start()] + markup + html[blocco.end():]
    with open(pagina, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    piovosi = [g["data"].isoformat() for g in elenco[1:] if g["pioggia"]]
    print(
        f"Meteo: {condizione(elenco[0]['codice'])[1]}, "
        f"{gradi(elenco[0]['max'])}/{gradi(elenco[0]['min'])}, "
        f"pioggia nei prossimi giorni: {', '.join(piovosi) or 'no'}."
    )


if __name__ == "__main__":
    main()
