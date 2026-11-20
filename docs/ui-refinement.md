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
| 2 | Sign-in / OTP `/login` | Next |
| 3 | Draft list `/drafts` | Pending |
| 4 | New draft `/drafts/new` | Pending |
| 5 | Edit draft `/drafts/[id]` | Pending |
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
