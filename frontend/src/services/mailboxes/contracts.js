import { ApiError } from '../../api/client.js';
import { parseDraft, uuid } from '../drafts/contracts.js';
import { parseAttachment } from '../attachments/contracts.js';
export const boxes = /** @type {const} */ ([
  'created',
  'scheduled',
  'sent',
  'received',
  'drafts',
  'failed',
]);
/** @typedef {typeof boxes[number]} Box */
export const states = [
  'DRAFT',
  'SCHEDULED',
  'CANCELED',
  'DISPATCHING',
  'DELIVERED',
  'PARTIALLY_DELIVERED',
  'SUBMITTED',
  'PARTIALLY_SUBMITTED',
  'DELIVERY_UNKNOWN',
  'FAILED',
];
/** @typedef {{id:string,role:'owned'|'received',subject:string|null,status:string,timestamp:string,scheduledFor:string|null,timezone:string|null,recipientCount:number|null,deliveryEnabled:boolean|null}} Summary */
/** @typedef {{asOf:string,items:Summary[],nextCursor:string|null}} Page */
/** @typedef {{id:string,kind:string,state:string,version:number,occurredAt:string}} Event */
/** @typedef {{items:Event[],nextCursor:string|null}} History */
/** @typedef {{recipientId:string,channel:string,outcome:string,intentId?:string,submittedAt?:string|null,expiresAt?:string|null,revokedAt?:string|null,errorCode?:string|null,deliveredAt:string|null,openedAt:string|null,attempt:{state:string,number:number,errorCode:string|null,startedAt:string,finishedAt:string|null}|null}} Delivery */
/** @typedef {Omit<import('../drafts/contracts.js').Draft,'recipients'> & {status:string,recipients:(import('../drafts/contracts.js').Recipient&{id:string})[],scheduledFor:string|null,timezone:string|null,localDateTime:string|null,canceledAt:string|null,deliveryEnabled:boolean,attachments:import('../attachments/contracts.js').Attachment[],deliveries:Delivery[],history:History}} Owned */
/** @typedef {{id:string,deliveredAt:string,openedAt:string|null,senderName:string|null,senderIsSelf:boolean,subject:string|null,text:string,occasion:string|null,scheduledFor:string,timezone:string,attachments:import('../attachments/contracts.js').Attachment[]}} Received */
const invalid = () =>
  new ApiError(
    'The mailbox response could not be confirmed. Refresh and try again.',
    'invalid_response',
  );
/** @param {unknown} v @returns {Record<string,unknown>} */
export const record = (v) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw invalid();
  return /** @type {Record<string,unknown>} */ (v);
};
/** @param {unknown} v @returns {v is string} */
export const validDate = (v) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v));
/** @param {unknown} v */
const nullableDate = (v) => v === null || validDate(v);
/** @param {unknown} v @returns {v is string} */
const validZone = (v) => {
  if (typeof v !== 'string' || v.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: v });
    return true;
  } catch {
    return false;
  }
};
/** @param {unknown} v */
const cursor = (v) =>
  v === null || (typeof v === 'string' && v.length > 0 && v.length <= 512);
