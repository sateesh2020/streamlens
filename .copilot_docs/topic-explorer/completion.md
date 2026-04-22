## Completion: Topic Explorer

### Status

`[x] Complete`

### Implementation Notes

**Topic caching**: Topics are stored in the `topics` PostgreSQL table (added via migration `20260421155923_add_topics_cache`). `GET /api/clusters/[id]/topics` reads from DB — no Kafka connection needed on page load. A dedicated `POST /api/clusters/[id]/topics/sync` endpoint fetches from Kafka and upserts the cache, removing stale entries. The UI shows a "last synced X ago" timestamp and a "Sync from Kafka" button; a banner prompts the first sync when no data is cached yet.

**Read-only mode**: Create Topic and Delete Topic operations have been removed from the UI. The API handlers (`POST /api/clusters/[id]/topics` and `DELETE /api/clusters/[id]/topics/[topic]`) are commented out (not deleted) so they can be re-enabled when role-based auth is added. The per-row message count retry (`PATCH`) remains active.

Topic exploration spans three nested pages under `/clusters/[id]/topics/`:

1. **Topic list** (`topics-client.tsx`) — fetches from `GET /api/clusters/[id]/topics`. Displays a searchable table of topics with partition count, replication factor, and under-replicated partition warnings.

2. **Topic detail** (`[topic]/topic-detail-client.tsx`) — fetches from `GET /api/clusters/[id]/topics/[topic]`. Shows a summary card (partition count, replication factor, internal flag) plus a configs table (retention.ms, retention.bytes, cleanup.policy, etc.) and a partitions metadata table.

3. **Message browser entry**: Topic detail page has a "Browse Messages" button that links to `/clusters/[id]/topics/[topic]/messages`.

The API routes use KafkaJS `admin.listTopics()` + `admin.fetchTopicMetadata()` for the list view, and `admin.describeConfigs()` + `admin.fetchTopicOffsets()` for the detail view. Total message counts are computed by summing `high - low` offsets across all partitions.

### Checklist

- [x] API route: `GET /api/clusters/[id]/topics` — reads from DB cache, returns `{ topics, syncedAt }`
- [x] API route: `POST /api/clusters/[id]/topics/sync` — Kafka → DB upsert, removes stale topics, tracks per-topic offset failures
- [x] API route: `GET /api/clusters/[id]/topics/[topicName]` — live detail from Kafka
- [x] API route: `POST /api/clusters/[id]/topics` — implemented but commented out (admin-only)
- [x] API route: `DELETE /api/clusters/[id]/topics/[topicName]` — implemented but commented out (admin-only)
- [x] API route: `PATCH /api/clusters/[id]/topics/[topicName]` — re-fetches message count for one topic, clears/sets `messageCountSyncFailed`
- [x] KafkaJS: topic list with partition and replication metadata
- [x] KafkaJS: offset fetching for `totalMessageCount` (high - low per partition, during sync)
- [x] KafkaJS: `describeConfigs` for retention and topic configs (detail page)
- [x] Topic DB cache (`topics` table with `totalMessageCount`, `messageCountSyncFailed`, `syncedAt`; unique on `[clusterId, name]`, `onDelete: Cascade`)
- [x] Migrations: `add_topics_cache`, `add_topic_message_count`, `add_message_count_sync_failed`
- [x] Topic list page reads from DB (fast, no Kafka on load)
- [x] "Sync from Kafka" button with last-synced timestamp in header and table footer
- [x] Never-synced banner with "Sync now" shortcut
- [x] Sync error banner shown on failure
- [x] `totalMessageCount` column displayed in topic list
- [x] Per-row retry button (amber "failed" label + `↻`) when `messageCountSyncFailed === true`
- [x] Topic list page with search filter
- [x] Internal topics toggle (hide `__` prefixed topics, default on)
- [x] Topic detail page with summary card
- [x] Topic detail page with config table
- [x] Partitions table with under-replicated highlight
- [ ] Create topic modal — UI removed (admin-only, API code preserved)
- [ ] Delete topic confirmation — UI removed (admin-only, API code preserved)
- [x] "Browse Messages" button linking to message browser
- [x] Loading skeletons and error states

### Decisions Made

- **DB-cached topic list**: `GET /api/clusters/[id]/topics` reads from the `topics` table — page loads with zero Kafka connections. Sync is explicit (user-triggered), solving the original concern about offset fetching being slow for large clusters.
- **`Promise.allSettled` for offset fetches during sync**: Individual topic offset failures don't abort the whole sync. Each failure sets `messageCountSyncFailed: true` on that row so the user can retry selectively.
- **Per-row retry via `PATCH`**: Rather than re-running the full sync for a single failed count, `PATCH /api/clusters/[id]/topics/[topic]` fetches and updates just that one topic. Clears `messageCountSyncFailed` on success; re-sets it on failure so the retry button persists.
- **Message count is a snapshot**: Counts reflect the state at last sync time, not real-time. This is an intentional trade-off — real-time counts require a Kafka connection per page load.
- **Under-replicated detection**: A partition is flagged under-replicated when `isr.length < replicas.length`. The row is highlighted with an amber left border and badge.
- **Internal topics toggle**: Hidden by default (filtered in DB query via `isInternal: false`); a toggle re-queries with `includeInternal=true`.
- **Read-only for non-admins**: Create/Delete topic UI removed. API code commented out (not deleted) with the note "admin-only, re-enable when role auth is added".

### Known Issues / Follow-ups

- Topic config table on the detail page shows raw Kafka config keys — no human-readable labels.
- Delete topic does not check for active consumer group offsets before deleting (moot until re-enabled).
- No topic-level metrics (message rate, bytes in/out) — requires JMX.
- Message count is stale until next sync; no auto-refresh polling.
- Columns are not sortable (sort by topic name ascending only).
