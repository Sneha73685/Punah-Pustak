import { expect, test } from "@playwright/test";

import { BACKEND_URL } from "./helpers/env";
import { countAdminActions, getUserIdByEmail, promoteUserToAdmin } from "./helpers/db";
import { createListingViaUi, loginViaUi, registerViaUi, submitLoginForm } from "./helpers/ui";
import { TEST_PASSWORD, uniqueEmail, uniqueTitle } from "./helpers/test-data";

/**
 * SRS §18.2/TEST-011 flow 2 — admin moderation: admin suspends a user →
 * that user's login is rejected → admin removes a listing with a reason
 * code → the listing disappears from public browse → both actions leave
 * an `AdminAction` row. Also covers the SRS §9/UC-6 non-goal a plain user
 * must never reach: an ordinary, non-suspended user attempting an
 * admin-only action, checked both at the UI (client-side guard) and the
 * API (the actual SEC-031 boundary).
 */
test.describe("admin moderation", () => {
  test("admin suspends a user, rejects their login, and removes their listing", async ({
    page,
    browser,
    request,
  }) => {
    const target = {
      email: uniqueEmail("target"),
      password: TEST_PASSWORD,
      displayName: "E2E Target Seller",
    };
    const admin = {
      email: uniqueEmail("admin"),
      password: TEST_PASSWORD,
      displayName: "E2E Admin",
    };
    const bystander = {
      email: uniqueEmail("bystander"),
      password: TEST_PASSWORD,
      displayName: "E2E Bystander",
    };
    const title = uniqueTitle("Admin Moderation Target Book");
    let listingId = "";

    await test.step("seed a normal user with a listing", async () => {
      const targetContext = await browser.newContext();
      const targetPage = await targetContext.newPage();
      await registerViaUi(targetPage, target);
      await loginViaUi(targetPage, { email: target.email, password: target.password });
      listingId = await createListingViaUi(targetPage, {
        title,
        author: "A. Moderated Author",
        description: "Seeded by the admin-moderation E2E spec.",
        category: "fiction",
        condition: "good",
        price: "8.00",
      });
      await targetContext.close();
    });

    await test.step("promote a second account to admin and log in as them", async () => {
      await registerViaUi(page, admin);
      promoteUserToAdmin(admin.email);
      await loginViaUi(page, { email: admin.email, password: admin.password });
      await page.getByRole("link", { name: "Admin", exact: true }).click();
      await page.waitForURL(/\/admin\/users$/);
    });

    await test.step("admin suspends the target user", async () => {
      const row = page.getByRole("row", { name: new RegExp(target.email) });
      await row.getByRole("button", { name: "Suspend" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Suspend ${target.email}`) });
      await dialog.getByLabel("Reason code").fill("e2e-suite: policy violation");
      await dialog.getByRole("button", { name: "Suspend" }).click();
      await expect(dialog).not.toBeVisible();
      await expect(row.getByText("Suspended")).toBeVisible();
      await expect(row.getByRole("button", { name: "Reinstate" })).toBeVisible();
    });

    await test.step("the suspended user's login attempt is rejected", async () => {
      const suspendedContext = await browser.newContext();
      const suspendedPage = await suspendedContext.newPage();
      const responsePromise = suspendedPage.waitForResponse(
        (response) =>
          response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
      );
      await submitLoginForm(suspendedPage, { email: target.email, password: target.password });
      const response = await responsePromise;
      expect(response.status()).toBe(401);
      await expect(suspendedPage).toHaveURL(/\/login$/);
      await expect(suspendedPage.getByRole("alert")).toBeVisible();
      await suspendedContext.close();
    });

    await test.step("a normal, non-admin user cannot reach admin-only actions", async () => {
      // UI guard: `ProtectedRoute`'s client-side check bounces a
      // non-admin, authenticated user back to "/".
      const bystanderContext = await browser.newContext();
      const bystanderPage = await bystanderContext.newPage();
      await registerViaUi(bystanderPage, bystander);
      await loginViaUi(bystanderPage, { email: bystander.email, password: bystander.password });
      await bystanderPage.goto("/admin/users");
      await expect(bystanderPage).toHaveURL("/");
      await bystanderContext.close();

      // The actual security boundary (SEC-031) is server-side — call the
      // real API directly with the bystander's own real access token and
      // confirm it is rejected there too, not only hidden by the UI.
      const loginResponse = await request.post(`${BACKEND_URL}/api/v1/auth/login`, {
        data: { email: bystander.email, password: bystander.password },
      });
      expect(loginResponse.ok()).toBe(true);
      const { access_token: accessToken } = (await loginResponse.json()) as {
        access_token: string;
      };
      const adminApiResponse = await request.get(`${BACKEND_URL}/api/v1/admin/users`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(adminApiResponse.status()).toBe(403);
    });

    await test.step("admin removes the listing, with a reason code", async () => {
      await page.getByRole("link", { name: "Listings", exact: true }).click();
      await page.waitForURL(/\/admin\/listings$/);
      const row = page.getByRole("row", { name: new RegExp(title) });
      await row.getByRole("button", { name: "Remove" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Remove "${title}"`) });
      await dialog.getByLabel("Reason code").fill("e2e-suite: policy violation");
      await dialog.getByRole("button", { name: "Remove" }).click();
      await expect(dialog).not.toBeVisible();
      await expect(row.getByText("Removed")).toBeVisible();
      await expect(row.getByRole("button", { name: "Remove" })).toHaveCount(0);
    });

    await test.step("the removed listing no longer appears in public browse", async () => {
      const guestContext = await browser.newContext();
      const guestPage = await guestContext.newPage();
      await guestPage.goto("/listings");
      await guestPage.getByLabel("Search").fill(title);
      await expect(guestPage.getByText("No books match your filters")).toBeVisible();
      await guestContext.close();
    });

    await test.step("both moderation actions produced an AdminAction row", async () => {
      const targetUserId = getUserIdByEmail(target.email);
      expect(countAdminActions("suspend_user", targetUserId)).toBe(1);
      expect(countAdminActions("remove_listing", listingId)).toBe(1);
    });
  });
});
