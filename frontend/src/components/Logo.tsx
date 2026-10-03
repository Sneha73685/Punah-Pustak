import { cn } from "@/lib/cn";

export interface LogoProps {
  className?: string;
}

/** Punah-Pustak's wordmark: the name set in heavy Schibsted Grotesk, with
 * the hyphen in ballpoint blue. The hyphen is the hand-off: "punah" (again)
 * joined to "pustak" (book), one reader to the next. No icon, no tile. */
export function Logo({ className }: LogoProps): React.JSX.Element {
  return (
    <span className={cn("whitespace-nowrap text-[19px] font-extrabold tracking-[-0.025em] text-ink sm:text-[21px]", className)}>
      Punah<span className="text-ballpoint">-</span>Pustak
    </span>
  );
}
