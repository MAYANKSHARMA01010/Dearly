import { ApiError } from '../../api/client.js';
import { parseDraft, uuid } from '../drafts/contracts.js';
import { parseAttachment } from '../attachments/contracts.js';
/** @typedef {import('../drafts/contracts.js').Recipient & {id:string}} ScheduleRecipient */
/** @typedef {{recipientId:string,channel:'IN_APP'}} Delivery */
/** @typedef {{recipientId:string,channels:string[]}} DeliveryChoice */
/** @typedef {{version:number,localDateTime:string,timezone:string,deliveries?:DeliveryChoice[]}} Choice */
/** @typedef {Omit<import('../drafts/contracts.js').Draft,'recipients'> & {status:'DRAFT'|'SCHEDULED'|'CANCELED'|'DISPATCHING'|'DELIVERED'|'PARTIALLY_DELIVERED'|'FAILED',recipients:ScheduleRecipient[],scheduledFor:string|null,timezone:string|null,localDateTime:string|null,canceledAt:string|null,attachments:import('../attachments/contracts.js').Attachment[],deliveries:Delivery[],backgroundDelivery:true,deliveryEnabled:boolean}} Message */
/** @typedef {{id:string,status:'SCHEDULED'|'CANCELED'|'DISPATCHING'|'DELIVERED'|'PARTIALLY_DELIVERED'|'FAILED',version:number,subject:string|null,scheduledFor:string,timezone:string,localDateTime:string,canceledAt:string|null,deliveryEnabled:boolean}} Summary */
/** @typedef {{message:Message,resolved:{scheduledFor:string,timezone:string,localDateTime:string,offset:string},deliveries:DeliveryChoice[],reviewToken:string,expiresAt:string,backgroundDelivery:true}} Review */
const invalid = () =>
  new ApiError(
    'The schedule response could not be confirmed. Reload before trying again.',
    'invalid_response',
  );
/** @param {unknown} value @returns {Record<string,unknown>} */
const record = (value) => {
  if (!value || typeof value !== 'object') throw invalid();
  return /** @type {Record<string,unknown>} */ (value);
};
/** @param {unknown} value */
const date = (value) =>
  typeof value === 'string' && Number.isFinite(Date.parse(value));
