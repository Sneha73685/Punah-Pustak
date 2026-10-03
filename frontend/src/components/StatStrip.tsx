import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type StatTone = "accent" | "default" | "muted";

export interface StatStripItem {
  label: string;
  value: ReactNode;
  tone?: StatTone;
}

export interface StatStripProps {
  items: StatStripItem[];
  className?: string;
}

const TONE_CLASSES: Record<StatTone, string> = {
  accent: "text-moss-700",
  default: "text-ink",
  muted: "text-ink-soft",
};

/**
 * A quiet, non-elevated "at a glance" stat readout — a tinted strip with
 * divider rules between values, not a floating `Card` (see `Card`'s
 * `elevated` prop): a handful of counts sitting next to each other is a
 * structural grouping, not content that needs to look lifted above the
 * page. Shared by `ProfilePage` and `MyListingsPage` rather than each
 * page hand-rolling its own version of the same three-number digest.
 */
export function StatStrip({ items, className }: StatStripProps): React.JSX.Element {
  return (
    <dl
      className={cn("grid divide-x divide-border rounded-xl bg-paper-muted p-4 text-center", className)}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-ink-muted">{item.label}</dt>
          <dd className={cn("font-serif text-2xl font-semibold", TONE_CLASSES[item.tone ?? "default"])}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
