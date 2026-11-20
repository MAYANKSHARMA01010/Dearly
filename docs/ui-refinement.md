# Screen-by-screen UI refinement

The user requested every screen be refined sequentially, with each completed
screen checked and committed before the next screen is implemented. Work is on
`codex/ui-screen-refinement`. Preserve the working Expo 58, NativeWind and Paper
setup, existing flows, real delivery states and backend contracts.

The approved direction preserves the violet identity, native system typography
and device light/dark modes. [DESIGN.md](../DESIGN.md) records the shared design.
Each screen combines a focused Stitch proposal with Impeccable's native Operate
review. Stitch receives sanitized descriptions and synthetic example content;
private screenshots and source are not uploaded.

| Order | Screen / route | Status |
| --- | --- | --- |
| 1 | Home / dashboard `/` | Complete |
| 2 | Sign-in / OTP `/login` | Complete |
| 3 | Draft list `/drafts` | Complete |
| 4 | New draft `/drafts/new` | Complete |
| 5 | Edit draft `/drafts/[id]` | Complete |
| 6 | Schedule list `/schedules` | Complete |
| 7 | Review schedule `/schedules/new` | Complete |
| 8 | Scheduled message `/schedules/[id]` | Complete |
| 9 | Reschedule `/schedules/reschedule` | Complete |
| 10 | Mailboxes `/mailboxes` | Complete |
| 11 | Owned message `/mailboxes/owned/[id]` | Complete |
| 12 | Received message `/mailboxes/received/[id]` | Complete |
| 13 | Profile `/profile` | Complete |
| 14 | Settings `/settings` | Complete |
| 15 | Notifications `/notifications` | Complete |
| 16 | Service status `/status` | Complete |
| 17 | Page not found | Complete |

Native evidence uses the existing iPhone 17 Pro Max simulator. No simulator reset,
Android launch, live message send or new provider configuration is part of this UI
pass. Empty/error states and unavailable live fixture coverage are recorded
honestly. Screens with shared components retain one implementation; route-specific
refinement is kept in its own screen commit.

## Home / dashboard

Stitch proposed grouped mailbox rows, one primary writing action, compact account
controls and separated delivery tools. Impeccable's native review kept the current
Paper palette and system fonts, shortened row subtitles, preserved real counts
and explicit stale-state feedback, and kept controls at accessible touch sizes.

Verified on iPhone 17 Pro Max in light/dark appearance and larger text. The compose
route opens without creating a draft. Frontend lint/types and all 83 existing
tests passed. The native screen still uses actual account data; no provider send
or message mutation was performed.

## Sign-in / OTP

Combined Stitch’s tighter form grouping and clearer verification status with
Impeccable’s native keyboard/autofill guidance. Country selection uses an explicit
disclosure control, code input supports paste/autofill, expiry is shown once, and
inline errors/recovery remain distinct from primary actions. Prototype state
switchers, artificial design notes and unsupported login methods were omitted.

Verified country search/selection, phone entry, disabled resend countdown, invalid
code feedback, code correction and successful local simulated sign-in on iPhone
17 Pro Max. Preview uses a disposable local PostgreSQL database and a synthetic
account; external providers are disabled. No real OTP was sent. Frontend lint,
types and all 83 tests passed; detector returned no findings.

## Draft list

Combined Stitch’s document rows and disclosure affordances with Impeccable’s
native hierarchy and scalable text guidance. Kept truthful account-backed draft
copy, separated previews from recipient/date metadata, added native back navigation
and inline stale-list errors, and retained pagination and request cancellation.
Omitted prototype design notes, recurrence suggestions and local-storage claims.

Verified synthetic populated rows, untitled/long-subject cases, light/dark modes,
larger text and opening the correct draft on iPhone 17 Pro Max. Existing empty,
loading and retry behavior is preserved; pagination and server failure were not
forced in this native check. Frontend lint/types passed.

## New draft

Combined Stitch’s focused writing form with Impeccable’s native form hierarchy:
grouped subject/message/count, distinct optional occasion and recipient sections,
native back navigation, one primary save action for new messages, and truthful
attachment availability. Kept existing occasion options and manual save semantics;
omitted invented presets and recurrence. Shared editor structure stays unified.

