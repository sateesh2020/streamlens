## Feature: Consumer Groups

### Problem

Consumer group lag is one of the most operationally critical metrics in a Kafka deployment. High lag means consumers are falling behind producers, which can cause data freshness issues, processing delays, or queue build-up. Today, investigating lag requires running `kafka-consumer-groups.sh --describe`, which returns raw tabular output with no aggregation and no visual hierarchy. Engineers need to cross-reference multiple CLI commands to get a complete picture of a group's health.

### Users

- **Platform/DevOps engineers** who monitor consumer group health and respond to lag alerts.
- **Backend developers** who own a specific consumer application and need to verify it is keeping up with production traffic.
- **Data engineers** who manage pipeline consumers and need to track per-partition lag for capacity planning.

### Success Metric

- Total lag per consumer group is visible on the group list page without clicking into individual groups.
- A user can identify the most lagging partition for a given consumer group within 10 seconds of loading the group detail page.
- The page loads group details for a group with 50 partitions in under 3 seconds.

### User Stories

1. As a DevOps engineer, I want to see a list of all consumer groups in a cluster with their state and total lag so that I can quickly triage which groups need attention.
2. As a backend developer, I want to see the members of my consumer group (client ID, host, assigned partitions) so that I can verify all consumers are running and have correct partition assignments.
3. As a DevOps engineer, I want to see the committed offset, log end offset, and lag per partition for a consumer group so that I can pinpoint which partition is causing lag.
4. As a developer, I want the total lag for a group to be prominently displayed so that I can assess severity at a glance.
5. As a platform engineer, I want to filter the consumer group list by name so that I can find groups in clusters with hundreds of groups.

### Functional Requirements

#### API Routes

- `GET /api/clusters/[id]/consumer-groups` — list all consumer groups.
  - Query params: `search` (substring filter on group ID), `state` (filter by Kafka group state).
  - Response per group: `{ groupId, state, members: number, totalLag, protocol, protocolType }`.
  - `totalLag` is computed as the sum of `(logEndOffset - committedOffset)` across all partitions in the group.
- `GET /api/clusters/[id]/consumer-groups/[groupId]` — full group detail.
  - Response:
    ```json
    {
      "groupId": "my-service-group",
      "state": "Stable",
      "protocol": "range",
      "protocolType": "consumer",
      "coordinator": { "nodeId": 1, "host": "broker1", "port": 9092 },
      "members": [
        {
          "memberId": "client-1-uuid",
          "clientId": "my-service",
          "clientHost": "/10.0.0.1",
          "assignments": [
            { "topic": "orders", "partition": 0 }
          ]
        }
      ],
      "offsets": [
        {
          "topic": "orders",
          "partition": 0,
          "committedOffset": "1000",
          "logEndOffset": "1050",
          "lag": 50,
          "metadata": ""
        }
      ],
      "totalLag": 50
    }
    ```

#### Data Derivation

- Member list and assignments: `admin.describeGroups([groupId])`.
- Committed offsets: `admin.fetchOffsets({ groupId })`.
- Log end offsets: `admin.fetchTopicOffsets(topicName)` for each topic in the group.
- Lag = `logEndOffset - committedOffset`; if `committedOffset` is `-1` (no commit), lag = `logEndOffset - 0` (show as "uncommitted").

#### Consumer Group List Page (`/clusters/[id]/consumer-groups`)

- Table with columns: **Group ID**, **State** (badge), **Members**, **Topics**, **Total Lag**, **Protocol**.
- **Total Lag** column: large red number when lag > 0; green "0" or "–" when caught up. Sort descending by default so highest-lag groups are at top.
- State badge colors: `Stable` → green, `PreparingRebalance` / `CompletingRebalance` → amber, `Empty` → grey, `Dead` → red.
- Search input filters the list.
- Clicking a row navigates to the group detail page.

#### Consumer Group Detail Page (`/clusters/[id]/consumer-groups/[groupId]`)

- Breadcrumb: Home > Cluster > Consumer Groups > Group ID.
- **Summary card**: Group ID, State badge, Protocol, Member count, Total Lag (large prominent number).
- **Members table**: Member ID (truncated), Client ID, Client Host, Assigned Partitions (expandable chip list).
- **Offsets table**: Topic, Partition, Committed Offset, Log End Offset, Lag.
  - Rows with lag > 0 shown with a red lag chip.
  - Rows where `committedOffset` is -1 (uncommitted) shown with a grey "—" and a tooltip "No committed offset".
  - Table sortable by Lag descending.
  - Table grouped by topic (expandable rows or topic header rows).
- **Refresh** button at top right re-fetches data.
- **Topic links**: topic names in the offsets table are clickable and navigate to the topic detail page.

### Acceptance Criteria

- [ ] Consumer group list loads all groups for a cluster with 200 groups within 3 seconds.
- [ ] Total lag is displayed on each row of the group list page.
- [ ] Group list is sorted by total lag descending by default.
- [ ] State badges are color-coded correctly for all Kafka group states.
- [ ] Search input filters the group list by group ID substring.
- [ ] Clicking a group row navigates to the group detail page.
- [ ] Group detail page shows all members with their assigned partitions.
- [ ] Offsets table shows committed offset, log end offset, and computed lag for every partition.
- [ ] Partitions with lag > 0 are visually highlighted.
- [ ] Total lag on the detail page matches the sum of per-partition lag values.
- [ ] Uncommitted partitions (offset = -1) show "No committed offset" indicator without crashing.
- [ ] Topic names in the offsets table link to the correct topic detail page.
- [ ] Refresh button updates the data without a full page reload.

### Out of Scope (MVP)

- Resetting consumer group offsets (to earliest, latest, or specific offset).
- Deleting a consumer group.
- Historical lag trending / charting over time.
- Alerting or threshold-based notifications for lag.
- Consumer group comparison across clusters.

### Open Questions

1. For groups with many topics (e.g. a group consuming 50 topics), the offsets table can be very long. Should we group rows by topic with collapse/expand by default?
2. Should `totalLag` be computed server-side (adds latency due to fetching all log-end offsets) or client-side (requires sending all raw offset data to the browser)? Server-side is recommended for large groups.
3. How should we handle groups in `Dead` or `Empty` state where there are no members but committed offsets exist? Show offsets without member info.

### Dependencies

- `kafkajs` — `admin.describeGroups()`, `admin.listGroups()`, `admin.fetchOffsets()`, `admin.fetchTopicOffsets()`.
- F1 (Cluster Management) — cluster connection required.
- F2 (Cluster Overview) — entry point via quick-nav.
- F3 (Topic Explorer) — topic name links from the offsets table.
- `shadcn/ui` components: `Table`, `Badge`, `Card`, `Button`, `Input`, `Tooltip`, `Collapsible`.