/** @param {unknown} v */
const subject = (v) => v === null || (typeof v === 'string' && v.length <= 160);
/** @param {unknown} value @returns {{asOf:string,counts:Record<Box,number>,unopened:number}} */
export function parseDashboard(value) {
  const r = record(value),
    counts = record(r.counts);
  if (
    !validDate(r.asOf) ||
    boxes.some(
      (b) => !Number.isSafeInteger(counts[b]) || Number(counts[b]) < 0,
    ) ||
    !Number.isSafeInteger(r.unopened) ||
    Number(r.unopened) < 0 ||
    Number(r.unopened) > Number(counts.received)
  )
    throw invalid();
  return {
    asOf: r.asOf,
    counts: /** @type {Record<Box,number>} */ (
      Object.fromEntries(boxes.map((b) => [b, counts[b]]))
    ),
    unopened: Number(r.unopened),
  };
}
/** @param {unknown} value @param {Box} box @returns {Page} */
export function parseMailboxPage(value, box) {
  const r = record(value);
  if (
    !validDate(r.asOf) ||
    !Array.isArray(r.items) ||
    r.items.length > 50 ||
    !cursor(r.nextCursor)
  )
    throw invalid();
  const items = r.items.map((value) => {
    const m = record(value),
      received = box === 'received';
    if (
      typeof m.id !== 'string' ||
      !uuid.test(m.id) ||
      m.role !== (received ? 'received' : 'owned') ||
      !subject(m.subject) ||
      !(received ? ['RECEIVED', 'OPENED'] : states).includes(
        String(m.status),
      ) ||
      !validDate(m.timestamp) ||
      !nullableDate(m.scheduledFor) ||
      !(m.timezone === null || validZone(m.timezone)) ||
      (received
        ? m.recipientCount !== null ||
          m.deliveryEnabled !== null ||
          !validDate(m.scheduledFor) ||
          !validZone(m.timezone)
        : !Number.isInteger(m.recipientCount) ||
          Number(m.recipientCount) < 0 ||
          Number(m.recipientCount) > 50 ||
          typeof m.deliveryEnabled !== 'boolean')
    )
      throw invalid();
    return /** @type {Summary} */ ({
      id: m.id,
      role: m.role,
      subject: m.subject,
      status: m.status,
      timestamp: m.timestamp,
      scheduledFor: m.scheduledFor,
      timezone: m.timezone,
      recipientCount: m.recipientCount,
      deliveryEnabled: m.deliveryEnabled,
    });
  });
  if (new Set(items.map((i) => i.id)).size !== items.length) throw invalid();
  return {
    asOf: r.asOf,
    items,
    nextCursor: /** @type {string|null} */ (r.nextCursor),
  };
}
/** @param {unknown} value @returns {History} */
export function parseHistory(value) {
  const r = record(value),
    kinds = [
      'BASELINE',
      'CREATED',
      'EDITED',
      'SCHEDULED',
      'RESCHEDULED',
      'CANCELED',
      'REOPENED',
      'DISPATCH_STARTED',
      'RETRY_SCHEDULED',
      'RETRY_REQUESTED',
      'DELIVERED',
      'PARTIALLY_DELIVERED',
      'SUBMITTED',
      'PARTIALLY_SUBMITTED',
      'DELIVERY_UNKNOWN',
      'FAILED',
      'OPENED',
      'EMAIL_LINK_REVOKED',
    ];
  if (
    !Array.isArray(r.items) ||
    r.items.length > 50 ||
    !(
      r.nextCursor === null ||
      (typeof r.nextCursor === 'string' && uuid.test(r.nextCursor))
    )
  )
    throw invalid();
  const items = r.items.map((v) => {
    const e = record(v);
    if (
      typeof e.id !== 'string' ||
      !uuid.test(e.id) ||
      !kinds.includes(String(e.kind)) ||
      !states.includes(String(e.state)) ||
      !Number.isInteger(e.version) ||
      Number(e.version) < 1 ||
      !validDate(e.occurredAt)
    )
      throw invalid();
    return /** @type {Event} */ ({
      id: e.id,
      kind: e.kind,
      state: e.state,
      version: e.version,
      occurredAt: e.occurredAt,
    });
  });
  return { items, nextCursor: /** @type {string|null} */ (r.nextCursor) };
}
/** @param {unknown} value @returns {import('../attachments/contracts.js').Attachment[]} */
function attachments(value) {
  if (!Array.isArray(value) || value.length > 10) throw invalid();
  const items = value.map(parseAttachment);
  if (
    items.some((i) => i.state !== 'READY') ||
    new Set(items.map((i) => i.id)).size !== items.length
  )
    throw invalid();
  return items;
}
/** @param {unknown} value @returns {Owned} */
export function parseOwned(value) {
  const r = record(value);
  if (
    !states.includes(String(r.status)) ||
    !nullableDate(r.scheduledFor) ||
    !(r.timezone === null || validZone(r.timezone)) ||
    !(r.localDateTime === null || typeof r.localDateTime === 'string') ||
    !nullableDate(r.canceledAt) ||
    typeof r.deliveryEnabled !== 'boolean' ||
    !Array.isArray(r.deliveries) ||
    r.deliveries.length > 200
  )
    throw invalid();
  const base = parseDraft({ ...r, status: 'DRAFT' }),
    original = /** @type {Record<string,unknown>[]} */ (r.recipients);
  const recipients = base.recipients.map((v, i) => {
    const id = original[i].id;
    if (typeof id !== 'string' || !uuid.test(id)) throw invalid();
    return { ...v, id };
  });
  if (new Set(recipients.map((i) => i.id)).size !== recipients.length)
    throw invalid();
  const deliveries = r.deliveries.map((v) => {
    const d = record(v);
    if (d.channel === 'EMAIL') {
      if (
        typeof d.recipientId !== 'string' ||
        !recipients.some((r) => r.id === d.recipientId && r.type === 'EMAIL') ||
        typeof d.intentId !== 'string' ||
        !uuid.test(d.intentId) ||
        !['PENDING', 'DISPATCHING', 'SUBMITTED', 'UNKNOWN', 'RETRYING', 'FAILED'].includes(
          String(d.outcome),
        ) ||
        d.deliveredAt !== null ||
        d.attempt !== null ||
        !nullableDate(d.submittedAt) ||
        !nullableDate(d.openedAt) ||
        !nullableDate(d.expiresAt) ||
        !nullableDate(d.revokedAt) ||
        (d.outcome === 'SUBMITTED' && !validDate(d.submittedAt)) ||
        !(
          d.errorCode === null ||
          [
            'SMTP_UNCERTAIN',
            'SMTP_THROTTLED',
            'SMTP_REJECTED',
            'SMTP_CONNECTION',
            'SMTP_AUTH',
            'EMAIL_QUOTA',
            'LINK_UNAVAILABLE',
            'INVALID_RECIPIENT',
          ].includes(String(d.errorCode))
        )
      )
        throw invalid();
      return /** @type {Delivery} */ ({
        recipientId: d.recipientId,
        channel: 'EMAIL',
        outcome: d.outcome,
        intentId: d.intentId,
        submittedAt: d.submittedAt,
        deliveredAt: null,
        openedAt: d.openedAt,
        expiresAt: d.expiresAt,
        revokedAt: d.revokedAt,
        errorCode: d.errorCode,
        attempt: null,
      });
    }
    if (
      typeof d.recipientId !== 'string' ||
      !recipients.some((r) => r.id === d.recipientId) ||
      !['IN_APP', 'SMS', 'WHATSAPP', 'EMAIL'].includes(String(d.channel)) ||
      ![
        'PENDING',
        'DISPATCHING',
        'RETRYING',
        'DELIVERED',
        'FAILED',
        'UNAVAILABLE',
      ].includes(String(d.outcome)) ||
      !nullableDate(d.deliveredAt) ||
      !nullableDate(d.openedAt) ||
      (d.openedAt !== null &&
        (d.deliveredAt === null ||
          Date.parse(String(d.openedAt)) <
            Date.parse(String(d.deliveredAt)))) ||
      (d.channel !== 'IN_APP' &&
        (d.outcome !== 'UNAVAILABLE' ||
          d.deliveredAt !== null ||
          d.openedAt !== null ||
          d.attempt !== null)) ||
      (d.outcome === 'DELIVERED' && !validDate(d.deliveredAt))
    )
      throw invalid();
    let attempt = null;
    if (d.attempt !== null) {
      const a = record(d.attempt);
      if (
        ![
          'STARTED',
          'SUCCEEDED',
          'RETRYABLE_FAILED',
          'PERMANENT_FAILED',
          'ABANDONED',
        ].includes(String(a.state)) ||
        !Number.isInteger(a.number) ||
        Number(a.number) < 1 ||
        !validDate(a.startedAt) ||
        !nullableDate(a.finishedAt) ||
        !(
          a.errorCode === null ||
          [
            'STORAGE_UNAVAILABLE',
            'ATTACHMENTS_NOT_READY',
            'INTERNAL',
            'RECIPIENT_UNAVAILABLE',
            'LEASE_EXPIRED',
            'ATTEMPTS_EXHAUSTED',
          ].includes(String(a.errorCode))
        )
      )
        throw invalid();
      attempt = {
        state: String(a.state),
        number: Number(a.number),
        errorCode: /** @type {string|null} */ (a.errorCode),
        startedAt: a.startedAt,
        finishedAt: /** @type {string|null} */ (a.finishedAt),
      };
    }
    return /** @type {Delivery} */ ({
      recipientId: d.recipientId,
      channel: d.channel,
      outcome: d.outcome,
      deliveredAt: d.deliveredAt,
      openedAt: d.openedAt,
      attempt,
    });
  });
  return {
    ...base,
    status: String(r.status),
    recipients,
    scheduledFor: /** @type {string|null} */ (r.scheduledFor),
    timezone: /** @type {string|null} */ (r.timezone),
    localDateTime: /** @type {string|null} */ (r.localDateTime),
    canceledAt: /** @type {string|null} */ (r.canceledAt),
    deliveryEnabled: r.deliveryEnabled,
    attachments: attachments(r.attachments),
    deliveries,
    history: parseHistory(r.history),
  };
}
/** @param {unknown} value @returns {Received} */
export function parseReceived(value) {
  const r = record(value);
  if (
    typeof r.id !== 'string' ||
    !uuid.test(r.id) ||
    !validDate(r.deliveredAt) ||
    !nullableDate(r.openedAt) ||
    (r.openedAt !== null &&
      Date.parse(String(r.openedAt)) < Date.parse(r.deliveredAt)) ||
    !subject(r.subject) ||
    typeof r.text !== 'string' ||
    r.text.length > 20000 ||
    !(
      r.occasion === null ||
      (typeof r.occasion === 'string' && r.occasion.length <= 80)
    ) ||
    !(
      r.senderName === null ||
      (typeof r.senderName === 'string' && r.senderName.length <= 80)
    ) ||
    typeof r.senderIsSelf !== 'boolean' ||
    !validDate(r.scheduledFor) ||
    !validZone(r.timezone)
  )
    throw invalid();
  return /** @type {Received} */ ({
    id: r.id,
    deliveredAt: r.deliveredAt,
    openedAt: r.openedAt,
    senderName: r.senderName,
    senderIsSelf: r.senderIsSelf,
    subject: r.subject,
    text: r.text,
    occasion: r.occasion,
    scheduledFor: r.scheduledFor,
    timezone: r.timezone,
    attachments: attachments(r.attachments),
  });
}
/** @param {string} kind */
export function eventLabel(kind) {
  const labels = /** @type {Record<string,string>} */ ({
    BASELINE: 'Tracking began — earlier changes are not recorded',
    CREATED: 'Draft created',
    EDITED: 'Message edited',
    SCHEDULED: 'Schedule confirmed',
    RESCHEDULED: 'Delivery time changed',
    CANCELED: 'Schedule canceled',
    REOPENED: 'Returned to drafts',
    DISPATCH_STARTED: 'Delivery attempt started',
    RETRY_SCHEDULED: 'Another delivery attempt scheduled',
    RETRY_REQUESTED: 'Recovery requested',
    DELIVERED: 'Delivered in app',
    PARTIALLY_DELIVERED: 'Partially delivered',
    SUBMITTED: 'Submitted to email service',
    PARTIALLY_SUBMITTED: 'Partially submitted',
    DELIVERY_UNKNOWN: 'Email result uncertain',
    FAILED: 'Delivery failed',
    EMAIL_LINK_REVOKED: 'An email link was revoked',
    OPENED: 'A recipient marked this message as opened',
  });
  return labels[kind] ?? 'Unknown activity';
}
export const boxLabels = /** @type {Record<Box,string>} */ ({
  created: 'Created',
  scheduled: 'Scheduled',
  sent: 'Sent',
  received: 'Received',
  drafts: 'Drafts',
  failed: 'Needs attention',
});
