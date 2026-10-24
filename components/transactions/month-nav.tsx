"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { activityPeriodHref, activityPeriodLabel, monthRange, parseMonth } from "@/lib/activity-period";
import { cn } from "@/lib/utils";

function monthValue(year: number, month: number) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function MonthPicker({ year, month, label, isAll, hrefFor, locale }: {
  year: number;
  month: number;
  label: string;
  isAll: boolean;
  hrefFor: (year: number, month: number) => string;
  locale: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(monthValue(year, month));
  const now = new Date();
  const currentValue = monthValue(now.getFullYear(), now.getMonth() + 1);
  const chosenMonth = parseMonth(chosen);
  const validChoice = chosenMonth !== null && chosen <= currentValue;
  // Budgets' grouped month links plus direct entry for any older month.
  const options = Array.from({ length: 36 }, (_, offset) => {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  });
  const groups = options.reduce<Record<number, typeof options>>((result, option) => {
    (result[option.year] ??= []).push(option);
    return result;
  }, {});

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="min-h-11 rounded-xl px-3 py-1 text-center transition-colors hover:bg-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Select month, currently ${label}`}>
          <span className="block text-sm font-semibold capitalize">{label}</span>
          <span className="text-xs text-muted-foreground">Choose month</span>
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh] space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Select month</SheetTitle>
          <SheetDescription>Choose any past month to review its activity.</SheetDescription>
        </SheetHeader>
        <form className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (!validChoice || !chosenMonth) return;
          setOpen(false);
          router.push(hrefFor(chosenMonth.year, chosenMonth.month));
        }}>
          <label htmlFor="activity-month" className="text-sm font-medium">Choose month</label>
          <div className="flex gap-2">
            <input id="activity-month" type="month" required min="0001-01" max={currentValue} value={chosen} onChange={(event) => setChosen(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm" />
            <Button type="submit" className="min-h-11" disabled={!validChoice}>Go to month</Button>
          </div>
        </form>
        <div className="space-y-5 pb-2">
          {Object.entries(groups).reverse().map(([groupYear, months]) => (
            <section key={groupYear} className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupYear}</h3>
              <div className="grid grid-cols-2 gap-2">
                {months.map((option) => {
                  const selected = !isAll && option.year === year && option.month === month;
                  const current = monthValue(option.year, option.month) === currentValue;
                  const optionLabel = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric" }).format(new Date(option.year, option.month - 1, 1));
                  return (
                    <SheetClose key={`${option.year}-${option.month}`} asChild>
                      <Link href={hrefFor(option.year, option.month)} aria-current={selected ? "date" : undefined} className={cn("flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-sm transition-colors", selected ? "border-primary/30 bg-primary/10" : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground")}>
                        <span className="capitalize">{optionLabel}</span>
                        <span className="flex items-center gap-1 text-[10px] uppercase">{current ? "Current" : null}{selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}</span>
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
  );
}

export function MonthNav({ year, month, isAll, baseUrl = "/transactions", locale = "es-CO", allLabel = "All transactions", labelAction = "all", allowAll = labelAction === "all", monthOnly = false }: {
  year: number;
  month: number;
  isAll: boolean;
  baseUrl?: string;
  locale?: string;
  allLabel?: string;
  labelAction?: "all" | "none";
  allowAll?: boolean;
  monthOnly?: boolean;
}) {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const now = new Date();
  const current = { year: now.getFullYear(), month: now.getMonth() + 1 };
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const nextIsFuture = monthValue(next.year, next.month) > monthValue(current.year, current.month);
  const label = isAll ? allLabel : activityPeriodLabel(new URLSearchParams(monthOnly ? "" : query), year, month, locale);
  const selectedRange = monthRange(year, month);
  const fullMonth = monthOnly || (!searchParams.get("start") && !searchParams.get("end")) || (searchParams.get("start") === selectedRange.start && searchParams.get("end") === selectedRange.end);
  const isCurrent = !isAll && fullMonth && year === current.year && month === current.month;
  const hrefFor = (y: number, m: number) => activityPeriodHref(baseUrl, query, { year: y, month: m });

  return (
    <div className="space-y-2">
      <p className="sr-only" aria-live="polite">Showing {label}</p>
      <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-1 rounded-2xl border bg-card/80 p-1">
        {previous.year < 1 ? <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" disabled aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button> : <Button asChild variant="ghost" size="icon" className="h-11 w-11 rounded-xl"><Link href={hrefFor(previous.year, previous.month)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link></Button>}
        <MonthPicker key={`${year}-${month}-${label}`} year={year} month={month} label={label} isAll={isAll || !fullMonth} hrefFor={hrefFor} locale={locale} />
        {nextIsFuture ? (
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl" disabled aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        ) : (
          <Button asChild variant="ghost" size="icon" className="h-11 w-11 rounded-xl"><Link href={hrefFor(next.year, next.month)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link></Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {allowAll ? <Button asChild variant={isAll ? "default" : "outline"} size="sm"><Link href={activityPeriodHref(baseUrl, query, "all")} aria-current={isAll ? "page" : undefined}>{allLabel}</Link></Button> : <span />}
        <Button asChild variant={isCurrent ? "default" : "outline"} size="sm"><Link href={hrefFor(current.year, current.month)} aria-current={isCurrent ? "date" : undefined}>This month</Link></Button>
      </div>
    </div>
  );
}
