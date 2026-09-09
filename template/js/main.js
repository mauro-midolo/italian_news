/* ===========================================================================
   Il Quotidiano — comportamenti della pagina.
   Tutto qui dentro e' progressive enhancement: senza JavaScript il giornale
   resta perfettamente leggibile. Questo file viene copiato invariato in
   public/: l'agente non deve riscriverlo durante la generazione quotidiana.
   =========================================================================== */

(function () {
  "use strict";

  var doc = document.documentElement;

  /* --- Tema: automatico -> chiaro -> scuro -------------------------------- */

  var CHIAVE_TEMA = "quotidiano:tema";
  var temi = ["auto", "chiaro", "scuro"];
  var etichette = { auto: "Tema: auto", chiaro: "Tema: chiaro", scuro: "Tema: scuro" };
  var bottoneTema = document.querySelector("[data-azione='tema']");

  function leggiTema() {
    try {
      var salvato = localStorage.getItem(CHIAVE_TEMA);
      return temi.indexOf(salvato) > -1 ? salvato : "auto";
    } catch (e) {
      return "auto";
    }
  }

  function applicaTema(tema) {
    if (tema === "auto") {
      doc.removeAttribute("data-tema");
    } else {
      doc.setAttribute("data-tema", tema);
    }
    if (bottoneTema) {
      bottoneTema.textContent = etichette[tema];
      bottoneTema.setAttribute("aria-label", etichette[tema] + " (clic per cambiare)");
    }
    try {
      localStorage.setItem(CHIAVE_TEMA, tema);
    } catch (e) {
      /* modalita' privata o storage bloccato: il tema vale solo per la sessione */
    }
  }

  if (bottoneTema) {
    bottoneTema.hidden = false;
    applicaTema(leggiTema());
    bottoneTema.addEventListener("click", function () {
      var successivo = temi[(temi.indexOf(leggiTema()) + 1) % temi.length];
      applicaTema(successivo);
    });
  }

  /* --- Ricerca fra le notizie -------------------------------------------- */

  var ricerca = document.querySelector("[data-azione='cerca']");
  var notizie = Array.prototype.slice.call(document.querySelectorAll(".notizia"));
  var riquadri = Array.prototype.slice.call(document.querySelectorAll(".riquadro"));

  var DIACRITICI = new RegExp("[\u0300-\u036f]", "g");

  function normalizza(testo) {
    return testo
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICI, "");
  }

  if (ricerca && notizie.length) {
    var contenitoreRicerca = ricerca.closest(".ricerca") || ricerca;
    contenitoreRicerca.hidden = false;

    var indice = notizie.map(function (notizia) {
      return { nodo: notizia, testo: normalizza(notizia.textContent || "") };
    });

    ricerca.addEventListener("input", function () {
      var query = normalizza(ricerca.value.trim());

      indice.forEach(function (voce) {
        voce.nodo.hidden = query !== "" && voce.testo.indexOf(query) === -1;
      });

      riquadri.forEach(function (riquadro) {
        var visibili = riquadro.querySelectorAll(".notizia:not([hidden])").length;
        riquadro.hidden = visibili === 0;
      });

      var totale = document.querySelectorAll(".notizia:not([hidden])").length;
      var avviso = document.querySelector("[data-ruolo='nessun-risultato']");
      if (avviso) avviso.hidden = totale !== 0;
    });
  }

  /* --- Conteggio notizie per riquadro ------------------------------------ */

  riquadri.forEach(function (riquadro) {
    var contatore = riquadro.querySelector("[data-ruolo='conteggio']");
    if (!contatore) return;
    var quante = riquadro.querySelectorAll(".notizia").length;
    contatore.textContent = quante + (quante === 1 ? " notizia" : " notizie");
  });

  /* --- "Aggiornato N ore fa" --------------------------------------------- */

  var marcatore = document.querySelector("[data-ruolo='aggiornato']");
  if (marcatore) {
    var quando = Date.parse(marcatore.getAttribute("datetime") || "");
    if (!isNaN(quando)) {
      var minuti = Math.round((Date.now() - quando) / 60000);
      var frase;
      if (minuti < 2) frase = "aggiornato adesso";
      else if (minuti < 60) frase = "aggiornato " + minuti + " minuti fa";
      else if (minuti < 48 * 60) {
        var ore = Math.round(minuti / 60);
        frase = "aggiornato " + ore + (ore === 1 ? " ora fa" : " ore fa");
      } else {
        var giorni = Math.round(minuti / 1440);
        frase = "aggiornato " + giorni + " giorni fa";
      }
      marcatore.textContent = frase;
      marcatore.hidden = false;
    }
  }

  /* --- Torna su ----------------------------------------------------------- */

  var su = document.querySelector("[data-azione='su']");
  if (su) {
    su.hidden = false;
    var aggiornaSu = function () {
      su.setAttribute("data-visibile", window.scrollY > 600 ? "si" : "no");
    };
    aggiornaSu();
    window.addEventListener("scroll", aggiornaSu, { passive: true });
    su.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
})();
