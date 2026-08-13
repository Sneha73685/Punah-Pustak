import path from "node:path";
import { expect, type Page } from "@playwright/test";

const TEST_IMAGE_PATH = path.join(__dirname, "..", "fixtures", "test-image.jpg");

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

/** §8.2: registration does not log the user in — drives the real
 * register → success card → "log in" link flow, matching what a real
 * visitor does, rather than skipping straight to an API call. */
export async function registerViaUi(page: Page, input: RegisterInput): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Display name").fill(input.displayName);
  await page.getByLabel("Email").fill(input.email);
  // Not `{ exact: true }`: `getByLabel` matches a `<label>`'s raw
  // `textContent`, which includes the visually-`aria-hidden` "*"
  // required-marker ("Password*") — unlike the accessible-name
  // computation, which correctly excludes it. A plain substring match is
  // safe here because Register/Login each have exactly one field whose
  // label contains "Password".
  await page.getByLabel("Password").fill(input.password);
  // Scoped to the page's main content: the unauthenticated nav also has a
  // "Register" button (navigates to this same page), so an unscoped
  // `getByRole("button", { name: "Register" })` is ambiguous (matches both).
  await page.locator("#main-content").getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Account created" })).toBeVisible();
}

export interface LoginInput {
  email: string;
  password: string;
}

/** Submits the login form and returns once the request has resolved
 * (success or failure) — deliberately does not assert an outcome, since
 * callers need this for both "login succeeds" and "login is rejected"
 * (suspended user, TEST-011 flow 2) cases. */
export async function submitLoginForm(page: Page, input: LoginInput): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(input.email);
  // Not `{ exact: true }`: `getByLabel` matches a `<label>`'s raw
  // `textContent`, which includes the visually-`aria-hidden` "*"
  // required-marker ("Password*") — unlike the accessible-name
  // computation, which correctly excludes it. A plain substring match is
  // safe here because Register/Login each have exactly one field whose
  // label contains "Password".
  await page.getByLabel("Password").fill(input.password);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/api/v1/auth/login") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Log in" }).click();
  await responsePromise;
}

/** Logs in and waits for the app to leave `/login` — only valid for a
 * login that is expected to succeed (lands on `/`, or `/change-password`
 * for a forced-change account per FR-015). */
export async function loginViaUi(page: Page, input: LoginInput): Promise<void> {
  await submitLoginForm(page, input);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export interface ListingFormInput {
  title: string;
  author: string;
  description: string;
  category: string;
  condition: string;
  price: string;
  withImage?: boolean;
}

/** Fills and submits the shared `ListingForm` (create or edit — both use
 * identical field labels), including the optional image-upload step,
 * matching FR-020's "create a listing with 1-6 images" end to end when the
 * environment supports storage (the Docker Compose stack always does —
 * `storage`/`storage-init`). */
async function fillListingForm(page: Page, input: ListingFormInput): Promise<void> {
  await page.getByLabel("Title").fill(input.title);
  await page.getByLabel("Author").fill(input.author);
  await page.getByLabel("Description").fill(input.description);
  await page.getByLabel("Category").selectOption(input.category);
  await page.getByLabel("Condition").selectOption(input.condition);
  await page.getByLabel("Price").fill(input.price);
  if (input.withImage) {
    await page.locator("#listing-images").setInputFiles(TEST_IMAGE_PATH);
  }
}

/** Navigates to "Sell a book", fills the form, submits, and returns the
 * new listing's id parsed off the post-create redirect URL
 * (`/listings/{id}`, per `CreateListingPage`'s `navigate` call). */
export async function createListingViaUi(page: Page, input: ListingFormInput): Promise<string> {
  await page.goto("/listings/new");
  await fillListingForm(page, input);
  await page.getByRole("button", { name: "Create listing" }).click();
  await page.waitForURL(/\/listings\/[0-9a-fA-F-]{36}$/);
  const match = /\/listings\/([0-9a-fA-F-]{36})$/.exec(new URL(page.url()).pathname);
  if (!match) {
    throw new Error(`Could not parse listing id from URL: ${page.url()}`);
  }
  return match[1];
}
