/* ===========================================================================
   Il Quotidiano — comportamenti della pagina.
   Tutto qui dentro e' progressive enhancement: senza JavaScript il giornale
   resta perfettamente leggibile. Questo file viene copiato invariato in
   public/: l'agente non deve riscriverlo durante la generazione quotidiana.
   =========================================================================== */

(function () {
  "use strict";

  var doc = document.documentElement;
  var riquadri = Array.prototype.slice.call(document.querySelectorAll(".riquadro"));
  var notizie = Array.prototype.slice.call(document.querySelectorAll(".notizia"));
  var griglia = document.querySelector(".griglia");

  /* --- Tema: automatico -> chiaro -> scuro -------------------------------- */

  var CHIAVE_TEMA = "quotidiano:tema";
  var temi = ["auto", "chiaro", "scuro"];
  var nomi = { auto: "Auto", chiaro: "Chiaro", scuro: "Scuro" };
  var ICONA = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var icone = {
    auto: ICONA + '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16Z" fill="currentColor"/></svg>',
    chiaro: ICONA + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    scuro: ICONA + '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/></svg>'
  };
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
      bottoneTema.innerHTML = icone[tema] + "<span>" + nomi[tema] + "</span>";
      bottoneTema.setAttribute("aria-label", "Tema: " + nomi[tema].toLowerCase() + " (clic per cambiare)");
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

  /* --- Sintesi: sezioni, notizie, tempo di lettura ----------------------- */

  var sintesi = document.querySelector("[data-ruolo='sintesi']");
  if (sintesi && notizie.length) {
    var parole = 0;
    notizie.forEach(function (notizia) {
      parole += (notizia.textContent || "").split(/\s+/).filter(Boolean).length;
    });
    var lettura = Math.max(1, Math.round(parole / 220));
    sintesi.textContent =
      riquadri.length + (riquadri.length === 1 ? " sezione" : " sezioni") + " · " +
      notizie.length + (notizie.length === 1 ? " notizia" : " notizie") + " · " +
      lettura + " min di lettura";
    sintesi.hidden = false;
  }

  /* --- Impaginazione a mosaico ------------------------------------------- */
  /* Ogni riquadro occupa tante righe da 2px quanto e' alto: le colonne si
     riempiono senza buchi e l'ordine dei riquadri resta quello del file. */

  var impagina = function () {};

  if (griglia && riquadri.length > 1 && window.getComputedStyle) {
    impagina = function () {
      var colonne = getComputedStyle(griglia).gridTemplateColumns.split(" ").length;
      if (colonne < 2) {
        griglia.removeAttribute("data-mosaico");
        riquadri.forEach(function (r) { r.style.gridRowEnd = ""; });
        return;
      }
      griglia.setAttribute("data-mosaico", "");
      var stile = getComputedStyle(griglia);
      var riga = parseFloat(stile.gridAutoRows) || 2;
      var spazio = parseFloat(stile.columnGap) || 0;
      riquadri.forEach(function (r) {
        if (r.hidden) return;
        var altezza = r.getBoundingClientRect().height;
        r.style.gridRowEnd = "span " + Math.ceil((altezza + spazio) / riga);
      });
    };

    var inAttesa = false;
    var richiedi = function () {
      if (inAttesa) return;
      inAttesa = true;
      window.requestAnimationFrame(function () {
        inAttesa = false;
        impagina();
      });
    };

    impagina();
    window.addEventListener("resize", richiedi);
    window.addEventListener("load", richiedi);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(richiedi);
    if ("ResizeObserver" in window) {
      var osservatore = new ResizeObserver(richiedi);
      riquadri.forEach(function (r) { osservatore.observe(r); });
    }
    impagina = richiedi;
  }

  /* --- Sommario delle sezioni -------------------------------------------- */

  var sommario = document.querySelector(".sommario");
  var listaSommario = sommario && sommario.querySelector(".sommario__lista");
  var vociSommario = [];
  var avvisi = document.querySelector(".avvisi");

  function slug(testo) {
    return testo
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "sezione";
  }

  function aggiungiVoce(bersaglio, titolo, numero, tinta) {
    if (!bersaglio.id) {
      var base = slug(titolo);
      var id = base;
      var n = 2;
      while (document.getElementById(id)) id = base + "-" + n++;
      bersaglio.id = id;
    }
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.className = "sommario__voce";
    a.href = "#" + bersaglio.id;
    if (tinta) a.style.setProperty("--tinta", tinta);

    var punto = document.createElement("span");
    punto.className = "sommario__punto";
    var testo = document.createElement("span");
    testo.className = "sommario__testo";
    testo.textContent = titolo;
    a.appendChild(punto);
    a.appendChild(testo);
    if (numero) {
      var conta = document.createElement("span");
      conta.className = "sommario__numero";
      conta.textContent = numero;
      a.appendChild(conta);
    }
    li.appendChild(a);
    listaSommario.appendChild(li);
    vociSommario.push({ bersaglio: bersaglio, li: li, link: a });
  }

  if (listaSommario && riquadri.length) {
    if (avvisi) aggiungiVoce(avvisi, "Avvisi", 0, "var(--avviso-badge)");
    riquadri.forEach(function (riquadro, i) {
      var titolo = riquadro.querySelector(".riquadro__titolo");
      aggiungiVoce(
        riquadro,
        titolo ? titolo.textContent.trim() : "Sezione " + (i + 1),
        riquadro.querySelectorAll(".notizia").length,
        "var(--t" + ((i % 8) + 1) + ")"
      );
    });
    sommario.hidden = false;

    var attiva = function (voce) {
      vociSommario.forEach(function (v) {
        if (v === voce) v.link.setAttribute("aria-current", "true");
        else v.link.removeAttribute("aria-current");
      });
      if (!voce) return;
      var lista = listaSommario;
      var sinistra = voce.li.offsetLeft - (lista.clientWidth - voce.li.offsetWidth) / 2;
      lista.scrollLeft = Math.max(0, sinistra);
    };

    var corrente = null;
    var aggiornaSommario = function () {
      /* Sezione corrente: l'ultima il cui inizio ha superato il sommario.
         Con piu' colonne affiancate vale lo stesso criterio: conta dove
         comincia il riquadro, non quale colonna e' piu' lunga. */
      var soglia = sommario.getBoundingClientRect().bottom + 24;
      var scelta = null;
      var inizio = -Infinity;
      vociSommario.forEach(function (v) {
        if (v.bersaglio.hidden) return;
        var alto = v.bersaglio.getBoundingClientRect().top;
        if (alto <= soglia && alto > inizio) { inizio = alto; scelta = v; }
      });
      if (scelta !== corrente) {
        corrente = scelta;
        attiva(scelta);
      }
      var max = doc.scrollHeight - window.innerHeight;
      sommario.style.setProperty("--avanzamento", max > 0 ? Math.min(1, window.scrollY / max).toFixed(4) : "0");
    };

    window.addEventListener("scroll", aggiornaSommario, { passive: true });
    window.addEventListener("resize", aggiornaSommario);
    aggiornaSommario();
  }

  /* --- Ricerca fra le notizie -------------------------------------------- */

  var ricerca = document.querySelector("[data-azione='cerca']");

  var DIACRITICI = new RegExp("[̀-ͯ]", "g");

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

      if (vociSommario.length) {
        var restano = 0;
        vociSommario.forEach(function (v) {
          v.li.hidden = !!v.bersaglio.hidden;
          if (!v.li.hidden) restano++;
        });
        sommario.hidden = restano === 0;
      }

      var totale = document.querySelectorAll(".notizia:not([hidden])").length;
      var avviso = document.querySelector("[data-ruolo='nessun-risultato']");
      if (avviso) avviso.hidden = totale !== 0;

      impagina();
    });

    /* "/" porta nella ricerca, Esc la svuota. */
    document.addEventListener("keydown", function (evento) {
      var bersaglio = evento.target;
      var scrivendo = bersaglio && (bersaglio.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(bersaglio.tagName));
      if (evento.key === "/" && !scrivendo && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
        evento.preventDefault();
        ricerca.focus();
      } else if (evento.key === "Escape" && bersaglio === ricerca && ricerca.value) {
        ricerca.value = "";
        ricerca.dispatchEvent(new Event("input"));
      }
    });
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
