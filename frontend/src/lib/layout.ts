/** The one listing-grid geometry, shared by every grid of `ListingCard`s
 * and by `ListingGridSkeleton`, so a loading grid and the grid that
 * replaces it can never disagree about column count or gutters.
 * 2 columns on phones, 3 on tablets, 4 on laptops, 5 from 1280px. */
export const LISTING_GRID_CLASSES =
  "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 xl:grid-cols-5";
