const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const { config } = require("./runtime-config");
const { APP_VERSION } = require("@multiportal/config/app-version");

const API_PROXY_URL = config.API_PROXY_URL;
const DEFAULT_GLOBAL_FOOTER_LABEL = `MultiPortal Listing Manager v${APP_VERSION} - Development Mode`;
const API_ROUTE_PREFIXES = [
  "/auth",
  "/listings",
  "/providers",
  "/marketplace-accounts",
  "/publication-jobs",
  "/media",
  "/media-files",
  "/health",
  "/site-stats",
];
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
function isApiRoute(pathname) {
  return API_ROUTE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function buildBaseSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

function injectNonceIntoHtml(html, nonce) {
  return html
    .replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)
    .replace(/<style(?![^>]*\bnonce=)/g, `<style nonce="${nonce}"`);
}

function buildGlobalFooterShell(labelHtml, existingAttributes = "") {
  const normalizedLabelHtml = String(labelHtml || "").trim() || DEFAULT_GLOBAL_FOOTER_LABEL;
  const classMatch = existingAttributes.match(/\bclass\s*=\s*["']([^"']*)["']/i);
  const existingClasses = classMatch ? classMatch[1].trim() : "";
  const mergedClasses = ["global-app-footer", existingClasses].filter(Boolean).join(" ");
  const attributesWithoutClass = existingAttributes.replace(/\s*\bclass\s*=\s*["'][^"']*["']/i, "");

  return `<footer${attributesWithoutClass} class="${mergedClasses}" data-global-footer-shell="true"><span class="global-footer-balance" aria-hidden="true"></span><span class="global-footer-label">${normalizedLabelHtml}</span><span class="global-visitor-counter" id="globalVisitorCounter" aria-live="polite">Visitors: --</span></footer>`;
}

function ensureGlobalFooterShell(html) {
  if (html.includes('data-global-footer-shell="true"')) {
    return html;
  }

  const footerPattern = /<footer([^>]*)>([\s\S]*?)<\/footer>/i;
  if (footerPattern.test(html)) {
    return html.replace(footerPattern, (_, attributes = "", content = "") => buildGlobalFooterShell(content, attributes));
  }

  const footerMarkup = buildGlobalFooterShell(DEFAULT_GLOBAL_FOOTER_LABEL);
  if (html.includes("</body>")) {
    return html.replace("</body>", `${footerMarkup}\n</body>`);
  }

  return `${html}\n${footerMarkup}`;
}

