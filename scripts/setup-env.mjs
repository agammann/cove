import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
function createEnvironment() {
  // Preserve existing entries, including dangling links, without opening them.
  try {
    lstatSync(".env");
    return false;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const template = readFileSync(".env.example", "utf8");
  if (
    !/^DATABASE_URL=\r?$/m.test(template) ||
    !/^POSTGRES_PASSWORD=\r?$/m.test(template)
  )
    throw new Error(
      ".env.example must contain empty database credential fields",
    );
  const dbPassword = randomBytes(32).toString("base64url");
  const content = template
    .replace(
      /^DATABASE_URL=\r?$/m,
      `DATABASE_URL=postgresql://cove:${dbPassword}@localhost:55439/cove`,
    )
    .replace(/^POSTGRES_PASSWORD=\r?$/m, `POSTGRES_PASSWORD=${dbPassword}`)
    .replace(
      "replace-with-at-least-32-random-characters",
      randomBytes(48).toString("base64url"),
    );
  let descriptor;
  try {
    descriptor = openSync(".env", "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  }
  try {
    writeFileSync(descriptor, content);
    fsyncSync(descriptor);
  } catch {
    // A failed file stays available for inspection. Never unlink a shared name
    // that another process might have replaced after this handle was opened.
    throw Error(
      "Could not finish .env. Inspect the local file before running setup again.",
    );
  } finally {
    closeSync(descriptor);
  }
  return true;
}
if (createEnvironment()) {
  console.log(
    "Created local .env with random session and database credentials. Do not commit it.",
  );
} else console.log("Existing .env preserved.");