Verified new-message fields, unsaved feedback, adding self and successfully saving
a synthetic draft to the isolated preview database. The saved route exposes
attachments and scheduling. Frontend lint/types and all 83 tests passed; detector
returned no findings. No recording, upload, schedule confirmation or live send.

## Edit draft

Combined Stitch’s saved/dirty action hierarchy with Impeccable’s destructive-action
separation. Schedule is primary only when clean; save is primary while editing.
Deletion is separated at the bottom with error color and its existing confirmation.
Attachments have concise privacy/capacity copy, an expandable type/limit reference,
clear chooser icons and inline transfer errors. No invented sync/retry behavior.

Verified a saved synthetic draft, attachment-limit disclosure, enabled scheduling
and delete-confirmation cancellation in the dark iPhone simulator. Shared new/edit
form still uses the same editor model and guards. Lint/types passed; no new live
media capture, upload or deletion was needed for this presentation change.

## Schedule list

Combined Stitch’s single status selector with Impeccable’s native utility-list
guidance. All nine statuses remain available through one menu; long channel-neutral
labels no longer compete in a segmented row. Added clear creation hierarchy,
calendar/disclosure rows, selected-status empty copy and inline stale errors.

Verified populated scheduled data, all nine menu choices and canceled empty state
on iPhone 17 Pro Max. Lint/types passed. No schedule was changed or dispatched.

## Review schedule

Combined Stitch’s focused grouped-form proposal with Impeccable’s native hierarchy.
Exact local time, zone/offset, UTC, message, recipients, attachment count and review
expiry remain visible before confirmation. Review becomes secondary once a review
exists. Corrected obsolete SMS copy; verified-account requirement is scoped to
in-app delivery. Stitch returned a textual proposal without a screen artifact.

Verified synthetic in-app review creation, resolved timezone/UTC values and final
confirmation layout on iPhone 17 Pro Max, including offline-worker feedback. No
confirmation or provider dispatch was performed. Lint/types passed.

## Scheduled message

Combined Stitch’s time/status emphasis with Impeccable’s native grouping and
destructive-action hierarchy. Message and recipients are separate sections;
cancel controls use error color and preserve confirmation. Corrected SMS channel
labeling. Omitted prototype encrypted/verified claims and invented sync controls.

Verified a saved synthetic schedule and cancellation-dialog dismissal on iPhone
17 Pro Max. Actual time/timezone, recipients and permitted controls render clearly.
Lint/types passed; schedule mutations and delivery were not needed for this pass.

## Reschedule

Combined Stitch’s current/new-time distinction with Impeccable’s state clarity.
The existing time is explicit, active/paused wording follows the actual plan, and
locked recipients/channels explain how to change them. Shared review logic remains
unified. Stitch provided a textual revision. Verified current summary, prefilled
new-time fields and disabled recipient selection on iPhone 17 Pro Max. No new time
was confirmed. Lint/types passed.

## Mailboxes

Combined Stitch’s compact mailbox selector with Impeccable’s native list
hierarchy. All six mailbox categories remain available; owned status and received
opened filters remain separate. Rows have envelope/disclosure affordances and
clear dates/status. Fixed Draft filter wording, retained explicit opened privacy
copy, pagination and access-error clearing.

Verified Created populated rows, all six selector entries, Received content and
read filters in the light iPhone simulator. Lint/types passed. No opened receipt
or message mutation was performed.

## Owned message

Combined Stitch’s delivery/timeline grouping with Impeccable’s readable message
hierarchy. Timing, recipient outcomes, attachments and activity are distinct;
actual status/version and immutable-state controls remain intact. Stale errors
are inline and obsolete claims that external receipts are unavailable were removed.

Verified delivered synthetic message, exact recipient outcome, no opened receipt,
empty attachments and recorded activity in the light iPhone simulator. Lint/types
passed after correcting a fallback-branch edit caught by type checking. No link
revocation, external send or account-owned data mutation was performed.

