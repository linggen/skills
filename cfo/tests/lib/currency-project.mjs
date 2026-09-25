// The slice of a report the shared currency cases pin (fixtures/currency/
// cases.json `reports[].expect`). linggen-mobile's currency_test.dart projects
// its own report the same way, so Mac and phone answer the same cases alike.
const totalsOf = (t) => (t ? { spend: t.spend, income: t.income, net: t.net } : null);

export function project(report, rows) {
  const ids = (pred) => rows.filter(pred).map((r) => r.id).sort();
  const b = report.budgets;
  return {
    currency: report.currency ?? null,
    currencies: report.currencies ?? null,
    totals: totalsOf(report.totals),
    by_currency: report.by_currency
      ? Object.fromEntries(Object.entries(report.by_currency).map(([c, s]) => [c, totalsOf(s.totals)]))
      : null,
    combined: report.combined ? { currency: report.combined.currency, totals: totalsOf(report.combined.totals) } : null,
    fx_missing: report.fx_missing ?? null,
    budgets: b ? {
      currency: b.currency ?? null,
      approx: b.approx ?? null,
      converted_from: b.converted_from ?? null,
      fx_missing: b.fx_missing ?? null,
      categories: b.categories.map((c) => ({ category: c.category, mtd: c.mtd, state: c.state })),
    } : null,
    transfers: ids((r) => r.transfer),
    transfer_fx: ids((r) => r.transfer_fx),
  };
}
