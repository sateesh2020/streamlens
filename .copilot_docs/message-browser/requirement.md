## Feature: Message Browser

### Problem

Debugging event-driven applications requires inspecting the actual messages flowing through Kafka topics. Today, developers use `kafka-console-consumer.sh` or `kcat`, which are CLI tools that lack filtering, pagination, and schema-aware decoding. Avro-serialized messages appear as binary garbage unless the developer manually fetches the schema and decodes them. A visual, filterable message browser dramatically reduces debugging time.

### Users

- **Backend developers** debugging a specific message or tracing an event through a system.
- **QA engineers** verifying that correct messages are produced by an application under test.
- **Data engineers** spot-checking data quality or investigating schema evolution issues.

### Success Metric

- A user can navigate to a specific offset range in a topic partition and view decoded messages within 5 seconds.
- Avro and JSON Schema messages are automatically decoded when a schema registry is configured, with zero manual steps.
- Pagination allows browsing topics with millions of messages without browser memory issues.

### User Stories

1. As a developer, I want to browse the latest N messages in a topic so that I can quickly see what is being produced.
2. As a developer, I want to filter messages by a specific partition so that I can isolate data for a particular key or event.
3. As a developer, I want to filter messages by offset range (start offset, end offset) so that I can replay or inspect a specific window of messages.
4. As a developer, I want to filter messages by timestamp range so that I can find messages produced during a specific incident window.
5. As a developer, I want message values decoded as pretty-printed JSON when they are JSON so that I can read them without copy-pasting into a formatter.
6. As a data engineer, I want Avro messages automatically decoded using the schema from the schema registry so that I can read structured data without manual schema lookup.
7. As a developer, I want to copy a message's key or value to the clipboard with a single click so that I can use the data in another tool.
8. As a developer, I want to load more messages (infinite scroll or "Load More" button) so that I can browse a large volume of messages without reloading the page.

### Functional Requirements

#### API Routes

- `GET /api/clusters/[id]/topics/[topicName]/messages` — fetch a page of messages.
  - Query params:
    - `partition` — integer or `all` (default `all`)
    - `startOffset` — integer or `earliest` (default `earliest`)
    - `endOffset` — integer or `latest` (default `latest`)
    - `startTimestamp` — ISO 8601 or Unix ms (mutually exclusive with offset range)
    - `endTimestamp` — ISO 8601 or Unix ms
    - `limit` — number of messages to return (default 50, max 500)
    - `decodeFormat` — `auto`, `json`, `avro`, `raw` (default `auto`)

- Response shape:
```json
{
  "messages": [
    {
      "partition": 0,
      "offset": "1024",
      "timestamp": "2026-04-21T10:00:00.000Z",
      "key": "user-123",
      "keyEncoding": "utf8",
      "value": { "userId": 123, "event": "login" },
      "valueEncoding": "json",
      "schemaId": null,
      "headers": { "correlationId": "abc" }
    }
  ],
  "hasMore": true,
  "nextOffset": { "0": 1074 }
}
```

#### Message Fetching Strategy

- Use a KafkaJS consumer in `fromBeginning: false` / seek mode; do not join a consumer group (use `groupId` with a unique UUID per session to avoid offset commits affecting real consumers).
- For "latest N messages": seek each partition to `max(0, endOffset - limit)` and consume up to `endOffset`.
- For timestamp-based filtering: use `admin.fetchTopicOffsetsByTimestamp` to resolve offsets, then seek.
- Server-side cursor: the `nextOffset` map in the response allows the client to request the next page by passing per-partition start offsets.

#### Schema Decoding

- When `decodeFormat` is `auto` or `avro`:
  - Check if the raw value starts with the magic byte `0x00` (Confluent wire format).
  - If yes, extract the 4-byte schema ID, fetch the schema from the schema registry API (`GET /subjects/{subject}/versions/{id}` or `/schemas/ids/{id}`), cache the schema in memory for the session, and decode using `avsc` (Avro) or `ajv` (JSON Schema).
