const http = require("http");

const port = Number.parseInt(process.env.API_PORT || "3001", 10);

const req = http.request({
  host: "127.0.0.1",
  port,
  path: "/health",
  method: "GET",
  timeout: 5000,
}, (res) => {
  res.resume();
  process.exit(res.statusCode === 200 ? 0 : 1);
});

req.on("timeout", () => {
  req.destroy(new Error("Timed out waiting for the API health endpoint."));
});

req.on("error", () => {
  process.exit(1);
});

req.end();
