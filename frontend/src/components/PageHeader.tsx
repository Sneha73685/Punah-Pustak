import type { ReactNode } from "react";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** FE-011 shared component: the title, one line of supporting copy and the
 * page's actions, used at the top of every account and admin page. The
 * rule below belongs to whatever comes next (tabs, a table), not here. */
export function PageHeader({ title, description, actions }: PageHeaderProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4 pt-6 sm:flex-row sm:items-end sm:justify-between sm:pt-8">
      <div>
        <h1 className="text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink sm:text-30">{title}</h1>
        {description && <p className="mt-1.5 max-w-xl text-15 text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
