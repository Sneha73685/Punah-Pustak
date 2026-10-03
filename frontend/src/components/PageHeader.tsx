import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** FE-011 shared component: the title + supporting copy + actions row used
 * at the top of every authenticated/data page (Browse, My Listings,
 * Profile, Admin), instead of each page hand-rolling its own `<h1>` block. */
export function PageHeader({ title, description, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
