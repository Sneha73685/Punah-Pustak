import { expect, test } from "@playwright/test";

import { expectNoAccessibilityViolations } from "./helpers/a11y";
import { promoteUserToAdmin } from "./helpers/db";
import { createListingViaUi, loginViaUi, registerViaUi, submitLoginForm } from "./helpers/ui";
import { TEST_PASSWORD, uniqueEmail, uniqueTitle } from "./helpers/test-data";

/**
 * SRS §A11Y-007 — an automated WCAG 2.1 AA regression gate, run with
 * axe-core against the real rendered app (never source markup in
 * isolation), covering the full gated page set A11Y-007 names (browse,
 * listing detail, create-listing, login, registration, password-change)
 * plus the rest of FE-002's route list and the meaningfully distinct UI
 * states each page can be in (empty, populated, validation error,
 * authenticated nav, a modal open, mobile nav).
 *
 * Split into two tests, mirroring `seller-lifecycle.spec.ts` /
 * `admin-moderation.spec.ts`'s division: one seller-facing journey (also
 * covering every unauthenticated page, since there is no separate account
 * to seed for those) and one admin-facing journey, each seeding its own
 * data so either can run alone. File name sorts before the other specs
 * (`a11y` < `account-recovery`/`admin-moderation`/`seller-lifecycle`), so
 * with this suite's `workers: 1` config it runs first against a database
 * with no other spec's listings yet — the empty-state checks below run
 * before this file creates any data of its own, and stay correct
 * regardless of whether that ordering assumption ever changes, since they
 * only assert on a specific "no results" empty state, not absence of any
 * other spec's data.
 */
