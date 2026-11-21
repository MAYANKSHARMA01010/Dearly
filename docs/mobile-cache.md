# Mobile SQLite cache — Phase 20

## Authority and scope

Neon and authenticated API checks remain authoritative. Phase 20 stores copies
only after successful remote authentication and explicitly allowlisted GETs:
profile, notification preferences, dashboard counts, owner message details, and
already delivered recipient details. Existing contracts rebuild the stored value;
unknown fields, codes, tokens, signed URLs and arbitrary responses are excluded.
A profile ID must match the active account; detail IDs must match the record key.
Received content must have both delivery and scheduled timestamps at or before now.
Owner-created future messages can be stored only as owner-authorized representations.

Screens continue reading the server in this phase. The repository's fresh-only
read boundary is ready for Phase 21; there is no offline sign-in, cached auth
approval, offline write queue or automatic send/confirmation replay. Media bytes
keep their existing temporary-cache behavior until Phase 22.

## Encryption and lifecycle

Expo SDK 58 uses `expo-sqlite` 58.0.18 with `useSQLCipher: true` for both native
platforms. Before tables or payloads are written, the native adapter requires a
nonempty `PRAGMA cipher_version` result. An old binary/Expo Go without SQLCipher
disables caching; it never silently falls back to plaintext. Web caching is a
no-op, without introducing IndexedDB/localStorage persistence.

A random 256-bit raw SQLCipher key is stored only in SecureStore using
`WHEN_UNLOCKED_THIS_DEVICE_ONLY`; session tokens remain in their existing separate
SecureStore entry. The key is strictly validated hexadecimal before the sole
PRAGMA interpolation. Account IDs, origins, keys and payloads use bound SQL values.
No key/payload/database error is printed or sent to analytics.

The cache uses one private native database, encrypted including its metadata,
with a serialized connection owner and versioned transactional migrations. The
migration and user_version update commit together. Newer schemas or migration
failures disable caching without deleting the database as a workaround. Corrupt
cache/storage failures return misses and do not block server recovery. Explicit
sign-out purges the disposable database/key; a later successful sign-in can
recreate it. No server database or unrelated app's files are deleted.

All records are keyed by account, API origin, kind and record key. Activation is
allowed only after remote identity proof. It removes other namespaces; account or
origin changes in-process also close/delete the previous cache/key. Logout,
restoration and account transitions synchronously revoke the current cache lease,
so an in-flight operation cannot publish an old result afterward. Logout closes
the connection and removes the decryption key before deleting the database. A
failed purge leaves the cache disabled and must succeed before reuse. Physical
flash erasure, protection on rooted devices and protection of already-rendered
content are not promised. Device backups may contain encrypted database bytes;
the device-only key is not portable. Missing/mismatched keys disable caching until
explicit sign-out cleanup; they do not create a plaintext replacement.

## Expiry, ordering and bounds

| Record | Maximum freshness |
| --- | --- |
| Profile / preferences | 5 minutes |
| Dashboard counts | 60 seconds |
| Owner / delivered recipient detail | 5 minutes |

Every row includes fetched_at, expires_at, record_version and deleted_at. Detail
versions use the server version when present; other snapshots use the local fetch
timestamp, which is not a server revision or authorization decision. Deletion
markers contain no payload and prevent older/equal fetches from resurrecting a
record during their TTL. Phase 21 owns server-driven invalidation and deletion
observation; Phase 20 never claims those are already synchronized.

Reads prune expired rows first, reject future/invalid timestamps and never return
expired/deleted data. Expiry is inclusive. An observed backward wall-clock change
purges snapshots before serving another read. This does not make the device clock
trusted. Remote revocation cannot be detected offline; no offline consumption is
enabled in this phase. Phase 21 must define its authorization window before use.

Retention is bounded to 200 rows, 128 KiB worst-case UTF-8 per payload and 4 MiB
of retained payload bytes. SQLite has a 4096-page limit (normally 16 MiB with
4096-byte pages), uses an encrypted DELETE journal, secure_delete and memory temp
storage. Freed pages may keep the file at its high-water mark. Disk-full or
oversized/invalid writes disable or skip cache work while network reads continue.

## Verification

See the dated Phase 20 record in [the follow-up plan](follow-up-phases.md).
Host SQLite tests execute actual migrations/queries and close/reopen a temporary
file; they do not prove SQLCipher in a native binary. Native verification must
separately prove cipher availability, restart persistence, encrypted file bytes,
expiry/isolation/purge and the matching signed APK identity. No live OTP is needed
for synthetic storage checks. Physical device installation remains separate.

References: [Expo SDK 58 SQLite and SQLCipher](https://docs.expo.dev/versions/v58.0.0/sdk/sqlite/),
[SecureStore](https://docs.expo.dev/versions/v58.0.0/sdk/securestore/).


22 November 2026: host migration/persistence/security checks and native Android
synthetic encryption/restart checks passed for 1.2.0 RC1 / build 9. The native test
APK used a separate synthetic bundle with identical native-library hashes; the
published signed APK was not modified and has no test entry. See the follow-up
record for scope, exact commit and remaining device/iOS gates.
