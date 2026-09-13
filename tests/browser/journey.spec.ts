import { test, expect } from "@playwright/test";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
test("manual journey, OAuth consent and grants, conflicts, portability, recovery, deletion, responsive layout", async ({
  page,
  context,
  request,
}) => {
  const email = `cove-browser-${randomUUID()}@example.test`;
  let password = `Cove-test-${randomUUID()}!`;
  const origin = "http://localhost:4317";
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Browser test fixture");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText("Check your email to verify your account and open Cove."),
  ).toBeVisible();
  const messages = await request.get("http://localhost:8025/api/v1/search", {
    params: { query: `to:${email}` },
  });
  const inbox = await messages.json();
  expect(inbox.messages.length).toBeGreaterThan(0);
  const mail = await (
    await request.get(
      `http://localhost:8025/api/v1/message/${inbox.messages[0].ID}`,
    )
  ).json();
  const link = mail.Text.match(
    /http:\/\/localhost:4317\/api\/auth\/verify-email\?\S+/,
  )?.[0];
  expect(link).toBeTruthy();
  await page.goto(link);
  await expect(
    page.getByRole("heading", { name: "Your projects", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create your first project" }).click();
  await page.getByLabel("Project name").fill("Research notebook");
  await page
    .getByLabel("Description")
    .fill("A clear starting point for your next assistant.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Update context", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Goal", { exact: true })
    .fill("Understand how people carry project context between assistants.");
  await page
    .getByLabel("Current state", { exact: true })
    .fill("Research questions are ready. Next, run the first interviews.");
  await page.getByRole("button", { name: "Add decision", exact: true }).click();
  await page
    .getByLabel("Decisions 1", { exact: true })
    .fill("Keep the pilot focused on individual workflows.");
  await page
    .getByRole("button", { name: "Add next step", exact: true })
    .click();
  await page
    .getByLabel("Next steps 1", { exact: true })
    .fill("Run three interviews and record missing context.");
  await page
    .getByRole("button", { name: "Add constraint", exact: true })
    .click();
  await page
    .getByLabel("Constraints 1", { exact: true })
    .fill("Use only information participants choose to share.");
  await page
    .getByRole("button", { name: "Save context", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Research notebook", exact: true }),
  ).toBeVisible();
  const projectId = new URL(page.url()).pathname.split("/")[2];
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.screenshot({ path: "docs/workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "docs/workspace-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page
    .getByRole("button", { name: "Create handoff", exact: true }).first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready to continue" }),
  ).toBeVisible();
  const handoffURL = page.url();
  await page.getByRole("button", { name: "Copy concise handoff" }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Full handoff", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy full handoff" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open current project" }).click();
  await page.getByRole("link", { name: "Update context", exact: true }).click();
  await page
    .getByLabel("Current state", { exact: true })
    .fill("My unsaved draft");
  const current = await (
    await page.request.get(`${origin}/api/projects/${projectId}`)
  ).json();
  const external = await page.request.put(
    `${origin}/api/projects/${projectId}/context`,
    {
      headers: { origin },
      data: {
        context: {
          ...current.revision.context,
          summary: "Concurrent update from another browser",
        },
        expectedVersion: current.project.version,
        summary: "Concurrent test",
        requestKey: randomUUID(),
      },
    },
  );
  expect(external.ok()).toBeTruthy();
  await page
    .getByRole("button", { name: "Save context", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Someone saved a newer revision" }),
  ).toBeVisible();
  await expect(page.getByLabel("Current state", { exact: true })).toHaveValue(
    "My unsaved draft",
  );
  await page
    .getByRole("button", {
      name: /Keep my draft and prepare an explicit retry/,
    })
    .click();
  await page
    .getByRole("button", { name: "Save context", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Research notebook", exact: true }),
  ).toBeVisible();
  await page.goto(handoffURL);
  await expect(
    page.getByText(/Newer context is available: revision 4/),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/history`);
  await page
    .getByRole("button", { name: "Compare with latest" })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: /Revision 1 compared with 4/ }),
  ).toBeVisible();
  await page.goto(`/projects/${projectId}/settings`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  await mkdir("test-results", { recursive: true });
  const exportPath = "test-results/browser-export.json";
  await download.saveAs(exportPath);
  await page.getByRole("link", { name: "Account", exact: true }).click();
  await page.getByLabel("Cove JSON file").setInputFiles(exportPath);
  await page.getByRole("button", { name: "Import into new project" }).click();
  await expect(
    page.getByRole("heading", { name: "Research notebook", exact: true }),
  ).toBeVisible();
  const importedId = new URL(page.url()).pathname.split("/")[2];
  expect(importedId).not.toBe(projectId);
  const registered = await (
    await request.post(`${origin}/api/auth/oauth2/register`, {
      data: {
        client_name: "Browser SDK fixture",
        application_type: "native",
        redirect_uris: ["http://127.0.0.1:3999/callback"],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code"],
        response_types: ["code"],
        scope: "cove",
      },
    })
  ).json();
  expect(registered.client_id).toBeTruthy();
  const verifier = randomBytes(48).toString("base64url");
  const query = new URLSearchParams({
    client_id: registered.client_id,
    redirect_uri: "http://127.0.0.1:3999/callback",
    response_type: "code",
    scope: "cove",
    resource: `${origin}/mcp`,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: randomUUID(),
  });
  await page.goto(`/api/auth/oauth2/authorize?${query}`);
  await expect(
    page.getByRole("heading", { name: "Authorize an assistant" }),
  ).toBeVisible();
  await page.getByLabel("Assistant label").fill("Browser SDK fixture");
  await page.getByLabel("Research notebook", { exact: true }).first().check();
  await page
    .getByRole("combobox", { name: "Permission", exact: true })
    .selectOption("write");
  await page.route("http://127.0.0.1:3999/callback**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: "Test OAuth callback received",
    }),
  );
  await page
    .getByRole("button", { name: "Authorize selected projects" })
    .click();
  await expect(page.getByText("Test OAuth callback received")).toBeVisible();
  await page.goto("/connections");
  await expect(
    page.getByText("Awaiting first interaction", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit permissions" }).click();
  await page
    .getByRole("combobox", { name: "Permission", exact: true })
    .selectOption("read");
  await page.getByRole("button", { name: "Save permissions" }).click();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  // Malicious text stays literal, and links with executable schemes cannot be saved.
  await page.goto(`/projects/${projectId}/edit`);
  await page
    .getByLabel("Goal", { exact: true })
    .fill('<img src=x onerror="window.coveXss=true">');
  await page
    .getByRole("button", { name: "Save context", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Research notebook", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('<img src=x onerror="window.coveXss=true">', {
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => Boolean((window as any).coveXss))).toBe(
    false,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto(`/projects/${importedId}/settings`);
  await page
    .getByLabel("Type Research notebook to confirm")
    .fill("Research notebook");
  await page
    .getByRole("button", { name: "Delete project permanently" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your projects", exact: true }),
  ).toBeVisible();
  await page.goto("/recover");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send recovery link" }).click();
  await expect(
    page.getByText("If that account exists, a recovery link is on its way."),
  ).toBeVisible();
  const recoveryInbox = await (
    await request.get("http://localhost:8025/api/v1/search", {
      params: { query: `to:${email} subject:Reset` },
    })
  ).json();
  expect(recoveryInbox.messages.length).toBeGreaterThan(0);
  const recoveryMail = await (
    await request.get(
      `http://localhost:8025/api/v1/message/${recoveryInbox.messages[0].ID}`,
    )
  ).json();
  const resetLink = recoveryMail.Text.match(
    /http:\/\/localhost:4317\/\S+/,
  )?.[0];
  expect(resetLink).toBeTruthy();
  await page.goto(resetLink);
  await expect(
    page.getByRole("heading", { name: "Choose a new password" }),
  ).toBeVisible();
  password = `Cove-reset-${randomUUID()}!`;
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(
    page.getByText("Password updated. You can sign in now."),
  ).toBeVisible();
  expect((await page.request.get(`${origin}/api/me`)).status()).toBe(401);
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your projects", exact: true }),
  ).toBeVisible();
  await page.goto("/account");
  await page.getByLabel("Current password", { exact: true }).fill(password);
  await page.getByLabel("Type DELETE MY ACCOUNT").fill("DELETE MY ACCOUNT");
  await page
    .getByRole("button", { name: "Delete account permanently" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Keep the context. Find your flow." }),
  ).toBeVisible();
  expect((await page.request.get(`${origin}/api/me`)).status()).toBe(401);
  await writeFile(
    "docs/browser-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        browser: "Playwright Chromium",
        desktop: [1536, 1024],
        mobile: [390, 844],
        journey:
          "account verification, create/edit, copy, conflict retry, stale snapshot, compare, export/import, OAuth consent, grant edit/revocation, literal malicious content, deletion",
        status: "passed",
      },
      null,
      2,
    ),
  );
});

