// Uses Cove's local Compose network and a uniquely named disposable database.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
const suffix = Date.now();
const database = `cove_container_${suffix}`;
const container = `cove-smoke-${suffix}`;
const envFile = `.env.container-${suffix}`;
const run = (args, allowFailure = false) =>
  new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 || allowFailure
        ? resolve({ code, output })
        : reject(new Error(output)),
    );
  });
const baseArgs = ["--rm", "--network", "cove_default", "--env-file", envFile];
let created = false;
let result;
try {
  await writeFile(
    envFile,
    [
      "NODE_ENV=production",
      "PORT=4317",
      "APP_URL=https://cove-smoke.example.test",
      `DATABASE_URL=postgresql://cove:cove-local-only@db:5432/${database}`,
      `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}`,
      "SMTP_HOST=mail",
      "SMTP_PORT=1025",
      "SMTP_SECURE=false",
      "SMTP_USER=synthetic-fixture",
      "SMTP_PASSWORD=synthetic-fixture",
      "SMTP_FROM=fixture@example.test",
      "TRUST_PROXY=false",
    ].join("\n"),
    { mode: 0o600 },
  );
  await run([
    "compose",
    "exec",
    "-T",
    "db",
    "psql",
    "-U",
    "cove",
    "-d",
    "cove",
    "-c",
    `CREATE DATABASE ${database};`,
  ]);
  created = true;
  await run([
    "run",
    ...baseArgs,
    "cove:0.1.0",
    "node",
    "dist/packages/database/migrate.js",
  ]);
  await run([
    "run",
    "-d",
    "--name",
    container,
    ...baseArgs,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "cove:0.1.0",
  ]);
  const verify = `import {get} from 'node:http';const read=(path,host='cove-smoke.example.test')=>new Promise((resolve,reject)=>{get({hostname:'127.0.0.1',port:4317,path,headers:{Host:host}},r=>{let body='';r.on('data',b=>body+=b);r.on('end',()=>resolve({status:r.statusCode,body}));}).on('error',reject);});for(const path of ['/health/live','/health/ready','/']){const r=await read(path);if(r.status!==200)throw Error(path+' status '+r.status);if(path==='/'&&!r.body.includes('/assets/'))throw Error('Frontend unavailable');}if((await read('/health/live','untrusted.example')).status!==400)throw Error('Host guard failed');if(process.getuid()===0)throw Error('Unexpected root user');`;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    const check = await run(
      ["exec", container, "node", "--input-type=module", "-e", verify],
      true,
    );
    if (check.code === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready) throw new Error("Production container smoke failed");
  await run(["exec", container, "node", "dist/apps/api/healthcheck.js"]);
  await run(["restart", container]);
  let restarted = false;
  for (let i = 0; i < 30; i++) {
    if (
      (
        await run(
          ["exec", container, "node", "--input-type=module", "-e", verify],
          true,
        )
      ).code === 0
    ) {
      restarted = true;
      break;
    }
    await delay(500);
  }
  if (!restarted) throw new Error("Production container restart failed");
  const rejected = await run(
    ["run", ...baseArgs, "-e", "DEMO_AUTH=true", "cove:0.1.0"],
    true,
  );
  if (
    rejected.code === 0 ||
    !rejected.output.includes("Production requires HTTPS")
  )
    throw new Error("Production did not reject insecure demo settings");
  const image = await run([
    "image",
    "inspect",
    "cove:0.1.0",
    "--format",
    "{{.Id}}",
  ]);
  result = {
    checkedAt: new Date().toISOString(),
    image: image.output.trim(),
    freshDatabaseMigration: "passed",
    productionHealthAndFrontend: "passed",
    hostValidation: "passed",
    nonRootReadOnlyContainer: "passed",
    restart: "passed",
    insecureDemoRejected: "passed",
    publicDeployment: false,
    disposableResourcesRemoved: true,
  };
} finally {
  await run(["rm", "-f", container], true);
  if (created)
    await run([
      "compose",
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "cove",
      "-d",
      "cove",
      "-c",
      `DROP DATABASE ${database} WITH (FORCE);`,
    ]);
  await unlink(envFile).catch(() => {});
}
await writeFile(
  "docs/container-verification.json",
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
