// Shared "parse then fail loud" tail for every platform's mapping.ts
// (hashnode/devto/medium) — each independently built a `new Date(...)` +
// `Number.isNaN(date.getTime())` + throw before this existed (rule of
// three: same concern, three copies). Each platform's own date STRING/NUMBER
// handling stays in its own mapping.ts (they differ — Hashnode/DEV.to are a
// single ISO string, Medium is either epoch-ms or a space-separated UTC
// string) since that part genuinely isn't shared; only the validation tail
// is.
/**
 * Returns `date` unchanged if it's a real date, otherwise throws
 * `describeError()` — never returns an `Invalid Date`, which would
 * otherwise sort/serialize unpredictably downstream.
 */
export function assertValidDate(date: Date, describeError: () => string): Date {
  if (Number.isNaN(date.getTime())) {
    throw new Error(describeError());
  }
  return date;
}
