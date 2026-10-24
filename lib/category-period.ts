import { monthRange, parseMonth } from "@/lib/activity-period";

export interface CategoryPeriodSearchParams {
  month?: string | string[];
  start?: string | string[];
  end?: string | string[];
}

export function categoryPeriod(
  search: CategoryPeriodSearchParams,
  now = new Date()
) {
  const selected =
    parseMonth(firstValue(search.month)) ??
    parseMonth(firstValue(search.start)) ??
    parseMonth(firstValue(search.end)) ?? {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
    };
  const range = monthRange(selected.year, selected.month);
  const startDate = new Date(0);
  startDate.setFullYear(selected.year, selected.month - 1, 1);
  const endDate = new Date(0);
  endDate.setFullYear(selected.year, selected.month, 0);

  return {
    ...selected,
    ...range,
    startDate,
    endDate,
    label: new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
    }).format(startDate),
  };
}

export function categoryPeriodQuery(period: { start: string; end: string }) {
  return new URLSearchParams({ start: period.start, end: period.end }).toString();
}

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}
