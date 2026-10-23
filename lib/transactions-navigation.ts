const LIST_PARAMS = ["view", "start", "end", "q", "type", "account", "category", "tag"];
const PERIOD_PARAMS = ["view", "start", "end"];

/** Only screens that link to transaction details and their known options can be Back targets. */
export function transactionReturnHref(value?: string) {
  if (!value) return "/transactions";

  const queryIndex = value.indexOf("?");
  const pathname = queryIndex === -1 ? value : value.slice(0, queryIndex);
  const keys = pathname === "/transactions"
    ? LIST_PARAMS
    : /^\/(accounts|categories|budgets)\/[a-zA-Z0-9_-]+$/.test(pathname)
      ? PERIOD_PARAMS
      : pathname === "/"
        ? []
        : null;
  if (!keys) return "/transactions";

  const source = new URLSearchParams(queryIndex === -1 ? "" : value.slice(queryIndex + 1));
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
