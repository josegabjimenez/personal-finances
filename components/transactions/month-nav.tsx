"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function monthStart(year: number, month: number) {
  return `${year}-${pad(month)}-01`;
}

function monthEnd(year: number, month: number) {
  const d = new Date(year, month, 0); // day-0 of next month = last day of this month
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

export function MonthNav({
  year,
  month,
  isAll,
  baseUrl = "/transactions",
}: {
  year: number;
  month: number; // 1-indexed
  isAll: boolean;
  baseUrl?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(y: number, m: number) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", monthStart(y, m));
    sp.set("end", monthEnd(y, m));
    sp.delete("view");
    sp.delete("page");
    router.push(`${baseUrl}?${sp.toString()}`);
  }

  function goAll() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("start");
    sp.delete("end");
    sp.set("view", "all");
    sp.delete("page");
    router.push(`${baseUrl}?${sp.toString()}`);
  }

  function goCurrentMonth() {
    const now = new Date();
    navigate(now.getFullYear(), now.getMonth() + 1);
  }

  const now = new Date();
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const isFutureNext =
    next.year > now.getFullYear() ||
    (next.year === now.getFullYear() && next.month > now.getMonth() + 1);

  const label = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  if (isAll) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">All transactions</span>
        <Button variant="outline" size="sm" onClick={goCurrentMonth}>
          By month
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => navigate(prev.year, prev.month)}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <button
        className="flex-1 text-center text-sm font-medium capitalize hover:text-foreground/70 transition-colors"
        onClick={goAll}
        title="Show all transactions"
      >
        {label}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={() => navigate(next.year, next.month)}
        disabled={isFutureNext}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
