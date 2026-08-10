import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/Button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** API-003: offset pagination, metadata shaped as total/page/page_size —
 * shared by every paginated list in the app (browse, admin users, admin
 * listings) rather than each page re-deriving "how many pages are there." */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps): React.JSX.Element | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-3 py-4">
      <Button
        variant="secondary"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
        Previous
      </Button>
      <span className="text-sm text-ink-muted">
        Page {page} of {totalPages}
      </span>
      <Button
        variant="secondary"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        aria-label="Next page"
      >
        Next
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
    </nav>
  );
}
