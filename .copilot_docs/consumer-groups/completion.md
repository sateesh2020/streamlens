## Completion: Consumer Groups

### Status

`[x] Complete`

### Implementation Notes

Consumer group monitoring spans two pages:

1. **Group list** (`consumer-groups-client.tsx`) at `/clusters/[id]/consumer-groups` — fetches from `GET /api/clusters/[id]/consumer-groups`. Displays a searchable table of groups with state badge, member count, and total lag (sum across all partitions). Lag is color-coded: red > 10,000, amber > 1,000, green otherwise.

2. **Group detail** (`[groupId]/consumer-group-detail-client.tsx`) at `/clusters/[id]/consumer-groups/[groupId]` — fetches from `GET /api/clusters/[id]/consumer-groups/[groupId]`. Shows a summary card, a members table (member ID, client ID, host, assigned partitions), and an offsets table grouped by topic (partition, committed offset, log end offset, lag per partition).

The API routes use KafkaJS `admin.listGroups()` for the list, and `admin.describeGroups()` + `admin.fetchOffsets()` + `admin.fetchTopicOffsets()` for the detail. Lag is computed server-side: `log_end_offset - committed_offset`, with uncommitted offsets (`-1`) treated as 0 lag.

### Checklist

- [x] API route: `GET /api/clusters/[id]/consumer-groups`
- [x] API route: `GET /api/clusters/[id]/consumer-groups/[groupId]`
- [x] KafkaJS: `listGroups`, `describeGroups`, `fetchOffsets`, `fetchTopicOffsets`
- [x] Lag computation (server-side, per partition)
- [x] Uncommitted offset handling (offset = -1 treated as no lag)
- [x] Consumer group list page with sortable table
- [x] Total lag column with color coding (red/amber/green thresholds)
- [x] State badge component (Stable, Rebalancing, Empty, Dead, Unknown)
- [x] Search/filter input (filters by group ID)
- [x] Consumer group detail page — summary card (state, member count, total lag)
- [x] Members table (member ID, client ID, host, partition assignments)
- [ ] Expandable partition chips in members table — not implemented; partitions shown as comma-separated list
- [x] Offsets table grouped by topic (partition, committed, log end, lag)
- [x] Per-partition lag highlighting (red/amber)
- [x] Topic name links to topic detail page
- [x] Refresh button
- [x] Loading skeletons
- [x] Empty state (no consumer groups in cluster)

### Decisions Made

- **Server-side lag computation**: Lag is computed in the API route rather than on the client to avoid sending raw offset data over the wire and doing arithmetic in the browser.
- **Uncommitted offsets**: When a partition's committed offset is `-1` (no committed offset), lag is treated as 0 rather than `log_end_offset`. This avoids false alarms for consumer groups that haven't committed yet.
- **Color thresholds**: Red at >10,000 total lag, amber at >1,000. These are reasonable defaults for most teams; they are not configurable in the UI.
- **Internal groups filtered**: KafkaJS returns `__consumer_offsets` and other internal groups; these are filtered out in the API route using the `protocolType` field (only `consumer` protocol groups are shown).

### Known Issues / Follow-ups

- Member partition assignments are displayed as a flat list rather than expandable chips — harder to read for groups with many partitions.
- No auto-refresh / polling; users must click the refresh button.
- Group detail does not show the consumer group's committed offset history or reset options.
- No ability to reset consumer group offsets from the UI.
