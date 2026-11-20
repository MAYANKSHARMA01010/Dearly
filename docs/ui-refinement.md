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
| 5 | Edit draft `/drafts/[id]` | Next |
| 6 | Schedule list `/schedules` | Pending |
| 7 | Review schedule `/schedules/new` | Pending |
| 8 | Scheduled message `/schedules/[id]` | Pending |
| 9 | Reschedule `/schedules/reschedule` | Pending |
| 10 | Mailboxes `/mailboxes` | Pending |
| 11 | Owned message `/mailboxes/owned/[id]` | Pending |
| 12 | Received message `/mailboxes/received/[id]` | Pending |
| 13 | Profile `/profile` | Pending |
| 14 | Settings `/settings` | Pending |
| 15 | Notifications `/notifications` | Pending |
| 16 | Service status `/status` | Pending |
| 17 | Page not found | Pending |

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
