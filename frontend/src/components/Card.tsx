import type { HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** FE-011 shared component: the one visual "boxed content" pattern reused
 * across listing cards, form panels, and summary tiles. */
export function Card({ className, children, ...rest }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn("rounded-lg border border-slate-200 bg-white p-4 shadow-sm", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
