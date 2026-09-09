(() => {
  "use strict";

  const root = document.documentElement;
  const LANGUAGE_STORAGE_KEY = "originmind.language";
  const LANGUAGE_COOKIE = "originmind_language";
  const HOME_PATH = /^\/(?:index(?:\.(?:en|zh|ja))?(?:\.html)?)?\/?$/u;
  const LANGUAGE_RESOURCES = {
    en: { file: "/index.en.html", htmlLang: "en", locale: "en-US", hreflang: "en" },
    zh: { file: "/index.zh.html", htmlLang: "zh-CN", locale: "zh-CN", hreflang: "zh-CN" },
    ja: { file: "/index.ja.html", htmlLang: "ja", locale: "ja-JP", hreflang: "ja-JP" },
  };
  const languageCodes = Object.keys(LANGUAGE_RESOURCES);
  let pageController = null;
  let pageObservers = [];
  let languageRequest = 0;
  let visitRecorded = false;

  const normalizeLanguage = (value) => {
    const language = String(value || "").trim().toLowerCase();
    if (language === "zh" || language.startsWith("zh-")) return "zh";
    if (language === "ja" || language.startsWith("ja-")) return "ja";
    return "en";
  };

  const currentLanguage = () => normalizeLanguage(root.lang);
  const isHomePage = () => Boolean(document.querySelector("main.logic-home")) && HOME_PATH.test(window.location.pathname);
  const isOemPage = () => document.body.classList.contains("founding-page") && /^\/founding-oem\/?$/u.test(window.location.pathname);
  const isWhyPage = () => document.body.classList.contains("why-page") && /^\/why-originmind\/?$/u.test(window.location.pathname);
  const isRobotPage = () => document.body.classList.contains("robot-products-page") && /^\/robot-products\/?$/u.test(window.location.pathname);

  const readStoredLanguage = () => {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return languageCodes.includes(stored) ? stored : "";
    } catch {
      return "";
    }
  };

  const readCookieLanguage = () => {
    try {
      const prefix = `${LANGUAGE_COOKIE}=`;
      const entry = document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix));
      const language = entry ? decodeURIComponent(entry.slice(prefix.length)) : "";
      return languageCodes.includes(language) ? language : "";
    } catch {
      return "";
    }
  };

  const preferredLanguage = () => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested && languageCodes.includes(requested)) return requested;
    const cookieLanguage = readCookieLanguage();
    if (cookieLanguage) return cookieLanguage;
    const stored = readStoredLanguage();
    if (stored) return stored;
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    return normalizeLanguage(candidates.find(Boolean));
  };

  const rememberLanguage = (language) => {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Language switching still works when browser storage is unavailable.
    }
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${LANGUAGE_COOKIE}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    } catch {
      // Cookies are an enhancement for future server-side locale handling.
    }
  };

  const updateLocalizedHead = (localizedDocument) => {
    document.title = localizedDocument.title || document.title;
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[property="og:locale"]',
      'meta[property="og:image"]',
      'meta[property="og:image:alt"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:alt"]',
    ];
    selectors.forEach((selector) => {
      const source = localizedDocument.head.querySelector(selector);
      const target = document.head.querySelector(selector);
      if (source && target) target.setAttribute("content", source.getAttribute("content") || "");
    });
    const sourceCanonical = localizedDocument.head.querySelector('link[rel="canonical"]');
    const targetCanonical = document.head.querySelector('link[rel="canonical"]');
    if (sourceCanonical && targetCanonical) targetCanonical.href = sourceCanonical.href;
    const sourceStructuredData = localizedDocument.head.querySelector('script[type="application/ld+json"]');
    const targetStructuredData = document.head.querySelector('script[type="application/ld+json"]');
    if (sourceStructuredData && targetStructuredData) targetStructuredData.textContent = sourceStructuredData.textContent;
  };

  const disposePage = () => {
    pageController?.abort();
    pageController = null;
    pageObservers.forEach((observer) => observer.disconnect());
    pageObservers = [];
  };

  const showLanguageError = (language) => {
    const messages = {
      en: "Language switching is temporarily unavailable. Please try again.",
      zh: "语言切换暂时不可用，请稍后重试。",
      ja: "言語の切り替えが一時的に利用できません。もう一度お試しください。",
    };
    let status = document.querySelector("[data-language-status]");
    if (!status) {
      status = document.createElement("p");
      status.className = "language-status";
      status.dataset.languageStatus = "";
      status.setAttribute("role", "status");
      document.body.append(status);
    }
    status.textContent = messages[language] || messages.en;
    window.setTimeout(() => status?.remove(), 4200);
  };

  const updateLanguageLinks = () => {
    const language = currentLanguage();
    const home = isHomePage();
    const oem = isOemPage();
    const why = isWhyPage();
    const robots = isRobotPage();
    const legacySites = {
      en: { origin: "https://omindos.ai", preview: "../en/", hreflang: "en" },
      zh: { origin: "https://omindos.ai", preview: "../zh/", hreflang: "zh-CN" },
      ja: { origin: "https://omindos.ai", preview: "../ja/", hreflang: "ja-JP" },
    };
    const host = window.location.hostname.toLowerCase();
    const isProduction = host === "omindos.ai" || host === "www.omindos.ai" || host === "originmindos.com" || host.endsWith(".originmindos.com") || host === "originmindos.cn" || host.endsWith(".originmindos.cn");
    const sectionHash = window.location.hash;

    document.querySelectorAll("[data-language]").forEach((link) => {
      const targetLanguage = link.dataset.language;
      if (!languageCodes.includes(targetLanguage)) return;
      link.classList.toggle("is-active", targetLanguage === language);
      if (targetLanguage === language) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");

      if (home || oem || why || robots) {
        const fallbackOrigin = isProduction ? "https://omindos.ai" : window.location.origin;
        const fallbackUrl = new URL(robots ? "/robot-products" : why ? "/why-originmind" : oem ? "/founding-oem" : "/", fallbackOrigin);
        fallbackUrl.searchParams.set("lang", targetLanguage);
        fallbackUrl.hash = sectionHash;
        link.href = fallbackUrl.toString();
        link.removeAttribute("hreflang");
        return;
      }

      const target = legacySites[targetLanguage];
      if (!target) return;
      link.hreflang = target.hreflang;
      link.href = isProduction ? `${target.origin}/founding-oem?lang=${targetLanguage}${sectionHash}` : `${target.preview}${sectionHash}`;
    });
  };

  const loadLanguage = async (requestedLanguage) => {
    const language = normalizeLanguage(requestedLanguage);
    if (!isHomePage()) return;
    if (language === currentLanguage()) {
      rememberLanguage(language);
      updateLanguageLinks();
      return;
    }

    const requestId = ++languageRequest;
    root.classList.add("locale-loading");
    root.setAttribute("aria-busy", "true");
    try {
      const resource = new URL(LANGUAGE_RESOURCES[language].file, window.location.origin);
      resource.searchParams.set("locale-resource", "1");
      const response = await fetch(resource, {
        headers: {
          Accept: "text/html",
          "X-OriginMind-Locale-Resource": "1",
        },
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(`Locale resource returned ${response.status}`);
      const markup = await response.text();
      if (requestId !== languageRequest) return;
      const localizedDocument = new DOMParser().parseFromString(markup, "text/html");
      if (!localizedDocument.body || !localizedDocument.querySelector("main.logic-home")) {
        throw new Error("Locale resource is not a valid OriginMind home page");
      }
      const responseLanguage = normalizeLanguage(localizedDocument.documentElement.lang);
      if (responseLanguage !== language) {
        throw new Error(`Locale resource language mismatch: requested ${language}, received ${responseLanguage}`);
      }

      localizedDocument.body.querySelectorAll("script").forEach((script) => script.remove());
      disposePage();
      updateLocalizedHead(localizedDocument);
      root.lang = localizedDocument.documentElement.lang || LANGUAGE_RESOURCES[language].htmlLang;
      root.dir = "ltr";
      root.dataset.menuOpen = localizedDocument.documentElement.dataset.menuOpen || "Open navigation menu";
      root.dataset.menuClose = localizedDocument.documentElement.dataset.menuClose || "Close navigation menu";
      document.body.className = localizedDocument.body.className;
      document.body.innerHTML = localizedDocument.body.innerHTML;
      rememberLanguage(language);
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.hash}`);
      initPage();
      window.requestAnimationFrame(() => {
        const id = window.location.hash.slice(1);
        if (!id) return;
        document.getElementById(id)?.scrollIntoView({ block: "start" });
      });
    } catch (error) {
      console.error("OriginMind language switch failed", error);
      const alreadyUsingFallback = new URLSearchParams(window.location.search).has("lang");
      if (!alreadyUsingFallback) {
        rememberLanguage(language);
        const host = window.location.hostname.toLowerCase();
        const isProduction = host === "omindos.ai" || host === "www.omindos.ai" || host === "originmindos.com" || host.endsWith(".originmindos.com") || host === "originmindos.cn" || host.endsWith(".originmindos.cn");
        const fallbackUrl = new URL("/", isProduction ? "https://omindos.ai" : window.location.origin);
        fallbackUrl.searchParams.set("lang", language);
        fallbackUrl.hash = window.location.hash;
        window.location.assign(fallbackUrl.toString());
        return;
      }
      showLanguageError(language);
    } finally {
      if (requestId === languageRequest) {
        root.classList.remove("locale-loading");
        root.removeAttribute("aria-busy");
      }
    }
  };

  document.addEventListener("click", (event) => {
    const skipLink = event.target.closest("a.skip-link[href^='#']");
    if (skipLink) {
      const target = document.querySelector(skipLink.hash);
      if (target) {
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        window.requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
      return;
    }
    const link = event.target.closest("a[data-language]");
    if (!link || !isHomePage()) return;
    const language = link.dataset.language;
    if (!languageCodes.includes(language)) return;
    event.preventDefault();
    const host = window.location.hostname.toLowerCase();
    const isOriginMindHost = host === "omindos.ai" || host === "www.omindos.ai" || host === "originmindos.com" || host.endsWith(".originmindos.com") || host === "originmindos.cn" || host.endsWith(".originmindos.cn");
    if (isOriginMindHost && host !== "omindos.ai") {
      const destination = new URL("https://omindos.ai/");
      destination.searchParams.set("lang", language);
      destination.hash = window.location.hash;
      window.location.assign(destination);
      return;
    }
    void loadLanguage(language);
  });

  const initPage = () => {
    disposePage();
    pageController = new AbortController();
    const { signal } = pageController;
    root.classList.add("js");
    root.dir = "ltr";
    updateLanguageLinks();

    // Locale fragments may have been rewritten by an edge email obfuscator.
    // Restore only our explicitly marked public contact, after every body swap.
    document.querySelectorAll("[data-sales-email]").forEach((link) => {
      link.setAttribute("href", "mailto:sales@omindos.ai");
    });
    document.querySelectorAll("[data-sales-email-text]").forEach((element) => {
      element.textContent = "sales@omindos.ai";
    });

    const header = document.querySelector(".site-header");
    const progress = document.querySelector(".scroll-progress i");
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.querySelector(".site-nav");
    const navLinks = [...document.querySelectorAll("[data-nav]")];

    const updateScroll = () => {
      const scrollTop = window.scrollY;
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (header) header.classList.toggle("is-scrolled", scrollTop > 12);
      if (progress) progress.style.width = `${available > 0 ? (scrollTop / available) * 100 : 0}%`;
    };

    const setMenu = (open, returnFocus = false) => {
      if (!toggle || !nav) return;
      const openLabel = root.dataset.menuOpen || "Open navigation";
      const closeLabel = root.dataset.menuClose || "Close navigation";
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? closeLabel : openLabel);
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
      if (!open && returnFocus) toggle.focus();
    };

    toggle?.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"), { signal });
    navLinks.forEach((link) => link.addEventListener("click", () => setMenu(false), { signal }));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") setMenu(false, true);
    }, { signal });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 920) setMenu(false);
    }, { signal });

    const revealObserver = "IntersectionObserver" in window
      ? new IntersectionObserver((entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          });
        }, { rootMargin: "0px 0px -8%", threshold: 0.08 })
      : null;
    if (revealObserver) pageObservers.push(revealObserver);

    document.querySelectorAll(".reveal").forEach((element) => {
      if (element.classList.contains("is-visible") || !revealObserver) element.classList.add("is-visible");
      else revealObserver.observe(element);
    });

    const revealHashTarget = () => {
      const rawId = window.location.hash.slice(1);
      if (!rawId) return;
      let id = rawId;
      try {
        id = decodeURIComponent(rawId);
      } catch {
        // Keep the raw fragment when a malformed escape sequence is supplied.
      }
      const target = document.getElementById(id);
      if (!target) return;
      const revealTargets = [
        ...(target.matches(".reveal") ? [target] : []),
        ...target.querySelectorAll(".reveal"),
      ];
      revealTargets.forEach((element) => {
        element.classList.add("is-visible");
        revealObserver?.unobserve(element);
      });
    };

    revealHashTarget();
    window.addEventListener("hashchange", () => window.requestAnimationFrame(revealHashTarget), { signal });
    window.addEventListener("pageshow", () => window.requestAnimationFrame(revealHashTarget), { signal });

    const loadVideoPoster = (video) => {
      const poster = video.dataset.poster;
      if (!poster) return;
      video.poster = poster;
      delete video.dataset.poster;
    };

    const lazyVideos = [...document.querySelectorAll("video[data-poster]")];
    if ("IntersectionObserver" in window) {
      const videoObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          loadVideoPoster(entry.target);
          observer.unobserve(entry.target);
        });
      }, { rootMargin: "600px 0px", threshold: 0.01 });
      pageObservers.push(videoObserver);
      lazyVideos.forEach((video) => videoObserver.observe(video));
    } else {
      lazyVideos.forEach(loadVideoPoster);
    }

    if ("IntersectionObserver" in window && navLinks.length) {
      const sectionObserver = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        navLinks.forEach((link) => link.classList.toggle("is-active", link.dataset.nav === visible.target.id));
      }, { rootMargin: "-22% 0px -62%", threshold: [0.01, 0.2, 0.5] });
      pageObservers.push(sectionObserver);
      navLinks.forEach((link) => {
        const section = document.getElementById(link.dataset.nav || "");
        if (section) sectionObserver.observe(section);
      });
    }

    const visitorRoot = document.querySelector("[data-visitor-map]");
    if (visitorRoot?.hidden === false) {
      const language = currentLanguage();
      const locale = LANGUAGE_RESOURCES[language].locale;
      const copy = {
        en: {
          unavailable: "Live statistics are temporarily unavailable. The rest of the site is unaffected.",
          live: "Counting starts when this map goes live; only country-level totals are stored.",
        },
        zh: {
          unavailable: "实时统计暂不可用，网站其他功能不受影响。",
          live: "数据从访客地图上线后开始累计，仅保留国家级汇总。",
        },
        ja: {
          unavailable: "アクセス統計は一時的にご利用いただけません。ウェブサイトのその他の機能には影響ありません。",
          live: "本マップの公開後から集計を開始し、国・地域別の集計値のみを保存しています。",
        },
      }[language];
      const numberFormat = new Intl.NumberFormat(locale);
      const regionNames = typeof Intl.DisplayNames === "function"
        ? new Intl.DisplayNames([locale], { type: "region" })
        : null;
      const countryPositions = window.ORIGINMIND_COUNTRY_POSITIONS || {};
      const totalNode = visitorRoot.querySelector("[data-visit-total]");
      const recentNode = visitorRoot.querySelector("[data-visit-day]");
      const statusNode = visitorRoot.querySelector("[data-visitor-status]");
      const markersNode = visitorRoot.querySelector("[data-visitor-markers]");
      const countriesNode = visitorRoot.querySelector("[data-visitor-countries]");
      const countryName = (code) => {
        try {
          return regionNames?.of(code) || code;
        } catch {
          return code;
        }
      };

      const setUnavailable = () => {
        visitorRoot.classList.remove("is-loading");
        visitorRoot.classList.add("is-unavailable");
        if (statusNode) statusNode.textContent = copy.unavailable;
      };

      const shouldRecordVisit = !visitRecorded;
      visitRecorded = true;
      const requestOptions = shouldRecordVisit
        ? {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            signal,
          }
        : { method: "GET", credentials: "same-origin", signal };

      fetch("/api/visits", requestOptions)
        .then((response) => {
          if (!response.ok) throw new Error(`Visitor API returned ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (!data.enabled) throw new Error("Visitor statistics are disabled");
          if (totalNode) totalNode.textContent = numberFormat.format(data.total);
          if (recentNode) recentNode.textContent = numberFormat.format(data.last24Hours);

          const countries = Array.isArray(data.countries) ? data.countries : [];
          if (markersNode) {
            markersNode.replaceChildren();
            countries.forEach((country) => {
              const position = countryPositions[country.code];
              if (!position) return;
              const marker = document.createElement("span");
              const scale = 0.78 + Math.min(1.45, Math.log10(country.visits + 1) / 1.8);
              marker.className = "visitor-marker";
              marker.style.setProperty("--marker-x", `${position[0]}%`);
              marker.style.setProperty("--marker-y", `${position[1]}%`);
              marker.style.setProperty("--marker-scale", scale.toFixed(2));
              const name = countryName(country.code);
              marker.tabIndex = 0;
              marker.setAttribute("role", "img");
              marker.setAttribute("aria-label", `${name}: ${numberFormat.format(country.visits)}`);
              marker.append(document.createElement("i"));
              const label = document.createElement("small");
              label.textContent = `${country.code} · ${numberFormat.format(country.visits)}`;
              marker.append(label);
              markersNode.append(marker);
            });
          }

          if (countriesNode) {
            countriesNode.replaceChildren();
            countries.slice(0, 6).forEach((country) => {
              const item = document.createElement("li");
              const label = document.createElement("span");
              const code = document.createElement("b");
              const count = document.createElement("strong");
              code.textContent = country.code;
              label.append(code, countryName(country.code));
              count.textContent = numberFormat.format(country.visits);
              item.append(label, count);
              countriesNode.append(item);
            });
          }

          visitorRoot.classList.remove("is-loading");
          if (statusNode) statusNode.textContent = copy.live;
        })
        .catch((error) => {
          if (error.name !== "AbortError") setUnavailable();
        });
    }

    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true, signal });
  };

  const start = async () => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    const language = preferredLanguage();
    if (isHomePage() && language !== currentLanguage()) await loadLanguage(language);
    else {
      rememberLanguage(currentLanguage());
      if (requested) {
        window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.hash}`);
      }
      initPage();
      root.classList.remove("locale-loading");
      root.removeAttribute("aria-busy");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void start(), { once: true });
  } else {
    void start();
  }
})();
