/** @typedef {import('./contracts').ScheduleRecipient} Recipient */
/** @param {Recipient} recipient @param {Record<string,string>} phoneChannels */
export function recipientChannel(recipient, phoneChannels) {
  return recipient.type === 'EMAIL' ? 'EMAIL' : recipient.type === 'PHONE' ? phoneChannels[recipient.id] ?? 'IN_APP' : 'IN_APP';
}
/** @param {{recipients:Recipient[],phoneChannels:Record<string,string>,available:boolean,emailAvailable:boolean,whatsappAvailable:boolean,smsAvailable:boolean,whatsappConsent:boolean,smsConsent:boolean,date:string,time:string,timezone:string}} input */
export function reviewBlockers(input) {
  const reasons = [];
  if (!input.recipients.length) reasons.push('Include at least one recipient.');
  for (const recipient of input.recipients) {
    const label = recipient.label || (recipient.type === 'SELF' ? 'Myself' : recipient.type === 'PHONE' ? recipient.phone : recipient.type === 'EMAIL' ? recipient.email : 'Dearly user');
    if (recipient.unavailable) { reasons.push(`Correct ${label} in the draft: this account is unavailable.`); continue; }
    const channel = recipientChannel(recipient, input.phoneChannels);
    const ready = channel === 'EMAIL' ? input.emailAvailable : channel === 'WHATSAPP' ? input.whatsappAvailable : channel === 'SMS' ? input.smsAvailable : input.available;
    if (!ready) reasons.push(`${label}: ${channel === 'IN_APP' ? 'Dearly inbox' : channel === 'WHATSAPP' ? 'WhatsApp' : channel === 'EMAIL' ? 'Email' : 'SMS'} is unavailable. Choose another available channel, or change recipients in the draft.`);
  }
  if (input.recipients.some((r) => recipientChannel(r, input.phoneChannels) === 'WHATSAPP') && !input.whatsappConsent) reasons.push('Confirm that the recipients agreed to WhatsApp messages.');
  if (input.recipients.some((r) => recipientChannel(r, input.phoneChannels) === 'SMS') && !input.smsConsent) reasons.push('Confirm that the recipients agreed to SMS messages.');
  if (!validWallTime(input.date, input.time)) reasons.push('Choose a valid delivery date and time.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }); } catch { reasons.push('Enter a valid timezone, such as Asia/Kolkata.'); }
  if (!input.timezone.trim()) reasons.push('Enter a timezone.');
  return [...new Set(reasons)];
}
/** @param {string} date @param {string} time */
export function validWallTime(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return false;
  const value = new Date(`${date}T${time}:00.000Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 16) === `${date}T${time}`;
}
/** UTC is an internal carrier for wall-clock fields, not the delivery timezone.
 * The server still resolves the chosen named zone and rejects DST ambiguity.
 * @param {string} date @param {string} time
 */
export function wallTimePickerValue(date, time) {
  return validWallTime(date, time) ? new Date(`${date}T${time}:00.000Z`) : new Date();
}
/** @param {Date} value */
export function pickerWallTime(value) {
  const iso = value.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}
