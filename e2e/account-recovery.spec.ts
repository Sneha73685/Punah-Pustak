import { expect, test } from "@playwright/test";

import { promoteUserToAdmin } from "./helpers/db";
import { loginViaUi, registerViaUi, submitLoginForm } from "./helpers/ui";
import { TEST_PASSWORD, uniqueEmail } from "./helpers/test-data";

/**
 * SRS §18.2/TEST-011 flow 3 — account recovery. §15.6 is explicit that
 * v2.1.0 has no self-service email flow by design (NG-9): the only
 * "account recovery" this product implements is admin-assisted reset
 * (FR-045/UC-7), so that is exactly what this spec drives — never an
 * invented email provider. Covers the full loop: admin triggers a reset →
 * user logs in with the one-time temporary password → FR-015's forced
 * password-change screen blocks every other authenticated route until
 * it's completed → the new password works normally afterward.
 */
test.describe("account recovery", () => {
  test("admin-assisted password reset forces a password change before anything else", async ({
    page,
    browser,
  }) => {
    const user = {
      email: uniqueEmail("recovery-user"),
      password: TEST_PASSWORD,
      displayName: "E2E Recovery User",
    };
    const admin = {
      email: uniqueEmail("recovery-admin"),
      password: TEST_PASSWORD,
      displayName: "E2E Recovery Admin",
    };
    const newPassword = `${TEST_PASSWORD}-new`;

    await test.step("seed the user who will need recovery", async () => {
      await registerViaUi(page, user);
    });

    let temporaryPassword = "";
    await test.step("admin triggers a password reset for that user", async () => {
      await registerViaUi(page, admin);
      promoteUserToAdmin(admin.email);
      await loginViaUi(page, { email: admin.email, password: admin.password });
      await page.getByRole("link", { name: "Admin", exact: true }).click();
      await page.waitForURL(/\/admin\/users$/);

      const row = page.getByRole("row", { name: new RegExp(user.email) });
      await row.getByRole("button", { name: "Reset password" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Reset password for ${user.email}`) });
      await dialog.getByRole("button", { name: "Reset password" }).click();

      const temporaryPasswordText = await dialog.locator("p.font-mono").textContent();
      expect(temporaryPasswordText).toBeTruthy();
      temporaryPassword = (temporaryPasswordText ?? "").trim();
      await dialog.getByRole("button", { name: "Done" }).click();
      await expect(dialog).not.toBeVisible();
    });

    // A fresh, unauthenticated session for the user — the admin above and
    // this user are different people in the real flow.
    const userContext = await browser.newContext();
    const userPage = await userContext.newPage();

    await test.step("the user logs in with the temporary password and is forced to change it", async () => {
      await submitLoginForm(userPage, { email: user.email, password: temporaryPassword });
      await userPage.waitForURL(/\/change-password$/);
      await expect(userPage.getByRole("heading", { name: "Change your password" })).toBeVisible();
    });

    await test.step("cannot navigate elsewhere until the password is changed", async () => {
      await userPage.goto("/profile");
      await expect(userPage).toHaveURL(/\/change-password$/);
    });

    await test.step("completing the change lands back on the home page", async () => {
      await userPage.getByLabel("Temporary password").fill(temporaryPassword);
      await userPage.getByLabel("New password").fill(newPassword);
      await userPage.getByRole("button", { name: "Change password" }).click();
      await userPage.waitForURL((url) => url.pathname === "/");
    });

    await test.step("the new password works for a normal login afterward", async () => {
      await userPage.getByRole("button", { name: "Log out" }).click();
      await userPage.waitForURL(/\/login$/);
      await loginViaUi(userPage, { email: user.email, password: newPassword });
      await expect(userPage).toHaveURL("/");
    });

    await userContext.close();
  });
});
