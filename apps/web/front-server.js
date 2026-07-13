const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

function injectRuntimeValuesIntoHtml(html) {
  return html.replaceAll("__APP_VERSION__", APP_VERSION);
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

function proxyToApi(req, res, url) {
  const target = new URL(`${url.pathname}${url.search}`, API_PROXY_URL);
  const client = target.protocol === "https:" ? https : http;

  const proxyReq = client.request(target, {
    method: req.method,
    headers: buildProxyRequestHeaders(req, {
      "x-forwarded-host": req.headers.host || "",
      "x-forwarded-proto": req.headers["x-forwarded-proto"] || "http",
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
      const html = injectNonceIntoHtml(injectRuntimeValuesIntoHtml(data.toString("utf8")), nonce);
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
