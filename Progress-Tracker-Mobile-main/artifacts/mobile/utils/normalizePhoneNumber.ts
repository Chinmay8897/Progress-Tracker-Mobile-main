export function normalizePhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;

  // Remove all non-numeric characters
  let digits = phone.replace(/\D/g, '');
  if (!digits) return null;

  // Remove leading zeros
  while (digits.startsWith('0')) {
    digits = digits.substring(1);
  }

  // Strip leading 91s until we're down to 10 digits, if possible
  while (digits.length > 10 && digits.startsWith('91')) {
    digits = digits.substring(2);
  }

  // Now we should have exactly 10 digits
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  // Invalid number length
  return null;
}
