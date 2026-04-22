## Completion: Message Browser

### Status

`[x] Complete (core functionality)`

### Implementation Notes

The message browser lives at `/clusters/[id]/topics/[topic]/messages` and is implemented in `messages-client.tsx`. It calls `GET /api/clusters/[id]/topics/[topic]/messages` with query params: `partition` (integer or `"all"`), `offset` (`"earliest"`, `"latest"`, or a specific integer), `limit` (1–500, default 50), and `fromTimestamp` (ISO string).

The API route (`route.ts`) creates a non-committing KafkaJS consumer with a unique group ID (`kafkalens-browser-<uuid>`) per request, seeks to the resolved offset, and collects up to `limit` messages before disconnecting. Timestamp-based seeking uses `admin.fetchTopicOffsetsByTimestamp()` to resolve offsets before the consumer seek.

Messages are rendered as cards showing key, value (JSON pretty-printed or raw string), headers, partition, offset, and timestamp. A detail drawer (`Sheet`) opens on click with full message content and clipboard copy buttons.

### Checklist

- [x] API route: `GET /api/clusters/[id]/topics/[topicName]/messages`
- [x] KafkaJS seek-based consumer (non-committing, unique group ID per request)
- [x] Offset resolution from timestamp (`fetchTopicOffsetsByTimestamp`)
- [ ] Confluent magic byte detection and Avro decoding — not implemented
- [ ] JSON Schema decoding — not implemented
- [ ] Schema registry HTTP client with in-memory schema cache — not implemented
- [x] Message browser page with filter bar (partition, offset mode, limit)
- [x] Partition selector component (dropdown, includes "All Partitions")
- [x] Offset range inputs (earliest / latest / specific offset)
- [x] Timestamp filter (fromTimestamp query param)
- [ ] Virtualized message list — not implemented; standard scrollable list
- [x] Message card component (key, value, headers, partition, offset, timestamp badges)
- [x] JSON syntax-highlighted display (JSON.stringify pretty-print)
- [ ] "Load More" pagination with cursor — not implemented; fixed limit per fetch
- [x] Message detail drawer (`Sheet`) with full content
- [x] Copy key / copy value to clipboard
- [ ] URL query param persistence for filters — not implemented
- [x] Empty state component (no messages found)
- [x] Error state (API error displayed inline)

### Decisions Made

- **Non-committing consumer**: Each browse request creates a transient consumer group with a random UUID suffix so browse operations never pollute consumer group offsets visible in the consumer groups view.
- **"All partitions" mode**: When `partition=all`, the API fans out reads across all partitions concurrently (Promise.all) and merges results sorted by timestamp descending.
- **Limit cap at 500**: Prevents runaway memory on the server for topics with high message volume. The default is 50 to keep latency low.
- **No Avro decoding in MVP**: Avro/Schema Registry decoding is deferred. Messages with a Confluent magic byte (0x00) will display as raw binary strings with a warning badge — not implemented yet.

### Known Issues / Follow-ups

- No pagination / "Load More" — users see at most `limit` messages per request.
- Avro and JSON Schema decoding is not implemented; binary messages show as garbled strings.
- Filter state (partition, offset, limit) is not preserved in the URL — navigating away loses the selection.
- Large message values (>50KB) can make the card list slow; virtualization is a follow-up.
