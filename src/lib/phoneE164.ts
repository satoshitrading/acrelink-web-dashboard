/**
 * Normalize phone input to E.164 for Twilio (`+[country code][subscriber]`, max 15 digits total after +).
 *
 * Handles common US farmer input:
 * - `18568338351` → `+18568338351`
 * - `(856) 833-8351` → `+18568338351` (10-digit NANP → +1)
 * - `+1 856 833 8351` → `+18568338351`
 *
 * Non-US: if the user includes full digits with country code but no `+` (10–15 digits),
 * a leading `+` is added. Ten-digit input is treated as US/Canada NANP (+1).
 */
export function normalizeToE164(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  if (raw.startsWith("+")) {
    const digits = raw.slice(1).replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return `+${digits}`;
}
