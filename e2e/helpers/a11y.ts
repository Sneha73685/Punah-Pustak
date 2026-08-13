import AxeBuilder from "@axe-core/playwright";
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * SRS §A11Y-007: axe-core, run against the real rendered app (never source
 * markup in isolation), scoped to WCAG 2.1 A/AA — the exact conformance
 * target A11Y-001 sets. `best-practice` is deliberately excluded: those
 * rules flag opinionated authoring conventions with no WCAG success
 * criterion behind them, and gating a required CI check on them would fail
 * builds over things that are not actually the compliance target.
 */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export interface AccessibilityCheckOptions {
  /** CSS selectors to exclude from the scan (e.g. third-party embeds this
   * app has no control over). Use sparingly and only with a documented
   * reason at the call site — this is not a place to silence real findings. */
  exclude?: string[];
}

/**
 * Runs axe-core against the current page state and asserts zero violations
 * among the WCAG 2.1 A/AA rule set. `label` identifies which page/state this
 * check covers (e.g. "home-empty", "login-validation-error") — it names the
 * attached JSON result and appears in the failure message, since a single
 * spec runs this dozens of times across different pages and states and a
 * bare "violations found" would not say which one failed.  On failure, the
 * assertion message lists every violation's rule id, impact, help text, and
 * affected selectors, and the full JSON result is attached to the test
 * report so a CI failure is debuggable without re-running locally.
 */
export async function expectNoAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  label: string,
  options: AccessibilityCheckOptions = {},
): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (options.exclude) {
    for (const selector of options.exclude) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  await testInfo.attach(`axe-results-${label}`, {
    body: JSON.stringify(results, null, 2),
    contentType: "application/json",
  });

  if (results.violations.length === 0) {
    return;
  }

  const summary = results.violations
    .map((violation) => {
      const targets = violation.nodes.map((node) => `    - ${node.target.join(" ")}`).join("\n");
      return `[${violation.impact ?? "unknown"}] ${violation.id}: ${violation.help}\n${targets}`;
    })
    .join("\n\n");

  expect(results.violations, `[${label}] Accessibility violations found:\n\n${summary}`).toEqual([]);
}
