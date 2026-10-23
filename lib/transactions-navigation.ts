const LIST_PARAMS = ["view", "start", "end", "q", "type", "account", "category", "tag"];

/** Only the transaction list and its known view options can be a detail's Back target. */
export function transactionReturnHref(value?: string) {
  if (!value || (value !== "/transactions" && !value.startsWith("/transactions?"))) {
    return "/transactions";
  }

  const source = new URLSearchParams(value.slice("/transactions".length));
  const params = new URLSearchParams();
  for (const key of LIST_PARAMS) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}
