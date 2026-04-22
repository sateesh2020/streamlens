## Completion: Schema Registry

### Status

`[x] Complete (core functionality)`

### Implementation Notes

Schema Registry subjects are cached in the `schema_subjects` PostgreSQL table (migration `20260421170000_add_schema_subjects_cache`). `GET /api/clusters/[id]/schema-registry/subjects` reads from the DB — no HTTP call to the registry on page load. A dedicated `POST /api/clusters/[id]/schema-registry/sync` endpoint fetches all subjects from the registry and upserts the cache, removing stale entries. Schema content for individual versions is always fetched live from the registry.

The feature spans two nested pages under `/clusters/[id]/schema-registry/`:

1. **Subjects list** (`schema-registry-client.tsx`) — fetches from DB via `GET .../subjects`. Displays a searchable table with Schema Type badge, Versions count, and Compatibility badge. Includes "Sync from Registry" button with last-synced timestamp, never-synced banner, and sync error banner. Shows an informational empty state when no registry URL is configured.

2. **Subject detail** (`[subject]/subject-detail-client.tsx`) — summary card with type, compatibility, and version count badges. Version selector (latest + individual vN buttons). Schema viewer renders pretty-printed JSON (or raw text for Protobuf) with a copy button.

The sync process uses `Promise.allSettled` across all subjects: for each subject it calls `/versions`, `/versions/latest` (for schema type), and `/config/{subject}` (for compatibility, with global `/config` as fallback) in parallel.

The Schema Registry quick-nav card on the overview page and the sidebar link both point to `/clusters/[id]/schema-registry`. The nav item is conditionally shown only when `schema_registry_url` is set on the cluster.

### Checklist

- [x] API route: `GET /api/clusters/[id]/schema-registry/subjects` — reads from DB cache, returns `{ subjects, syncedAt, schemaRegistryUrl }`
- [x] API route: `POST /api/clusters/[id]/schema-registry/sync` — Registry → DB upsert, removes stale subjects, `Promise.allSettled` for per-subject detail fetches
- [x] API route: `GET /api/clusters/[id]/schema-registry/subjects/[subject]/versions/[version]` — live schema content from Registry
- [x] Schema Registry HTTP proxy client (native `fetch`, no auth for MVP — see Known Issues)
- [x] Global compatibility config fetch fallback (`/config` used when `/config/{subject}` returns 404)
- [x] `schema_subjects` DB model (`subject`, `schemaType`, `versionCount`, `latestVersion`, `compatibility`, `syncedAt`; unique on `[clusterId, subject]`, `onDelete: Cascade`)
- [x] Migration: `add_schema_subjects_cache`
- [x] Conditional nav item (sidebar + overview quick-nav) — hidden when no registry URL
- [x] Unconfigured empty state when cluster has no `schema_registry_url`
- [x] Schema registry list page with subject table (Subject, Type, Versions, Compatibility)
- [x] Search/filter for subjects (client-side substring match)
- [x] "Sync from Registry" button with last-synced timestamp
- [x] Never-synced banner with "Sync now" shortcut
- [x] Sync error banner shown on failure
- [x] Subject name links to subject detail page
- [x] Subject detail page — summary card (subject name, schema type badge, compatibility badge, version count)
- [x] Version selector component (latest + vN buttons)
- [x] Schema viewer (pretty-printed JSON / raw text) with copy button
- [x] Schema ID and version number displayed below version selector
- [x] Loading skeletons and error states

### Decisions Made

- **DB-cached subject list**: Same pattern as topics — `GET .../subjects` reads from DB, zero registry HTTP calls on page load. Sync is user-triggered.
- **`Promise.allSettled` for per-subject detail fetches**: Individual subject failures during sync don't abort the whole sync. Failed subjects are simply omitted from the upsert (they remain in the DB from the last successful sync).
- **Schema content always live**: Schema content for a specific version is fetched live on the detail page (not cached). Schemas are immutable once registered, so a `staleTime` of 5 minutes is used in react-query.
- **Versions array derived from `latestVersion`**: Rather than storing the full versions array, only `latestVersion` and `versionCount` are cached. The version selector renders buttons from `1` to `latestVersion`. This assumes no gaps in version numbers (deleted versions would still show a button that 404s on click — acceptable for MVP).
- **No basic auth for registry in MVP**: The cluster's `auth_config` covers Kafka auth only. Schema Registry basic auth is a follow-up.

### Known Issues / Follow-ups

- Schema Registry basic auth credentials are not applied to proxy requests — registries requiring HTTP Basic auth will fail.
- Version selector assumes contiguous version numbers; deleted versions will show a button that returns an error.
- Compatibility mode tooltip explaining BACKWARD/FORWARD/FULL semantics not implemented.
- No subject-level version diff view.
- Subjects that match TopicNameStrategy (`{topic}-key`, `{topic}-value`) have no direct link back to the topic.
- `schemaType` defaults to `"AVRO"` for registries that don't return it in the versions/latest response (older Confluent versions).
