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

  /* --- Riquadri: identificatori e legame con il proprio titolo ------------ */

  var riquadri = Array.prototype.slice.call(document.querySelectorAll(".riquadro"));
  var notizie = Array.prototype.slice.call(document.querySelectorAll(".notizia"));

  riquadri.forEach(function (riquadro, i) {
    var titolo = riquadro.querySelector(".riquadro__titolo");
    if (!riquadro.id) riquadro.id = "riquadro-" + (i + 1);
    if (titolo && !riquadro.getAttribute("aria-labelledby")) {
      if (!titolo.id) titolo.id = riquadro.id + "-titolo";
      riquadro.setAttribute("aria-labelledby", titolo.id);
    }
  });

  /* --- Conteggi: per riquadro e totale di sezione ------------------------- */

  var totaleSezione = document.querySelector("[data-ruolo='totale']");

  function plurale(quante) {
    return quante === 1 ? " notizia" : " notizie";
  }

  function aggiornaConteggi(filtrando) {
    var visibiliTotali = 0;

    riquadri.forEach(function (riquadro) {
      var tutte = riquadro.querySelectorAll(".notizia");
      var visibili = riquadro.querySelectorAll(".notizia:not([hidden])");
      visibiliTotali += visibili.length;

      /* La prima notizia ancora visibile non porta il filetto di stacco. */
      Array.prototype.forEach.call(tutte, function (notizia, i) {
        if (visibili.length && notizia === visibili[0] && i !== 0) {
          notizia.setAttribute("data-primo", "si");
        } else {
          notizia.removeAttribute("data-primo");
        }
      });

      var contatore = riquadro.querySelector("[data-ruolo='conteggio']");
      if (contatore) {
        contatore.textContent = filtrando && visibili.length !== tutte.length
          ? visibili.length + " su " + tutte.length
          : tutte.length + plurale(tutte.length);
      }

      var voce = riquadro.id && document.querySelector("[data-voce='" + riquadro.id + "']");
      if (voce) {
        voce.hidden = visibili.length === 0;
        var numero = voce.querySelector(".indice__numero");
        if (numero) numero.textContent = visibili.length;
      }
    });

    if (totaleSezione && notizie.length) {
      totaleSezione.textContent = filtrando && visibiliTotali !== notizie.length
        ? visibiliTotali + " su " + notizie.length
        : notizie.length + plurale(notizie.length);
      totaleSezione.hidden = false;
    }

    return visibiliTotali;
  }

  /* --- Indice dei riquadri ------------------------------------------------ */

  var indice = document.querySelector("[data-ruolo='indice']");

  if (indice && riquadri.length > 1) {
    riquadri.forEach(function (riquadro) {
      var titolo = riquadro.querySelector(".riquadro__titolo");
      if (!titolo) return;

      var voce = document.createElement("a");
      voce.className = "indice__voce";
      voce.href = "#" + riquadro.id;
      voce.setAttribute("data-voce", riquadro.id);
      voce.appendChild(document.createTextNode(titolo.textContent.trim()));

      var numero = document.createElement("span");
      numero.className = "indice__numero";
      numero.textContent = riquadro.querySelectorAll(".notizia").length;
      voce.appendChild(numero);

      indice.appendChild(voce);
    });

    indice.hidden = indice.children.length === 0;
  }

  /* --- Impaginazione dei riquadri ----------------------------------------- */
  /*
     Il bilanciamento delle colonne CSS e' avido: riempie una colonna alla
     volta e, con riquadri di lunghezza molto diversa, lascia mezza pagina
     vuota. Qui i riquadri vengono misurati e ognuno dichiara quante righe
     della griglia occupa: il motore di layout puo' cosi' infilare i riquadri
     corti negli spazi liberi, senza cambiare l'ordine del documento.
  */

  var griglia = document.querySelector(".griglia");

  function pxDaVariabile(nome, elemento) {
    var valore = getComputedStyle(elemento).getPropertyValue(nome).trim();
    if (valore.slice(-3) === "rem") {
      return parseFloat(valore) * parseFloat(getComputedStyle(doc).fontSize);
    }
    return parseFloat(valore) || 0;
  }

  var impaginazione = griglia
    && riquadri.length
    && window.ResizeObserver
    && window.CSS && CSS.supports && CSS.supports("grid-auto-flow", "row dense");

  if (impaginazione) {
    var RIGA = 4; /* px: deve combaciare con --riga nel CSS */
    var inAttesa = false;

    var impagina = function () {
      inAttesa = false;

      var spazio = pxDaVariabile("--griglia-spazio", griglia);
      var minima = pxDaVariabile("--griglia-colonna", griglia);
      var entrano = minima > 0
        ? Math.max(1, Math.floor((griglia.clientWidth + spazio) / (minima + spazio)))
        : 1;

      var visibili = 0;
      riquadri.forEach(function (riquadro) { if (!riquadro.hidden) visibili++; });

      /* Colonne piu' dei riquadri lascerebbero una colonna vuota in fondo:
         meglio dividere la larghezza fra quelli che ci sono davvero. */
      var colonne = Math.max(1, Math.min(entrano, visibili));

      /* Un riquadro solo su tutta la pagina darebbe righe di testo lunghe il
         doppio del leggibile: si stringe la griglia e la si centra. */
      var stretta = colonne === 1 && entrano > 1;
      griglia.style.maxWidth = stretta ? "46rem" : "";
      griglia.style.marginInline = stretta ? "auto" : "";

      griglia.style.setProperty("--riga", RIGA + "px");
      griglia.style.setProperty("--colonne", colonne);
      griglia.setAttribute("data-impaginata", "si");

      /* Prima si misura tutto, poi si scrive: alternare le due cose
         costringerebbe il browser a rifare il layout a ogni riquadro. */
      var altezze = riquadri.map(function (riquadro) {
        return riquadro.hidden ? 0 : riquadro.getBoundingClientRect().height;
      });

      riquadri.forEach(function (riquadro, i) {
        if (!altezze[i]) return;
        riquadro.style.setProperty("--righe", Math.max(1, Math.ceil((altezze[i] + spazio) / RIGA)));
      });
    };

    var programma = function () {
      if (inAttesa) return;
      inAttesa = true;
      requestAnimationFrame(impagina);
    };

    /* Font che arrivano, immagini che si caricano, ricerca che nasconde
       notizie: ogni cambio di altezza rimette in fila i riquadri. */
    var osservatore = new ResizeObserver(programma);
    osservatore.observe(griglia);
    riquadri.forEach(function (riquadro) { osservatore.observe(riquadro); });

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(programma);
    impagina();
  }

  /* --- Foto: se l'originale non c'e' piu', si toglie lo spazio ------------ */

  Array.prototype.forEach.call(
    document.querySelectorAll(".notizia__foto, .notizia > img"),
    function (foto) {
      foto.addEventListener("error", function () {
        foto.remove();
      });
      if (foto.complete && foto.naturalWidth === 0) foto.remove();
    }
  );

  /* --- Ricerca fra le notizie -------------------------------------------- */

  var ricerca = document.querySelector("[data-azione='cerca']");

  var DIACRITICI = new RegExp("[\\u0300-\\u036f]", "g");

  function normalizza(testo) {
    return testo
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICI, "");
  }

  if (ricerca && notizie.length) {
    var contenitoreRicerca = ricerca.closest(".ricerca") || ricerca;
    contenitoreRicerca.hidden = false;

    var indiceTesti = notizie.map(function (notizia) {
      return { nodo: notizia, testo: normalizza(notizia.textContent || "") };
    });

    ricerca.addEventListener("input", function () {
      var query = normalizza(ricerca.value.trim());

      indiceTesti.forEach(function (voce) {
        voce.nodo.hidden = query !== "" && voce.testo.indexOf(query) === -1;
      });

      riquadri.forEach(function (riquadro) {
        riquadro.hidden = riquadro.querySelectorAll(".notizia:not([hidden])").length === 0;
      });

      var totale = aggiornaConteggi(query !== "");

      var avviso = document.querySelector("[data-ruolo='nessun-risultato']");
      if (avviso) avviso.hidden = totale !== 0;
    });

    ricerca.addEventListener("keydown", function (evento) {
      if (evento.key === "Escape" && ricerca.value !== "") {
        ricerca.value = "";
        ricerca.dispatchEvent(new Event("input"));
      }
    });
  }

  aggiornaConteggi(false);

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
