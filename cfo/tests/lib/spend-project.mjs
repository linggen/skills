// The slice of a report the shared spend cases pin (fixtures/spend/cases.json
// `reports[].expect`): what counts as spend, income, saved, one-off, and the
// "not imported" lines. linggen-mobile's spend_cases_test.dart projects its
// own report the same way, so Mac and phone answer the same cases alike.
const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));

export function project(report, rows) {
  const ids = (pred) => rows.filter(pred).map((r) => r.id).sort();
  return {
    totals: pick(report.totals, ['spend', 'income', 'net']),
    refunds_total: report.refunds_total ?? null,
    by_category: (report.by_category || []).map((c) => pick(c, ['category', 'spend'])),
    one_off_total: report.one_off_total ?? null,
    one_offs: (report.one_offs || []).map((o) => pick(o, ['merchant', 'amount', 'date'])),
    typical_month_spend: report.typical_month_spend ?? null,
    saved: report.saved ?? null,
    paid_to_cards_not_imported: report.paid_to_cards_not_imported ?? null,
    moved_not_imported: report.moved_not_imported ?? null,
    saving_suggestions: report.saving_suggestions ?? null,
    subscriptions: (report.subscriptions || []).map((s) => pick(s, ['merchant', 'monthly', 'charges'])),
    anomalies: (report.anomalies || []).map((a) => pick(a, ['type', 'merchant', 'amount', 'date'])),
    transfers: ids((r) => r.transfer),
    refunds: ids((r) => r.refund),
    one_off_rows: ids((r) => r.one_off),
  };
}
