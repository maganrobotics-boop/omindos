const VISITS_ENDPOINT = "/api/visits";
const LANGUAGE_COOKIE = "originmind_language";
const PRIVACY_VERSION = "2026-09-09";
const MINUTE_IN_MS = 60 * 1000;
const RECENT_RETENTION_MINUTES = 2 * 24 * 60;
const ROBOT_BROCHURE_PATH = /^\/assets\/brochures\/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_(EN|ZH)\.pdf$/;
const VERSIONED_PUBLIC_ASSET = /\.(?:css|js|png|jpe?g|svg|webp|ico)$/u;
const STABLE_PUBLIC_ASSET = /\.(?:woff2?|png|jpe?g|svg|webp|ico|mp4)$/u;

const LANGUAGE_SITES = {
  en: { home: "/index.en", oem: "/oem/en/", why: "/why/en/", robots: "/robots/en/", notFound: "/en/404", contentLanguage: "en" },
  zh: { home: "/index.zh", oem: "/oem/zh/", why: "/why/zh/", robots: "/robots/zh/", notFound: "/404.zh", contentLanguage: "zh-CN" },
};

const CANONICAL_HOSTS = {
  "originmindos.com": "omindos.ai",
  "www.originmindos.com": "omindos.ai",
  "www.omindos.ai": "omindos.ai",
  "jp.originmindos.com": "omindos.ai",
};

const LANGUAGE_REDIRECT_HOSTS = {
  "originmindos.cn": "zh",
  "www.originmindos.cn": "zh",
};

const LEGACY_HOME_PATH = /^\/index(?:\.(?:en|zh|ar|de))?(?:\.html)?\/?$/;
const LOCALE_RESOURCE_PATH = /^\/index\.(en|zh)\.html$/;
const LEGACY_OEM_PATH = /^\/founding-oem(?:\.(en|zh|ja|ar|de))?(?:\.html)?\/?$/;
const INTERNAL_OEM_PATH = /^\/oem\/(en|zh)(?:\/index(?:\.html)?)?\/?$/;
const INTERNAL_WHY_PATH = /^\/why\/(en|zh)(?:\/index(?:\.html)?)?\/?$/;
const INTERNAL_ROBOT_PATH = /^\/robots\/(en|zh)(?:\/index(?:\.html)?)?\/?$/;
const NOT_FOUND_PATH = /^\/404(?:\.(en|zh))?(?:\.html)?\/?$/;
const REMOVED_JAPANESE_HOME_PATH = /^\/(?:ja\/?|index\.ja(?:\.html)?\/?)$/u;
const REMOVED_JAPANESE_CONTENT_PATH = /^\/(?:founding-oem\.ja(?:\.html|\.js)?\/?|(?:oem|why|robots)\/ja(?:\/index(?:\.html)?)?\/?|404\.ja(?:\.html)?\/?|assets\/brochures\/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_JA\.pdf)$/u;
const RETIRED_PUBLIC_ASSETS = new Set([
  "/assets/unitree-originmind-hardware.jpg",
  "/assets/dual-arm-digital-twin-demo-poster.jpg",
  "/assets/dual-arm-service-demo-poster.jpg",
  "/assets/videos/dual-arm-digital-twin-demo.mp4",
  "/assets/videos/dual-arm-service-demo.mp4",
]);

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Content-Type": "application/json; charset=utf-8",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function errorResponse(error, status = 500, code = "internal_error") {
  return jsonResponse({ error, code }, status);
}

function methodNotAllowed(methods) {
  return jsonResponse({ error: "Method not allowed", code: "method_not_allowed" }, 405, { Allow: methods.join(", ") });
}

function logError(message, error, extra = {}) {
  console.error(JSON.stringify({
    level: "error",
    message,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  }));
}

function visitorCountry(request) {
  const country = request.cf?.country?.toUpperCase();
  return typeof country === "string" && /^[A-Z]{2}$/.test(country) ? country : "ZZ";
}

// The English panel has its own anonymous identity. Never borrow a domestic,
// OA, registered-account, or browser-supplied Authorization credential.
const ENGLISH_CHAT_PATH = "/api/english-chat";
const ENGLISH_CHAT_SESSION_PATH = "/api/english-chat/session";
const ENGLISH_GUEST_COOKIE = "__Host-omindos-english-guest";
const DOMESTIC_ACCOUNT_COOKIE = "__Host-omindos-account";
const ENGLISH_CHAT_UPSTREAM = "https://omindos.cn/learning/api/";
const ENGLISH_GUEST_TOKEN = /^[a-f0-9]{64}$/;
const ENGLISH_GUEST_ID = /^[A-Za-z0-9_-]{16,128}$/;

class EnglishChatError extends Error {
  constructor(status, code, clearCookie = false, retryAfter = null) {
    super(code);
    this.status = status;
    this.code = code;
    this.clearCookie = clearCookie;
    this.retryAfter = retryAfter;
  }
}

function englishChatHostAllowed(url) {
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && (["omindos.ai", "www.omindos.ai", "localhost", "127.0.0.1"].includes(host) || host.endsWith(".pages.dev"));
}

function englishGuestCookie(value, clear = false) {
  return `${ENGLISH_GUEST_COOKIE}=${clear ? "" : value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 31536000}`;
}