- When `decodeFormat` is `json`: attempt `JSON.parse`; fall back to raw string.
- When `decodeFormat` is `raw`: return base64-encoded bytes.
- Decoding errors must not crash the page; show the raw value with a warning badge instead.

#### Message Browser Page (`/clusters/[id]/topics/[topicName]/messages`)

- **Filter bar** (collapsible) at the top:
  - Partition selector: "All" or individual partition numbers.
  - Offset range inputs: Start Offset, End Offset (or "Latest").
  - Timestamp range pickers: Start Timestamp, End Timestamp.
  - Limit input (10 / 50 / 100 / 500).
  - "Apply Filters" button; filters persist in URL query params for shareability.
- **Message list**: virtualized list (using `@tanstack/virtual` or similar) showing one card per message.
- **Message card** fields:
  - Partition badge, Offset, Timestamp (relative and absolute on hover).
  - Key (truncated with expand button, copy icon).
  - Value: JSON rendered as a collapsible syntax-highlighted tree; raw string shown in a monospace block; binary shown as hex with a warning.
  - Headers: shown as a collapsible key-value list.
  - Schema info chip: shows schema ID and subject name when Avro decoded.
- **Pagination**: "Load More" button at the bottom of the list; appends next page to existing messages. Message count shown as "Showing X messages".
- **Empty state**: when no messages match the filter, show a clear empty-state illustration with filter suggestions.

#### Message Detail Drawer

- Clicking a message card opens a side drawer (shadcn/ui `Sheet`) showing the full message with:
  - Full JSON tree (non-truncated).
  - Raw bytes view toggle.
  - "Copy Value" and "Copy Key" buttons.
  - Schema viewer link (if Avro; navigates to schema registry page).

### Acceptance Criteria

- [ ] Navigating to the message browser for a topic shows the latest 50 messages by default.
- [ ] Selecting a specific partition filters messages to only that partition.
- [ ] Entering an offset range (e.g. 100–200) returns messages only within that range.
- [ ] Entering a timestamp range returns messages with timestamps within that range.
- [ ] JSON message values are rendered as a formatted, collapsible JSON tree.
- [ ] Avro messages with Confluent magic byte are decoded automatically when a schema registry is configured.
- [ ] A message with an unknown schema ID displays the raw bytes with a warning badge (no crash).
- [ ] "Load More" appends the next page of messages without resetting the existing list.
- [ ] Clicking a message opens the detail drawer with full non-truncated content.
- [ ] "Copy Value" copies the JSON string of the value to clipboard.
- [ ] Filter state is reflected in the URL query params so the page can be bookmarked/shared.
- [ ] The message list handles topics with 0 messages gracefully (empty state shown).
- [ ] The API never commits offsets to Kafka (uses non-persistent consumer group).

### Out of Scope (MVP)

- Message search by content (full-text key/value search) — requires server-side scanning.
- Producing / publishing messages from the UI.
- Protobuf decoding.
- Dead-letter queue / retry queue specific views.
- Downloading messages as CSV or JSON file.

### Open Questions

1. Should we support seeking across all partitions simultaneously, or require the user to select one partition when using offset range? (Offsets are per-partition, so "all partitions, offset 100–200" is ambiguous.)
2. What is the right maximum `limit` per page? 500 messages may be heavy if each value is large; consider a max-bytes cap per request in addition to count.
3. Should the session consumer group ID be stored server-side (e.g. per Next.js server instance) to allow reuse across paginated requests, or created fresh each time? Fresh per request is simpler but creates more consumer group churn.

### Dependencies

- `kafkajs` — consumer (seek mode), `admin.fetchTopicOffsetsByTimestamp`.
- `avsc` — Avro schema parsing and decoding.
- Schema Registry HTTP API (standard Confluent REST API).
- F1 (Cluster Management) — schema registry URL stored per cluster.
- F3 (Topic Explorer) — entry point to message browser.
- F6 (Schema Registry) — linked from schema info chips on decoded messages.
- `@tanstack/virtual` or similar — virtualized list rendering.
- `shadcn/ui` components: `Sheet`, `Badge`, `Button`, `Select`, `DateTimePicker`, `Collapsible`.
