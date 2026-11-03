/**
 * Normalises a phone number to E.164.
 *
 * South African numbers in any common format become `+27` + 9 digits:
 * `082 123 4567`, `(082) 123-4567`, `27821234567`, `0027 82 123 4567`, `+27 (0)82 123 4567`.
 * Other international numbers are accepted if written with `+` or `00` and a country code.
 *
 * Returns `null` if the input isn't a plausible phone number.
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed)) return null;

  const hasPlus = trimmed.startsWith("+");
  // "+27 (0)82 ..." is a common way of writing SA numbers: drop the trunk "(0)".
  let digits = trimmed.replace(/\(0\)/g, "").replace(/\D/g, "");

  // Written with "+": already international. Otherwise work out the country code.
  if (!hasPlus) {
    if (digits.startsWith("00")) {
      digits = digits.slice(2); // 0027 82 … → 27 82 …
    } else if (digits.startsWith("0")) {
      digits = `27${digits.slice(1)}`; // 082 … → 27 82 …
    } else if (!(digits.startsWith("27") && digits.length === 11)) {
      return null; // no trunk 0, no country code: not a number we can place
    }
  }

  if (digits.startsWith("27")) {
    const national = digits.slice(2);
    // 9 digits; area/mobile codes start 1–8 (e.g. 21 Cape Town, 82 mobile).
    return /^[1-8]\d{8}$/.test(national) ? `+27${national}` : null;
  }

  // E.164: country code doesn't start with 0, at most 15 digits.
  return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
}
