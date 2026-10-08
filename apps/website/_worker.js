const VISITS_ENDPOINT = "/api/visits";
const LANGUAGE_COOKIE = "originmind_language";
const PRIVACY_VERSION = "2026-09-09";
const MINUTE_IN_MS = 60 * 1000;
const RECENT_RETENTION_MINUTES = 2 * 24 * 60;
const ROBOT_BROCHURE_PATH = /^\/assets\/brochures\/OriginMind_Intelligent_Mobile_Robot_Product_Brochure_(EN|ZH)\.pdf$/;
const VERSIONED_PUBLIC_ASSET = /\.(?:css|js|png|jpe?g|svg|webp|ico)$/u;
const STABLE_PUBLIC_ASSET = /\.(?:woff2?|png|jpe?g|svg|webp|ico|mp4)$/u;

const LANGUAGE_SITES = {
  en: { home: "/index.en", oem: "/oem/en/", why: "/why/en/", robots: "/robots/en/", notFound: "/404", contentLanguage: "en" },
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

function isSameSiteBrowserRequest(request, url) {
  const origin = request.headers.get("Origin");
  if (origin) return origin === url.origin;
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return fetchSite === "same-origin" || fetchSite === "same-site";
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

async function recordVisit(database, countryCode, now) {
  const minuteBucket = Math.floor(now / MINUTE_IN_MS);
  await database.batch([
    database.prepare(`INSERT INTO visit_totals (id, visits) VALUES (1, 1) ON CONFLICT(id) DO UPDATE SET visits = visits + 1`),
    database.prepare(`INSERT INTO visit_recent (minute_bucket, country_code, visits) VALUES (?, ?, 1) ON CONFLICT(minute_bucket, country_code) DO UPDATE SET visits = visits + 1`).bind(minuteBucket, countryCode),
    database.prepare(`INSERT INTO visit_country (country_code, visits) VALUES (?, 1) ON CONFLICT(country_code) DO UPDATE SET visits = visits + 1`).bind(countryCode),
    database.prepare("DELETE FROM visit_recent WHERE minute_bucket < ?").bind(minuteBucket - RECENT_RETENTION_MINUTES),
  ]);
}

async function handleVisits(request, env, url) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  if (!env.VISITS_DB) return jsonResponse({ enabled: false, error: "Visitor statistics are not configured" }, 503);
  try {
    const now = Date.now();
    if (!isSameSiteBrowserRequest(request, url)) return errorResponse("Forbidden", 403, "forbidden");
    await recordVisit(env.VISITS_DB, visitorCountry(request), now);
    return new Response(null, { status: 204, headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    } });
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
  "/robots/articulated", "/robots/open-frame", "/robots/wheeled", "/robots/dual-arm",
  "/omindos", "/integration", "/field-work", "/field-work/mining",
  "/field-work/warehouse", "/mobility", "/about", "/contact", "/privacy",
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

function chinesePrimaryRedirect(url, path) {
  const destination = new URL('https://omindos.cn' + path);
  destination.search = url.search;
  destination.searchParams.delete('lang');
  return new Response(null, { status: 308, headers: {
    Location: destination.toString(), 'Cache-Control': 'public, max-age=3600',
  } });
}

// Public international policy: English only. Intercept retired Chinese URLs
// before ASSETS.fetch, including stale successful asset-cache responses.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (host !== 'omindos.ai' && !host.endsWith('.pages.dev') && host !== 'localhost') {
      return legacyWorker.fetch(request, env);
    }
    if (url.pathname.startsWith('/api/')) return legacyWorker.fetch(request, env);
    const chinese = url.pathname.match(/^\/cn(\/.*)?$/);
    if (chinese) {
      const route = (chinese[1] || '/').replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
      if (PORTAL_ROUTES.has(route)) return chinesePrimaryRedirect(url, route === '/' ? '/' : route + '/');
      return renderNotFound(request, env, url, 'en');
    }
    if (/^\/index\.zh(?:\.html)?\/?$/.test(url.pathname)) return chinesePrimaryRedirect(url, '/');
    if (/^\/(?:oem\/zh(?:\/index(?:\.html)?)?\/?|founding-oem\.zh(?:\.html)?\/?|why\/zh(?:\/index(?:\.html)?)?\/?|robots\/zh(?:\/index(?:\.html)?)?\/?)$/.test(url.pathname)) {
      return chinesePrimaryRedirect(url, url.pathname.startsWith('/robots/') ? '/robots/' : url.pathname.startsWith('/why/') ? '/about/' : '/integration/');
    }
    if (url.pathname === '/founding-oem.js' || /^\/404\.zh(?:\.html)?\/?$/.test(url.pathname)) return renderNotFound(request, env, url, 'en');
    const route = url.pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
    if (PORTAL_ROUTES.has(route)) {
      // Language cookies and Chinese browser preferences no longer choose a
      // Chinese mirror at the international entry.
      return portalRedirect(url, '/en' + (route === '/' ? '/' : route + '/'), true);
    }
    if (/^\/en(?:\/|$)/.test(url.pathname)) return legacyWorker.fetch(request, env);
    if (['zh', 'cn'].includes(url.searchParams.get('lang'))) {
      return chinesePrimaryRedirect(url, url.pathname === '/robot-products' ? '/robots/' : url.pathname === '/why-originmind' ? '/about/' : '/integration/');
    }
    const headers = new Headers(request.headers);
    const cookies = (headers.get('Cookie') || '').split(';').filter(part => !part.trim().startsWith(LANGUAGE_COOKIE + '=')).join(';');
    headers.set('Cookie', cookies + (cookies ? '; ' : '') + LANGUAGE_COOKIE + '=en');
    headers.set('Accept-Language', 'en');
    return legacyWorker.fetch(new Request(request, { headers }), env);
  },
};
