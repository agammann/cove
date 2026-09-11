import { get } from "node:http";
// node:http preserves the canonical Host header used by the application guard.
// Node's fetch implementation may replace a caller-supplied Host header.
const request = get(
  {
    hostname: "127.0.0.1",
    port: Number(process.env.PORT || 4317),
    path: "/health/ready",
    headers: { Host: new URL(process.env.APP_URL!).host },
    timeout: 4000,
  },
  (response) => {
    response.resume();
    process.exitCode = response.statusCode === 200 ? 0 : 1;
  },
);
request.on("timeout", () => request.destroy());
request.on("error", () => {
  process.exitCode = 1;
});
