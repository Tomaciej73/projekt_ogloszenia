const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const net = require("net");
const { config } = require("./runtime-config");
const { APP_VERSION } = require("@multiportal/config/app-version");

const API_PROXY_URL = config.API_PROXY_URL;
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

function buildVisitorCounterMarkup(nonce) {
  return `
  <div
    id="globalVisitorCounterDock"
    aria-live="polite"
    style="position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;justify-content:flex-end;align-items:flex-end;padding:0 max(1rem, env(safe-area-inset-right)) max(1rem, env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left));pointer-events:none;visibility:hidden;"
  >
    <div
      id="globalVisitorCounter"
      style="display:inline-flex;align-items:center;justify-content:flex-end;max-width:min(100%, 22rem);text-align:right;white-space:nowrap;"
    >Visitors: --</div>
  </div>
  <script nonce="${nonce}">
    (function () {
      const visitorCounterDock = document.getElementById("globalVisitorCounterDock");
      const visitorCounter = document.getElementById("globalVisitorCounter");
      if (!visitorCounterDock || !visitorCounter) return;
      const footer = document.querySelector("footer");
      const footerStyles = footer ? window.getComputedStyle(footer) : null;

      if (footerStyles) {
        visitorCounterDock.style.paddingRight = footerStyles.paddingRight;
        visitorCounterDock.style.paddingBottom = footerStyles.paddingBottom;
        visitorCounterDock.style.paddingLeft = footerStyles.paddingLeft;
        visitorCounter.style.color = footerStyles.color;
        visitorCounter.style.fontSize = footerStyles.fontSize;
        visitorCounter.style.fontFamily = footerStyles.fontFamily;
        visitorCounter.style.fontWeight = footerStyles.fontWeight;
        visitorCounter.style.letterSpacing = footerStyles.letterSpacing;
        visitorCounter.style.lineHeight = footerStyles.lineHeight;
      } else {
        visitorCounterDock.style.paddingRight = "1rem";
        visitorCounterDock.style.paddingBottom = "1rem";
        visitorCounterDock.style.paddingLeft = "1rem";
        visitorCounter.style.color = "rgba(255,255,255,0.3)";
        visitorCounter.style.fontSize = "0.85rem";
        visitorCounter.style.fontFamily = "system-ui, -apple-system, sans-serif";
        visitorCounter.style.fontWeight = "400";
        visitorCounter.style.letterSpacing = "normal";
        visitorCounter.style.lineHeight = "1.4";
      }

      visitorCounterDock.style.visibility = "visible";

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

function injectRuntimeValuesIntoHtml(html, nonce) {
  const htmlWithVersion = html.replaceAll("__APP_VERSION__", APP_VERSION);
  if (htmlWithVersion.includes('id="globalVisitorCounter"')) {
    return htmlWithVersion;
  }

  const visitorCounterMarkup = buildVisitorCounterMarkup(nonce);
  if (htmlWithVersion.includes("</body>")) {
    return htmlWithVersion.replace("</body>", `${visitorCounterMarkup}\n</body>`);
  }

  return `${htmlWithVersion}\n${visitorCounterMarkup}`;
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