## Received message

Combined Stitch’s sender/content hierarchy with Impeccable’s explicit-consent
guidance. Time, attachments and delivery activity are separated; opened privacy
copy is prominent beside the optional action. Attachment rows have clear open
actions and inline errors. Removed duplicate native back affordance when pushing
mailbox details. No encrypted-storage claims were adopted from the prototype.

Verified unavailable-item recovery, navigation from Received to the correct inbox
item, sender/body/timing and unmarked state in the light iPhone simulator. Viewing
did not mark opened. Lint/types passed; no receipt was created.

## Profile

Combined Stitch’s account/editable-details separation with Impeccable’s native
form guidance. Read-only phone and selectable account ID are grouped; actual UUID
format is retained. Save feedback and validation use inline notices, sign-out is
separate. Email remains explicitly unverified and phone-only login unchanged.

Verified account details, invalid timezone recovery, corrected successful synthetic
profile save and saved feedback on iPhone 17 Pro Max. Lint/types passed.

## Settings

Combined Stitch’s grouped preferences with Impeccable’s native control hierarchy.
Alert switches and phone-channel choices have separate groups, device push setup
is explained below saving, account navigation is grouped, and errors/success are
inline. Exposed individual switches to accessibility instead of a disabled parent
list row. Device permission remains explicitly requested by its action only.

Verified switch accessibility/state changes, restored original local preferences
and saved feedback on iPhone 17 Pro Max. Lint/types passed. No push permission
prompt, registration or physical push test was triggered.

## Notifications

Combined Stitch’s unread hierarchy with Impeccable’s native event-list guidance.
Generic event titles retain privacy, unread weight/icon/text work beyond color,
rows have disclosures, empty state has recovery context, duplicate unavailable
errors are suppressed, and notification-read vs message-opened is explicit.

Verified unavailable/retry state, corrected an invalid synthetic fixture target,
then verified unread row, exact received-item navigation and unchanged message
opened status. Lint/types passed. No push delivery or real account record changed.

## Service status

Combined Stitch’s focused status grouping with Impeccable’s truthful state
guidance. Connection headline, two storage/server checks and retry action are
clear; scope copy avoids implying provider readiness from database health.
Verified available server/storage and repeat check on iPhone 17 Pro Max. Lint/types
passed; external-provider availability was not inferred or tested by this screen.

## Page not found

Combined Stitch’s focused missing-link recovery with Impeccable’s concise native
empty-state guidance. Uses the existing icon family, clear explanation and one
home action. Verified an unknown URL and successful return to Dearly in the
iPhone simulator. Lint/types passed.

### Settings larger-text follow-up

Final dark-mode extra-extra-large text check found insufficient separation between
the notification description and switch. Added a dedicated 16-point gap so the
description wraps before the control. Rechecked the native render; lint/types
passed. This follows the same focused Stitch/Impeccable settings direction.

## Final verification — 20 November 2026

All 17 screens were refined and committed individually, followed by focused
larger-text and shared-navigation corrections. The navigation correction combines
Stitch’s explicit single-back proposal with Impeccable’s native-stack guidance:
hide the automatic duplicate only where a custom back control exists; retain
actual destinations, unsaved/busy guards and existing gestures. Draft editor’s
accessible back label now follows whether it returns through history or to drafts.
Verified one back control and the unsaved-edit discard guard after pushing from Home.

`npm run check --prefix frontend` passed: lint, strict JavaScript type checking and
all 83 existing tests. Final presentation-only corrections passed lint/types;
Impeccable detector returned no findings. `git diff --check` passed. Native checks
used the existing iPhone 17 Pro Max with light/dark appearances and larger text;
Settings switch spacing was corrected from the larger-text render. Restored light
appearance and original text size, then left the app on its ready Home screen.

QA used a disposable local PostgreSQL database and synthetic Alex/Casey records.
Local preview API (8080) and Metro (8081) remain running; provider sends and workers
are disabled in that preview process. The private backend environment is unchanged.
No production message, account, provider setting or hosted deployment was changed.
No Android launch, APK rebuild, release/version bump or Git push was part of this
UI pass. Physical Android, push/provider acceptance, populated attachment media and
all possible server-failure/pagination combinations were not revalidated here.