function buildVisitorCounterMarkup(nonce) {
  return `
  <style nonce="${nonce}">
    footer.global-app-footer {
      width: 100%;
      margin: 0 !important;
      padding: 1rem max(0.75rem, env(safe-area-inset-right, 0px)) max(1rem, env(safe-area-inset-bottom, 0px)) max(0.75rem, env(safe-area-inset-left, 0px)) !important;
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      align-items: center;
      gap: 1rem;
      flex: 0 0 auto;
      box-sizing: border-box;
      text-align: center !important;
    }

    footer.global-app-footer .global-footer-balance {
      min-width: 0;
    }

    footer.global-app-footer .global-footer-label {
      grid-column: 2;
      justify-self: center;
      min-width: 0;
      max-width: min(100%, 70vw);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    footer.global-app-footer .global-visitor-counter {
      grid-column: 3;
      justify-self: end;
      white-space: nowrap;
    }

    @media (max-width: 720px) {
      footer.global-app-footer {
        grid-template-columns: minmax(0, 1fr);
        gap: 0.35rem;
        padding-top: 0.85rem !important;
        padding-bottom: max(0.85rem, env(safe-area-inset-bottom, 0px)) !important;
      }

      footer.global-app-footer .global-footer-balance {
        display: none;
      }

      footer.global-app-footer .global-footer-label {
        grid-column: 1;
        justify-self: center;
        max-width: 100%;
        white-space: normal;
        line-height: 1.4;
        text-align: center;
      }

      footer.global-app-footer .global-visitor-counter {
        grid-column: 1;
        justify-self: end;
        width: 100%;
        text-align: right;
      }
    }
  </style>
  <script nonce="${nonce}">
    (function () {
      const body = document.body;
      const footer = document.querySelector("footer.global-app-footer");
      const visitorCounter = document.getElementById("globalVisitorCounter");
      if (!body || !footer || !visitorCounter || footer.dataset.visitorCounterReady === "true") return;

      const bodyStyles = window.getComputedStyle(body);
      const originalDisplay = bodyStyles.display;
      const originalAlignItems = bodyStyles.alignItems;
      const originalJustifyContent = bodyStyles.justifyContent;
      const originalFlexDirection = bodyStyles.flexDirection;
      const originalGap = bodyStyles.gap;
      const originalGridTemplateColumns = bodyStyles.gridTemplateColumns;
      const originalGridTemplateRows = bodyStyles.gridTemplateRows;
      const originalPlaceItems = bodyStyles.placeItems;
      const originalPlaceContent = bodyStyles.placeContent;
      const contentWrapper = document.createElement("div");
      let currentNode = body.firstChild;
      let movedNodes = 0;

      contentWrapper.className = "global-page-content";
      contentWrapper.style.flex = "1 0 auto";
      contentWrapper.style.minHeight = "0";
      contentWrapper.style.width = "100%";
      contentWrapper.style.boxSizing = "border-box";

      while (currentNode && currentNode !== footer) {
        const nextNode = currentNode.nextSibling;
        if (!(currentNode.nodeType === Node.TEXT_NODE && !currentNode.textContent.trim())) {
          contentWrapper.appendChild(currentNode);
          movedNodes += 1;
        }
        currentNode = nextNode;
      }

      if (movedNodes > 0) {
        body.insertBefore(contentWrapper, footer);
      }

      body.style.minHeight = "100vh";
      body.style.display = "flex";
      body.style.flexDirection = "column";
      body.style.alignItems = "stretch";
      body.style.justifyContent = "flex-start";

      if (originalDisplay === "flex") {
        contentWrapper.style.display = "flex";
        contentWrapper.style.flexDirection = originalFlexDirection;
        contentWrapper.style.alignItems = originalAlignItems;
        contentWrapper.style.justifyContent = originalJustifyContent;
        if (originalGap && originalGap !== "normal") {
          contentWrapper.style.gap = originalGap;
        }
      } else if (originalDisplay === "grid") {
        contentWrapper.style.display = "grid";
        contentWrapper.style.gridTemplateColumns = originalGridTemplateColumns;
        contentWrapper.style.gridTemplateRows = originalGridTemplateRows;
        if (originalPlaceItems && originalPlaceItems !== "normal") {
          contentWrapper.style.placeItems = originalPlaceItems;
        }
        if (originalPlaceContent && originalPlaceContent !== "normal") {
          contentWrapper.style.placeContent = originalPlaceContent;
        }
      }

      footer.dataset.visitorCounterReady = "true";

      fetch("/site-stats/visitors", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error("Failed to load visitor counter.");
          }
          return response.json();
        })
        .then((payload) => {
          const totalUniqueVisitors = Number(payload && payload.totalUniqueVisitors);
          if (!Number.isFinite(totalUniqueVisitors) || totalUniqueVisitors < 0) {
            throw new Error("Invalid visitor counter payload.");
          }

          visitorCounter.textContent = "Visitors: " + totalUniqueVisitors;
        })
        .catch(() => {
          visitorCounter.textContent = "Visitors: --";
        });
    }());
  </script>`;
}

