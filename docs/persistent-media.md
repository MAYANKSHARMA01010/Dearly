# Persistent mobile media — Phase 22

Neon and the authenticated backend remain authoritative. This cache saves transfer
bytes, not authorization calls. Android/iOS retain verified encrypted downloads;
web continues using temporary Blob URLs and does not persist reusable downloads.

## Authorization and identity

Owner and delivered-inbox attachment content routes have a read-only `/access`
child endpoint. It applies the same owner, committed delivery and due-time checks
as the content endpoint, returning only attachment ID, immutable SHA-256, byte
count, MIME type and a five-minute access window. It creates no opened receipt
and reveals no storage path. The upload reservation's `expiresAt` is not a READY
attachment's access deadline.

Every native open checks that endpoint online before reading retained bytes.
Account, API origin, content route and authorized SHA-256 identify a cache entry.
Changes remove the previous version; denied or failed checks remove matching
retained entries and fail closed. There is no offline unlock or cached auth
fallback. A local deadline bounded by the server's five-minute window
is calculated conservatively from the request start. A transfer finishing after
that window cannot expose a playback copy.

An open viewer stops rendering content when its access window expires, including
a foreground deadline check. Revocation while already open is not instantaneous;
it is enforced at the next online open or local five-minute deadline. Neither
cached metadata nor a successful transfer implies delivery or content opening.

## Storage and protection

- A separate SQLCipher index stores identity, digest, MIME, byte counts, local
  file name, retention deadline, last access and latest access deadline. No tokens,
  OTPs or media bytes are stored there. Cipher support is required before writes.
- Reusable files use AES-256-GCM with an independent random file key. Index and
  file keys live only in device-only SecureStore. No plaintext fallback exists.
- SHA-256 and exact size are verified before committing ciphertext and after
  decrypting it. A `.part` file is moved into place before its metadata is stored.
  Interrupted encryption, missing files, invalid ciphertext and orphan files are
  removed; corrupt bytes are downloaded again only after online authorization.
- Ciphertext and its encrypted index live in Expo's private **cache directory**,
  not Documents, gallery, shared storage or the database's default directory.
  [Android backup excludes cache files](https://developer.android.com/identity/data/autobackup),
  and [Apple excludes Library/Caches from backups](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/FileSystemOverview/FileSystemOverview.html).
  SecureStore uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. OS cache eviction is a normal
  miss; the server retains the original.
- Native players require a temporary decrypted file in a separate private cache
  directory. Dismissal, access expiry while the app runs, auth suspension and restart remove
  these playback copies. Suspended processes cannot guarantee deletion at a wall-clock
  instant; foreground/startup cleanup remains required. Reusable ciphertext survives dismissal/restart. Files explicitly
  exported to another app may remain there; clearing Dearly cannot remove them.
  Deleting files/keys is not a promise of physical flash erasure.

## Bounds and recovery

Retention is at most seven days from the completed download, without extending it
on reuse. The encrypted media-byte budget is 250 MiB with at most 500 entries;
least recently used entries are evicted before committing a new download. SQLite
is independently page-bounded. All index/file operations serialize, and generation
checks after native operations prevent canceled or logged-out work from exposing
plaintext. A backward clock change removes retained entries rather than extending
them. Startup/authenticated foreground sweeps remove expired, missing and orphan
files; access checks enforce deadlines even between sweeps.

One attachment is decrypted/encrypted at a time, bounded by existing per-type
limits (maximum video 50 MiB). The adapter checks free disk for four times the
attachment size plus 16 MiB, allowing transient encryption/decryption overhead.
This is a conservative precheck, not an assurance against another app consuming
disk concurrently. Allocation/write failures remain failures, with temporary-file
cleanup. Encryption or index/key failures never create a plaintext persistent
fallback; Settings → Clear downloaded media resets this disposable cache.

Settings reports actual encrypted bytes/count and confirms clearing downloads.
Clearing downloads removes media keys/index/files and playback copies while
preserving pending selections and recordings. Logout/account or API-origin changes
purge reusable downloads; logout also clears Dearly's temporary pending files.
Server objects are unchanged. Pending upload recovery across process death is
outside this cache's scope and remains unchanged.

## Verification

Unit tests use real host SQLite with a deterministic file/crypto adapter to cover
reuse, per-open access, version changes, denial, missing/corrupt files, retention,
clock rollback, scope isolation, LRU/disk bounds, encryption failure and cancellation
including a queued clear during transfer. Backend tests cover metadata projection,
owner/recipient/due-time boundaries and no storage read/open mutation; isolated
PostgreSQL attachment integration exercises anonymous/other-owner/unfinalized
rejection and READY digest metadata. Native encryption, restart, playback and
release evidence are recorded in the Phase 22 closeout below when observed.
