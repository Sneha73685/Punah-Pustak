/** The listing-grid geometries, shared by every grid of `ListingCard`s and
 * by `ListingGridSkeleton`, so a loading grid and the grid that replaces it
 * can never disagree about column count or gutters.
 *
 * - RESULTS: Browse's results column (beside a 240px filter column) and
 *   "More from": 2 columns on phones, 3 on tablets, 4 from 1280px.
 * - HOME: "Just in", full width: 2 / 3 / 4 / 5 columns. */
export const LISTING_GRID_CLASSES =
  "grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 md:grid-cols-3 xl:grid-cols-4";

export const HOME_GRID_CLASSES =
  "grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 xl:grid-cols-5";

/** Rails of six smaller records ("More from <seller>"): a horizontal,
 * snapping strip on phones, a single row of 4 or 6 above. */
export const RAIL_CLASSES =
  "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scroll-padding-inline:1rem] sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-6 sm:overflow-visible sm:px-0 xl:grid-cols-6 [&>*]:w-[41%] [&>*]:shrink-0 [&>*]:snap-start sm:[&>*]:w-auto";

/** The page's outer measure: 1360px of content inside 40px gutters. */
export const PAGE_CLASSES = "mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-10";