function buildSessionTerminationWatcherMarkup(nonce) {
  return `
  <style nonce="${nonce}">
    .global-session-termination-notice {
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%);
      width: min(92vw, 34rem);
      padding: 0.95rem 1rem;
      border: 1px solid rgba(251, 191, 36, 0.45);
      border-radius: 14px;
      background: rgba(37, 27, 58, 0.96);
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
      color: #fff;
      z-index: 4000;
      display: none;
      pointer-events: none;
      backdrop-filter: blur(12px);
    }

    .global-session-termination-notice.active {
      display: block;
    }

    .global-session-termination-notice strong {
      display: block;
      color: #fcd34d;
      font-size: 0.92rem;
      letter-spacing: 0.02em;
    }

    .global-session-termination-notice p {
      margin: 0.38rem 0 0;
      color: rgba(255,255,255,0.9);
      font-size: 0.88rem;
      line-height: 1.45;
    }
  </style>
  <script nonce="${nonce}">
    (function () {
      const AUTH_MARKER = "cookie-session";
      const TOKEN_STORAGE_KEY = "token";
      const USER_STORAGE_KEY = "user";
      const SESSION_NOTICE_STORAGE_KEY = "mp_session_notice";
      const SESSION_STATE_POLL_INTERVAL_MS = 3000;
      const SESSION_LOGOUT_DELAY_MS = 5000;
      const SESSION_REASON_MESSAGES = {
        session_revoked: "This session was ended from another device or browser.",
        session_security_change: "This session was invalidated after account security changes.",
        session_expired: "This session has expired.",
        session_missing: "This session is no longer available.",
        token_invalid: "This session is no longer valid.",
      };

      let noticeElement = null;
      let countdownIntervalId = null;
      let countdownDeadlineMs = 0;
      let countdownReason = "";
      let countdownMessage = "";
      let forcedLogoutCompleted = false;

      function canUseStorage() {
        try {
          const probeKey = "__mp_session_probe__";
          window.localStorage.setItem(probeKey, "1");
          window.localStorage.removeItem(probeKey);
          return true;
        } catch {
          return false;
        }
      }

      const storageEnabled = canUseStorage();

      function hasStoredSessionMarker() {
        if (!storageEnabled) return false;
        return window.localStorage.getItem(TOKEN_STORAGE_KEY) === AUTH_MARKER;
      }

      function ensureNoticeElement() {
        if (noticeElement || !document.body) return noticeElement;

        noticeElement = document.createElement("section");
        noticeElement.className = "global-session-termination-notice";
        noticeElement.setAttribute("role", "alert");
        noticeElement.setAttribute("aria-live", "assertive");

        const heading = document.createElement("strong");
        heading.textContent = "Session ending soon";
        const body = document.createElement("p");

        noticeElement.append(heading, body);
        document.body.appendChild(noticeElement);
        return noticeElement;
      }

      function hideNotice() {
        const element = ensureNoticeElement();
        if (!element) return;
        element.classList.remove("active");
        const body = element.querySelector("p");
        if (body) body.textContent = "";
      }

      function renderNotice(message, secondsLeft) {
        const element = ensureNoticeElement();
        if (!element) return;
        const body = element.querySelector("p");
        if (body) {
          body.textContent = message + " You will be signed out in " + secondsLeft + "s.";
        }
        element.classList.add("active");
      }

      function rememberSessionNotice(reason, message, deadlineMs) {
        if (!storageEnabled) return;
        try {
          window.localStorage.setItem(SESSION_NOTICE_STORAGE_KEY, JSON.stringify({
            reason,
            message,
            deadlineMs,
            at: Date.now(),
          }));
        } catch {
          // Ignore storage synchronization failures.
        }
      }

      function clearLocalSessionArtifacts() {
        if (storageEnabled) {
          try { window.localStorage.removeItem(TOKEN_STORAGE_KEY); } catch {}
          try { window.localStorage.removeItem(USER_STORAGE_KEY); } catch {}
          try { window.localStorage.removeItem(SESSION_NOTICE_STORAGE_KEY); } catch {}
        }
        try { window.sessionStorage.clear(); } catch {}
      }

      function completeForcedLogout() {
        if (forcedLogoutCompleted) return;
        forcedLogoutCompleted = true;
        if (countdownIntervalId) {
          window.clearInterval(countdownIntervalId);
          countdownIntervalId = null;
        }

        const finalMessage = (countdownMessage || SESSION_REASON_MESSAGES[countdownReason] || "Your session has ended.") + " Please sign in again.";
        clearLocalSessionArtifacts();

        try {
          if (typeof window.showLoggedOut === "function") {
            window.showLoggedOut();
          }
        } catch {
          // Ignore page-specific UI cleanup failures.
        }

        try {
          if (typeof window.toast === "function") {
            window.toast(finalMessage, "warning");
          }
        } catch {
          // Ignore page-local toast failures.
        }

        hideNotice();

        const currentPath = window.location.pathname || "/";
        if (currentPath === "/" || currentPath === "/index.html") {
          return;
        }

        window.location.href = "/";
      }

      function updateCountdownNotice() {
        if (!countdownDeadlineMs) return;

        const remainingMs = countdownDeadlineMs - Date.now();
        if (remainingMs <= 0) {
          completeForcedLogout();
          return;
        }

        const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
        renderNotice(
          countdownMessage || SESSION_REASON_MESSAGES[countdownReason] || "Your session is no longer valid.",
          secondsLeft,
        );
      }

      function beginForcedLogout(reason, deadlineMs, message, options = {}) {
        if (forcedLogoutCompleted) return;

        const normalizedReason = typeof reason === "string" && reason
          ? reason
          : "session_revoked";
        const normalizedMessage = typeof message === "string" && message.trim()
          ? message.trim()
          : (SESSION_REASON_MESSAGES[normalizedReason] || "Your session is no longer valid.");
        const fallbackDeadlineMs = Date.now() + SESSION_LOGOUT_DELAY_MS;
        const normalizedDeadlineMs = Number.isFinite(deadlineMs) && deadlineMs > Date.now()
          ? deadlineMs
          : fallbackDeadlineMs;

        countdownReason = normalizedReason;
        countdownMessage = normalizedMessage;
        countdownDeadlineMs = countdownDeadlineMs
          ? Math.min(countdownDeadlineMs, normalizedDeadlineMs)
          : normalizedDeadlineMs;

        if (options.broadcast !== false) {
          rememberSessionNotice(countdownReason, countdownMessage, countdownDeadlineMs);
        }

        updateCountdownNotice();
        if (countdownIntervalId) {
          window.clearInterval(countdownIntervalId);
        }
        countdownIntervalId = window.setInterval(updateCountdownNotice, 250);
      }

      function handleSessionInvalidation(payload) {
        const reason = String(payload && payload.reason || "");
        const message = String(payload && payload.error || "").trim();

        if (reason === "auth_required" && !hasStoredSessionMarker()) {
          return;
        }

        if (
          reason === "session_revoked" ||
          reason === "session_security_change" ||
          reason === "session_expired" ||
          reason === "session_missing" ||
          reason === "token_invalid"
        ) {
          beginForcedLogout(reason, Date.now() + SESSION_LOGOUT_DELAY_MS, message);
        }
      }

      async function pollSessionState() {
        if (forcedLogoutCompleted || !hasStoredSessionMarker()) return;

        try {
          const response = await window.fetch("/auth/session-state", {
            method: "GET",
            credentials: "same-origin",
            cache: "no-store",
            headers: { Accept: "application/json" },
          });

          if (response.ok) {
            return;
          }

          let payload = {};
          try {
            payload = await response.json();
          } catch {
            payload = {};
          }

          if (response.status === 401) {
            handleSessionInvalidation(payload);
          }
        } catch {
          // Temporary network issues should not force logout.
        }
      }

      window.addEventListener("storage", (event) => {
        if (forcedLogoutCompleted) return;

        if (event.key === SESSION_NOTICE_STORAGE_KEY && event.newValue) {
          try {
            const payload = JSON.parse(event.newValue);
            beginForcedLogout(payload.reason, payload.deadlineMs, payload.message, { broadcast: false });
          } catch {
            // Ignore malformed storage events.
          }
          return;
        }

        if (event.key === TOKEN_STORAGE_KEY && event.oldValue === AUTH_MARKER && event.newValue === null) {
          beginForcedLogout("session_revoked", Date.now() + SESSION_LOGOUT_DELAY_MS, "This session was signed out from another tab or browser.", { broadcast: false });
        }
      });

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) {
          pollSessionState();
        }
      });

      window.addEventListener("pagehide", () => {
        if (countdownIntervalId) {
          window.clearInterval(countdownIntervalId);
          countdownIntervalId = null;
        }
      });

      if (storageEnabled && hasStoredSessionMarker()) {
        try {
          const storedNotice = JSON.parse(window.localStorage.getItem(SESSION_NOTICE_STORAGE_KEY) || "null");
          if (storedNotice && Number.isFinite(storedNotice.deadlineMs) && storedNotice.deadlineMs > Date.now()) {
            beginForcedLogout(storedNotice.reason, storedNotice.deadlineMs, storedNotice.message, { broadcast: false });
          }
        } catch {
          // Ignore malformed persisted notices.
        }
      }

      if (hasStoredSessionMarker()) {
        pollSessionState();
      }
      window.setInterval(pollSessionState, SESSION_STATE_POLL_INTERVAL_MS);
    }());
  </script>`;
}

