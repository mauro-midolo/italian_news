/* ===========================================================================
   Il Quotidiano — editor delle richieste (details.info).

   Legge il file dall'API del Worker, lo mostra come schede modificabili e lo
   risalva con lo stesso formato: intestazione di commento invariata,
   [NOTIZIE] con una sezione "## Titolo" per riquadro separata da "---",
   [INFORMAZIONI] con una voce "- " per avviso (righe successive rientrate di
   due spazi). Eventuali sezioni [ALTRO] successive restano invariate.
   =========================================================================== */

(function (radice) {
  "use strict";

  /* --- Formato di details.info ------------------------------------------- */

  var INTESTAZIONE = /^\[([^\]]+)\]\s*$/;

  function senzaBordiVuoti(righe) {
    var inizio = 0;
    var fine = righe.length;
    while (inizio < fine && righe[inizio].trim() === "") inizio++;
    while (fine > inizio && righe[fine - 1].trim() === "") fine--;
    return righe.slice(inizio, fine);
  }

  /* Corpo di una sezione di [NOTIZIE]: via le righe vuote e i separatori
     "---" in coda, che il formato aggiunge da solo fra una sezione e l'altra. */
  function corpoSezione(righe) {
    var r = senzaBordiVuoti(righe);
    while (r.length && /^-{3,}\s*$/.test(r[r.length - 1])) {
      r = senzaBordiVuoti(r.slice(0, -1));
    }
    return r.join("\n").replace(/[ \t]+$/gm, "");
  }

  function analizza(testo) {
    var righe = testo.replace(/\r\n?/g, "\n").split("\n");
    var iNotizie = -1;
    var iInfo = -1;
    var iCoda = righe.length;

    righe.forEach(function (riga, i) {
      var m = INTESTAZIONE.exec(riga);
      if (!m) return;
      var nome = m[1].trim().toUpperCase();
      if (nome === "NOTIZIE" && iNotizie < 0) iNotizie = i;
      else if (nome === "INFORMAZIONI" && iInfo < 0) iInfo = i;
      else if (iInfo >= 0 && i > iInfo && iCoda === righe.length) iCoda = i;
    });
    if (iNotizie < 0 || iInfo < 0 || iInfo < iNotizie) {
      throw new Error("details.info non contiene le sezioni [NOTIZIE] e [INFORMAZIONI] nell'ordine atteso.");
    }

    var modello = {
      preambolo: righe.slice(0, iNotizie),
      introNotizie: [],
      notizie: [],
      introInformazioni: [],
      informazioni: [],
      coda: righe.slice(iCoda)
    };

    var corrente = null;
    righe.slice(iNotizie + 1, iInfo).forEach(function (riga) {
      var m = /^##[ \t]+(.*)$/.exec(riga);
      if (m) {
        corrente = { titolo: m[1].trim(), righe: [] };
        modello.notizie.push(corrente);
      } else if (corrente) {
        corrente.righe.push(riga);
      } else {
        modello.introNotizie.push(riga);
      }
    });
    modello.notizie = modello.notizie.map(function (s) {
      return { titolo: s.titolo, testo: corpoSezione(s.righe) };
    });
    modello.introNotizie = senzaBordiVuoti(modello.introNotizie);
    while (modello.introNotizie.length && /^-{3,}\s*$/.test(modello.introNotizie[modello.introNotizie.length - 1])) {
      modello.introNotizie = senzaBordiVuoti(modello.introNotizie.slice(0, -1));
    }

    var voce = null;
    righe.slice(iInfo + 1, iCoda).forEach(function (riga) {
      if (/^-(\s|$)/.test(riga)) {
        voce = [riga.replace(/^-\s?/, "")];
        modello.informazioni.push(voce);
      } else if (voce) {
        voce.push(riga.trim() === "" ? "" : riga.replace(/^ {1,2}|^\t/, ""));
      } else {
        modello.introInformazioni.push(riga);
      }
    });
    modello.informazioni = modello.informazioni.map(function (r) {
      return senzaBordiVuoti(r).join("\n").replace(/[ \t]+$/gm, "");
    });
    modello.introInformazioni = senzaBordiVuoti(modello.introInformazioni);
    return modello;
  }

  function componi(modello) {
    var out = modello.preambolo.slice();
    out.push("[NOTIZIE]", "");
    if (modello.introNotizie.length) out.push.apply(out, modello.introNotizie.concat([""]));

    modello.notizie.forEach(function (s, i) {
      if (i > 0) out.push("---", "");
      out.push("## " + s.titolo.replace(/\s+/g, " ").trim(), "");
      var testo = s.testo.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
      if (testo) out.push.apply(out, testo.split("\n").concat([""]));
    });

    out.push("", "[INFORMAZIONI]", "");
    if (modello.introInformazioni.length) out.push.apply(out, modello.introInformazioni.concat([""]));

    modello.informazioni.forEach(function (testo) {
      var righe = senzaBordiVuoti(testo.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").split("\n"));
      righe.forEach(function (riga, j) {
        if (j === 0) out.push("- " + riga.trim());
        else out.push(riga === "" ? "" : "  " + riga);
      });
    });

    if (modello.coda.length) out.push("", "");
    out.push.apply(out, senzaBordiVuoti(modello.coda));
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n") + "\n";
  }

  var formato = { analizza: analizza, componi: componi };

  /* Per i test fuori dal browser. */
  if (typeof module === "object" && module.exports) {
    module.exports = formato;
  }
  if (typeof document === "undefined") return;

  /* --- Tema (lo stesso scelto sul giornale) ------------------------------ */

  try {
    var tema = localStorage.getItem("quotidiano:tema");
    if (tema === "chiaro" || tema === "scuro") document.documentElement.setAttribute("data-tema", tema);
  } catch (e) { /* storage non disponibile */ }

  /* --- Editor ------------------------------------------------------------- */

  var API = "api/details";
  var CHIAVE_BOZZA = "quotidiano:bozza-richieste";

  var $ = function (sel) { return document.querySelector(sel); };
  var listaNotizie = $("[data-lista='notizie']");
  var listaInfo = $("[data-lista='informazioni']");
  var modelloNotizia = $("#modello-notizia");
  var modelloInfo = $("#modello-informazione");
  var barra = $("[data-ruolo='barra']");
  var stato = $("[data-ruolo='stato']");
  var bottoneSalva = $("[data-azione='salva']");
  var bottoneAnnulla = $("[data-azione='annulla']");
  var boxErrore = $("[data-ruolo='errore']");

  var base = null;      /* modello come sta su GitHub */
  var testoBase = "";   /* base ricomposta: termine di paragone per "modificato" */
  var sha = "";
  var salvando = false;

  function mostraErrore(messaggio) {
    boxErrore.textContent = messaggio;
    boxErrore.hidden = !messaggio;
  }

  function scriviStato(testo, tipo) {
    stato.textContent = testo;
    barra.setAttribute("data-stato", tipo || "");
  }

  function adattaAltezza(area) {
    area.style.height = "auto";
    area.style.height = area.scrollHeight + 2 + "px";
    if (area.matches(".scheda__titolo")) return;
    var scheda = area.closest(".scheda");
    var lungo = area.scrollHeight > 130;
    var espandi = scheda.querySelector("[data-azione='espandi']");
    espandi.hidden = !lungo || document.activeElement === area;
    if (!lungo) scheda.removeAttribute("data-chiusa");
    espandi.textContent = scheda.hasAttribute("data-chiusa") ? "Mostra tutto" : "Riduci";
    espandi.setAttribute("aria-expanded", scheda.hasAttribute("data-chiusa") ? "false" : "true");
  }

  function creaScheda(tipo, dati, nuova) {
    var frammento = (tipo === "notizia" ? modelloNotizia : modelloInfo).content.cloneNode(true);
    var scheda = frammento.querySelector(".scheda");
    var titolo = scheda.querySelector("[data-campo='titolo']");
    var testo = scheda.querySelector("[data-campo='testo']");
    if (titolo) titolo.value = dati.titolo || "";
    testo.value = dati.testo || "";
    if (!nuova) scheda.setAttribute("data-chiusa", "");
    else scheda.setAttribute("data-nuova", "");
    return scheda;
  }

  function popola(modello) {
    listaNotizie.textContent = "";
    listaInfo.textContent = "";
    modello.notizie.forEach(function (s) { listaNotizie.appendChild(creaScheda("notizia", s)); });
    modello.informazioni.forEach(function (t) { listaInfo.appendChild(creaScheda("info", { testo: t })); });
    aggiornaTutto();
  }

  function modelloCorrente() {
    var notizie = [];
    listaNotizie.querySelectorAll(".scheda").forEach(function (scheda) {
      var titolo = scheda.querySelector("[data-campo='titolo']").value.trim();
      var testo = scheda.querySelector("[data-campo='testo']").value;
      if (titolo || testo.trim()) notizie.push({ titolo: titolo, testo: testo });
    });
    var informazioni = [];
    listaInfo.querySelectorAll(".scheda").forEach(function (scheda) {
      var testo = scheda.querySelector("[data-campo='testo']").value;
      if (testo.trim()) informazioni.push(testo);
    });
    return {
      preambolo: base.preambolo,
      introNotizie: base.introNotizie,
      notizie: notizie,
      introInformazioni: base.introInformazioni,
      informazioni: informazioni,
      coda: base.coda
    };
  }

  function aggiornaComandi(lista) {
    var schede = lista.querySelectorAll(".scheda");
    schede.forEach(function (scheda, i) {
      scheda.querySelector("[data-azione='su']").disabled = i === 0;
      scheda.querySelector("[data-azione='giu']").disabled = i === schede.length - 1;
    });
  }

  function modificato() {
    return base && componi(modelloCorrente()) !== testoBase;
  }

  function aggiornaStato() {
    if (salvando) return;
    var sporco = modificato();
    bottoneSalva.disabled = !sporco;
    bottoneAnnulla.disabled = !sporco;
    if (sporco) {
      scriviStato("Modifiche non salvate", "sporco");
      try {
        localStorage.setItem(CHIAVE_BOZZA, JSON.stringify({ sha: sha, contenuto: componi(modelloCorrente()) }));
      } catch (e) { /* niente bozza */ }
    } else if (barra.getAttribute("data-stato") === "sporco") {
      scriviStato("Nessuna modifica", "");
      cancellaBozza();
    }
  }

  function aggiornaTutto() {
    aggiornaComandi(listaNotizie);
    aggiornaComandi(listaInfo);
    document.querySelectorAll(".scheda textarea").forEach(adattaAltezza);
    aggiornaStato();
  }

  function cancellaBozza() {
    try { localStorage.removeItem(CHIAVE_BOZZA); } catch (e) { /* niente */ }
  }

  /* --- Eventi ------------------------------------------------------------- */

  document.addEventListener("input", function (e) {
    if (e.target.matches("[data-campo='titolo']")) {
      /* Il titolo e' una riga sola: niente a capo, nemmeno incollati. */
      if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/\s*[\r\n]+\s*/g, " ");
      e.target.closest(".scheda").removeAttribute("data-errore");
    }
    if (e.target.matches(".scheda textarea")) adattaAltezza(e.target);
    aggiornaStato();
  });

  document.addEventListener("focusin", function (e) {
    if (!e.target.matches(".scheda__testo")) return;
    e.target.closest(".scheda").removeAttribute("data-chiusa");
    adattaAltezza(e.target);
  });

  document.addEventListener("focusout", function (e) {
    if (e.target.matches(".scheda__testo")) setTimeout(function () { adattaAltezza(e.target); }, 0);
  });

  document.addEventListener("click", function (e) {
    var bottone = e.target.closest("button[data-azione]");
    if (!bottone) return;
    var azione = bottone.getAttribute("data-azione");
    var scheda = bottone.closest(".scheda");

    if (azione === "aggiungi-notizia" || azione === "aggiungi-informazione") {
      var lista = azione === "aggiungi-notizia" ? listaNotizie : listaInfo;
      var nuova = creaScheda(azione === "aggiungi-notizia" ? "notizia" : "info", {}, true);
      lista.appendChild(nuova);
      aggiornaTutto();
      nuova.scrollIntoView({ behavior: "smooth", block: "center" });
      (nuova.querySelector("[data-campo='titolo']") || nuova.querySelector("[data-campo='testo']")).focus({ preventScroll: true });
    } else if (azione === "su" && scheda && scheda.previousElementSibling) {
      scheda.parentNode.insertBefore(scheda, scheda.previousElementSibling);
      aggiornaTutto();
      bottone.disabled ? scheda.querySelector("[data-azione='giu']").focus() : bottone.focus();
    } else if (azione === "giu" && scheda && scheda.nextElementSibling) {
      scheda.parentNode.insertBefore(scheda.nextElementSibling, scheda);
      aggiornaTutto();
      bottone.disabled ? scheda.querySelector("[data-azione='su']").focus() : bottone.focus();
    } else if (azione === "elimina" && scheda) {
      var campoTitolo = scheda.querySelector("[data-campo='titolo']");
      var campoTesto = scheda.querySelector("[data-campo='testo']");
      var nome = campoTitolo ? campoTitolo.value.trim() : campoTesto.value.trim().split("\n")[0];
      var vuota = !nome && !campoTesto.value.trim();
      if (vuota || window.confirm("Eliminare " + (campoTitolo ? "la sezione" : "l'avviso") + (nome ? " “" + nome.slice(0, 80) + "”" : "") + "?")) {
        scheda.remove();
        aggiornaTutto();
      }
    } else if (azione === "espandi" && scheda) {
      if (scheda.hasAttribute("data-chiusa")) scheda.removeAttribute("data-chiusa");
      else scheda.setAttribute("data-chiusa", "");
      adattaAltezza(scheda.querySelector("[data-campo='testo']"));
    } else if (azione === "annulla") {
      if (window.confirm("Annullare tutte le modifiche non salvate?")) {
        popola(base);
        cancellaBozza();
        scriviStato("Modifiche annullate", "");
        aggiornaStato();
      }
    } else if (azione === "salva") {
      salva();
    }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && e.target.matches("[data-campo='titolo']")) {
      e.preventDefault();
      e.target.closest(".scheda").querySelector("[data-campo='testo']").focus();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (!bottoneSalva.disabled) salva();
    }
  });

  window.addEventListener("resize", function () {
    document.querySelectorAll(".scheda textarea").forEach(adattaAltezza);
  });

  window.addEventListener("beforeunload", function (e) {
    if (modificato()) {
      e.preventDefault();
      e.returnValue = "";
    }
  });

  /* --- Rete --------------------------------------------------------------- */

  function chiama(metodo, corpo) {
    return fetch(API, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : {},
      body: corpo ? JSON.stringify(corpo) : undefined,
      cache: "no-store",
      credentials: "same-origin"
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (dati) {
        if (!r.ok) throw new Error(dati.errore || "Errore del server (HTTP " + r.status + ").");
        return dati;
      });
    }, function () {
      throw new Error("Il server non risponde: forse la sessione di accesso e' scaduta. Ricarica la pagina (la bozza resta salvata in questo browser).");
    });
  }

  function salva() {
    var mancanti = [];
    listaNotizie.querySelectorAll(".scheda").forEach(function (scheda) {
      var titolo = scheda.querySelector("[data-campo='titolo']").value.trim();
      var testo = scheda.querySelector("[data-campo='testo']").value.trim();
      if (!titolo && testo) { scheda.setAttribute("data-errore", ""); mancanti.push(scheda); }
    });
    if (mancanti.length) {
      scriviStato("Ogni sezione ha bisogno di un titolo", "errore");
      mancanti[0].querySelector("[data-campo='titolo']").focus();
      return;
    }

    var contenuto = componi(modelloCorrente());
    salvando = true;
    bottoneSalva.disabled = true;
    bottoneAnnulla.disabled = true;
    scriviStato("Salvataggio in corso…", "");

    chiama("PUT", { contenuto: contenuto, sha: sha }).then(function (dati) {
      sha = dati.sha || sha;
      base = analizza(contenuto);
      testoBase = componi(base);
      salvando = false;
      cancellaBozza();
      popola(base);
      var ora = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
      scriviStato("Salvato alle " + ora + ": vale dall'edizione di domattina", "ok");
    }, function (errore) {
      salvando = false;
      scriviStato(errore.message, "errore");
      bottoneSalva.disabled = false;
      bottoneAnnulla.disabled = false;
    });
  }

  function avvia() {
    chiama("GET").then(function (dati) {
      base = analizza(dati.contenuto);
      testoBase = componi(base);
      sha = dati.sha;

      var modelloIniziale = base;
      var bozzaRipristinata = false;
      try {
        var bozza = JSON.parse(localStorage.getItem(CHIAVE_BOZZA) || "null");
        if (bozza && bozza.sha === sha && bozza.contenuto !== testoBase) {
          modelloIniziale = analizza(bozza.contenuto);
          bozzaRipristinata = true;
        } else if (bozza) {
          cancellaBozza();
        }
      } catch (e) { /* bozza illeggibile: si ignora */ }

      $("[data-ruolo='caricamento']").hidden = true;
      document.querySelectorAll("[data-blocco]").forEach(function (b) { b.hidden = false; });
      barra.hidden = false;
      popola(modelloIniziale);
      if (bozzaRipristinata) scriviStato("Ripristinate le modifiche non salvate dell'ultima volta", "sporco");
    }, function (errore) {
      $("[data-ruolo='caricamento']").hidden = true;
      mostraErrore(errore.message);
    });
  }

  avvia();
})(this);
