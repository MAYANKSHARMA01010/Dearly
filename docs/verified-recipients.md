# Verified recipient accounts

Registration and login remain mobile-number based. The configured real login
transport is WhatsApp; no automatic SMS fallback or email login was added.

In Profile, save an email address, request its verification code, then enter the
six-digit code sent through Gmail. Verification attaches that address to the
existing phone account. Saving another address clears verification and consumes
pending challenges. One verified address belongs to at most one account.

The authenticated `/auth/email/request` and `/auth/email/verify` endpoints keep
challenge IDs account-scoped. Codes expire in five minutes, allow five incorrect
attempts, and are hashed with a secret separate from their domain-separated
relay derivation. Resends wait 60 seconds; persistent per-account/address budgets
allow five requests per hour and the dedicated sender budget allows 100 daily.
Network uncertainty is never automatically replayed. The trusted relay accepts
only a durable challenge ID, derives its recipient from that active record and
checks that the profile address still matches before submitting Gmail mail.

On dashboard/Received refresh, at most 100 active due external deliveries are
matched to the account's verified phone or verified email. New matches create
committed inbox items and deduplicated notifications. Unverified profile emails,
future deliveries, revoked/expired unclaimed links, rejected submissions and
recipients bound to another account are excluded. Repeat refreshes are idempotent;
refresh again to import another batch. A recipient binds once and cannot be
redirected to a replacement account. Existing bindings are never rewritten.

Once imported, a message belongs to that recipient's inbox. Later email changes
or private-link expiry/revocation do not erase that already delivered copy.
Recipient access remains authenticated and ownership scoped; attachment access
uses the same checks. Refresh/import never marks content opened. Only explicit
Open in the app updates the inbox and external content-read evidence; SMS or
WhatsApp delivery receipts remain separate.

All notifications use the hosted HTTPS origin, including local-worker sends.
Email/WhatsApp and the SMS companion page explain app download, phone registration,
Profile email verification and Received. SMS retains one carrier segment. Old
notifications are not automatically resent. The shared database, private object
storage and access-signing key must match the hosted viewer.

The additive migrations add verified-email state/challenges, a durable external
inbox claim marker and support for binding EMAIL recipients. They do not reset
users or existing messages. Backups include the new records; restore consumes
all pending email challenges alongside phone challenges.
