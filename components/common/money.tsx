import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  amount: number | string | null | undefined;
  currency?: string;
  /** Color the value green/red based on sign. */
  colorize?: boolean;
  /** Treat the value as an expense (always negative color) if true. */
  expense?: boolean;
}

export function Money({
  amount,
  currency = "USD",
  colorize,
  expense,
  className,
  ...rest
}: MoneyProps) {
  const n =
    typeof amount === "string"
      ? parseFloat(amount)
      : typeof amount === "number"
        ? amount
        : NaN;
  const tone =
    colorize && Number.isFinite(n)
      ? n < 0
        ? "text-danger"
        : n > 0
          ? "text-success"
          : ""
      : expense
        ? "text-danger"
        : "";
  return (
    <span
      className={cn("tabular-nums font-medium", tone, className)}
      {...rest}
    >
      {formatMoney(amount, currency)}
    </span>
  );
}