function readEnglishGuestCookie(request) {
  const values = (request.headers.get("Cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(ENGLISH_GUEST_COOKIE + "=")).map(part => part.slice(ENGLISH_GUEST_COOKIE.length + 1));
  if (values.length > 1 || (values.length === 1 && !ENGLISH_GUEST_TOKEN.test(values[0]))) throw new EnglishChatError(403, "invalid_guest", true);
  return values[0] || null;
}

function issuedDomesticGuestCookie(headers) {
  // getSetCookie is available in current runtimes; the fallback also handles a
  // combined Set-Cookie field without treating an Expires comma as a cookie.
  const fields = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("Set-Cookie") || ""];
  const values = fields.flatMap(field => [...field.matchAll(/(?:^|,\s*)__Host-omindos-account=([^;,]*)/g)].map(match => match[1]));
  if (values.length > 1 || (values.length === 1 && !ENGLISH_GUEST_TOKEN.test(values[0]))) throw new EnglishChatError(502, "invalid_upstream");
  return values[0] || null;
}

async function readEnglishChatJson(message, maximum, invalidStatus, signal) {
  const declaredLength = message.headers.get("Content-Length");
  if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > maximum)) throw new EnglishChatError(invalidStatus === 400 ? 413 : invalidStatus, "body_too_large");
  if ((message.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() !== "application/json") throw new EnglishChatError(invalidStatus === 400 ? 415 : invalidStatus, "invalid_format");
  const reader = message.body?.getReader();
  if (!reader) throw new EnglishChatError(invalidStatus, "invalid_json");
  const chunks = [];
  let length = 0;
  const cancel = () => { reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new EnglishChatError(504, "upstream_timeout");
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel();
        throw new EnglishChatError(invalidStatus === 400 ? 413 : invalidStatus, "body_too_large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let data;
    try { data = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new EnglishChatError(invalidStatus, "invalid_json"); }
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new EnglishChatError(invalidStatus, "invalid_json");
    return data;
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

function englishChatUpstreamError(response) {
  const status = [400, 401, 403, 409, 413, 429].includes(response.status) ? response.status : 502;
  const retry = response.headers.get("Retry-After") || "";
  return new EnglishChatError(status, status === 429 ? "rate_limited" : "upstream_unavailable", status === 401 || status === 403, /^\d{1,5}$/.test(retry) ? retry : null);
}

function englishChatPayload(data) {
  if (Object.keys(data).some(key => !["topic", "messages", "conversationToken"].includes(key)) || data.topic !== "research" || !Array.isArray(data.messages) || data.messages.length !== 1) throw new EnglishChatError(400, "invalid_question");
  const message = data.messages[0];
  // The local UI prepends a short English-language instruction to a question
  // of at most 4,000 characters. Never accept caller-provided system messages.
  if (!message || typeof message !== "object" || Array.isArray(message) || Object.keys(message).some(key => !["role", "content"].includes(key)) || message.role !== "user" || typeof message.content !== "string" || !message.content.trim() || message.content.length > 4400 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(message.content)) throw new EnglishChatError(400, "invalid_question");
  const payload = { topic: "research", messages: [{ role: "user", content: message.content }] };
  if (data.conversationToken !== undefined) {
    if (typeof data.conversationToken !== "string" || !data.conversationToken || data.conversationToken.length > 40000 || /[\u0000-\u0020\u007f]/u.test(data.conversationToken)) throw new EnglishChatError(400, "invalid_conversation");
    payload.conversationToken = data.conversationToken;
  }
  return payload;
}

function englishChatPublicAnswer(data) {
  if (typeof data.answer !== "string" || !data.answer.trim() || data.answer.length > 64000) throw new EnglishChatError(502, "invalid_upstream");
  const answer = { answer: data.answer };
  if (data.conversationToken !== undefined) {
    if (typeof data.conversationToken !== "string" || data.conversationToken.length > 40000 || /[\u0000-\u0020\u007f]/u.test(data.conversationToken)) throw new EnglishChatError(502, "invalid_upstream");
    answer.conversationToken = data.conversationToken;
  }
  if (Array.isArray(data.sources)) {
    const seen = new Set();
    answer.sources = data.sources.slice(0, 20).flatMap(source => {
      if (!source || typeof source !== "object" || typeof source.url !== "string" || source.url.length > 2048 || typeof source.title !== "string" || source.title.length > 300) return [];
      let url;
      try { url = new URL(source.url); } catch { return []; }
      if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ url: url.href, title: source.title }];
    });
  }
  return answer;
}

// fetch and a short deadline may be injected by unit tests only. Production
// always calls this handler with the fixed upstream and the default deadline.
export async function handleEnglishChatRequest(request, { fetch: upstreamFetch = (...args) => globalThis.fetch(...args), timeoutMs = 55000 } = {}) {
  const url = new URL(request.url);
  if (![ENGLISH_CHAT_PATH, ENGLISH_CHAT_SESSION_PATH].includes(url.pathname)) return errorResponse("Not found", 404, "not_found");
  if (!englishChatHostAllowed(url) || url.search || request.headers.get("Sec-Fetch-Site") !== "same-origin" || (request.headers.has("Origin") && request.headers.get("Origin") !== url.origin)) return errorResponse("Forbidden", 403, "forbidden");
  const sessionOnly = url.pathname === ENGLISH_CHAT_SESSION_PATH;
  if (request.method !== (sessionOnly ? "GET" : "POST")) return methodNotAllowed([sessionOnly ? "GET" : "POST"]);
  if (!sessionOnly && request.headers.get("Origin") !== url.origin) return errorResponse("Forbidden", 403, "forbidden");
  const controller = new AbortController();
  let timeout;
  let responseCookie = null;
  const disconnect = () => controller.abort();
  request.signal.addEventListener("abort", disconnect, { once: true });
  try {
    const operation = async () => {
      if (request.signal.aborted) throw new EnglishChatError(504, "upstream_timeout");
      const token = readEnglishGuestCookie(request);
      const expected = sessionOnly ? null : request.headers.get("X-OmindOS-Expected-Account");
      if (!sessionOnly && !ENGLISH_GUEST_ID.test(expected || "")) throw new EnglishChatError(409, "guest_changed");
      const payload = sessionOnly ? null : englishChatPayload(await readEnglishChatJson(request, 65536, 400, controller.signal));
      const headers = new Headers({ Accept: "application/json" });
      if (token) headers.set("Cookie", `${DOMESTIC_ACCOUNT_COOKIE}=${token}`);
      let sessionResponse;
      try {
        sessionResponse = await upstreamFetch(ENGLISH_CHAT_UPSTREAM + "account/session", { method: "GET", headers, redirect: "manual", signal: controller.signal });
      } catch (error) {
        throw new EnglishChatError(502, /illegal invocation/i.test(error?.message || '') ? 'upstream_runtime' : 'upstream_connection');
      }
      if (!sessionResponse.ok) throw englishChatUpstreamError(sessionResponse);
      const data = await readEnglishChatJson(sessionResponse, 16384, 502, controller.signal);
      if (data.account?.kind !== "guest") throw new EnglishChatError(403, "guest_required", true);
      if (typeof data.account.id !== "string" || !ENGLISH_GUEST_ID.test(data.account.id)) throw new EnglishChatError(502, "invalid_upstream");
      const issued = issuedDomesticGuestCookie(sessionResponse.headers);
      const guestToken = issued || token;
      if (!guestToken) throw new EnglishChatError(502, "invalid_upstream");
      if (issued) responseCookie = englishGuestCookie(issued);
      if (sessionOnly) return { account: { id: data.account.id, kind: "guest" } };
      if (expected !== data.account.id) throw new EnglishChatError(409, "guest_changed");
      const chatHeaders = new Headers({ Accept: "application/json", "Content-Type": "application/json", Origin: "https://omindos.cn", Cookie: `${DOMESTIC_ACCOUNT_COOKIE}=${guestToken}`, "X-OmindOS-Expected-Account": data.account.id });
      const chatResponse = await upstreamFetch(ENGLISH_CHAT_UPSTREAM + "chat", { method: "POST", headers: chatHeaders, body: JSON.stringify(payload), redirect: "manual", signal: controller.signal });
      if (!chatResponse.ok) throw englishChatUpstreamError(chatResponse);
      return englishChatPublicAnswer(await readEnglishChatJson(chatResponse, 262144, 502, controller.signal));
    };
    const deadline = new Promise((_, reject) => { timeout = setTimeout(() => { controller.abort(); reject(new EnglishChatError(504, "upstream_timeout")); }, timeoutMs); });
    const result = await Promise.race([operation(), deadline]);
    return jsonResponse(result, 200, responseCookie ? { "Set-Cookie": responseCookie } : {});
  } catch (error) {
    const failure = error instanceof EnglishChatError ? error : new EnglishChatError(502, "upstream_unavailable");
    const headers = {};
    if (failure.clearCookie) headers["Set-Cookie"] = englishGuestCookie("", true);
    else if (responseCookie) headers["Set-Cookie"] = responseCookie;
    if (failure.status === 429 && failure.retryAfter) headers["Retry-After"] = failure.retryAfter;
    return jsonResponse({ error: failure.status === 429 ? "Too many requests. Please try again later." : "Chat temporarily unavailable. Please try again.", code: failure.code }, failure.status, headers);
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", disconnect);
  }
}

function isSameOriginBrowserRequest(request, url) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  // A sibling subdomain is not the English website. Contradictory Fetch
  // Metadata must not override Origin, or vice versa. These are provenance
  // checks, not proof that a request came from a human.
  if (origin && origin !== url.origin) return false;
  if (fetchSite && fetchSite !== "same-origin") return false;
  return origin === url.origin || fetchSite === "same-origin";
}

