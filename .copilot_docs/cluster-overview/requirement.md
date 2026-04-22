## Feature: Cluster Overview

### Problem

Once a user connects to a Kafka cluster they need an immediate, at-a-glance view of the cluster's health and topology without having to navigate to individual topics or consumer groups. Currently, Kafka operators must use CLI tools (`kafka-topics.sh`, `kafka-broker-api-versions.sh`) to piece together this information, which is time-consuming and error-prone.

### Users

- **Platform/DevOps engineers** who perform routine health checks and incident triage.
- **Backend developers** who want to verify a cluster is healthy before debugging application-level issues.
- **Data engineers** who need to understand partition and replication topology before designing pipelines.

### Success Metric

- All key cluster metadata (broker list, topic count, partition count, consumer group count, controller) loads and renders within 3 seconds on a co-located network.
- The overview page surfaces enough information that a user can determine cluster health without leaving the page.

### User Stories

1. As a DevOps engineer, I want to see all brokers in the cluster with their host, port, and controller status so that I can verify the cluster topology at a glance.
2. As a DevOps engineer, I want to see ISR (in-sync replica) counts per broker so that I can identify under-replicated partitions before they become an outage.
3. As a developer, I want to see the total number of topics, partitions, and consumer groups so that I have a quick sense of cluster usage.
4. As a platform engineer, I want to know which broker is the current cluster controller so that I understand failover state.
5. As a developer, I want to click through from the overview to the topic list or consumer groups list so that the overview acts as a navigation hub.

### Functional Requirements

#### API Routes

- `GET /api/clusters/[id]/overview` — returns a single JSON payload containing:
  - `brokers`: array of `{ nodeId, host, port, isController, isrPartitionCount, leaderPartitionCount }`
  - `topicCount`: integer (excludes internal topics like `__consumer_offsets` by default)
  - `partitionCount`: integer (total across all non-internal topics)
  - `consumerGroupCount`: integer
  - `controllerId`: integer (node ID of the current controller)
  - `kafkaVersion`: string (if detectable via `ApiVersions` request)
  - `fetchedAt`: ISO 8601 timestamp

Data is gathered via KafkaJS `admin.describeCluster()`, `admin.listTopics()`, `admin.listGroups()`, and `admin.fetchTopicMetadata()`.

#### Page Layout (`/clusters/[id]`)

The overview page is reached by clicking a cluster on the home page. It contains:

1. **Header bar** — cluster name, auth type badge, status indicator (live re-checked on mount), "Edit Cluster" and "Delete Cluster" action buttons.
2. **Stats row** — four summary stat cards:
   - Total Brokers
   - Total Topics
   - Total Partitions
   - Consumer Groups
3. **Broker table** — one row per broker with columns:
   - Node ID
   - Host : Port
   - Controller (star icon or "Yes"/"No")
   - Leader Partitions
   - ISR Partitions
   - Status chip (Online / Offline — determined by whether the broker appears in the live metadata response)
4. **Cluster controller callout** — highlights the controller node ID and host:port in a distinct card.
5. **Quick-nav cards** — "Browse Topics", "Consumer Groups", "Schema Registry" (the last only shown when a schema registry URL is configured).

#### Refresh

- A "Refresh" button in the header re-fetches the overview data without a full page reload.
- Stale data warning: if `fetchedAt` is older than 60 seconds, display a subtle "Data may be stale" banner.

#### Internal Topics Toggle

- A toggle switch "Show internal topics" controls whether `__consumer_offsets`, `__transaction_state`, etc. are counted and visible in the topic count. Default: hidden.

### Acceptance Criteria

- [ ] The overview page loads and displays broker table within 3 seconds for a cluster with up to 10 brokers and 500 topics.
- [ ] The controller broker is visually distinguished in the broker table (e.g. star icon, bold row).
- [ ] Broker ISR partition count matches the value returned by `kafka-topics.sh --describe`.
- [ ] Clicking "Browse Topics" navigates to `/clusters/[id]/topics`.
- [ ] Clicking "Consumer Groups" navigates to `/clusters/[id]/consumer-groups`.
- [ ] "Schema Registry" quick-nav card is hidden when no schema registry URL is configured.
- [ ] "Refresh" button re-fetches data and updates `fetchedAt` timestamp visibly.
- [ ] If a broker is unreachable, its row shows an "Offline" status chip in red.
- [ ] Internal topics are excluded from topic/partition counts by default.
- [ ] The internal topics toggle updates counts immediately without a server round-trip if the raw data is already cached.

### Out of Scope (MVP)

- Historical broker metrics (CPU, disk, heap) — requires JMX or Confluent Metrics API.
- Real-time partition leader election events or live streaming updates (WebSocket).
- Cross-cluster comparison view.
- Per-broker traffic throughput (bytes in/out).

### Open Questions

1. KafkaJS does not natively expose per-broker ISR counts via a single admin call; it requires correlating `fetchTopicMetadata` responses. Is this acceptable latency for MVP, or should we cache the result and refresh on demand only?
2. Should the `kafkaVersion` field be shown in the UI, given it can be unreliable or unavailable on some managed services?
3. Should the stats row be updated in real-time via polling, or only on explicit "Refresh"? MVP assumes explicit refresh only.

### Dependencies

- `kafkajs` — `admin.describeCluster()`, `admin.listTopics()`, `admin.listGroups()`, `admin.fetchTopicMetadata()`.
- F1 (Cluster Management) — cluster must exist and be reachable before this page is accessible.
- `shadcn/ui` components: `Card`, `Table`, `Badge`, `Button`, `Switch`, `Tooltip`.
- SWR or React Query for client-side data fetching and cache invalidation.
