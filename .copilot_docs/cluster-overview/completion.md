## Completion: Cluster Overview

### Status

`[x] Complete`

### Implementation Notes

The cluster overview page (`src/app/clusters/[id]/page.tsx`) is a server component that fetches the cluster record from Prisma and passes it as a prop to the client component `ClusterOverviewClient` (`src/app/clusters/[id]/overview-client.tsx`). Live Kafka metadata (broker list, topic count, partition count, consumer group count) is fetched client-side via react-query hitting `GET /api/clusters/[id]/overview`.

The API route calls KafkaJS `admin.describeCluster()`, `admin.listTopics()`, `admin.listGroups()`, and `admin.fetchTopicMetadata()` to aggregate the four summary metrics and the broker list. Controller node is identified by comparing each broker's `nodeId` to the `controllerId` returned by `describeCluster`.

### Checklist

- [x] API route: `GET /api/clusters/[id]/overview`
- [x] KafkaJS admin calls: `describeCluster`, `listTopics`, `listGroups`, `fetchTopicMetadata`
- [x] ISR count correlation (partition count summed from metadata)
- [x] Page: `/clusters/[id]` — header with cluster name, auth badge, schema registry badge
- [x] Stats row (4 summary cards: Brokers, Topics, Partitions, Consumer Groups)
- [x] Broker table with controller highlight (Controller / Broker badges)
- [ ] Cluster controller callout card — not implemented (controller shown inline in broker table)
- [x] `fetchedAt` timestamp shown — "Data fetched X ago" row with live 30s timer and Refresh button
- [x] Refresh button triggers `refetch()` on the react-query overview query
- [x] Quick-nav cards (Topics, Messages, Consumer Groups, Schema Registry conditional)
- [x] Schema Registry quick-nav card links correctly to `/clusters/[id]/schema-registry`
- [ ] Stale data banner (> 60 seconds) — not implemented
- [ ] Internal topics toggle — not on this page (on topic list page)
- [x] Loading skeleton states (MetricCardSkeleton, BrokerTableSkeleton)
- [x] Error boundary for unreachable cluster (inline error card with Retry button)

### Decisions Made

- **Server component + client component split**: The page server component resolves the cluster row from the DB (avoids a client-side fetch for static cluster data), then the client component handles the live Kafka metadata query.
- **Test Connection on overview page**: The requirement placed test-connection on the create/edit form; it was also added to the overview page header for convenience.
- **react-query staleTime = 30s**: Overview data is considered stale after 30 seconds; users can force-refresh via the Refresh button in the fetched-at row.
- **Messages quick-link goes to Topics**: The "Messages" quick-nav card links to `/clusters/[id]/topics` rather than a standalone messages page because messages are always accessed through a topic.
- **`dataUpdatedAt` for fetchedAt**: react-query's built-in `dataUpdatedAt` (ms timestamp) drives the "fetched X ago" display. A `setInterval` in a `useEffect` re-renders the label every 30 seconds without re-querying Kafka.

### Known Issues / Follow-ups

- No auto-refresh / polling; data only refreshes on page focus or manual Refresh click.
- Schema Registry quick-nav card links to `/clusters/[id]/schema-registry` — now implemented.
- Stale data banner (> 60s without refresh) is not implemented.
