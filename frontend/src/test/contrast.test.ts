import { describe, expect, it } from "vitest";

import indexCss from "../index.css?raw";

/**
 * A11Y-002 / WCAG 2.1 AA regression guard for the "Copy Record" design
 * tokens: every token used as real content text (ink, ink-2, ballpoint,
 * danger) against every surface it is rendered on (the ground, the photo
 * field, white input fills), white text on the two filled button colours,
 * and WCAG 1.4.11's 3:1 for `rule-strong`, the boundary of every input and
 * control.
 *
 * This reads the actual token values out of `src/index.css`, the single
 * source of truth those tokens are defined in, imported via Vite's `?raw`
 * suffix (no new dependency and no Node built-ins, which this project's
 * tsconfig has no `@types/node` for), rather than hardcoding a second copy
 * of the hex values here, so a future edit to `index.css` is exactly what
 * this test is checking. The WCAG relative-luminance/contrast-ratio
 * formulas are reimplemented directly (no new dependency).
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
const WCAG_NON_TEXT = 3;
const WHITE = "#ffffff";

describe("WCAG AA contrast — design tokens", () => {
  const surfaces = (): [string, string][] => [
    ["ground", readToken("ground")],
    ["field", readToken("field")],
    ["field-hover", readToken("field-hover")],
    ["white", WHITE],
  ];

  for (const token of ["ink", "ink-2", "ballpoint", "danger"]) {
    it(`${token} meets 4.5:1 as text on every surface (ground, field, field-hover, white)`, () => {
      const colour = readToken(token);
      for (const [name, bg] of surfaces()) {
        expect(contrastRatio(colour, bg), `${token} (${colour}) vs ${name} (${bg})`).toBeGreaterThanOrEqual(
          WCAG_AA_NORMAL_TEXT,
        );
      }
    });
  }

  it("white button text meets 4.5:1 on ballpoint, ballpoint-deep (hover) and danger", () => {
    for (const token of ["ballpoint", "ballpoint-deep", "danger"]) {
      const bg = readToken(token);
      expect(contrastRatio(WHITE, bg), `white vs ${token} (${bg})`).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });

  it("ground text meets 4.5:1 on ink (the search button, the photo lightbox)", () => {
    expect(contrastRatio(readToken("ground"), readToken("ink"))).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it("rule-strong (every input and control boundary) meets 3:1 against the ground and white (WCAG 1.4.11)", () => {
    const rule = readToken("rule-strong");
    for (const bg of [readToken("ground"), WHITE]) {
      expect(contrastRatio(rule, bg), `rule-strong (${rule}) vs ${bg}`).toBeGreaterThanOrEqual(WCAG_NON_TEXT);
    }
  });
});
