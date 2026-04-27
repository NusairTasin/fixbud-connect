const BD_PHONE_REGEX = /^(?:\+880|880|0)1[3-9]\d{8}$/;

/**
 * Returns true if the raw string is a valid Bangladeshi mobile number.
 * Accepts optional +880 or 880 prefix, or bare 01XXXXXXXXX form.
 */
export function isValidBDPhone(raw: string): boolean {
  const stripped = raw.replace(/\s/g, "");
  return BD_PHONE_REGEX.test(stripped);
}

/**
 * Normalises a valid BD phone number to E.164 format (+880XXXXXXXXXX).
 * Throws if the input is not a valid BD phone number.
 */
export function normaliseBDPhone(raw: string): string {
  const stripped = raw.replace(/\s/g, "");

  if (!BD_PHONE_REGEX.test(stripped)) {
    throw new Error(`Invalid Bangladeshi phone number: ${raw}`);
  }

  // Strip any existing prefix (+880, 880, or leading 0) to get the 10-digit local number
  let local: string;
  if (stripped.startsWith("+880")) {
    local = stripped.slice(4); // remove +880
  } else if (stripped.startsWith("880")) {
    local = stripped.slice(3); // remove 880
  } else {
    // starts with 0 (e.g. 01XXXXXXXXX) — strip the leading 0
    local = stripped.slice(1);
  }

  return `+880${local}`;
}
