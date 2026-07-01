"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MonthOption = {
  year: number;
  month: number;
  label: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthStart(year: number, month: number) {
  return `${year}-${pad(month)}-01`;
}

function monthEnd(year: number, month: number) {
  const d = new Date(year, month, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

function compareMonth(a: { year: number; month: number }, b: { year: number; month: number }) {
  return a.year === b.year ? a.month - b.month : a.year - b.year;
}

function monthLabel(year: number, month: number, monthFormat: "long" | "short" = "long") {
  return new Intl.DateTimeFormat("en-US", {
    month: monthFormat,
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function statusForMonth(
  selected: { year: number; month: number },
  current: { year: number; month: number }
) {
  const comparison = compareMonth(selected, current);
  if (comparison === 0) return { label: "This month", tone: "current" as const };
  if (comparison < 0) return { label: "Past month", tone: "past" as const };
  return { label: "Planned month", tone: "planned" as const };
}

function buildMonthOptions(
  selected: { year: number; month: number },
  current: { year: number; month: number }
) {
  const currentDate = new Date(current.year, current.month - 1, 1);
  const selectedDate = new Date(selected.year, selected.month - 1, 1);
  const defaultStart = new Date(current.year, current.month - 1 - 35, 1);
  const start = selectedDate < defaultStart ? selectedDate : defaultStart;
  const end = selectedDate > currentDate ? selectedDate : currentDate;

  const options: MonthOption[] = [];
  for (const d = new Date(end); d >= start; d.setMonth(d.getMonth() - 1)) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    options.push({ year, month, label: monthLabel(year, month, "long") });
  }

  return options;
}

export function BudgetMonthNav({
  year,
  month,
  currentYear,
  currentMonth,
  baseUrl = "/budgets",
}: {
  year: number;
  month: number;
  currentYear: number;
  currentMonth: number;
  baseUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selected = { year, month };
  const current = { year: currentYear, month: currentMonth };
  const previous = prevMonth(year, month);
  const next = nextMonth(year, month);
  const nextIsFuture = compareMonth(next, current) > 0;
  const status = statusForMonth(selected, current);
  const label = monthLabel(year, month);
  const monthOptions = buildMonthOptions(selected, current);
  const groupedOptions = monthOptions.reduce<Record<number, MonthOption[]>>((acc, option) => {
    acc[option.year] ??= [];
    acc[option.year].push(option);
    return acc;
  }, {});

  function hrefFor(y: number, m: number) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", monthStart(y, m));
    sp.set("end", monthEnd(y, m));
    sp.delete("month");
    sp.delete("view");
    sp.delete("page");
    return `${baseUrl}?${sp.toString()}`;
  }

  function navigate(y: number, m: number) {
    router.push(hrefFor(y, m));
  }

  return (
    <div className="space-y-2">
      <p className="sr-only" aria-live="polite">
        Showing budgets for {label}
      </p>
      <div className="rounded-2xl border bg-card/80 p-1 shadow-sm shadow-black/5 backdrop-blur">
        <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-xl"
            onClick={() => navigate(previous.year, previous.month)}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                className="min-h-11 rounded-xl px-3 py-1 text-center transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Select month, currently ${label}`}
              >
                <span className="block text-sm font-semibold capitalize leading-tight text-foreground">
                  {label}
                </span>
                <span
                  className={cn(
                    "mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
                    status.tone === "current" && "border-success/20 bg-success/10 text-success",
                    status.tone === "past" && "border-border bg-muted text-muted-foreground",
                    status.tone === "planned" && "border-transfer/20 bg-transfer/10 text-transfer"
                  )}
                >
                  {status.label}
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[80vh] space-y-4 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Select month</SheetTitle>
                <SheetDescription>
                  Review assigned budget limits and spending for a historical month.
                </SheetDescription>
              </SheetHeader>

              {compareMonth(selected, current) !== 0 ? (
                <SheetClose asChild>
                  <Link
                    href={hrefFor(currentYear, currentMonth)}
                    className="flex min-h-11 items-center justify-center rounded-xl border bg-card px-3 text-sm font-medium transition-colors hover:bg-accent"
                  >
                    Back to current month
                  </Link>
                </SheetClose>
              ) : null}

              <div className="space-y-5 pb-2">
                {Object.entries(groupedOptions).map(([groupYear, options]) => (
                  <section key={groupYear} className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {groupYear}
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {options.map((option) => {
                        const isSelected = option.year === year && option.month === month;
                        const isCurrent = option.year === currentYear && option.month === currentMonth;
                        return (
                          <SheetClose key={`${option.year}-${option.month}`} asChild>
                            <Link
                              href={hrefFor(option.year, option.month)}
                              aria-current={isSelected ? "date" : undefined}
                              className={cn(
                                "flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors",
                                isSelected
                                  ? "border-primary/30 bg-primary/10 text-foreground"
                                  : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                              )}
                            >
                              <span className="capitalize">{monthLabel(option.year, option.month, "short")}</span>
                              <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide">
                                {isCurrent ? "Current" : null}
                                {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                              </span>
                            </Link>
                          </SheetClose>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </SheetContent>
          </Sheet>

          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 rounded-xl"
            onClick={() => navigate(next.year, next.month)}
            disabled={nextIsFuture}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
