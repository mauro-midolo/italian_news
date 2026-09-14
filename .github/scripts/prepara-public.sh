#!/usr/bin/env bash
#
# Ricrea public/ da una copia pulita di template/ e ne mette da parte una
# copia: la verifica la usa per capire se l'agente ha davvero scritto
# l'edizione o ha lasciato il template com'era.

set -euo pipefail

rm -rf public
cp -R template public

# Il commento di intestazione del template spiega all'agente come generare la
# pagina: non ha senso pubblicarlo. Si rimuove qui, cosi' l'edizione parte
# comunque pulita anche se l'agente modifica il file invece di riscriverlo.
if [ "$(sed -n 2p public/index.html)" = "<!--" ]; then
  sed -i '2,/^-->$/d' public/index.html
fi

cp public/index.html "${RUNNER_TEMP:-/tmp}/edizione-base.html"

echo "public/ ricreata dal template ($(wc -c < public/index.html) byte)."
