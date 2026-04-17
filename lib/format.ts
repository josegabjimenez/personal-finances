const moneyFormatters = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(currency: string) {
  const key = currency || "USD";
  let f = moneyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: key,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    moneyFormatters.set(key, f);
  }
  return f;
}

export function formatMoney(
  amount: number | string | null | undefined,
  currency = "USD"
) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  try {
    return getMoneyFormatter(currency).format(n);
  } catch {
    return getMoneyFormatter("USD").format(n);
  }
}

const dateShort = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

const dateLong = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeLong = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateShort(iso: string | Date) {
  return dateShort.format(new Date(iso));
}
export function formatDateLong(iso: string | Date) {
  return dateLong.format(new Date(iso));
}
export function formatDateTime(iso: string | Date) {
  return dateTimeLong.format(new Date(iso));
}

export function formatPercent(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat(undefined, {
    style: "percent",
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function monthsAgo(n: number, d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
}
