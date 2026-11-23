# Project documentation

Android APK and backend are the active delivery and testing scope. Shared iOS
source/configuration is retained; iOS testing and APNs are outside current scope.

## Start and operate

- [Repository structure](project-structure.md)
- [Environment configuration](environment-setup.md)
- [Android APK builds](android-apk.md)
- [Render deployment](render-deployment.md)
- [Release pipeline](release-pipeline.md) and [release packaging](releases/README.md)
- [Production operations, backup and recovery](release-operations.md)
- [Swagger and scheduled operations](api-and-scheduled-operations.md)

## Product and security contracts

- [Authentication](authentication.md) and [mobile sessions](mobile-auth.md)
- [Draft API](draft-api.md) and [mobile drafts](mobile-drafts.md)
- [Attachments](attachments.md), [persistent media](persistent-media.md)
- [Scheduling](scheduling.md), [delivery workers](delivery-workers.md), [mailboxes](mailboxes.md)
- [Email](email-delivery.md), [WhatsApp](whatsapp-delivery.md), [SMS](sms-delivery.md)
- [Verified recipients](verified-recipients.md), [notifications/preferences](notifications-settings.md)
- [Encrypted snapshots](mobile-cache.md), [synchronization](mobile-synchronization.md)

## Recipients and contacts

The app supports manually entered phone/email recipients, Dearly user IDs and
self-delivery. Existing recipients can be edited in drafts. It does not request
contacts permission or scan/import the phone address book. WhatsApp session setup
disables contact/history collection where supported; pairing a sender is separate
from managing recipients. Database user/recipient records remain private.

Historical roadmaps, task progress, device-test evidence and private audit notes
are intentionally not published in this repository. They are not needed to run
or understand the app. Keep useful contracts and runbooks here; store internal
continuity under the ignored local notes directory.
