#!/usr/bin/env bash
#
# Ricrea public/ da template/ e trasforma public/index.html nello SCHELETRO
# dell'edizione di oggi: testata con la data corretta, nessun contenuto di
# esempio, griglia delle notizie vuota.
#
# Perche' uno scheletro e non una copia del template: l'agente non deve piu'
# riscrivere la pagina da zero alla fine del lavoro (se il turno si chiudeva
# prima di quell'unica Write non veniva pubblicato nulla). Parte da una pagina
# gia' valida e la riempie un riquadro alla volta, cosi' anche un lavoro
# interrotto a meta' resta pubblicabile.
#
# Ne mette da parte una copia (edizione-base.html): la verifica la usa per
# capire se l'agente ha davvero scritto qualcosa.

set -euo pipefail

rm -rf public
cp -R template public

pagina=public/index.html

# 1. Via il commento di intestazione del template: spiega come generare la
#    pagina, non ha senso pubblicarlo.
if [ "$(sed -n 2p "$pagina")" = "<!--" ]; then
  sed -i '2,/^-->$/d' "$pagina"
fi

# 2. Data di oggi, in italiano, senza dipendere dai locale del runner.
giorni=(domenica lunedì martedì mercoledì giovedì venerdì sabato)
mesi=(gennaio febbraio marzo aprile maggio giugno luglio agosto settembre ottobre novembre dicembre)

oggi_iso="$(TZ='Europe/Rome' date +%Y-%m-%d)"
ora_hm="$(TZ='Europe/Rome' date +%H:%M)"
adesso_iso="$(TZ='Europe/Rome' date +%Y-%m-%dT%H:%M:%S%:z)"
nome_giorno="${giorni[$(TZ='Europe/Rome' date +%w)]}"
nome_mese="${mesi[$(( $(TZ='Europe/Rome' date +%-m) - 1 ))]}"
data_estesa="${nome_giorno^} $(TZ='Europe/Rome' date +%-d) ${nome_mese} $(TZ='Europe/Rome' date +%Y)"

titolo="Il Quotidiano — ${data_estesa}"
descrizione="Le notizie di ${nome_giorno} $(TZ='Europe/Rome' date +%-d) ${nome_mese}, selezionate e riassunte automaticamente."

# 3. Testata, metadati e attributo di prova.
sed -i \
  -e 's| data-edizione="[^"]*"||' \
  -e "s|<title>.*</title>|<title>${titolo}</title>|" \
  -e "s|<meta name=\"description\" content=\"[^\"]*\">|<meta name=\"description\" content=\"${descrizione}\">|" \
  -e "s|<meta property=\"og:title\" content=\"[^\"]*\">|<meta property=\"og:title\" content=\"${titolo}\">|" \
  -e "s|<meta property=\"og:description\" content=\"[^\"]*\">|<meta property=\"og:description\" content=\"${descrizione}\">|" \
  -e "s|<time datetime=\"[^\"]*\">.*</time>|<time datetime=\"${oggi_iso}\"><strong>${data_estesa}</strong></time>|" \
  -e "s|<span>Edizione delle [^<]*</span>|<span>Edizione delle ${ora_hm}</span>|" \
  -e "s|\(data-ruolo=\"aggiornato\" datetime=\)\"[^\"]*\"|\1\"${adesso_iso}\"|" \
  "$pagina"

# 4. Via gli avvisi di esempio: la sezione .avvisi esiste solo se una voce di
#    [INFORMAZIONI] ha davvero prodotto qualcosa, e in quel caso la scrive
#    l'agente.
sed -i '/SCHELETRO:AVVISI-INIZIO/,/SCHELETRO:AVVISI-FINE/d' "$pagina"

# 5. Griglia vuota, pronta a ricevere i riquadri. Il segnaposto non contiene
#    le stringhe class="riquadro" / class="notizia": la verifica conta quelle.
sed -i \
  -e '/SCHELETRO:RIQUADRI-INIZIO/,/SCHELETRO:RIQUADRI-FINE/d' \
  -e 's|^\( *\)<div class="griglia">$|\1<div class="griglia">\n\1  <!-- I riquadri delle notizie vanno inseriti qui, uno per ogni voce di [NOTIZIE]. -->|' \
  "$pagina"

# 6. Rete di sicurezza: se qualcosa qui sopra non ha agganciato, meglio
#    saperlo adesso che dopo dieci minuti di ricerche.
for residuo in 'data-edizione' 'esempio\.it' 'edizione di esempio' 'SCHELETRO:'; do
  if grep -q "$residuo" "$pagina"; then
    echo "::error::lo scheletro contiene ancora \"${residuo}\": prepara-public.sh non e' allineato al template."
    exit 1
  fi
done
if ! grep -q "$oggi_iso" "$pagina"; then
  echo "::error::lo scheletro non riporta la data di oggi (${oggi_iso})."
  exit 1
fi

cp "$pagina" "${RUNNER_TEMP:-/tmp}/edizione-base.html"

echo "Scheletro del ${oggi_iso} pronto in public/ ($(wc -c < "$pagina") byte)."
