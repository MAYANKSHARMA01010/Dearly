import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export function normalizePhone(phone: string, country: string): string | null {
  if (!isSupportedCountry(country)) return null;
  const parsed = parsePhoneNumberFromString(phone, { defaultCountry: country as CountryCode, extract: false });
  return parsed?.isValid() && !parsed.ext && parsed.country === country ? parsed.number : null;
}
