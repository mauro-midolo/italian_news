#!/usr/bin/env bash
#
# Verifica public/index.html. Due livelli:
#
#   (default)  "completa": la pagina e' pubblicabile E ha un riquadro per ogni
#              voce di [NOTIZIE]. Usato come controllo morbido dopo il primo
#              tentativo: se fallisce, all'agente viene dato un secondo giro.
#
#   --minimo   "pubblicabile": niente residui del template, data di oggi,
#              almeno un riquadro con almeno una notizia, asset intatti.
#              Usato come controllo definitivo: un'edizione piu' povera del
#              previsto si pubblica lo stesso (meglio poche notizie che il
#              sito fermo a ieri), ma con un avviso nel log.
#
# Non usa `set -e`: i controlli vengono eseguiti tutti, cosi' il log elenca
# ogni problema invece di fermarsi al primo.

set -uo pipefail

modo="completa"
if [ "${1:-}" = "--minimo" ]; then
  modo="minimo"
fi

errori=0

segnala() {
  echo "::error::$1"
  errori=$(( errori + 1 ))
}

if [ ! -f public/index.html ]; then
  echo "::error::public/index.html non è stato generato."
  exit 1
fi

# Quante voci ci sono sotto [NOTIZIE]? Le intestazioni sono `## voce`; il
# formato storico (`- voce`) resta supportato come ripiego.
voci_attese="$(
  awk '
    /^\[NOTIZIE\]/  { dentro = 1; next }
    /^\[[A-Z]+\]/   { dentro = 0 }
    dentro && /^## /            { intestazioni++ }
    dentro && /^[[:space:]]*- / { trattini++ }
    END { print (intestazioni > 0 ? intestazioni : trattini) + 0 }
  ' details.info 2>/dev/null || echo 0
)"

riquadri="$(grep -c '<section class="riquadro"' public/index.html || true)"
notizie="$(grep -c '<article class="notizia"' public/index.html || true)"

# 1. La pagina deve essere diversa dallo scheletro preparato dal workflow: se
#    coincidono, l'agente non ha scritto nulla.
base="${EDIZIONE_BASE:-${RUNNER_TEMP:-/tmp}/edizione-base.html}"
if [ -f "$base" ] && diff -q "$base" public/index.html > /dev/null; then
  segnala "public/index.html è ancora lo scheletro preparato dalla pipeline: l'agente non ha scritto l'edizione."
fi

# 2. Nessun residuo del template di esempio.
if grep -n 'data-edizione' public/index.html; then
  segnala "public/index.html contiene l'attributo data-edizione del template."
fi
if grep -n 'esempio\.it' public/index.html; then
  segnala "public/index.html contiene ancora i link di esempio del template."
fi

# 3. Struttura minima dell'edizione.
if [ "$riquadri" -lt 1 ]; then
  segnala "l'edizione non contiene alcun riquadro di notizie."
fi
if [ "$notizie" -lt 1 ]; then
  segnala "l'edizione non contiene alcuna notizia."
fi

# 4. La data di oggi deve comparire nella testata.
oggi="$(TZ='Europe/Rome' date +%Y-%m-%d)"
if ! grep -q "$oggi" public/index.html; then
  segnala "l'edizione non riporta la data di oggi ($oggi)."
fi

# 5. CSS, JS e asset devono restare identici al template.
for file in css/style.css js/main.js assets/favicon.svg _headers robots.txt; do
  if ! diff -q "template/$file" "public/$file" > /dev/null 2>&1; then
    segnala "public/$file diverge dal template."
  fi
done

# 6. Completezza: riquadro mancante = errore al primo giro, avviso al secondo.
if [ "$voci_attese" -gt 0 ] && [ "$riquadri" -lt "$voci_attese" ]; then
  if [ "$modo" = "completa" ]; then
    segnala "edizione incompleta: ${riquadri} riquadri su ${voci_attese} voci di [NOTIZIE]."
  else
    echo "::warning::edizione ridotta: ${riquadri} riquadri su ${voci_attese} voci di [NOTIZIE]."
  fi
fi

echo "Edizione: ${riquadri}/${voci_attese} riquadri, ${notizie} notizie, $(wc -c < public/index.html) byte."

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  {
    echo "riquadri=${riquadri}"
    echo "attesi=${voci_attese}"
    echo "notizie=${notizie}"
  } >> "$GITHUB_OUTPUT"
fi

if [ "$errori" -ne 0 ]; then
  echo "::group::Prime 40 righe di public/index.html"
  head -n 40 public/index.html
  echo "::endgroup::"
  exit 1
fi
