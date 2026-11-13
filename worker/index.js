// ===========================================================================
// Il Quotidiano — Worker di Cloudflare.
//
// Il giornale e' un sito statico (public/, servito dagli asset del Worker).
// Questo codice gestisce solo l'API dell'editor delle richieste:
//
//   POST   /modifica/api/accesso   verifica la password, apre la sessione
//   DELETE /modifica/api/accesso   chiude la sessione
//   GET    /modifica/api/details   legge details.info da GitHub
//   PUT    /modifica/api/details   lo riscrive con un commit su GitHub
//
// Tutte le altre richieste vanno agli asset statici.
//
// Sicurezza: l'editor e' protetto da una password. Se e' giusta il Worker
// imposta un cookie di sessione firmato (HMAC, HttpOnly, Secure,
// SameSite=Strict) valido 30 giorni; cambiare la password chiude tutte le
// sessioni aperte. I tentativi sbagliati sono limitati per indirizzo IP.
// Senza configurazione l'editor resta chiuso.
//
// Configurazione (Worker > Settings > Variables and Secrets, tipo "Secret"):
//   GITHUB_TOKEN     token GitHub fine-grained, solo questo repository,
//                    permesso "Contents: Read and write"
//   EDITOR_PASSWORD  la password dell'editor (almeno 12 caratteri)
// In wrangler.jsonc (vars): GITHUB_REPO, GITHUB_BRANCH, DETAILS_PATH.
// ===========================================================================

