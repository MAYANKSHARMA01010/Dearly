# Private attachments and voice — Phase 8

Save a draft first, then choose a photo/video, choose a file/audio clip, or record
a voice note. Review the local selection and explicitly upload it. Attachments
save independently of message text. Only **Saved privately** means validation and
persistence were confirmed. Adding media does not schedule, deliver or share it.

## Storage decision and setup

This phase selects a private local filesystem adapter. It uses existing disk space,
requires no cloud account, and adds no paid service. PostgreSQL stores metadata;
file bytes stay in `backend/data/attachments/` by default, excluded from Git.
The storage interface lives in `backend/src/providers/storage/`; hosting later
requires a persistent private volume and backups alongside the database. An
ephemeral hosting directory would lose files and must not be used for real data.
No hosted storage provider, billing, public bucket or paid upgrade is enabled.

From `backend/`, install dependencies, run `npm run prisma:deploy`, and regenerate
Prisma if needed. Preserve the private `.env` and existing connection string.
Optional settings, shown safely in `.env.example`:

```dotenv
STORAGE_ROOT=./data/attachments
FFPROBE_PATH=ffprobe
```

Install **ffprobe** from a trusted FFmpeg distribution before validating images,
audio or video. It is already available on this development Mac. FFmpeg is
[free/open-source](https://ffmpeg.org/legal.html); build licenses depend on enabled
components. Its [ffprobe documentation](https://ffmpeg.org/ffprobe.html) describes
stream inspection. No external media service is called. PDFs are parsed with
[MIT-licensed PDF-LIB](https://github.com/Hopding/pdf-lib/blob/master/LICENSE.md) in
a worker with a five-second deadline and a 64 MB JavaScript heap limit.

The local adapter streams exact reserved bytes to an exclusive temporary file,
computes SHA-256, and publishes by atomic rename. Files/directories use private
permissions. Filenames supplied by users are display metadata, never filesystem
paths. Keep the storage directory out of public/static serving and maintain
at least 50 MiB free disk space beyond the next upload. Back up DB references and
objects together; READY objects are immutable through the API.

## Limits and validation

All MB values below are MiB (1,048,576 bytes).

| Type | Accepted formats | File limit | Other bounds |
| --- | --- | --- | --- |
| Photo | JPEG, PNG, WebP | 10 MiB | Up to 20 million pixels, each dimension at most 8,192 |
| Video | MP4, MOV, WebM | 50 MiB | Up to 120 seconds; one video track, at most one audio track; dimensions at most 4,096 and 10 million pixels |
| Audio/voice | M4A, MP3, WAV, audio WebM | 10 MiB | Up to 300 seconds; one audio track, no video |
| PDF | Unencrypted PDF | 20 MiB | Parseable document with 1–100 pages |
| Text | UTF-8 plain text | 1 MiB | Reject binary/control bytes except tabs/newlines |

Each draft allows 10 reservations/attachments and 100 MiB total. Each account
allows 500 MiB; the backend allows 2 GiB total reserved bytes. Pending/deleting
objects count until removed, preventing quota evasion through unfinished uploads.
The server serializes reservations across processes before checking allowances.
Capacity exhaustion stops uploads; it never enables billing or upgrades a plan.

The allowlist excludes archives, Office formats, HEIC/GIF and unsupported codecs.
Supported video codecs are H.264, HEVC, VP8, VP9 and AV1; audio codecs are AAC,
MP3, Opus, Vorbis and common PCM WAV encodings. Playback support still depends on
the device/browser; the app shows playback failure without claiming the file was
sent. Prefer MP4/H.264 and M4A/AAC for broad native compatibility.

Validation checks actual signatures and ffprobe stream metadata, not just names
or supplied MIME types. ffprobe runs without network protocols, with a ten-second
deadline and bounded output. At most two inspections run per backend process;
excess finalization requests return a retryable unavailable response while uploaded
bytes stay private. PDF parsing checks document structure and page count.
This is format validation, not malware scanning or document sanitization. Files
remain private and documents open only through an explicit viewer/share action.

## Authenticated API

All paths begin `/messages/drafts/:draftId/attachments`. Every operation validates
the current bearer session and draft ownership; intended recipients cannot access
these draft files. Foreign/missing IDs share a 404. Binary content is served with
`Cache-Control: private, no-store`, `nosniff`, and document attachment disposition.
There are no public permanent or token-in-query URLs. Range reads are supported.

| Method/path suffix | Behavior |
| --- | --- |
| `GET /` | List up to 10 attachment states for the owned draft |
| `POST /` | Reserve `{ id, name, mime, bytes }`; `id` is a client-generated UUID |
| `GET /:id` | Read owned reservation metadata/state |
| `PUT /:id/content` | Stream raw bytes as `application/octet-stream`; exact reserved length required; no compression |
| `POST /:id/finalize` | Inspect uploaded bytes, then mark READY; READY replay is idempotent |
| `GET /:id/content` | Download READY content only, after fresh authorization |
| `DELETE /:id` | Tombstone and remove the owned object/metadata; owner-scoped retries are idempotent |

Metadata responses expose `id`, `name`, `mime`, `bytes`, `state`, `createdAt`,
`expiresAt`. Internal paths, hashes, owner IDs and transfer attempt IDs stay private.
The lifecycle is PENDING → UPLOADING → UPLOADED → READY. Removal uses DELETING.
A failed/interrupted transfer returns to PENDING. A process crash can leave
UPLOADING until its 15-minute lease becomes stale; cleanup or explicit removal
can then clear it. Active transfers cannot be overwritten or removed.

Reservation retries reuse the **same UUID and metadata**. After an uncertain
response, the mobile flow checks the existing reservation: READY completes without
resending, UPLOADED finalizes without resending, PENDING explicitly retries bytes,
and UPLOADING asks the user to refresh/wait. Choosing a new selection creates a new
UUID. No write automatically retries after a 401/timeout; access renewal and all
file transports share the existing serialized session manager.

Uploads have a ten-minute transfer deadline and bounded size; server requests
allow 610 seconds with a 30-second idle timeout. Native upload/download tasks use
foreground sessions to avoid hidden background retries, with progress and cancel.
Downloads verify the expected byte length before preview. Large native videos
are streamed from files; they are never converted to base64 or a whole JS buffer.

## Mobile privacy and permissions

The app requests microphone access only when Record voice is pressed. Denial
explains recovery through Settings or choosing an existing audio file. Recording
stops in the background, on cancellation, or near the duration/size cap. Review
and upload are explicit steps. System photo/file pickers grant access to chosen
items; no contact import, camera capture or broad photo-library permission request
is added. A temporary inactive state for a system picker does not trigger session
restoration; returning after actual backgrounding still gates and checks the session.

Native selections, previews and recordings use private temporary files. Managed
copies are deleted on discard, preview close, screen disposal and sign-out. Startup
clears the Dearly media cache and Dearly-prefixed crashed recordings. Picker caches
are system-managed until selection processing; no original Photos/Files document
is deleted. Credentials never appear in media URLs or persisted media metadata.
Text previews show up to 65,536 characters; PDF opening uses the device document
viewer/share menu. Selecting an external sharing destination is a user action.
Web uses browser File/Blob objects and local object URLs; sharing/recording support
varies by browser and may require HTTPS and microphone permission.

## Cleanup and retention

Unfinished reservations expire after 24 hours. READY files attached to a surviving
draft are retained until explicitly removed or the draft/account is deleted.
Draft deletion nulls the attachment reference so cleanup can still locate its
object. Account deletion cascades metadata; orphan scanning later finds its files.

Run `npm run attachments:cleanup` from `backend/`. The command processes up to 100
eligible rows and 100 orphan files per run. It retries DELETING rows, expired
unfinished reservations, stale transfer leases and deleted-draft references.
Orphan files must be at least 24 hours old; each DB reference is rechecked under
the reservation lock before unlinking. Referenced READY media is preserved.
Cleanup failures leave tombstones for a later retry instead of claiming removal.

This command is explicit in local development. Configure an external hourly job
against the same database and persistent storage when hosting; rerun to drain
large backlogs. It is not an app timer or a deployed scheduler in this phase.
Cleanup removes live objects, not separately retained backups; define hosted backup
retention before public use. No arbitrary draft age automatically deletes READY media.

## Verification

Backend `npm run check` covers lint, strict type checks, 35 standard tests and build.
Its opt-in `npm run test:integration` requires private `AUTH_TEST_DATABASE_URL` and
ffmpeg/ffprobe. Disposable PostgreSQL schemas and filesystem roots isolate tests.
Attachment integration covers idempotent/concurrent reservations, ownership,
pre-validation denial, range download, oversized/short transfers, mismatched MIME,
retry, every accepted format family, quotas and active-transfer removal protection,
deleted-draft/orphan cleanup, preserved READY objects and safe logs.

Frontend `npm run check` covers lint, strict JS/JSDoc checks and 55 unit tests.
Mobile integration retains auth and draft coverage with the additive schema.
SDK 58 modules were installed through Expo; configuration disables background
recording/playback and camera capture. Expo Doctor and platform exports verify
compatibility/bundling. See the dated phase record for exact native device evidence
and remaining runtime limitations. Scheduling and provider delivery remain Phase 9+.

SDK note: when supplying a recording filename to `prepareToRecordAsync`, pass the
full quality/container preset as well. A filename-only override can fall back to
native PCM defaults; a `.m4a` suffix alone is not proof of AAC/MP4 content.

## Scheduled messages

Phase 9 freezes attachment mutations once a message is scheduled or canceled.
Owner-only reads/previews remain available through the same private endpoints.
Reservations and removal acquire the message lock used by scheduling; pending or
deleting attachments block confirmation. Cancel and return the message to drafts
before changing attachments, then review a new schedule. See [scheduling](scheduling.md).
