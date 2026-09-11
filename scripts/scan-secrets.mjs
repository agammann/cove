import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{30,}/,
  /sk-(proj-)?[A-Za-z0-9_-]{40,}/,
  /AKIA[0-9A-Z]{16}/,
];
const failures = [];
for (const f of files) {
  if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".env.example")) {
    failures.push(f);
    continue;
  }
  if (/\.(png|jpg|zip|dump)$/.test(f)) continue;
  const text = readFileSync(f, "utf8");
  if (patterns.some((p) => p.test(text))) failures.push(f);
}
if (failures.length) {
  console.error("Possible secrets in:", ...failures);
  process.exit(1);
}
console.log(
  `Secret-pattern scan passed for ${files.length} source files. This is a bounded pattern scan, not a guarantee.`,
);
