import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (existsSync(".env")) console.log("Existing .env preserved.");
else {
  writeFileSync(
    ".env",
    readFileSync(".env.example", "utf8").replace(
      "replace-with-at-least-32-random-characters",
      randomBytes(48).toString("base64url"),
    ),
    { mode: 0o600 },
  );
  console.log(
    "Created local .env with a random session secret. Do not commit it.",
  );
}