function injectRuntimeValuesIntoHtml(html, nonce) {
  const htmlWithVersion = html.replaceAll("__APP_VERSION__", APP_VERSION);
  const htmlWithFooter = ensureGlobalFooterShell(htmlWithVersion);
  if (
    htmlWithFooter.includes('data-global-visitor-script="true"') &&
    htmlWithFooter.includes('data-global-session-watcher="true"')
  ) {
    return htmlWithFooter;
  }

  const visitorCounterMarkup = buildVisitorCounterMarkup(nonce).replace("<script ", '<script data-global-visitor-script="true" ');
  const sessionWatcherMarkup = buildSessionTerminationWatcherMarkup(nonce).replace("<script ", '<script data-global-session-watcher="true" ');
  const runtimeMarkup = `${visitorCounterMarkup}\n${sessionWatcherMarkup}`;
  if (htmlWithFooter.includes("</body>")) {
    return htmlWithFooter.replace("</body>", `${runtimeMarkup}\n</body>`);
  }

  return `${htmlWithFooter}\n${runtimeMarkup}`;
}

function buildHtmlSecurityHeaders(nonce) {
  return {
    ...buildBaseSecurityHeaders(),
    "Cache-Control": "no-store",
    "Content-Security-Policy": [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "script-src-attr 'none'",
      `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  };
}

function buildProxyRequestHeaders(req, extraHeaders = {}) {
  const headers = { ...req.headers, ...extraHeaders };

  for (const headerName of HOP_BY_HOP_HEADERS) {
    delete headers[headerName];
  }

  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (headerValue === undefined) {
      delete headers[headerName];
    }
  }

  return headers;
}

function normalizeIpAddress(value) {
  if (typeof value !== "string") return "";

  const trimmedValue = value.trim();
  if (!trimmedValue) return "";

  if (trimmedValue === "::1") return "127.0.0.1";
  if (trimmedValue.startsWith("::ffff:")) {
    const mappedIpv4 = trimmedValue.slice(7);
    if (net.isIP(mappedIpv4) === 4) {
      return mappedIpv4;
    }
  }

  return trimmedValue;
}

function isPrivateIpv4Address(ipAddress) {
  const octets = ipAddress.split(".").map((segment) => Number.parseInt(segment, 10));
  if (octets.length !== 4 || octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)) {
    return false;
  }

  if (octets[0] === 10) return true;
  if (octets[0] === 127) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  return false;
}

function isTrustedProxyAddress(ipAddress) {
  const normalizedIpAddress = normalizeIpAddress(ipAddress);
  if (!normalizedIpAddress) return false;

  const addressFamily = net.isIP(normalizedIpAddress);
  if (addressFamily === 4) {
    return isPrivateIpv4Address(normalizedIpAddress);
  }

  if (addressFamily === 6) {
    const lowerCaseIp = normalizedIpAddress.toLowerCase();
    return lowerCaseIp === "::1" || lowerCaseIp.startsWith("fc") || lowerCaseIp.startsWith("fd") || lowerCaseIp.startsWith("fe80:");
  }

  return false;
}

function extractFirstHeaderIp(value) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  if (typeof rawValue !== "string") return "";
  return normalizeIpAddress(rawValue.split(",")[0]);
}

function getTrustedClientIp(req) {
  const socketIp = normalizeIpAddress(String(req.socket?.remoteAddress || req.connection?.remoteAddress || "").trim());

  if (socketIp && isTrustedProxyAddress(socketIp)) {
    return extractFirstHeaderIp(req.headers["x-real-ip"]) || extractFirstHeaderIp(req.headers["x-forwarded-for"]) || socketIp;
  }

  return socketIp || extractFirstHeaderIp(req.headers["x-real-ip"]) || extractFirstHeaderIp(req.headers["x-forwarded-for"]) || "";
}

function proxyToApi(req, res, url) {
  const target = new URL(`${url.pathname}${url.search}`, API_PROXY_URL);
  const client = target.protocol === "https:" ? https : http;
  const trustedClientIp = getTrustedClientIp(req);

  const proxyReq = client.request(target, {
    method: req.method,
    headers: buildProxyRequestHeaders(req, {
      "x-forwarded-host": req.headers.host || "",
      "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
      "x-forwarded-for": trustedClientIp || undefined,
      "x-real-ip": trustedClientIp || undefined,
    }),
  }, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "API proxy request failed", detail: error.message }));
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let filePath = url.pathname;

  if (isApiRoute(url.pathname)) {
    proxyToApi(req, res, url);
    return;
  }

  if (filePath === "/" || filePath === "") {
    filePath = "/index.html";
  }

  const routeMap = {
    "/create-listing": "/create-listing.html",
    "/login": "/login.html",
    "/register": "/register.html",
  };

  if (routeMap[filePath]) {
    filePath = routeMap[filePath];
  }

  const fullPath = path.join(__dirname, "public", filePath);

  const extMap = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
  };

  const ext = path.extname(fullPath);
  const contentType = extMap[ext] || "text/plain";

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404);
        res.end("Page not found");
      } else {
        res.writeHead(500);
        res.end("Internal server error");
      }
      return;
    }

    if (contentType === "text/html") {
      const nonce = crypto.randomBytes(16).toString("base64");
      const html = injectNonceIntoHtml(injectRuntimeValuesIntoHtml(data.toString("utf8"), nonce), nonce);
      res.writeHead(200, {
        "Content-Type": `${contentType}; charset=utf-8`,
        ...buildHtmlSecurityHeaders(nonce),
      });
      res.end(html);
      return;
    }

    res.writeHead(200, {
      "Content-Type": contentType,
      ...buildBaseSecurityHeaders(),
    });
    res.end(data);
  });
});

server.listen(config.WEB_PORT, () => {
  console.log(`Frontend running at http://localhost:${config.WEB_PORT} (v${APP_VERSION})`);
});
