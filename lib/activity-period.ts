export function parseMonth(value?: string | null) {
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value ?? "");
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && month >= 1 && month <= 12 ? { year, month } : null;
}

export function monthRange(year: number, month: number) {
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const lastDay = new Date(0);
  lastDay.setFullYear(year, month, 0);
  return { start: `${prefix}-01`, end: `${prefix}-${lastDay.getDate()}` };
}

/** Change only the activity period; filters and the originating page stay intact. */
export function activityPeriodHref(baseUrl: string, query: string, period: { year: number; month: number } | "all") {
  const sp = new URLSearchParams(query);
  sp.delete("month");
  sp.delete("page");
  if (period === "all") {
    sp.delete("start");
    sp.delete("end");
    sp.set("view", "all");
  } else {
    const { start, end } = monthRange(period.year, period.month);
    sp.set("start", start);
    sp.set("end", end);
    sp.delete("view");
  }
  return `${baseUrl}?${sp.toString()}`;
}

export function activityPeriodLabel(search: URLSearchParams, year: number, month: number, locale = "es-CO") {
  const start = search.get("start");
  const end = search.get("end");
  const range = monthRange(year, month);
  if ((start || end) && (start !== range.start || end !== range.end)) {
    if (start && end) return `From ${start} to ${end}`;
    return start ? `From ${start}` : `Through ${end}`;
  }
  const date = new Date(0);
  date.setFullYear(year, month - 1, 1);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(date);
}