## Recipient corrections — 20 November 2026

Added Edit beside Remove in draft recipient rows, combining Stitch’s focused
prefilled-form proposal with Impeccable’s inline editing guidance. The form opens
beneath the selected recipient. Phone/country, email, Dearly ID and optional name
can be corrected; self recipients can change their display name. Update replaces
one row locally, Cancel keeps the original, and Save draft persists the changes.
Other recipient mutations and draft saving are blocked until the entry finishes.
Schedule review continues to use the saved draft; destinations are not edited on
an active schedule.

Normalization and duplicate checks apply to corrections while excluding the
edited row. A full 50-recipient list can still be edited. Six new tests cover
replacement, immutability, duplicate/self identity, capacity, phone/email validation,
unavailable-account correction and invalid indexes. All 89 frontend tests, lint and
types passed; the detector returned no findings. Verified prefilled email editing,
cancel, successful replacement, invalid input recovery, disabled saving and inline
placement on iPhone 17 Pro Max. The synthetic unsaved test draft was discarded;
no real recipient data was saved and no message was sent.

## Scheduling controls — 20 November 2026

Combined Stitch's focused scheduling revision with Impeccable's native form
and error-recovery guidance. iOS now opens a calendar and clock picker with
Cancel/Done; Android uses its native calendar/clock dialogs. Picker values retain
the selected wall-clock fields independently of the phone timezone. The server
still resolves the named delivery timezone and rejects invalid or ambiguous times.

Every saved draft recipient remains included, matching the scheduling contract.
Recipient groups show destinations and one explicit channel choice per phone.
Round channel controls and square permission controls remain visible on iOS.
Unavailable channels and missing WhatsApp/SMS permission explain why Review is
disabled directly above the action. Longer privacy details are expandable. The
resolved-time review and separate final confirmation remain required.

All 95 frontend tests, lint and types passed, including six new selection,
permission, date/time and timezone cases. Eight scheduler integration checks passed
against the disposable local PostgreSQL instance with fake transports. Native
checks on iPhone 17 Pro Max verified calendar selection, clock opening/cancel,
recipient grouping and the unchecked-permission blocker. Android interaction and
clock-wheel value changes were not separately verified. Expo Doctor passed all
20 checks and the iOS production bundle exported successfully. No real schedule was
confirmed and no external message was sent.

The normal local API and delivery worker were restored using the existing private
environment; the earlier isolated UI-preview provider settings no longer apply to
those running processes. No hosted deployment, release or APK rebuild was made.

## 12-hour scheduling clock — 20 November 2026

Changed the mobile scheduling time button and accessible label to explicit AM/PM
format. Android requests its 12-hour clock; iOS uses the English-US locale only
for the supported time spinner, preserving the calendar's existing locale. This
focused correction follows the paired Stitch and Impeccable review. Internal
HH:mm wall-clock values, named timezone resolution and delivery instants remain
unchanged.

Lint, strict type checking and all 95 frontend tests passed. The iPhone simulator
rendered the new AM/PM caption and formatted time. Picker interaction verification
was interrupted by a desktop-control timeout; no schedule was changed by this check.

## Profile verified email — 20 November 2026

Added an inline email verification flow to the existing Profile screen. The
focused Stitch proposal and Impeccable copy guidance were reconciled into one
save-then-verify flow, a single accessible six-digit field, resend countdown,
expired/error states and a verified status. Speculative encryption, secure-enclave
and automatic SMS-fallback claims from the proposal were excluded. Phone sign-in
remains unchanged; the new proof enables account-owned email inbox matching.

Frontend lint/types and 97 tests passed. The iPhone app refreshed its dashboard
successfully, but desktop control could not click the Profile navigation because
the Simulator window became unavailable. The Profile verification layout and live
email-code acceptance are not claimed as interactively tested. No test email,
WhatsApp notification or SMS was submitted for this work.