test.describe("accessibility (WCAG 2.1 AA, axe-core)", () => {
  test("public and seller-authenticated pages have no violations", async ({ page }, testInfo) => {
    const seller = {
      email: uniqueEmail("a11y-seller"),
      password: TEST_PASSWORD,
      displayName: "A11y Seller",
    };
    const title = uniqueTitle("Accessibility Test Almanac");

    await test.step("home page — unauthenticated, empty catalog", async () => {
      await page.goto("/");
      await expectNoAccessibilityViolations(page, testInfo, "home-unauth-empty");
    });

    await test.step("browse page — unauthenticated, empty results", async () => {
      await page.goto("/listings");
      await expect(page.getByText("No books match your filters")).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "browse-empty");
    });

    await test.step("login page — default state", async () => {
      await page.goto("/login");
      await expectNoAccessibilityViolations(page, testInfo, "login-default");
    });

    await test.step("login page — field validation error", async () => {
      // A malformed email is a 422 from the backend's `EmailStr` field
      // validation, mapped to a field-level error (`aria-describedby` +
      // `role="alert"`, A11Y-003) rather than the plain form-level alert a
      // wrong-password 401 would produce.
      await submitLoginForm(page, { email: "not-an-email", password: "irrelevant" });
      await expect(page.getByRole("alert")).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "login-validation-error");
    });

    await test.step("register page — default state", async () => {
      await page.goto("/register");
      await expectNoAccessibilityViolations(page, testInfo, "register-default");
    });

    await test.step("register page — client-side validation error", async () => {
      await page.getByLabel("Display name").fill(seller.displayName);
      await page.getByLabel("Email").fill(uniqueEmail("a11y-unused"));
      await page.getByLabel("Password").fill("short");
      await page.locator("#main-content").getByRole("button", { name: "Register" }).click();
      await expect(page.getByText(/at least 10 characters/i)).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "register-validation-error");
    });

    await test.step("register page — success state", async () => {
      await registerViaUi(page, seller);
      await expectNoAccessibilityViolations(page, testInfo, "register-success");
    });

    await test.step("log in as the seller", async () => {
      await loginViaUi(page, { email: seller.email, password: seller.password });
      await expect(page).toHaveURL("/");
    });

    await test.step("create-listing page — default state", async () => {
      await page.goto("/listings/new");
      await expectNoAccessibilityViolations(page, testInfo, "create-listing-default");
    });

    await test.step("create-listing page — client-side validation error", async () => {
      await page.locator("#main-content").getByRole("button", { name: "Create listing" }).click();
      await expect(page.getByText("Title is required.")).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "create-listing-validation-error");
    });

    await test.step("my listings page — empty state", async () => {
      await page.goto("/my-listings");
      await expect(page.getByText("You haven't listed anything yet")).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "my-listings-empty");
    });

    let listingId = "";
    await test.step("create a listing", async () => {
      listingId = await createListingViaUi(page, {
        title,
        author: "A. Accessibility Author",
        description: "Seeded by the accessibility E2E spec.",
        category: "fiction",
        condition: "good",
        price: "9.00",
        withImage: true,
      });
    });

    await test.step("listing detail page — populated, owner view", async () => {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "listing-detail-owner");
    });

    await test.step("listing detail page — confirmation modal open", async () => {
      // Exercises the shared `Modal` component (A11Y-004: `role="dialog"`,
      // `aria-modal`, `aria-labelledby`, focus trap) in its open state.
      await page.getByRole("button", { name: "Delete" }).click();
      const dialog = page.getByRole("dialog", { name: "Delete this listing?" });
      await expect(dialog).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "listing-detail-delete-modal");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible();
    });

    await test.step("my listings page — populated state", async () => {
      await page.goto("/my-listings");
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "my-listings-populated");
    });

    await test.step("browse page — populated, authenticated", async () => {
      await page.goto("/listings");
      await page.getByLabel("Search").fill(title);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "browse-populated");
    });

    await test.step("home page — populated, authenticated nav", async () => {
      await page.goto("/");
      await expectNoAccessibilityViolations(page, testInfo, "home-populated-authenticated");
    });

    await test.step("profile page", async () => {
      await page.goto("/profile");
      await expectNoAccessibilityViolations(page, testInfo, "profile");
    });

    await test.step("mobile navigation — menu open", async () => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.goto("/");
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.locator("#mobile-nav")).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "mobile-nav-open");
    });
  });

  test("admin pages have no violations", async ({ page, browser }, testInfo) => {
    const member = {
      email: uniqueEmail("a11y-member"),
      password: TEST_PASSWORD,
      displayName: "A11y Member",
    };
    const admin = {
      email: uniqueEmail("a11y-admin"),
      password: TEST_PASSWORD,
      displayName: "A11y Admin",
    };
    const title = uniqueTitle("Accessibility Admin Target Book");

    await test.step("seed a member with a listing", async () => {
      const memberContext = await browser.newContext();
      const memberPage = await memberContext.newPage();
      await registerViaUi(memberPage, member);
      await loginViaUi(memberPage, { email: member.email, password: member.password });
      await createListingViaUi(memberPage, {
        title,
        author: "A. Admin Target Author",
        description: "Seeded by the accessibility E2E spec's admin test.",
        category: "fiction",
        condition: "good",
        price: "7.00",
      });
      await memberContext.close();
    });

    await test.step("register and promote an admin, then log in", async () => {
      await registerViaUi(page, admin);
      promoteUserToAdmin(admin.email);
      await loginViaUi(page, { email: admin.email, password: admin.password });
      await page.getByRole("link", { name: "Admin", exact: true }).click();
      await page.waitForURL(/\/admin\/users$/);
    });

    await test.step("admin users page — populated", async () => {
      await expect(page.getByRole("row", { name: new RegExp(member.email) })).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "admin-users-populated");
    });

    await test.step("admin users page — suspend confirmation modal open", async () => {
      const row = page.getByRole("row", { name: new RegExp(member.email) });
      await row.getByRole("button", { name: "Suspend" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Suspend ${member.email}`) });
      await expect(dialog).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "admin-suspend-modal");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible();
    });

    let temporaryPassword = "";
    await test.step("admin resets the member's password", async () => {
      const row = page.getByRole("row", { name: new RegExp(member.email) });
      await row.getByRole("button", { name: "Reset password" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Reset password for ${member.email}`) });
      await dialog.getByRole("button", { name: "Reset password" }).click();
      const text = await dialog.locator("p.font-mono").textContent();
      expect(text).toBeTruthy();
      temporaryPassword = (text ?? "").trim();
      await dialog.getByRole("button", { name: "Done" }).click();
      await expect(dialog).not.toBeVisible();
    });

    await test.step("change-password page — the forced password-change form (A11Y-007)", async () => {
      // A11Y-007 explicitly names this page in the gated set — reached, as
      // in production, only via the real admin-reset -> forced-change
      // flow (see `account-recovery.spec.ts`), not by navigating directly.
      const memberContext = await browser.newContext();
      const memberPage = await memberContext.newPage();
      await submitLoginForm(memberPage, { email: member.email, password: temporaryPassword });
      await memberPage.waitForURL(/\/change-password$/);
      await expectNoAccessibilityViolations(memberPage, testInfo, "change-password-default");

      // `PasswordChangeForm`'s own client-side minimum-length check (< 10
      // chars) — no server round trip, so this can't disturb the account's
      // real temporary password for the next step.
      await memberPage.getByLabel("Temporary password").fill(temporaryPassword);
      await memberPage.getByLabel("New password").fill("short");
      await memberPage.getByRole("button", { name: "Change password" }).click();
      await expect(memberPage.getByText(/at least 10 characters/i)).toBeVisible();
      await expectNoAccessibilityViolations(memberPage, testInfo, "change-password-validation-error");
      await memberContext.close();
    });

    await test.step("admin listings page — populated", async () => {
      await page.getByRole("link", { name: "Listings", exact: true }).click();
      await page.waitForURL(/\/admin\/listings$/);
      await expect(page.getByRole("row", { name: new RegExp(title) })).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "admin-listings-populated");
    });

    await test.step("admin listings page — remove confirmation modal open", async () => {
      const row = page.getByRole("row", { name: new RegExp(title) });
      await row.getByRole("button", { name: "Remove" }).click();
      const dialog = page.getByRole("dialog", { name: new RegExp(`Remove "${title}"`) });
      await expect(dialog).toBeVisible();
      await expectNoAccessibilityViolations(page, testInfo, "admin-remove-modal");
      await dialog.getByRole("button", { name: "Cancel" }).click();
      await expect(dialog).not.toBeVisible();
    });
  });
});
