// ===========================================================================
// Il Quotidiano — Worker di Cloudflare.
//
// Il giornale e' un sito statico (public/, servito dagli asset del Worker).
// Questo codice gestisce solo l'API dell'editor delle richieste:
//
//   GET  /modifica/api/details   legge details.info da GitHub
//   PUT  /modifica/api/details   lo riscrive con un commit su GitHub
//
// Tutte le altre richieste vanno agli asset statici.
//
// Sicurezza: la pagina /modifica e l'API vanno protette con Cloudflare
// Access. L'API verifica comunque il token di Access (firma, audience,
// scadenza) e, se manca la configurazione o il token non e' valido, rifiuta:
// senza Access configurato l'editor non funziona, non resta aperto.
//
// Configurazione (Worker > Settings > Variables and Secrets, tipo "Secret"):
//   GITHUB_TOKEN        token GitHub fine-grained, solo questo repository,
//                       permesso "Contents: Read and write"
//   ACCESS_TEAM_DOMAIN  es. nometeam.cloudflareaccess.com
//   ACCESS_AUD          "Application Audience (AUD) Tag" dell'app di Access
// In wrangler.jsonc (vars): GITHUB_REPO, GITHUB_BRANCH, DETAILS_PATH.
// ===========================================================================

const PERCORSO_API = "/modifica/api/details";
const DIMENSIONE_MASSIMA = 200 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === PERCORSO_API) {
      try {
        return await gestisciApi(request, env, url);
      } catch (errore) {
        console.error(errore);
        return risposta(500, { errore: "Errore interno del server." });
      }
    }
    return env.ASSETS.fetch(request);
  },
};

async function gestisciApi(request, env, url) {
  if (!env.GITHUB_TOKEN || !env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return risposta(503, {
      errore: "Editor non configurato: mancano GITHUB_TOKEN, ACCESS_TEAM_DOMAIN o ACCESS_AUD.",
    });
  }

  const utente = await verificaAccesso(request, env);
  if (!utente) {
    return risposta(401, {
      errore: "Accesso non autorizzato: apri la pagina dal dominio protetto da Cloudflare Access.",
    });
  }

  if (request.method === "GET") return leggi(env);

  if (request.method === "PUT") {
    // Difesa da richieste incrociate: stessa origine e corpo JSON.
    const origine = request.headers.get("Origin");
    if (origine && origine !== url.origin) {
      return risposta(403, { errore: "Origine non consentita." });
    }
    if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
      return risposta(415, { errore: "Il corpo deve essere JSON." });
    }
    return scrivi(request, env, utente);
  }

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

async function scrivi(request, env, utente) {
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
  console.log(`details.info aggiornato da ${utente}`);
  return risposta(200, { sha: dati.content && dati.content.sha, commit: dati.commit && dati.commit.sha });
}

// --- Cloudflare Access ---------------------------------------------------------

let certificati = { dominio: "", chiavi: null, scadenza: 0 };

function dominioTeam(env) {
  return String(env.ACCESS_TEAM_DOMAIN).replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function chiaviAccess(dominio, forza) {
  if (!forza && certificati.dominio === dominio && certificati.chiavi && Date.now() < certificati.scadenza) {
    return certificati.chiavi;
  }
  const r = await fetch(`https://${dominio}/cdn-cgi/access/certs`);
  if (!r.ok) throw new Error(`Certificati di Access non disponibili (HTTP ${r.status})`);
  const dati = await r.json();
  certificati = { dominio, chiavi: dati.keys || [], scadenza: Date.now() + 60 * 60 * 1000 };
  return certificati.chiavi;
}

// Restituisce l'email (o l'identificativo) dell'utente se il token di Access
// e' valido, altrimenti null.
async function verificaAccesso(request, env) {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return null;
  const parti = token.split(".");
  if (parti.length !== 3) return null;

  let testata, dati;
  try {
    testata = JSON.parse(base64UrlInTesto(parti[0]));
    dati = JSON.parse(base64UrlInTesto(parti[1]));
  } catch {
    return null;
  }
  if (testata.alg !== "RS256" || !testata.kid) return null;

  const dominio = dominioTeam(env);
  let chiavi = await chiaviAccess(dominio, false);
  let jwk = chiavi.find((k) => k.kid === testata.kid);
  if (!jwk) {
    // Le chiavi di Access ruotano: riprova una volta con quelle aggiornate.
    chiavi = await chiaviAccess(dominio, true);
    jwk = chiavi.find((k) => k.kid === testata.kid);
  }
  if (!jwk) return null;

  const chiave = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valida = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    chiave,
    base64UrlInByte(parti[2]),
    new TextEncoder().encode(`${parti[0]}.${parti[1]}`),
  );
  if (!valida) return null;

  const adesso = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(dati.aud) ? dati.aud : [dati.aud];
  if (!audience.includes(env.ACCESS_AUD)) return null;
  if (typeof dati.exp !== "number" || dati.exp < adesso) return null;
  if (typeof dati.nbf === "number" && dati.nbf > adesso + 60) return null;
  if (dati.iss !== `https://${dominio}`) return null;

  return dati.email || dati.sub || "utente";
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

function base64UrlInByte(s) {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return base64InByte(b64);
}

function base64UrlInTesto(s) {
  return new TextDecoder().decode(base64UrlInByte(s));
}
