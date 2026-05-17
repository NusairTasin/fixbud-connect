const BD_PHONE_REGEX = /^(?:\+880|880|0)1[3-9]\d{8}$/;

/** Returns true if the raw string is a valid Bangladeshi mobile number. */
export function isValidBDPhone(raw: string): boolean {
  return BD_PHONE_REGEX.test(raw.replace(/\s/g, ""));
}

/** Normalises a valid BD phone number to E.164 (+880XXXXXXXXXX). Throws if invalid. */
export function normaliseBDPhone(raw: string): string {
  const stripped = raw.replace(/\s/g, "");
  if (!BD_PHONE_REGEX.test(stripped)) throw new Error(`Invalid Bangladeshi phone number: ${raw}`);
  // Strip any prefix (+880, 880, or 0) to get the 10-digit local part, then re-add +880
  return "+880" + stripped.replace(/^(?:\+880|880|0)/, "");
}