function visitClassification(request) {
  const purpose = `${request.headers.get("Sec-Purpose") || ""} ${request.headers.get("Purpose") || ""}`;
  if (/\b(?:prefetch|prerender)\b/i.test(purpose)) return "excluded_prefetch";
  const management = request.cf?.botManagement;
  if (management?.verifiedBot === true) return "excluded_verified_bot";
  // request.cf is platform-provided. Never trust score-like HTTP headers.
  // A missing/zero score is unknown. Corporate proxies may share low scores
  // with automation, so do not exclude them on score alone.
  const score = management?.score;
  const scored = Number.isInteger(score) && score >= 1 && score <= 99;
  if (scored && score < 30 && management?.corporateProxy !== true) return "excluded_low_score";
  const userAgent = request.headers.get("User-Agent") || "";
  // Specific crawlers and HTTP/automation tools only; do not match generic
  // substrings such as "bot", which can occur in legitimate browser names.
  if (/(?:googlebot|bingbot|baiduspider|yandexbot|duckduckbot|applebot|bytespider|petalbot|sogou[ -](?:web[ -])?spider|gptbot|oai-searchbot|chatgpt-user|claudebot|facebookexternalhit|twitterbot|headlesschrome|phantomjs|playwright|puppeteer|(?:^|[\s;(])(?:curl|wget|python-requests|python-urllib|aiohttp|scrapy|go-http-client|node-fetch|undici|postmanruntime)\/|OMINDOS-Deployment-Check\/)/i.test(userAgent)) return "excluded_automation_ua";
  return scored ? "accepted_scored" : "accepted_unknown";
}

async function digestText(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function handleOemApplication(request, env, url) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (request.headers.get("Origin") !== url.origin) return errorResponse("Forbidden", 403, "forbidden");
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") return errorResponse("JSON required", 415, "invalid_format");
  if (!env.VISITS_DB) return errorResponse("Submission unavailable", 503, "unavailable");
  let data;
  try {
    const reader = request.body?.getReader();
    if (!reader) return errorResponse("Application required", 400, "invalid_application");
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32000) { await reader.cancel(); return errorResponse("Application too large", 413, "too_large"); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return errorResponse("Invalid JSON", 400, "invalid_application"); }
  if (!data || typeof data !== "object" || Array.isArray(data) || data.consent !== true || data.website || !["zh", "en"].includes(data.language) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(data.submissionKey || "")) return errorResponse("Invalid application", 400, "invalid_application");
  const fields = { company: 200, contact: 100, email: 254, phone: 100, robot: 300, stack: 500, start: 100, quantity: 100, capabilities: 3000, test_unit: 200, track: 30, summary: 5000 };
  const optional = new Set(["phone", "quantity", "summary"]);
  const payload = {};
  for (const [key, maximum] of Object.entries(fields)) {
    const value = data[key] === undefined && optional.has(key) ? "" : data[key];
    if (typeof value !== "string" || value.length > maximum || (!optional.has(key) && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return errorResponse("Invalid application field", 400, "invalid_application");
    payload[key] = value.trim();
  }
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/u.test(payload.email) || !["foundation", "advanced"].includes(payload.track)) return errorResponse("Invalid contact or track", 400, "invalid_application");
  payload.consentVersion = PRIVACY_VERSION;
  const payloadJson = JSON.stringify(payload);
  const payloadHash = await digestText(data.language + payloadJson);
  try {
    // Replays return the same receipt only when the entire submitted content matches.
    const existing = await env.VISITS_DB.prepare("SELECT id, payload_hash FROM oem_applications WHERE submission_key = ?").bind(data.submissionKey).first();
    if (existing) return existing.payload_hash === payloadHash ? jsonResponse({ receipt: existing.id }, 200) : errorResponse("Submission changed; use a new key", 409, "submission_changed");
    const now = Date.now();
    const ip = request.headers.get("CF-Connecting-IP") || "local";
    const sourceHash = await digestText(`${Math.floor(now / 86400000)}:${ip}`);
    const id = `OEM-${crypto.randomUUID()}`;
    // D1 serializes this conditional INSERT, including simultaneous submissions.
    await env.VISITS_DB.prepare(`INSERT INTO oem_applications (id, submission_key, payload_hash, language, payload_json, created_at, source_hash)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM oem_applications WHERE source_hash = ? AND created_at > ?) < 10
      ON CONFLICT(submission_key) DO NOTHING`).bind(id, data.submissionKey, payloadHash, data.language, payloadJson, now, sourceHash, sourceHash, now - 3600000).run();
    const saved = await env.VISITS_DB.prepare("SELECT id, payload_hash FROM oem_applications WHERE submission_key = ?").bind(data.submissionKey).first();
    if (!saved) return jsonResponse({ error: "Too many submissions", code: "rate_limited" }, 429, { "Retry-After": "3600" });
    if (saved.payload_hash !== payloadHash) return errorResponse("Submission changed; use a new key", 409, "submission_changed");
    return jsonResponse({ receipt: saved.id }, saved.id === id ? 201 : 200);
  } catch {
    // Never put the submitted contact or business information in public errors/logs.
    return errorResponse("Submission unavailable; retry with the same key", 503, "unavailable");
  }
}

async function recordVisit(database, countryCode, now, classification) {
  const minuteBucket = Math.floor(now / MINUTE_IN_MS);
  // New collection stays separate from the unfiltered legacy visit_* totals.
  // All classifications are aggregate event counts, never visitor identities.
  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO visit_collection_v2 (id, first_event_at, metric) VALUES (1, ?, 'filtered_page_views')`).bind(now),
    database.prepare(`INSERT INTO visit_totals_v2 (classification, visits) VALUES (?, 1) ON CONFLICT(classification) DO UPDATE SET visits = visits + 1`).bind(classification),
    database.prepare(`INSERT INTO visit_recent_v2 (minute_bucket, country_code, classification, visits) VALUES (?, ?, ?, 1) ON CONFLICT(minute_bucket, country_code, classification) DO UPDATE SET visits = visits + 1`).bind(minuteBucket, countryCode, classification),
    database.prepare(`INSERT INTO visit_country_v2 (country_code, classification, visits) VALUES (?, ?, 1) ON CONFLICT(country_code, classification) DO UPDATE SET visits = visits + 1`).bind(countryCode, classification),
    database.prepare("DELETE FROM visit_recent_v2 WHERE minute_bucket < ?").bind(minuteBucket - RECENT_RETENTION_MINUTES),
  ]);
}

function visitAcknowledgement() {
  return new Response(null, { status: 204, headers: {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  } });
}

async function handleVisits(request, env, url) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!isSameOriginBrowserRequest(request, url)) return errorResponse("Forbidden", 403, "forbidden");
  // A Pages preview/alias can share the binding but is not omindos.ai traffic.
  if (url.hostname !== "omindos.ai") return visitAcknowledgement();
  if (!env.VISITS_DB) return jsonResponse({ enabled: false, error: "Visitor statistics are not configured" }, 503);
  try {
    await recordVisit(env.VISITS_DB, visitorCountry(request), Date.now(), visitClassification(request));
    // Exclusion affects analytics only. Crawlers still receive normal website
    // content, and no score or classification is disclosed by this endpoint.
    return visitAcknowledgement();
  } catch (error) {
    logError("visitor statistics request failed", error);
    return jsonResponse({ enabled: false, error: "Statistics unavailable" }, 503);
  }
}

function languageForHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === "originmindos.cn" || host.endsWith(".originmindos.cn")) return "zh";
  return "en";
}

function normalizedHomeLanguage(value) {
  const language = String(value || "").trim().toLowerCase();
  return Object.hasOwn(LANGUAGE_SITES, language) ? language : "";
}

function languageFromCookie(request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0) continue;
    const name = entry.slice(0, separator).trim();
    if (name !== LANGUAGE_COOKIE) continue;
    try {
      return normalizedHomeLanguage(decodeURIComponent(entry.slice(separator + 1).trim()));
    } catch {
      return "";
    }
  }
  return "";
}

function isUnifiedHomeHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "omindos.ai" || host === "www.omindos.ai" || host === "www.originmindos.com" || host === "originmindos.com" || host.endsWith(".pages.dev") || host === "localhost" || host === "127.0.0.1";
}

function isWeChatBrowser(request) {
  return /(?:MicroMessenger|WeChat)/iu.test(request.headers.get("User-Agent") || "");
}

function selectedHomeLanguage(request, url, fallbackLanguage) {
  if (!isUnifiedHomeHost(url.hostname)) return fallbackLanguage;
  return languageFromCookie(request) || fallbackLanguage;
}

function rememberLanguageRedirect(url, language, pathname = url.pathname) {
  const destination = new URL(url);
  destination.pathname = pathname;
  destination.searchParams.delete("lang");
  const secure = destination.protocol === "https:" ? "; Secure" : "";
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    Location: destination.toString(),
    "Set-Cookie": `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`,
  });
  return new Response(null, { status: 302, headers });
}

function assetRequest(request, url, pathname) {
  const assetUrl = new URL(url);
  assetUrl.pathname = pathname;
  assetUrl.search = "";
  return new Request(assetUrl, request);
}

function permanentRedirect(url, pathname, hostname = url.hostname) {
  const destination = new URL(url);
  destination.hostname = hostname;
  destination.pathname = pathname;
  return new Response(null, {
    status: 308,
    headers: {
      "Cache-Control": "public, max-age=3600",
      Location: destination.toString(),
    },
  });
}

function redirectLanguageDomain(url, language) {
  const destination = new URL(url);
  destination.protocol = "https:";
  destination.hostname = "omindos.ai";
  if (url.pathname === "/" || LEGACY_HOME_PATH.test(url.pathname)) {
    destination.pathname = "/";
    destination.searchParams.set("lang", language);
  } else if (LEGACY_OEM_PATH.test(url.pathname) || INTERNAL_OEM_PATH.test(url.pathname)) {
    destination.pathname = "/founding-oem";
    destination.searchParams.set("lang", language);
  } else if (url.pathname === "/why-originmind" || INTERNAL_WHY_PATH.test(url.pathname)) {
    destination.pathname = "/why-originmind";
    destination.searchParams.set("lang", language);
  } else if (/^\/robot-products\/?$/.test(url.pathname) || INTERNAL_ROBOT_PATH.test(url.pathname)) {
    destination.pathname = "/robot-products";
    destination.searchParams.set("lang", language);
  }
  return new Response(null, {
    status: 308,
    headers: {
      "Cache-Control": "public, max-age=3600",
      Location: destination.toString(),
    },
  });
}

function withLanguageHeaders(response, language, varyByCookie = false) {
  const headers = new Headers(response.headers);
  headers.set("Content-Language", LANGUAGE_SITES[language].contentLanguage);
  const vary = headers.get("Vary");
  const values = (vary || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const varyValues = [];
  if (!values.includes("host")) varyValues.push("Host");
  if (varyByCookie && !values.includes("cookie")) varyValues.push("Cookie");
  if (varyValues.length) headers.set("Vary", vary ? `${vary}, ${varyValues.join(", ")}` : varyValues.join(", "));
  const cacheControl = (headers.get("Cache-Control") || "").toLowerCase();
  const contentType = (headers.get("Content-Type") || "").toLowerCase();
  if (varyByCookie && response.status >= 200 && response.status < 300 && contentType.includes("text/html")) {
    headers.set("Cache-Control", "private, no-store");
  } else if (response.status >= 200 && response.status < 300 && contentType.includes("text/html") && !cacheControl.includes("no-store") && !cacheControl.includes("private")) {
    headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  }
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function withPublicAssetCache(response, url) {
  if (response.status < 200 || response.status >= 400) return response;
  const pathname = url.pathname.toLowerCase();
  const headers = new Headers(response.headers);
  if ((url.searchParams.has("v") && VERSIONED_PUBLIC_ASSET.test(pathname)) || /\.woff2?$/u.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
  } else if (STABLE_PUBLIC_ASSET.test(pathname)) {
    headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function renderNotFound(request, env, url, language) {
  // Fetch the clean URL for en/404.html: Pages otherwise redirects the .html
  // asset request before this handler can return its body with a 404 status.
  const response = await env.ASSETS.fetch(assetRequest(request, url, LANGUAGE_SITES[language].notFound));
  const headers = new Headers(response.headers);
  headers.delete("Location");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, follow");
  return withLanguageHeaders(new Response(response.body, {
    status: 404,
    statusText: "Not Found",
    headers,
  }), language);
}

async function serveRobotBrochure(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  const response = await env.ASSETS.fetch(request);
  if (response.status === 404) return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Disposition", `attachment; filename="${url.pathname.split("/").pop()}"`);
  headers.set("Content-Type", "application/pdf");
  headers.set("Cache-Control", url.searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=86400, stale-while-revalidate=604800");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// The approved bilingual portal uses URL language selection. Legacy OEM pages
// retain the existing language cookie and API bindings.
const PORTAL_ROUTES = new Set([
  "/", "/robots", "/robots/wheel-legged", "/robots/quadruped",
  "/robots/articulated", "/robots/open-frame", "/robots/wheeled", "/robots/tracked", "/robots/dual-arm", "/robots/mobile-dual-arm",
  "/omindos", "/developers", "/integration", "/field-work", "/field-work/mining",
  "/field-work/warehouse", "/mobility", "/about", "/contact", "/privacy",
  "/lab", "/lab/join", "/careers", "/join",
]);

function browserPortalLocale(request) {
  const preferences = (request.headers.get("Accept-Language") || "en")
    .split(",").map((entry, index) => {
      const [language, ...parameters] = entry.trim().split(";");
      const weight = parameters.find(value => value.trim().startsWith("q="));
      return { language, index, quality: weight ? Number(weight.trim().slice(2)) : 1 };
    }).filter(entry => Number.isFinite(entry.quality) && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return /^zh(?:-|$)/i.test(preferences[0]?.language || "en") ? "cn" : "en";
}

function portalRedirect(url, pathname, automatic = false) {
  const destination = new URL(url);
  destination.pathname = pathname;
  destination.searchParams.delete("lang");
  return new Response(null, { status: automatic ? 302 : 308, headers: {
    Location: destination.toString(),
    "Cache-Control": automatic ? "private, no-store" : "public, max-age=3600",
    ...(automatic ? { Vary: "Accept-Language" } : {}),
  } });
}

async function servePortal(request, env, url, locale, route) {
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
  const exists = PORTAL_ROUTES.has(route);
  if (!exists) return renderNotFound(request, env, url, locale === "cn" ? "zh" : "en");
  const assetPath = `/${locale}${route === "/" ? "/" : route + "/"}`;
  const response = await env.ASSETS.fetch(assetRequest(request, url, assetPath));
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Content-Language", locale === "cn" ? "zh-CN" : "en");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Cache-Control", "public, max-age=0, must-revalidate");
  return new Response(request.method === "HEAD" ? null : response.body, {
    status: response.status, headers,
  });
}

// The existing handlers remain regression-tested independently of host policy.
export const legacyWorker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      const requestHost = url.hostname.toLowerCase();
      const redirectLanguage = Object.hasOwn(LANGUAGE_REDIRECT_HOSTS, requestHost) ? LANGUAGE_REDIRECT_HOSTS[requestHost] : "";
      if (redirectLanguage) return redirectLanguageDomain(url, redirectLanguage);
      const canonicalHost = Object.hasOwn(CANONICAL_HOSTS, requestHost) ? CANONICAL_HOSTS[requestHost] : null;
      // Preserve the existing WeChat workaround only on the old apex host.
      // The new www alias always redirects to the current canonical domain.
      const preserveLegacyWeChatApex = requestHost === "originmindos.com" && isWeChatBrowser(request);
      if (canonicalHost && !preserveLegacyWeChatApex) return permanentRedirect(url, url.pathname, canonicalHost);

      // Keep the short /go link on the normal homepage language-selection path.
      if (url.pathname === "/go" || url.pathname === "/go/") {
        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
        return permanentRedirect(url, "/");
      }

      if (url.pathname === VISITS_ENDPOINT) return handleVisits(request, env, url);
      if (url.pathname === "/api/oem-applications") return handleOemApplication(request, env, url);
      if (RETIRED_PUBLIC_ASSETS.has(url.pathname)) return renderNotFound(request, env, url, "en");

      const explicitPortal = url.pathname.match(/^\/(cn|en)(\/.*)?$/);
      if (explicitPortal) {
        const locale = explicitPortal[1];
        const route = (explicitPortal[2] || "/").replace(/\/index\.html$/, "/").replace(/\/$/, "") || "/";
        const canonicalPath = `/${locale}${route === "/" ? "/" : route + "/"}`;
        if (PORTAL_ROUTES.has(route) && url.pathname !== canonicalPath) return portalRedirect(url, canonicalPath);
        return servePortal(request, env, url, locale, route);
      }


      // Intercept every retired Japanese page before ASSETS.fetch so an older
      // Cloudflare asset cache cannot continue serving deleted Japanese HTML.
      if (REMOVED_JAPANESE_HOME_PATH.test(url.pathname)) return portalRedirect(url, "/en/");
      if (REMOVED_JAPANESE_CONTENT_PATH.test(url.pathname)) return renderNotFound(request, env, url, "en");

      const portalRoute = url.pathname.replace(/\/$/, "") || "/";
      if (PORTAL_ROUTES.has(portalRoute)) {
        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
        const selected = url.searchParams.get("lang");
        const locale = selected === "zh" || selected === "cn" ? "cn" : selected === "en" ? "en" : browserPortalLocale(request);
        return portalRedirect(url, `/${locale}${portalRoute === "/" ? "/" : portalRoute + "/"}`, true);
      }

      if ((url.pathname === "/" || url.pathname === "/founding-oem" || url.pathname === "/why-originmind" || url.pathname === "/robot-products") && url.searchParams.has("lang")) {
        const requestedLanguage = normalizedHomeLanguage(url.searchParams.get("lang"));
        if (requestedLanguage) return rememberLanguageRedirect(url, requestedLanguage, url.pathname);
        const destination = new URL(url);
        destination.searchParams.delete("lang");
        return new Response(null, { status: 302, headers: { "Cache-Control": "private, no-store", Location: destination.toString() } });
      }

      const localeResource = url.pathname.match(LOCALE_RESOURCE_PATH);
      if (localeResource && url.searchParams.get("locale-resource") === "1") {
        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
        const language = localeResource[1];
        const response = await env.ASSETS.fetch(assetRequest(request, url, LANGUAGE_SITES[language].home));
        if (response.status === 404) return renderNotFound(request, env, url, language);
        const localized = withLanguageHeaders(response, language);
        const headers = new Headers(localized.headers);
        headers.set("Cache-Control", "private, no-store");
        headers.set("X-Robots-Tag", "noindex, nofollow");
        return new Response(localized.body, { status: localized.status, statusText: localized.statusText, headers });
      }

      const hostLanguage = languageForHostname(url.hostname);
      const language = selectedHomeLanguage(request, url, hostLanguage);
      const site = LANGUAGE_SITES[language];
      if (ROBOT_BROCHURE_PATH.test(url.pathname)) {
        const response = await serveRobotBrochure(request, env, url);
        return response.status === 404 ? renderNotFound(request, env, url, language) : response;
      }
      if (url.pathname === "/") {
        const response = await env.ASSETS.fetch(assetRequest(request, url, site.home));
        return withLanguageHeaders(response, language, isUnifiedHomeHost(url.hostname));
      }

      if (LEGACY_HOME_PATH.test(url.pathname)) {
        const legacyLocale = url.pathname.match(/\.(en|zh)(?:\.html)?$/)?.[1];
        return portalRedirect(url, legacyLocale ? `/${legacyLocale === "zh" ? "cn" : legacyLocale}/` : "/");
      }

      const legacyOem = url.pathname.match(LEGACY_OEM_PATH);
      const internalOem = url.pathname.match(INTERNAL_OEM_PATH);
      if ((legacyOem && url.pathname !== "/founding-oem") || internalOem) {
        const legacyLanguage = legacyOem?.[1] || internalOem?.[1] || hostLanguage;
        const destination = new URL(url);
        destination.pathname = "/founding-oem";
        destination.searchParams.set("lang", legacyLanguage);
        return new Response(null, { status: 308, headers: { "Cache-Control": "public, max-age=3600", Location: destination.toString() } });
      }

      if (url.pathname === "/founding-oem") {
        const response = await env.ASSETS.fetch(assetRequest(request, url, site.oem));
        return withLanguageHeaders(response, language, isUnifiedHomeHost(url.hostname));
      }

      const internalWhy = url.pathname.match(INTERNAL_WHY_PATH);
      if (internalWhy) {
        const destination = new URL(url);
        destination.pathname = "/why-originmind";
        destination.searchParams.set("lang", internalWhy[1]);
        return new Response(null, { status: 308, headers: { "Cache-Control": "public, max-age=3600", Location: destination.toString() } });
      }

      if (url.pathname === "/why-originmind") {
        const response = await env.ASSETS.fetch(assetRequest(request, url, site.why));
        return withLanguageHeaders(response, language, isUnifiedHomeHost(url.hostname));
      }

      const internalRobot = url.pathname.match(INTERNAL_ROBOT_PATH);
      if (internalRobot || url.pathname === "/robot-products/") {
        const destination = new URL(url);
        destination.pathname = "/robot-products";
        if (internalRobot) destination.searchParams.set("lang", internalRobot[1]);
        return new Response(null, { status: 308, headers: { "Cache-Control": "public, max-age=3600", Location: destination.toString() } });
      }

      if (url.pathname === "/robot-products") {
        if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed(["GET", "HEAD"]);
        const response = await env.ASSETS.fetch(assetRequest(request, url, site.robots));
        return response.status === 404 ? renderNotFound(request, env, url, language) : withLanguageHeaders(response, language, isUnifiedHomeHost(url.hostname));
      }

      const explicitNotFound = url.pathname.match(NOT_FOUND_PATH);
      if (explicitNotFound) return renderNotFound(request, env, url, explicitNotFound[1] || language);

      const response = await env.ASSETS.fetch(request);
      return response.status === 404 ? renderNotFound(request, env, url, language) : withPublicAssetCache(response, url);
    } catch (error) {
      logError("unhandled worker request failure", error, { method: request.method, pathname: url.pathname });
      if (url.pathname.startsWith("/api/")) return errorResponse("Service temporarily unavailable", 500, "internal_error");
      return new Response("Service temporarily unavailable", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
  },
};

function chinesePortalRedirect(request, url, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);
  const destination = new URL(url);
  destination.protocol = 'https:';
  destination.host = 'omindos.cn';
  destination.pathname = pathname;
  destination.searchParams.delete('lang');
  return new Response(null, {
    status: 308,
    headers: { Location: destination.toString(), 'Cache-Control': 'public, max-age=300' },
  });
}

// The international homepage opens in English. Explicit Chinese aliases and
// established unprefixed deep links continue to the domestic production site.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (url.pathname === ENGLISH_CHAT_PATH || url.pathname.startsWith(ENGLISH_CHAT_PATH + "/")) return handleEnglishChatRequest(request);
    if (!['omindos.ai', 'www.omindos.ai', 'localhost', '127.0.0.1'].includes(host) && !host.endsWith('.pages.dev')) {
      return legacyWorker.fetch(request, env);
    }
    if (url.pathname.startsWith('/api/')) return legacyWorker.fetch(request, env);
    // Locale media must bypass page routing, including same-origin English captions.
    if (/^\/(?:cn|en)\/(?:assets\/|[^/]+\.(?:css|js)$)/.test(url.pathname)) {
      if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);
      if (/^\/en\/assets\/english-chat\/panel(?:\.html)?$/.test(url.pathname)) {
        const response = await env.ASSETS.fetch(request);
        const headers = new Headers(response.headers);
        headers.set('Content-Security-Policy', "frame-ancestors 'self'");
        headers.set('X-Frame-Options', 'SAMEORIGIN');
        headers.set('Cache-Control', 'no-store');
        headers.set('X-Content-Type-Options', 'nosniff');
        return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
      }
      return withPublicAssetCache(await env.ASSETS.fetch(request), url);
    }
    const chinese = url.pathname.match(/^\/cn(\/.*)?$/);
    if (chinese) {
      const route = (chinese[1] || '/').replace(/\/index\.html$/, '/');
      return chinesePortalRedirect(request, url, route);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);
      const selected = (url.searchParams.get('lang') || '').toLowerCase();
      if (['zh', 'cn'].includes(selected)) return chinesePortalRedirect(request, url, '/');
      const destination = new URL(url);
      if (host === 'www.omindos.ai') destination.hostname = 'omindos.ai';
      return portalRedirect(destination, '/en/', true);
    }
    if (/^\/index(?:\.zh)?(?:\.html)?\/?$/.test(url.pathname)) return chinesePortalRedirect(request, url, '/');
    if (/^\/(?:oem\/zh(?:\/index(?:\.html)?)?\/?|founding-oem\.zh(?:\.html)?\/?|why\/zh(?:\/index(?:\.html)?)?\/?|robots\/zh(?:\/index(?:\.html)?)?\/?)$/.test(url.pathname)) {
      return chinesePortalRedirect(request, url, url.pathname.startsWith('/robots/') ? '/robots/' : url.pathname.startsWith('/why/') ? '/about/' : '/integration/');
    }
    const route = url.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    if (PORTAL_ROUTES.has(route)) {
      if (!['GET', 'HEAD'].includes(request.method)) return methodNotAllowed(['GET', 'HEAD']);
      const path = route === '/' ? '/' : route + '/';
      if ((url.searchParams.get('lang') || '').toLowerCase() === 'en') return portalRedirect(url, '/en' + path, true);
      return chinesePortalRedirect(request, url, path);
    }
    if (/^\/en(?:\/|$)/.test(url.pathname)) return legacyWorker.fetch(request, env);
    if (url.pathname === '/founding-oem.js' || /^\/404\.zh(?:\.html)?\/?$/.test(url.pathname)) return renderNotFound(request, env, url, 'zh');
    if (['zh', 'cn'].includes(url.searchParams.get('lang'))) {
      return chinesePortalRedirect(request, url, url.pathname === '/robot-products' ? '/robots/' : url.pathname === '/why-originmind' ? '/about/' : '/integration/');
    }
    // Preserve the established English legacy OEM URLs and existing API logic.
    const headers = new Headers(request.headers);
    const cookies = (headers.get('Cookie') || '').split(';').filter(part => !part.trim().startsWith(LANGUAGE_COOKIE + '=')).join(';');
    headers.set('Cookie', cookies + (cookies ? '; ' : '') + LANGUAGE_COOKIE + '=en');
    headers.set('Accept-Language', 'en');
    return legacyWorker.fetch(new Request(request, { headers }), env);
  },
};


