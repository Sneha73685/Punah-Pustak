import type { ReactNode } from "react";

import { useBrowseListings } from "@/hooks/useListings";
import type { ListingPublic } from "@/api/types";

export interface AuthShellProps {
  children: ReactNode;
}

const COVER_COUNT = 4;
const COVER_MIN = 3;

/**
 * The frame for login and registration: one ~400px column on the paper
 * ground — the page supplies its H1, one honest sentence, the form and the
 * switch link. Phone and desktop share this composition, so nothing that
 * carries meaning appears on one and vanishes on the other.
 *
 * The only addition is a small row of real, photographed books from the
 * current shelf above the form, on screens wide enough to spare the room
 * (the row is decorative context, `aria-hidden`, not content a phone user
 * is missing). It reuses the homepage's newest-listings request and only
 * appears when at least `COVER_MIN` photographed listings exist — never
 * placeholder art, never a claim about how many books there are.
 */
export function AuthShell({ children }: AuthShellProps): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-[400px] flex-col pt-2 sm:pt-8">
      <RecentCovers />
      {children}
    </div>
  );
}

function RecentCovers(): React.JSX.Element {
  // Same key as the homepage's request, so arriving from home costs nothing.
  const query = useBrowseListings({ page: 1, pageSize: 20 });
  const withPhotos = (query.data?.items ?? []).filter((item: ListingPublic) => item.images.length > 0);
  const show = withPhotos.length >= COVER_MIN;

  // The row's space is reserved whether or not covers end up in it, so
  // their arrival (or absence) never moves the form below.
  return (
    <div aria-hidden="true" className="mb-10 hidden h-[97px] md:block">
      {show && (
        <>
          <div className="flex items-end justify-center gap-3">
            {withPhotos.slice(0, COVER_COUNT).map((item) => (
              <div key={item.id} className="flex h-24 w-16 items-end justify-center">
                <img
                  src={item.images[0].url}
                  alt=""
                  className="max-h-full max-w-full rounded-xs object-contain shadow-object"
                />
              </div>
            ))}
          </div>
          <div className="mx-auto w-64 border-b border-border-strong" />
        </>
      )}
    </div>
  );
}
