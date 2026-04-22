## Feature: Topic Explorer

### Problem

Kafka operators and developers routinely need to inspect topic configuration, partition layout, and message volume. The only native way to do this is through CLI scripts that return dense, unformatted output. There is no ergonomic way to search, filter, or navigate topic metadata in real time, making routine tasks like verifying replication or checking message lag unnecessarily slow.

### Users

- **Backend developers** who need to verify that a topic exists, has the correct partition count, and is properly replicated before deploying a service.
- **Platform/DevOps engineers** who audit topic retention policies and replication factors across a cluster.
- **Data engineers** who need partition-level offset data for pipeline design or debugging.

### Success Metric

- A user can locate any topic in a cluster of 1,000 topics using the search box within 5 seconds.
- Partition-level details (leader, replicas, ISR, offsets) are visible without leaving the topic detail view.
- Topic creation and deletion are completable in under 30 seconds each.

### User Stories

1. As a developer, I want to see a paginated, searchable list of all topics so that I can find a topic quickly even in large clusters.
2. As a developer, I want to filter topics by name prefix or substring so that I can narrow down topics belonging to a specific service or domain.
3. As a developer, I want to see key metadata for each topic (partition count, replication factor, total message count, retention) in the list view so that I can compare topics at a glance.
4. As a platform engineer, I want to drill into a topic to see per-partition details (leader, replicas, ISR, begin/end offsets) so that I can diagnose replication and offset issues.
5. As a DevOps engineer, I want to create a new topic with configurable partition count and replication factor so that I do not need CLI access.
6. As a DevOps engineer, I want to delete a topic with a confirmation prompt so that accidental deletions are prevented.

### Functional Requirements

#### API Routes

- `GET /api/clusters/[id]/topics` — list all topics from the DB cache.
  - Query params: `includeInternal` (boolean, default `false`).
  - Response: `{ topics: TopicSummary[], syncedAt: string | null }`.
  - Each topic: `{ name, partitionCount, replicationFactor, totalMessageCount, isInternal, hasUnderReplicatedPartitions, messageCountSyncFailed }`.
  - Returns immediately from DB — no Kafka connection. Returns empty list with `syncedAt: null` if never synced.
- `POST /api/clusters/[id]/topics/sync` — fetch all topics from Kafka and upsert to DB cache.
  - Fetches topic metadata and per-topic offsets in parallel.
  - Removes DB rows for topics that no longer exist in Kafka.
  - Records `messageCountSyncFailed: true` on individual topics whose offset fetch fails.
  - Returns the refreshed `{ topics, syncedAt }`.
- `GET /api/clusters/[id]/topics/[topicName]` — full topic detail (live from Kafka).
  - Response: topic summary fields + `partitions[]` array.
  - Each partition: `{ partitionId, leader, replicas[], isr[], beginOffset, endOffset, messageCount }`.
- `POST /api/clusters/[id]/topics` — create a topic in Kafka and insert into DB cache.
  - Body: `{ name, numPartitions, replicationFactor }`.
- `DELETE /api/clusters/[id]/topics/[topicName]` — delete from Kafka and remove from DB cache.
- `PATCH /api/clusters/[id]/topics/[topicName]` — re-fetch and update only the message count for one topic.
  - Used for per-row retry when a previous offset fetch failed.
  - Clears `messageCountSyncFailed` on success; re-sets it on failure.

#### Data Derivation

- `totalMessageCount` = sum of (`high - low`) across all partitions, computed during sync via `admin.fetchTopicOffsets()`. Stored in DB at sync time — not recomputed on every page load.
- If offset fetch fails for a topic during sync, `messageCountSyncFailed` is set to `true`. The UI shows an amber "failed" label and a per-row retry button (`PATCH`) for those topics.
- `retentionMs` and `retentionBytes` are read from the topic's config via `admin.describeConfigs` (available on the topic detail page only, not the list).
- `replicationFactor` is inferred from the first partition's replica count.

#### Topic List Page (`/clusters/[id]/topics`)

- Table layout with columns: **Topic Name**, **Partitions**, **Replication Factor**, **Health**, **Messages**, **Actions**.
- Data is served from the DB cache — page loads instantly without a Kafka connection.
- "Sync from Kafka" button in the header triggers `POST /api/clusters/[id]/topics/sync` and refreshes the list. Shows "synced X ago" timestamp.
- First-visit banner: when `syncedAt === null` (never synced), a blue prompt banner is shown with a "Sync now" button.
- **Message count** column shows the count from last sync. When `messageCountSyncFailed === true` for a row, the cell shows "failed" in amber with a `↻` retry icon that calls `PATCH` for just that topic.
- Search input filters the table client-side.
- Toggle: "Hide internal topics" (default on).
- "Create Topic" button in the page header opens a modal form.
- Each row has a trash icon that triggers the delete flow.
- Topic name is a link that navigates to the topic detail page.

