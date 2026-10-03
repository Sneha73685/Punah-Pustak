import { Button } from "@/components/Button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

/** API-003: offset pagination, metadata shaped as total/page/page_size,
 * shared by every paginated list in the app (browse, admin users, admin
 * listings). A ruled line: where you are on the left, the two moves on the
 * right. */
export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps): React.JSX.Element | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t border-rule pt-4">
      <span className="tnum font-mono text-13 text-ink-2">
        Page {page} of {totalPages}
      </span>
      <span className="flex gap-2">
        <Button variant="secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          Previous
        </Button>
        <Button variant="secondary" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          Next
        </Button>
      </span>
    </nav>
  );
}