/** @param {unknown} value */
const zone = (value) => {
  if (typeof value !== 'string' || value.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
};
/** @param {unknown} value @returns {Summary} */
export function parseScheduleSummary(value) {
  const r = record(value);
  if (
    typeof r.id !== 'string' ||
    !uuid.test(r.id) ||
    ![
      'SCHEDULED',
      'CANCELED',
      'DISPATCHING',
      'DELIVERED',
      'PARTIALLY_DELIVERED',
      'FAILED',
    ].includes(String(r.status)) ||
    typeof r.deliveryEnabled !== 'boolean' ||
    !Number.isInteger(r.version) ||
    Number(r.version) < 1 ||
    !(r.subject === null || typeof r.subject === 'string') ||
    !date(r.scheduledFor) ||
    !zone(r.timezone) ||
    typeof r.localDateTime !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(r.localDateTime) ||
    !(r.canceledAt === null || date(r.canceledAt)) ||
    (r.status === 'CANCELED' && !date(r.canceledAt))
  )
    throw invalid();
  return /** @type {Summary} */ ({
    id: r.id,
    status: r.status,
    version: r.version,
    subject: r.subject,
    scheduledFor: r.scheduledFor,
    timezone: r.timezone,
    localDateTime: r.localDateTime,
    canceledAt: r.canceledAt,
    deliveryEnabled: r.deliveryEnabled,
  });
}
/** @param {unknown} value @returns {Message} */
export function parseScheduleMessage(value) {
  const r = record(value);
  if (
    ![
      'DRAFT',
      'SCHEDULED',
      'CANCELED',
      'DISPATCHING',
      'DELIVERED',
      'PARTIALLY_DELIVERED',
      'FAILED',
    ].includes(String(r.status)) ||
    r.backgroundDelivery !== true ||
    typeof r.deliveryEnabled !== 'boolean'
  )
    throw invalid();
  const base = parseDraft({ ...r, status: 'DRAFT' });
  const original = /** @type {Record<string,unknown>[]} */ (r.recipients);
  const recipients = base.recipients.map((item, i) => {
    const id = original[i].id;
    if (typeof id !== 'string' || !uuid.test(id)) throw invalid();
    return { ...item, id };
  });
  if (
    new Set(recipients.map((r) => r.id)).size !== recipients.length ||
    !Array.isArray(r.attachments) ||
    r.attachments.length > 10 ||
    !Array.isArray(r.deliveries) ||
    r.deliveries.length > 50
  )
    throw invalid();
  const deliveries = r.deliveries.map((value) => {
    const d = record(value);
    if (
      typeof d.recipientId !== 'string' ||
      !recipients.some((r) => r.id === d.recipientId) ||
      d.channel !== 'IN_APP'
    )
      throw invalid();
    return /** @type {Delivery} */ ({
      recipientId: d.recipientId,
      channel: d.channel,
    });
  });
  if (new Set(deliveries.map((d) => d.recipientId)).size !== deliveries.length)
    throw invalid();
  if (r.status !== 'DRAFT') {
    parseScheduleSummary(r);
    if (
      deliveries.length !== recipients.length ||
      !recipients.length ||
      r.attachments.some((a) => record(a).state !== 'READY')
    )
      throw invalid();
  } else if (
    r.scheduledFor !== null ||
    r.timezone !== null ||
    r.localDateTime !== null ||
    r.canceledAt !== null ||
    deliveries.length
  )
    throw invalid();
  return {
    ...base,
    status: /** @type {Message['status']} */ (r.status),
    recipients,
    scheduledFor: /** @type {string|null} */ (r.scheduledFor),
    timezone: /** @type {string|null} */ (r.timezone),
    localDateTime: /** @type {string|null} */ (r.localDateTime),
    canceledAt: /** @type {string|null} */ (r.canceledAt),
    attachments: r.attachments.map(parseAttachment),
    deliveries,
    backgroundDelivery: true,
    deliveryEnabled: /** @type {boolean} */ (r.deliveryEnabled),
  };
}
/** @param {unknown} value @returns {Review} */
export function parseScheduleReview(value) {
  const r = record(value),
    resolved = record(r.resolved);
  const message = parseScheduleMessage(r.message);
  if (
    r.backgroundDelivery !== true ||
    typeof r.reviewToken !== 'string' ||
    !r.reviewToken ||
    r.reviewToken.length > 512 ||
    !date(r.expiresAt) ||
    !date(resolved.scheduledFor) ||
    !zone(resolved.timezone) ||
    typeof resolved.localDateTime !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(resolved.localDateTime) ||
    typeof resolved.offset !== 'string' ||
    !/^[-+]\d{2}:\d{2}(?::\d{2})?$/.test(resolved.offset) ||
    !Array.isArray(r.deliveries) ||
    r.deliveries.length !== message.recipients.length
  )
    throw invalid();
  const deliveries = r.deliveries.map((value) => {
    const d = record(value);
    if (
      typeof d.recipientId !== 'string' ||
      !message.recipients.some((r) => r.id === d.recipientId) ||
      !Array.isArray(d.channels) ||
      d.channels.length !== 1 ||
      d.channels[0] !== 'IN_APP'
    )
      throw invalid();
    return { recipientId: d.recipientId, channels: ['IN_APP'] };
  });
  if (new Set(deliveries.map((d) => d.recipientId)).size !== deliveries.length)
    throw invalid();
  return /** @type {Review} */ ({
    message,
    resolved,
    deliveries,
    reviewToken: r.reviewToken,
    expiresAt: r.expiresAt,
    backgroundDelivery: true,
  });
}
/** @param {unknown} value @returns {{items:Summary[],nextCursor:string|null}} */
export function parseSchedulePage(value) {
  const r = record(value);
  if (
    !Array.isArray(r.items) ||
    r.items.length > 50 ||
    !(
      r.nextCursor === null ||
      (typeof r.nextCursor === 'string' && r.nextCursor.length <= 512)
    )
  )
    throw invalid();
  return {
    items: r.items.map(parseScheduleSummary),
    nextCursor: /** @type {string|null} */ (r.nextCursor),
  };
}
/** @param {string} scheduledFor @param {string} timezone */
export function scheduleLabel(scheduledFor, timezone) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(scheduledFor));
}
/** @param {string} timezone @param {Date} [now] */
export function defaultWallTime(
  timezone,
  now = new Date(Date.now() + 30 * 60000),
) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** @param {string} status */
export function scheduleStatusLabel(status) {
  const labels = /** @type {Record<string,string>} */ ({
    SCHEDULED: 'Scheduled',
    CANCELED: 'Canceled',
    DISPATCHING: 'Dispatch started',
    DELIVERED: 'Delivered in app',
    PARTIALLY_DELIVERED: 'Partially delivered',
    FAILED: 'Delivery failed',
  });
  return labels[status] ?? 'Unknown state';
}
