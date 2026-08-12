import { describe, expect, it } from "vitest";

import indexCss from "../index.css?raw";

/**
 * A11Y-002 / WCAG 2.1 AA regression guard for the design tokens found to
 * fail contrast during the frontend-redesign remediation: `--color-ink-soft`
 * (used as real content text — `ListingCard`'s category/seller line,
 * `Footer`'s copyright line, `ListingDetailPage`'s "No image available",
 * `ImageUploadField`'s "Photo limit reached") and `--color-gold-600`
 * (`Badge`'s "warning" tone text, on `--color-gold-50`).
 *
 * This reads the actual token values out of `src/index.css` — the single
 * source of truth those tokens are defined in, imported via Vite's `?raw`
 * suffix (already-available tooling, no new dependency and no Node
 * built-ins, which this project's tsconfig has no `@types/node` for) —
 * rather than hardcoding a second copy of the hex values here, so a
 * future edit to `index.css` is exactly what this test is checking, not
 * something it could drift out of sync with. The WCAG relative-luminance/
 * contrast-ratio formulas are reimplemented directly (no new dependency)
 * since this project has no color-contrast library today and these
 * formulas are small, stable, and unlikely to need maintenance.
 */

function readToken(name: string): string {
  const match = indexCss.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) {
    throw new Error(`Token --color-${name} not found in src/index.css`);
  }
  return match[1];
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const [R, G, B] = [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** WCAG 2.1 contrast ratio, 1:1 to 21:1. */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [lighter, darker] = lA >= lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

describe("WCAG AA contrast — design tokens used as real content text", () => {
  it("ink-soft meets 4.5:1 against every surface it's rendered on (white, paper, paper-muted)", () => {
    const inkSoft = readToken("ink-soft");
    const white = "#ffffff";
    const paper = readToken("paper");
    const paperMuted = readToken("paper-muted");

    for (const [name, bg] of [
      ["white", white],
      ["paper", paper],
      ["paper-muted", paperMuted],
    ] as const) {
      expect(
        contrastRatio(inkSoft, bg),
        `ink-soft (${inkSoft}) vs ${name} (${bg})`,
      ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("gold-600 meets 4.5:1 against gold-50 (Badge's warning tone)", () => {
    const goldText = readToken("gold-600");
    const goldBg = readToken("gold-50");

    expect(
      contrastRatio(goldText, goldBg),
      `gold-600 (${goldText}) vs gold-50 (${goldBg})`,
    ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("ink-muted (never regressed, kept here as a control) still meets 4.5:1", () => {
    const inkMuted = readToken("ink-muted");
    const white = "#ffffff";

    expect(contrastRatio(inkMuted, white)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });
});