#### Topic Detail Page (`/clusters/[id]/topics/[topicName]`)

- Breadcrumb: Home > Cluster > Topics > Topic Name.
- Summary card: partition count, replication factor, total messages, retention, cleanup policy.
- Config table: shows all non-default topic-level configs as returned by `describeConfigs`.
- Partitions table with columns: **Partition ID**, **Leader (Node ID : Host)**, **Replicas**, **ISR**, **Begin Offset**, **End Offset**, **Message Count**.
  - ISR vs Replicas delta is highlighted in amber when ISR count < replicas count (under-replicated).
- "Browse Messages" button navigates to `/clusters/[id]/topics/[topicName]/messages`.
- "Delete Topic" button (with confirmation modal).

#### Create Topic Modal

- Fields: Topic Name (text), Partitions (number, min 1), Replication Factor (number, min 1, max = broker count), Advanced Configs (key-value pairs, add/remove rows).
- Validation: topic name must match Kafka naming rules (`[a-zA-Z0-9._-]+`, max 249 chars).
- On success: modal closes, topic list refreshes, success toast shown.
- On error: Kafka error message surfaced inline.

#### Delete Topic Flow

- Clicking delete opens a confirmation modal.
- User must type the topic name to confirm.
- On success: navigated back to topic list, success toast shown.

### Acceptance Criteria

- [ ] Topic list page loads from DB cache — no Kafka connection required on page load.
- [x] "Sync from Kafka" button fetches from Kafka, upserts cache, and refreshes the list.
- [x] "Last synced X ago" timestamp shown in header and table footer.
- [x] First-visit banner shown when cache is empty, with a "Sync now" shortcut.
- [x] `totalMessageCount` shown per topic in the list (snapshot from last sync).
- [x] Topics whose offset fetch failed show "failed" in amber with a per-row retry button.
- [x] Per-row retry (`PATCH`) re-fetches just that topic's count and clears the failure flag on success.
- [ ] Topic list loads all topics for a cluster with 1,000 topics within 5 seconds.
- [ ] Search input filters the visible topic list by substring match on topic name.
- [x] Internal topics are hidden by default; toggle reveals them.
- [ ] All columns in the topic list are sortable.
- [x] Clicking a topic name navigates to the topic detail page.
- [x] Topic detail page shows per-partition table with leader, replicas, ISR, begin offset, end offset.
- [x] Under-replicated partitions (ISR < replicas) are visually highlighted in amber.
- [x] "Browse Messages" button is present on the topic detail page and navigates correctly.
- [x] Create topic form validates name against Kafka naming rules before submission.
- [ ] Creating a topic with an invalid replication factor (greater than broker count) shows an error from Kafka.
- [x] Delete topic requires confirmation before removing.
- [x] Deleting a topic removes it from the list and from the DB cache.
- [x] Total message count matches the sum of partition offset deltas.

### Out of Scope (MVP)

- Topic configuration editing (changing retention, partition count after creation).
- Partition reassignment / replica rebalancing.
- ACL management per topic.
- Topic-level metrics (bytes in/out, request rates) — requires JMX.
- Compacted topic log inspection.

### Open Questions

1. ~~Fetching offsets for 1,000 topics may be slow — should `totalMessages` be lazy?~~ **Resolved**: offset fetches happen during explicit sync only (not on page load). Failures are tracked per-topic with a retry button so partial results are usable.
2. Should the partition table show rack awareness info (`rack` field) if the broker metadata includes it?
3. How should we handle topics where the user lacks `DESCRIBE` ACL permissions? Show a placeholder or filter them out?

### Dependencies

- `kafkajs` — `admin.listTopics()`, `admin.fetchTopicMetadata()`, `admin.fetchTopicOffsets()`, `admin.describeConfigs()`, `admin.createTopics()`, `admin.deleteTopics()`.
- F1 (Cluster Management) — cluster connection required.
- F2 (Cluster Overview) — navigated to from overview quick-nav.
- F4 (Message Browser) — "Browse Messages" links into this feature.
- `shadcn/ui` components: `Table`, `Dialog`, `Input`, `Button`, `Badge`, `Tooltip`, `Form`.
