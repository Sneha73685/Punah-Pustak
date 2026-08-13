import { expect, test } from "@playwright/test";

import { createListingViaUi, loginViaUi, registerViaUi } from "./helpers/ui";
import { TEST_PASSWORD, uniqueEmail, uniqueTitle } from "./helpers/test-data";

/**
 * SRS §18.2/TEST-011 flow 1 — the seller lifecycle, end to end through a
 * real browser against the real backend: register → login → create a
 * listing (with an image, since this environment's storage stack supports
 * it) → appears in My Listings and public browse → edit → mark sold →
 * confirm hidden from public browse → delete → confirm the owner can
 * still see it (My Listings + its own detail page) while a second,
 * non-owner browser session gets 404 on the same detail URL (the direct
 * regression check for the FR-006a fix).
 */
test.describe("seller lifecycle", () => {
  test("register, list, edit, sell, and delete a book, with FR-006a visibility enforced", async ({
    page,
    browser,
  }) => {
    const seller = {
      email: uniqueEmail("seller"),
      password: TEST_PASSWORD,
      displayName: "E2E Seller",
    };
    const title = uniqueTitle("The E2E Seller's Almanac");

    await test.step("register and log in", async () => {
      await registerViaUi(page, seller);
      await loginViaUi(page, { email: seller.email, password: seller.password });
      await expect(page).toHaveURL("/");
    });

    let listingId = "";
    await test.step("create a listing with an image", async () => {
      listingId = await createListingViaUi(page, {
        title,
        author: "A. E2E Author",
        description: "A book listed entirely by an automated browser test.",
        category: "fiction",
        condition: "good",
        price: "12.50",
        withImage: true,
      });
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      // The uploaded image is present and rendered, not just accepted —
      // `alt` text is `${title} by ${author}` per `ListingDetailPage`.
      await expect(page.getByRole("img", { name: new RegExp(title) })).toBeVisible();
    });

    await test.step("appears on My Listings", async () => {
      await page.goto("/my-listings");
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    });

    await test.step("appears in public browse", async () => {
      await page.goto("/listings");
      await page.getByLabel("Search").fill(title);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    });

    await test.step("edit the listing", async () => {
      await page.goto(`/listings/${listingId}`);
      await page.getByRole("button", { name: "Edit" }).click();
      await page.waitForURL(new RegExp(`/listings/${listingId}/edit$`));
      await page.getByLabel("Price").fill("19.99");
      await page.getByRole("button", { name: "Save changes" }).click();
      await page.waitForURL(new RegExp(`/listings/${listingId}$`));
      await expect(page.getByText("$19.99")).toBeVisible();
    });

    await test.step("mark as sold, then confirm hidden from public browse", async () => {
      await page.getByRole("button", { name: "Mark as sold" }).click();
      const dialog = page.getByRole("dialog", { name: "Mark this listing as sold?" });
      await dialog.getByRole("button", { name: "Mark as sold" }).click();
      await expect(dialog).not.toBeVisible();
      await expect(page.getByText("Status: sold")).toBeVisible();

      const guestContext = await browser.newContext();
      const guestPage = await guestContext.newPage();
      await guestPage.goto("/listings");
      await guestPage.getByLabel("Search").fill(title);
      await expect(guestPage.getByText("No books match your filters")).toBeVisible();
      await expect(guestPage.getByRole("heading", { name: title })).toHaveCount(0);
      await guestContext.close();
    });

    await test.step("delete, then confirm owner can still view it", async () => {
      await page.getByRole("button", { name: "Delete" }).click();
      const dialog = page.getByRole("dialog", { name: "Delete this listing?" });
      await dialog.getByRole("button", { name: "Delete" }).click();
      await page.waitForURL(/\/my-listings$/);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
      // Scoped to this listing's own card: "Removed" is ambiguous on this
      // page on its own (it's also the label on My Listings' status-count
      // summary card), but this listing's card is the one place both the
      // title and its status badge are guaranteed to appear together.
      const listingCard = page.getByRole("link", { name: new RegExp(title) });
      await expect(listingCard.getByText("Removed")).toBeVisible();

      // FR-006a: the owner's own detail view of a deleted listing is still
      // a full 200, never the 404 a stranger gets (checked next).
      await page.goto(`/listings/${listingId}`);
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    });

    await test.step("a second, non-owner session gets 404 on the same detail URL", async () => {
      const strangerContext = await browser.newContext();
      const strangerPage = await strangerContext.newPage();
      const responsePromise = strangerPage.waitForResponse((response) =>
        new RegExp(`/api/v1/listings/${listingId}$`).test(response.url()),
      );
      await strangerPage.goto(`/listings/${listingId}`);
      const response = await responsePromise;
      expect(response.status()).toBe(404);
      await expect(strangerPage.getByRole("alert")).toBeVisible();
      await strangerContext.close();
    });
  });
});