const PERCORSO_API = "/modifica/api/details";
const PERCORSO_ACCESSO = "/modifica/api/accesso";
const COOKIE = "quotidiano_sessione";
const DURATA_SESSIONE = 30 * 24 * 60 * 60; // secondi
const LUNGHEZZA_MINIMA_PASSWORD = 12;
const DIMENSIONE_MASSIMA = 200 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === PERCORSO_API || url.pathname === PERCORSO_ACCESSO) {
      try {
        if (!env.GITHUB_TOKEN || !env.EDITOR_PASSWORD) {
          return risposta(503, {
            errore: "Editor non configurato: mancano i segreti GITHUB_TOKEN o EDITOR_PASSWORD.",
          });
        }
        if (env.EDITOR_PASSWORD.length < LUNGHEZZA_MINIMA_PASSWORD) {
          return risposta(503, {
            errore: `Editor non configurato: EDITOR_PASSWORD deve avere almeno ${LUNGHEZZA_MINIMA_PASSWORD} caratteri.`,
          });
        }
        if (request.method !== "GET" && !stessaOrigine(request, url)) {
          return risposta(403, { errore: "Origine non consentita." });
        }
        if (url.pathname === PERCORSO_ACCESSO) return await gestisciAccesso(request, env);
        return await gestisciApi(request, env);
      } catch (errore) {
        console.error(errore);
        return risposta(500, { errore: "Errore interno del server." });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

function stessaOrigine(request, url) {
  // Difesa da richieste incrociate, oltre a SameSite=Strict: le scritture
  // devono arrivare dalla stessa origine e con corpo JSON.
  const origine = request.headers.get("Origin");
  if (origine && origine !== url.origin) return false;
  if (request.method === "DELETE") return true;
  return (request.headers.get("Content-Type") || "").includes("application/json");
}

async function gestisciAccesso(request, env) {
  if (request.method === "DELETE") {
    return risposta(200, { ok: true }, { "Set-Cookie": cookieSessione("", 0) });
  }
  if (request.method !== "POST") {
    return risposta(405, { errore: "Metodo non consentito." }, { Allow: "POST, DELETE" });
  }

  if (env.LIMITE_ACCESSI) {
    const ip = request.headers.get("CF-Connecting-IP") || "sconosciuto";
    const { success } = await env.LIMITE_ACCESSI.limit({ key: ip });
    if (!success) {
      return risposta(429, { errore: "Troppi tentativi: riprova fra un minuto." });
    }
  }

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return risposta(400, { errore: "JSON non valido." });
  }
  const password = corpo && typeof corpo.password === "string" ? corpo.password : "";

  if (!(await uguali(password, env.EDITOR_PASSWORD, env))) {
    // Rallenta i tentativi a raffica anche senza limite configurato.
    await new Promise((fatto) => setTimeout(fatto, 1000));
    return risposta(401, { errore: "Password errata." });
  }

  const scadenza = Math.floor(Date.now() / 1000) + DURATA_SESSIONE;
  const valore = `${scadenza}.${await firma(String(scadenza), env)}`;
  return risposta(200, { ok: true }, { "Set-Cookie": cookieSessione(valore, DURATA_SESSIONE) });
}

async function gestisciApi(request, env) {
  if (!(await sessioneValida(request, env))) {
    return risposta(401, { errore: "Serve la password per modificare le richieste.", accesso: true });
  }
  if (request.method === "GET") return leggi(env);
  if (request.method === "PUT") return scrivi(request, env);
  return risposta(405, { errore: "Metodo non consentito." }, { Allow: "GET, PUT" });
}

// --- GitHub ------------------------------------------------------------------

function urlContenuto(env) {
  const repo = env.GITHUB_REPO;
  const percorso = (env.DETAILS_PATH || "details.info").split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${repo}/contents/${percorso}`;
}

function intestazioniGitHub(env) {
  return {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "il-quotidiano-editor",
  };
}

async function leggi(env) {
  const ramo = encodeURIComponent(env.GITHUB_BRANCH || "main");
  const r = await fetch(`${urlContenuto(env)}?ref=${ramo}`, { headers: intestazioniGitHub(env) });
  if (!r.ok) {
    return risposta(502, { errore: `GitHub non ha restituito il file (HTTP ${r.status}).` });
  }
  const dati = await r.json();
  return risposta(200, { contenuto: base64InTesto(dati.content || ""), sha: dati.sha });
}

async function scrivi(request, env) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return risposta(400, { errore: "JSON non valido." });
  }

  const contenuto = corpo && corpo.contenuto;
  const sha = corpo && corpo.sha;
  if (typeof contenuto !== "string" || typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    return risposta(400, { errore: "Servono \"contenuto\" (testo) e \"sha\" (versione letta)." });
  }
  if (new TextEncoder().encode(contenuto).length > DIMENSIONE_MASSIMA) {
    return risposta(413, { errore: "Il file e' troppo grande." });
  }
  // Rete di sicurezza: il file deve restare leggibile dalla generazione.
  if (!/^\[NOTIZIE\]\s*$/m.test(contenuto) || !/^\[INFORMAZIONI\]\s*$/m.test(contenuto)) {
    return risposta(422, { errore: "Il file deve contenere le sezioni [NOTIZIE] e [INFORMAZIONI]." });
  }

  const r = await fetch(urlContenuto(env), {
    method: "PUT",
    headers: { ...intestazioniGitHub(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "Richieste aggiornate dall'editor del giornale",
      content: testoInBase64(contenuto),
      sha,
      branch: env.GITHUB_BRANCH || "main",
    }),
  });

  if (r.status === 409 || r.status === 422) {
    return risposta(409, {
      errore: "Il file e' stato modificato da un'altra parte nel frattempo: ricarica la pagina.",
    });
  }
  if (!r.ok) {
    return risposta(502, { errore: `GitHub ha rifiutato il salvataggio (HTTP ${r.status}).` });
  }
  const dati = await r.json();
  console.log("details.info aggiornato dall'editor");
  return risposta(200, { sha: dati.content && dati.content.sha, commit: dati.commit && dati.commit.sha });
}

// --- Sessione -------------------------------------------------------------------

// Chiave HMAC ricavata dai segreti: cambiare la password (o il token)
// invalida tutte le sessioni.
async function chiaveSessione(env) {
  const materiale = new TextEncoder().encode(`quotidiano-sessione\u0000${env.EDITOR_PASSWORD}\u0000${env.GITHUB_TOKEN}`);
  const impronta = await crypto.subtle.digest("SHA-256", materiale);
  return crypto.subtle.importKey("raw", impronta, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function firma(testo, env) {
  const chiave = await chiaveSessione(env);
  const mac = await crypto.subtle.sign("HMAC", chiave, new TextEncoder().encode(testo));
  return byteInBase64(new Uint8Array(mac)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Confronto a tempo costante: si confrontano le firme, non i testi.
async function uguali(a, b, env) {
  const [fa, fb] = await Promise.all([firma(`confronto:${a}`, env), firma(`confronto:${b}`, env)]);
  let diversi = fa.length ^ fb.length;
  for (let i = 0; i < Math.min(fa.length, fb.length); i++) diversi |= fa.charCodeAt(i) ^ fb.charCodeAt(i);
  return diversi === 0;
}

async function sessioneValida(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [scadenza, mac] = m[1].split(".");
  if (!/^\d+$/.test(scadenza || "") || !mac) return false;
  if (Number(scadenza) < Math.floor(Date.now() / 1000)) return false;
  return uguali(mac, await firma(scadenza, env), env);
}

function cookieSessione(valore, durata) {
  return `${COOKIE}=${valore}; Max-Age=${durata}; Path=/modifica; HttpOnly; Secure; SameSite=Strict`;
}

// --- Utilita' ------------------------------------------------------------------

function risposta(stato, corpo, extra) {
  return new Response(JSON.stringify(corpo), {
    status: stato,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...(extra || {}),
    },
  });
}

function byteInBase64(byte) {
  let binario = "";
  for (let i = 0; i < byte.length; i += 0x8000) {
    binario += String.fromCharCode.apply(null, byte.subarray(i, i + 0x8000));
  }
  return btoa(binario);
}

function base64InByte(b64) {
  const binario = atob(b64.replace(/\s+/g, ""));
  const byte = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i);
  return byte;
}

function testoInBase64(testo) {
  return byteInBase64(new TextEncoder().encode(testo));
}

function base64InTesto(b64) {
  return new TextDecoder().decode(base64InByte(b64));
}

