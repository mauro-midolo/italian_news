#!/usr/bin/env bash
#
# Verifica che public/index.html sia davvero l'edizione del giorno e non un
# residuo del template. Viene eseguito due volte dal workflow: la prima come
# controllo morbido (se fallisce si rigenera), la seconda come controllo
# definitivo.
#
# Non usa `set -e`: i controlli vengono eseguiti tutti, cosi' il log elenca
# ogni problema invece di fermarsi al primo.

set -uo pipefail

errori=0

segnala() {
  echo "::error::$1"
  errori=$(( errori + 1 ))
}

if [ ! -f public/index.html ]; then
  echo "::error::public/index.html non è stato generato."
  exit 1
fi

# 1. La pagina deve essere diversa dalla base preparata dal workflow: se
#    coincidono, l'agente non ha scritto nulla.
base="${EDIZIONE_BASE:-${RUNNER_TEMP:-/tmp}/edizione-base.html}"
if [ -f "$base" ]; then
  if diff -q "$base" public/index.html > /dev/null; then
    segnala "public/index.html è identico alla copia del template: l'agente non ha scritto l'edizione."
  fi
elif diff -q template/index.html public/index.html > /dev/null; then
  segnala "public/index.html è identico al template: l'agente non ha scritto l'edizione."
fi

# 2. Nessun residuo del template di esempio: l'attributo data-edizione esiste
#    solo li' e non deve comparire nella pagina pubblicata.
if grep -n 'data-edizione' public/index.html; then
  segnala "public/index.html contiene ancora l'attributo data-edizione del template."
fi

# 3. Struttura minima dell'edizione.
riquadri="$(grep -c 'class="riquadro"' public/index.html || true)"
if [ "$riquadri" -lt 1 ]; then
  segnala "l'edizione non contiene alcun riquadro di notizie."
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

notizie="$(grep -c 'class="notizia"' public/index.html || true)"
echo "Edizione: ${riquadri} riquadri, ${notizie} notizie, $(wc -c < public/index.html) byte."

if [ "$errori" -ne 0 ]; then
  echo "::group::Prime 40 righe di public/index.html"
  head -n 40 public/index.html
  echo "::endgroup::"
  exit 1
fi
