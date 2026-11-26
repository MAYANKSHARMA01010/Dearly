import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import * as auth from '../validators/auth.validators';
import * as drafts from '../validators/draft.validators';
import * as schedules from '../validators/schedule.validators';
import * as notifications from '../validators/notification.validators';
import { reserveAttachment } from '../validators/attachment.validators';
import { mimeLimits } from '../constants/attachments';
type Schema = Record<string, unknown>;
const string = { type: 'string' }, boolean = { type: 'boolean' }, integer = { type: 'integer' };
const uuid = { type: 'string', format: 'uuid' }, date = { type: 'string', format: 'date-time' };
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: 'null' }] });
const array = (items: Schema): Schema => ({ type: 'array', items });
const object = (properties: Record<string, Schema>, required = Object.keys(properties), additionalProperties = false): Schema => ({ type: 'object', properties, required, additionalProperties });
const ref = (name: string): Schema => ({ $ref: '#/components/schemas/' + name });
const input = (schema: z.ZodType): Schema => {
    // Input mode retains transforms' source fields; runtime refinements remain authoritative.
    const json = z.toJSONSchema(schema, { io: 'input' });
    delete json.$schema;
    return json;
};
const empty = z.object({}).strict();
const state = { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'CANCELED', 'DISPATCHING', 'DELIVERED', 'PARTIALLY_DELIVERED', 'SUBMITTED', 'PARTIALLY_SUBMITTED', 'DELIVERY_UNKNOWN', 'FAILED'] };
function pageReference(): Schema { return object({ items: array(ref('HistoryEvent')), nextCursor: nullable(string) }); }
const schemas: Record<string, Schema> = {
    Error: object({ success: { const: false }, error: object({ code: string, message: string, details: array(object({ field: string, code: string })) }, ['code', 'message']), requestId: uuid }),
    User: object({ id: uuid, phone: string, phoneVerifiedAt: nullable(date), name: nullable(string), email: nullable(string), emailVerifiedAt: nullable(date), timezone: string, createdAt: date }),
    OtpChallenge: object({ challengeId: uuid, expiresAt: date, resendAfterSeconds: integer, dispatch: { type: 'string', enum: ['accepted', 'simulated'] }, channel: { type: 'string', enum: ['whatsapp', 'simulated'] }, developmentCode: { ...string, description: 'Explicit local development adapter only; never returned by real production authentication.' } }, ['challengeId', 'expiresAt', 'resendAfterSeconds', 'dispatch']),
    Tokens: object({ accessToken: string, refreshToken: string, accessExpiresAt: date, sessionExpiresAt: date, tokenType: { const: 'Bearer' } }),
    Session: object({ user: ref('User'), accessToken: string, refreshToken: string, accessExpiresAt: date, sessionExpiresAt: date, tokenType: { const: 'Bearer' } }),
    Recipient: object({ id: uuid, type: { type: 'string', enum: ['SELF', 'USER', 'PHONE', 'EMAIL'] }, label: nullable(string), userId: nullable(uuid), unavailable: boolean, phone: string, country: string, email: string }, ['id', 'type', 'label']),
    Attachment: object({ id: uuid, name: string, mime: { type: 'string', enum: Object.keys(mimeLimits) }, bytes: integer, state: { type: 'string', enum: ['PENDING', 'UPLOADING', 'UPLOADED', 'READY', 'DELETING'] }, createdAt: date, expiresAt: { ...date, description: 'Upload reservation deadline, not a READY content access deadline.' } }),
    MediaAccess: object({ id: uuid, sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' }, bytes: integer, mime: string, checkedAt: date, expiresAt: date }),
    Draft: object({ id: uuid, status: state, subject: nullable(string), text: string, occasion: nullable(string), version: integer, createdAt: date, updatedAt: date, recipients: array(ref('Recipient')) }),
    Schedule: object({ id: uuid, status: state, subject: nullable(string), text: string, occasion: nullable(string), version: integer, createdAt: date, updatedAt: date, recipients: array(ref('Recipient')), deliveryEnabled: boolean, scheduledFor: nullable(date), timezone: nullable(string), localDateTime: nullable(string), canceledAt: nullable(date), attachments: array(ref('Attachment')), deliveries: array(object({ recipientId: uuid, channel: { type: 'string', enum: ['IN_APP', 'WHATSAPP', 'SMS', 'EMAIL'] } })), backgroundDelivery: boolean }),
    Review: object({ message: ref('Schedule'), resolved: object({}, [], true), deliveries: array(object({ recipientId: uuid, channels: array(string) })), reviewToken: string, expiresAt: date }, ['message', 'resolved', 'deliveries', 'reviewToken', 'expiresAt'], true),
    DeliveryOutcome: object({ recipientId: uuid, channel: string, intentId: uuid, outcome: { ...string, description: 'Channel-specific observed state. Provider acceptance, carrier submission/delivery, notification read and content opened are distinct.' }, submittedAt: nullable(date), deliveredAt: nullable(date), notificationSentAt: nullable(date), notificationReadAt: nullable(date), openedAt: nullable(date), expiresAt: nullable(date), revokedAt: nullable(date), errorCode: nullable(string), attempt: nullable(object({}, [], true)) }, ['recipientId', 'channel', 'outcome'], true),
    DraftSummary: object({ id: uuid, status: state, subject: nullable(string), occasion: nullable(string), version: integer, createdAt: date, updatedAt: date, textPreview: string, recipientCount: integer }),
    ScheduleSummary: object({ id: uuid, status: state, subject: nullable(string), version: integer, scheduledFor: nullable(date), timezone: nullable(string), localDateTime: nullable(string), canceledAt: nullable(date), deliveryEnabled: boolean }),
    Inbox: object({ id: uuid, deliveredAt: date, openedAt: nullable(date), senderName: nullable(string), senderIsSelf: boolean, subject: nullable(string), text: string, occasion: nullable(string), scheduledFor: date, timezone: nullable(string), attachments: array(ref('Attachment')) }, ['id', 'deliveredAt', 'openedAt', 'senderName', 'senderIsSelf', 'subject', 'text', 'occasion', 'attachments'], true),
    Preferences: input(notifications.preferencesInput),
    Notification: object({ id: uuid, kind: string, targetType: string, targetId: uuid, readAt: nullable(date), createdAt: date }, ['id'], true),
    MailboxItem: object({ id: uuid, status: string, subject: nullable(string), scheduledFor: nullable(date), timestamp: date, timezone: nullable(string), role: { type: 'string', enum: ['owned', 'received'] }, recipientCount: nullable(integer), deliveryEnabled: nullable(boolean) }, ['id', 'subject'], true),
    OwnedMessage: object({ id: uuid, status: state, subject: nullable(string), text: string, occasion: nullable(string), version: integer, createdAt: date, updatedAt: date, recipients: array(ref('Recipient')), attachments: array(ref('Attachment')), scheduledFor: nullable(date), timezone: nullable(string), localDateTime: nullable(string), canceledAt: nullable(date), deliveryEnabled: boolean, deliveries: array(ref('DeliveryOutcome')), history: pageReference() }, ['id'], true),
    HistoryEvent: object({ id: uuid, kind: string, state: nullable(string), version: nullable(integer), occurredAt: date }),
    Capabilities: object({ channels: array(object({ channel: string, available: boolean, mode: string }, ['channel', 'available'], true)), worker: object({ status: string }), whatsappStatus: string, smsStatus: string }, ['channels', 'worker'], true),
    ExternalMessage: object({ subject: nullable(string), text: string, occasion: nullable(string), expiresAt: date, attachments: array(object({ handle: string, name: string, mime: string, bytes: integer })) }, [], true),
};
const page = (name: string): Schema => object({ items: array(ref(name)), nextCursor: nullable(string) });
const envelope = (data: Schema): Schema => object({ success: { const: true }, data, requestId: uuid });
const paths: Record<string, Record<string, unknown>> = {};
type Options = {
    body?: z.ZodType;
    response?: Schema;
    public?: boolean;
    status?: number;
    description?: string;
    query?: Record<string, Schema>;
    binary?: boolean;
    contentType?: string;
    rawBody?: Schema;
    headers?: string[];
    security?: unknown[];
};
function operation(method: string, path: string, tag: string, summary: string, options: Options = {}) {
    const parameters: unknown[] = [...path.matchAll(/\{([^}]+)\}/g)].map(m => ({ name: m[1], in: 'path', required: true, schema: uuid }));
    for (const [name, schema] of Object.entries(options.query ?? {}))
        parameters.push({ name, in: 'query', required: schema.required === true, schema: { ...schema, required: undefined } });
    for (const name of options.headers ?? [])
        parameters.push({ name, in: 'header', required: true, schema: string });
    const response = options.response ?? object({}, [], true);
    const responses: Record<string, unknown> = { [options.status ?? 200]: { description: options.binary ? 'Private file bytes; no opened receipt.' : 'Successful operation', content: options.contentType ? { [options.contentType]: { schema: response } } : options.binary ? Object.fromEntries(Object.keys(mimeLimits).map(mime => [mime, { schema: { type: 'string', format: 'binary' } }])) : { 'application/json': { schema: envelope(response) } } } };
    for (const code of [400, 401, 403, 404, 409, 413, 415, 429, 500, 503])
        responses[code] = { description: ({ 400: 'Validation failed', 401: 'Missing, expired or invalid credential', 403: 'Forbidden', 404: 'Unavailable or not owned', 409: 'Version, state or quota conflict', 413: 'Request too large', 415: 'Unsupported content type', 429: 'Rate limit exceeded', 500: 'Internal failure', 503: 'Dependency disabled or unavailable' } as Record<number, string>)[code], content: { 'application/json': { schema: ref('Error') } } };
    paths[path] ??= {};
    paths[path][method] = { tags: [tag], summary, operationId: method + '_' + path.replace(/[^a-zA-Z0-9]+/g, '_'), description: options.description ?? 'Authenticated account ownership and current state are enforced by the server. Read operations do not create opened receipts.', security: options.security ?? (options.public ? [] : [{ sessionBearer: [] }]), parameters, responses,
        ...(options.body ? { requestBody: { required: true, content: { 'application/json': { schema: input(options.body) } } } } : {}),
        ...(options.rawBody ? { requestBody: { required: true, content: { 'application/octet-stream': { schema: options.rawBody } } } } : {}) };
}
const listQuery = { limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, cursor: { type: 'string', maxLength: 512, description: 'Opaque base64url cursor from the preceding response; preserve filters. Never construct it from private records.' } };
operation('get', '/', 'Health', 'API information', { public: true, response: object({ name: string, status: string, endpoints: object({}, [], true) }) });
for (const name of ['', '/live', '/db', '/ready', '/worker'])
    operation('get', '/health' + name, 'Health', name === '/worker' ? 'Delivery worker heartbeat' : name === '/db' || name === '/ready' ? 'Database readiness' : 'Process liveness', { public: true, response: object({ status: string }), description: 'No provider message is sent. A healthy API does not prove message delivery.' });
operation('get', '/auth/otp/status', 'Authentication', 'WhatsApp-first OTP readiness', { public: true, response: object({ status: string, channel: string }), description: 'Read-only bounded readiness probe. Does not generate an OTP or consume resend budgets.' });
operation('post', '/auth/otp/request', 'Authentication', 'Request a phone verification code', { public: true, body: auth.requestOtpSchema, response: ref('OtpChallenge'), description: 'Sends a real WhatsApp code when configured. Normalize by country; requires ready sender, durable limits and explicit user action. Never automatically replay a timeout or silently fall back to SMS.' });
operation('post', '/auth/otp/resend', 'Authentication', 'Request another code', { public: true, body: auth.resendOtpSchema, response: ref('OtpChallenge'), description: 'Uses existing challenge identity. Resend cooldown and durable sender budgets apply; may send a real WhatsApp code.' });
operation('post', '/auth/otp/verify', 'Authentication', 'Verify a phone code', { public: true, body: auth.verifyOtpSchema, response: ref('Session'), description: 'Five-minute codes, at most five challenge attempts. Phone number is the login identity; email is not a login method.' });
operation('post', '/auth/refresh', 'Authentication', 'Rotate refresh credentials', { public: true, body: auth.refreshSchema, response: ref('Tokens'), description: 'Refresh token in JSON body, not session bearer. Rotating credentials cannot be blindly replayed after uncertainty.' });
operation('post', '/auth/logout', 'Authentication', 'Revoke the current session', { response: object({ loggedOut: boolean }) });
operation('get', '/auth/me', 'Profile', 'Read your profile', { response: ref('User') });
operation('patch', '/auth/me', 'Profile', 'Update profile destination fields', { body: auth.profileSchema, response: ref('User'), description: 'Changing an email clears verification. A saved email is not proof of possession or a login credential. A recognized IANA timezone is required.' });
operation('post', '/auth/email/request', 'Profile', 'Send an email-linking code', { body: empty, response: object({ challengeId: uuid, expiresAt: date }, ['challengeId', 'expiresAt'], true), description: 'Sends Gmail verification to the current profile email. Authenticated phone account required. Independent five-minute challenge and sender budget.' });
operation('post', '/auth/email/verify', 'Profile', 'Verify your profile email', { body: auth.verifyOtpSchema, response: object({ verified: boolean }), description: 'Proves the email destination for this phone account; links eligible due deliveries to its inbox. Does not create email login.' });
operation('get', '/messages/drafts', 'Drafts', 'List your drafts', { query: listQuery, response: page('DraftSummary') });
operation('post', '/messages/drafts', 'Drafts', 'Create a private draft', { body: drafts.createDraftSchema, status: 201, response: ref('Draft'), description: 'Saving does not send. At most 50 SELF/USER/PHONE/EMAIL recipients. PHONE requires valid country/number; EMAIL is normalized. Text max 20,000 characters.' });
operation('get', '/messages/drafts/{id}', 'Drafts', 'Read an owned draft', { response: ref('Draft') });
operation('patch', '/messages/drafts/{id}', 'Drafts', 'Edit draft content or recipients', { body: drafts.updateDraftSchema, response: ref('Draft'), description: 'Requires the current version and at least one changed field; only editable drafts. Recipient updates are draft-only and never send a notification.' });
operation('delete', '/messages/drafts/{id}', 'Drafts', 'Delete an owned draft', { query: { version: { type: 'integer', minimum: 1, required: true } }, response: object({ id: uuid, deleted: boolean }) });
const attachmentBase = '/messages/drafts/{draftId}/attachments';
operation('get', attachmentBase, 'Attachments', 'List owned message attachments', { response: object({ items: array(ref('Attachment')) }) });
operation('post', attachmentBase, 'Attachments', 'Reserve a private upload', { body: reserveAttachment, response: ref('Attachment'), description: 'Idempotent client UUID reservation. Max 10 attachments, 100 MiB/draft, 500 MiB/account; type-specific limits: images/audio 10 MiB, video 50 MiB, PDF 20 MiB, text 1 MiB. Ownership/state/quota enforced.' });
operation('get', attachmentBase + '/{id}', 'Attachments', 'Read upload state', { response: ref('Attachment') });
operation('put', attachmentBase + '/{id}/content', 'Attachments', 'Upload exact reserved bytes', { rawBody: { type: 'string', format: 'binary' }, response: ref('Attachment'), description: 'Binary application/octet-stream, not multipart. Exact reserved byte count; bounded foreground transfer. Refresh state before retrying an uncertain upload.' });
operation('post', attachmentBase + '/{id}/finalize', 'Attachments', 'Validate and finalize an upload', { response: ref('Attachment'), description: 'Validates actual stream MIME/container and content before READY. Client extension alone is insufficient.' });
operation('delete', attachmentBase + '/{id}', 'Attachments', 'Remove a draft attachment', { response: object({ id: uuid, deleted: boolean }) });
operation('get', attachmentBase + '/{id}/content', 'Attachments', 'Download READY private content', { binary: true });
operation('get', attachmentBase + '/{id}/content/access', 'Attachments', 'Authorize a versioned media open', { response: ref('MediaAccess'), description: 'Read-only per-open check. Returns immutable digest and five-minute viewer access, no storage path or opened receipt. Never unlock cached content offline.' });
operation('get', '/messages/schedules/capabilities', 'Schedules', 'Read channels and sender readiness', { response: ref('Capabilities') });
operation('get', '/messages/schedules', 'Schedules', 'List your scheduled message states', { query: { ...listQuery, status: { ...state, default: 'SCHEDULED' } }, response: page('ScheduleSummary') });
operation('get', '/messages/schedules/{id}', 'Schedules', 'Read an owned schedule', { response: ref('Schedule') });
operation('patch', '/messages/schedules/{id}', 'Schedules', 'Edit content before dispatch', { body: schedules.scheduleEdit, response: ref('Schedule') });
for (const [suffix, body, title, response] of [
    ['preview', schedules.scheduleChoice, 'Review a new schedule', ref('Review')], ['confirm', schedules.scheduleConfirm, 'Confirm the reviewed schedule', ref('Schedule')], ['reschedule/preview', schedules.rescheduleChoice, 'Review a new delivery time', ref('Review')], ['reschedule', schedules.rescheduleConfirm, 'Confirm the reviewed new time', ref('Schedule')], ['cancel', schedules.scheduleVersion, 'Cancel before dispatch', ref('Schedule')], ['reopen', schedules.scheduleVersion, 'Return a stopped message to drafts', ref('Draft')],
] as const)
    operation('post', '/messages/schedules/{id}/' + suffix, 'Schedules', title, { body, response, description: 'Current version required. Time is local YYYY-MM-DDTHH:mm plus IANA timezone; UTC instant is reviewed explicitly. At least one minute ahead and within ten years; ambiguous/skipped local times rejected. Confirmations bind review token, recipient/channel choices and explicit WhatsApp/SMS consent. DISPATCHING cannot be edited or canceled. Acceptance, delivery and opening are distinct; no automatic fallback or uncertain-write replay.' });
operation('get', '/messages/dashboard', 'Mailboxes', 'Read account mailbox counts', { response: object({ asOf: date, counts: object(Object.fromEntries(['created', 'scheduled', 'sent', 'received', 'drafts', 'failed'].map(n => [n, integer]))), unopened: integer }) });
operation('get', '/messages/mailboxes', 'Mailboxes', 'Filter an account mailbox', { query: { ...listQuery, box: { type: 'string', enum: ['created', 'scheduled', 'sent', 'received', 'drafts', 'failed'], default: 'created' }, status: state, read: { type: 'string', enum: ['all', 'opened', 'unopened'], default: 'all' } }, response: { ...page('MailboxItem'), properties: { box: string, items: array(ref('MailboxItem')), nextCursor: nullable(string) } }, description: 'Received accepts opened/unopened, not a status filter; other boxes require read=all. Opaque cursors are bound to filters. Lists do not mark content opened.' });
operation('get', '/messages/mailboxes/owned/{id}', 'Mailboxes', 'Read owned content and delivery outcomes', { response: ref('OwnedMessage') });
operation('get', '/messages/mailboxes/owned/{id}/history', 'Mailboxes', 'Read recorded message activity', { query: { limit: listQuery.limit, cursor: uuid }, response: page('HistoryEvent') });
operation('get', '/messages/inbox', 'Inbox', 'List committed due inbox deliveries', { query: listQuery, response: page('MailboxItem') });
operation('get', '/messages/inbox/{id}', 'Inbox', 'Read a delivered recipient-owned message', { response: ref('Inbox'), description: 'Requires a committed, due, recipient-owned delivery and immutable destination binding. Merely reading does not mark opened.' });
operation('post', '/messages/inbox/{id}/open', 'Inbox', 'Explicitly mark content opened', { body: empty, response: object({ id: uuid, openedAt: nullable(date) }) });
operation('get', '/messages/inbox/{id}/attachments/{attachmentId}/content', 'Inbox', 'Download a delivered attachment', { binary: true });
operation('get', '/messages/inbox/{id}/attachments/{attachmentId}/content/access', 'Inbox', 'Authorize a delivered attachment version', { response: ref('MediaAccess') });
operation('get', '/notifications', 'Notifications', 'List account notifications', { query: { cursor: uuid }, response: page('Notification'), description: 'Fixed page size 20, UUID cursor. Only account-owned notification metadata, no private message content.' });
operation('get', '/notifications/{id}', 'Notifications', 'Resolve an account notification target', { response: object({ id: uuid, targetId: uuid, targetType: string }) });
operation('post', '/notifications/{id}/read', 'Notifications', 'Mark a notification read', { response: object({ read: boolean }) });
operation('get', '/notifications/preferences', 'Notifications', 'Read notification preferences', { response: ref('Preferences') });
operation('patch', '/notifications/preferences', 'Notifications', 'Save notification preferences', { body: notifications.preferencesInput, response: ref('Preferences') });
operation('put', '/notifications/devices', 'Notifications', 'Register a push token for this session', { body: notifications.deviceInput, response: object({ registered: boolean }), description: 'Project UUID must match configured Expo project. Token ownership follows this authenticated session. Lock-screen payload contains only a generic notification ID.' });
operation('delete', '/notifications/devices/{id}', 'Notifications', 'Remove this session push registration', { response: object({ removed: boolean }) });
operation('get', '/external', 'External links', 'Private-link viewer shell', { public: true, contentType: 'text/html', response: string, description: 'Static viewer shell only. Bearer link secrets are supplied in the fragment by the recipient, never logged in a URL query.' });
operation('get', '/external/logo.png', 'External links', 'Public Dearly brand mark', { public: true, contentType: 'image/png', response: { type: 'string', format: 'binary' } });
operation('get', '/external/viewer.js', 'External links', 'Private-link viewer script', { public: true, contentType: 'application/javascript', response: string });
operation('post', '/external/open', 'External links', 'Resolve a private bearer link', { public: true, body: z.object({ token: z.string().min(1).max(100) }).strict(), response: ref('ExternalMessage'), description: 'Expiring/revocable bearer link in JSON body, not a session token. Anyone possessing a valid link can view it; seven-day lifetime. Access does not create an opened receipt.' });
operation('post', '/external/file', 'External links', 'Download a linked private file', { public: true, body: z.object({ token: z.string().min(1).max(100), handle: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict(), binary: true });
operation('post', '/external/deliveries/{id}/revoke', 'External links', 'Revoke an owned delivery link', { response: object({ revoked: boolean }) });
for (const provider of ['waha', 'smsgate']) {
    operation('post', '/webhooks/' + provider, 'Webhooks', 'Receive signed ' + provider + ' delivery evidence', { public: true, headers: provider === 'waha' ? ['X-Webhook-Hmac', 'X-Webhook-Hmac-Algorithm'] : ['X-Timestamp', 'X-Signature'], description: 'Provider-only raw application/json bytes, maximum 65,536 bytes. HMAC verified before parsing/applying a scoped outbound receipt. No incoming-message subscriptions. Provider evidence is distinct from content opening.', status: 202 });
    const op = paths['/webhooks/' + provider].post as Record<string, unknown>;
    op.requestBody = { required: true, content: { 'application/json': { schema: object({}, [], true), example: provider === 'waha' ? { event: 'message.ack', session: 'default', payload: { id: 'synthetic-outbound-id', ack: 3 } } : { event: 'sms:delivered', payload: { messageId: 'synthetic-outbound-id', partsCount: 1 } } } } };
    op.responses = { '202': { description: 'Scoped receipt accepted or ignored', content: { 'application/json': { schema: object({}, [], true) } } }, '400': { description: 'Invalid callback bytes', content: { 'application/json': { schema: ref('Error') } } }, '401': { description: 'Missing/invalid signature', content: { 'application/json': { schema: ref('Error') } } }, '503': { description: 'Callback unavailable', content: { 'application/json': { schema: ref('Error') } } } };
}
operation('post', '/internal/operations/maintenance', 'Operations', 'Run one bounded maintenance batch', { security: [{ maintenanceBearer: [] }], body: empty, headers: ['X-Operations-Run'], description: 'Dedicated maintenance token, not a user credential. UUID run ID prevents accidental replay. Single cross-instance lock, bounded attachment/expired receipt cleanup and sanitized durable outcomes. Never sends messages, resets WAHA, replays delivery or creates a backup.' });
operation('get', '/internal/operations/status', 'Operations', 'Read backend and WAHA status separately', { security: [{ monitorBearer: [] }], description: 'Dedicated read-only monitor token. Bounded database, worker and WAHA checks; no login codes, payloads, account records or gateway keys returned.' });
const synthetic = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const otpRequest = paths['/auth/otp/request'].post as {
    requestBody: {
        content: Record<string, {
            example?: unknown;
        }>;
    };
};
otpRequest.requestBody.content['application/json'].example = { phone: '+12025550123', country: 'US' };
schemas.OtpChallenge.example = { challengeId: synthetic, expiresAt: '2030-01-01T10:05:00Z', resendAfterSeconds: 60, dispatch: 'accepted', channel: 'whatsapp' };
const version = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')).version as string;
export const openapi = { openapi: '3.1.1', info: { title: 'Dearly API Reference', version, description: 'Read-only reference: live execution is disabled. Requests still require the documented credentials, ownership and state checks. Examples are synthetic. Never automatically replay OTP, schedule or other uncertain writes. Schema cannot express all cross-field/ownership/time refinements; server validation remains authoritative.' }, servers: [{ url: '/' }], tags: ['Health', 'Authentication', 'Profile', 'Drafts', 'Attachments', 'Schedules', 'Mailboxes', 'Inbox', 'Notifications', 'External links', 'Webhooks', 'Operations'].map(name => ({ name })), paths, components: { securitySchemes: { sessionBearer: { type: 'http', scheme: 'bearer', description: 'Opaque Dearly access token from phone OTP verification/refresh. Not a JWT.' }, maintenanceBearer: { type: 'http', scheme: 'bearer', description: 'Dedicated least-privilege maintenance credential; no user/session/provider access.' }, monitorBearer: { type: 'http', scheme: 'bearer', description: 'Dedicated read-only operations credential.' } }, schemas } };
