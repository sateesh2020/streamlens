## Feature: Cluster Management

### Problem

Kafka operators and developers need a single place to register, configure, and manage connections to one or more Kafka clusters. Without a persistent store of cluster credentials and endpoints, users must re-enter connection details every session, making the tool impractical for teams managing multiple environments (dev, staging, production).

### Users

- **Platform/DevOps engineers** who own Kafka infrastructure and configure access for their teams.
- **Backend developers** who consume or produce to topics and need quick access to multiple clusters.
- **Data engineers** who inspect topics and consumer group lag across environments.

### Success Metric

- A user can add a new cluster and establish a verified connection in under 60 seconds.
- Zero cluster connection details are lost between application restarts (durable SQLite storage).
- Connection status is visible at a glance on the home page without any manual refresh required on load.

### User Stories

1. As a DevOps engineer, I want to register a new Kafka cluster with its broker list and authentication credentials so that I and my team can connect to it from KafkaLens.
2. As a developer, I want to test a connection before saving cluster details so that I am not storing broken configurations.
3. As a developer, I want to edit an existing cluster's broker list or credentials when they change, without deleting and re-creating the entry.
4. As a developer, I want to delete a cluster I no longer need so that the home page stays uncluttered.
5. As a platform engineer, I want to see at a glance whether each cluster is reachable (connected / disconnected / error) so that I can quickly identify incidents.
6. As a data engineer, I want to optionally store a schema registry URL alongside the cluster so that Avro/JSON Schema messages can be decoded automatically in the message browser.

### Functional Requirements

#### Data Model

Each cluster record stored in SQLite must have the following fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | TEXT (UUID v4) | Yes | Primary key, auto-generated |
| `name` | TEXT | Yes | Human-readable label, unique |
| `brokers` | TEXT | Yes | Comma-separated `host:port` list |
| `auth_type` | TEXT | Yes | One of: `none`, `sasl_plain`, `sasl_scram_256`, `sasl_scram_512`, `ssl` |
| `sasl_username` | TEXT | No | Required when auth_type is SASL |
| `sasl_password` | TEXT | No | Required when auth_type is SASL; stored encrypted at rest |
| `ssl_ca_cert` | TEXT | No | PEM string or file path, used for SSL auth |
| `ssl_client_cert` | TEXT | No | PEM string, used for mTLS |
| `ssl_client_key` | TEXT | No | PEM string, used for mTLS |
| `schema_registry_url` | TEXT | No | Base URL, e.g. `http://localhost:8081` |
| `schema_registry_auth` | TEXT | No | `username:password` for basic auth, stored encrypted |
| `description` | TEXT | No | Free-text notes |
| `created_at` | INTEGER | Yes | Unix timestamp ms |
| `updated_at` | INTEGER | Yes | Unix timestamp ms |

#### API Routes (Next.js Route Handlers)

- `GET /api/clusters` — return all clusters (passwords redacted).
- `POST /api/clusters` — create a new cluster.
- `GET /api/clusters/[id]` — return single cluster (passwords redacted).
- `PUT /api/clusters/[id]` — update cluster fields.
- `DELETE /api/clusters/[id]` — delete cluster and all associated cached data.
- `POST /api/clusters/[id]/test-connection` — attempt to connect and return success/error.

#### Home Page (Cluster List)

- Display a card or row per cluster showing: name, broker count, auth type badge, description excerpt.
- Each card has a status badge: **Connected** (green), **Disconnected** (grey), **Error** (red).
- Status is determined by a lightweight metadata fetch (`admin.describeCluster()`) on page load; badge shows a loading spinner during the check.
- "Add Cluster" button opens the creation dialog/page.
- Clicking a cluster card navigates to the cluster overview page.

#### Create / Edit Form

- Form fields map 1:1 to the data model above.
- Auth type selector is a `<Select>` component; dependent fields (username, password, certs) appear/disappear based on selection.
- Broker list field accepts free-text comma-separated values; client-side validation ensures each token matches `hostname:port` pattern.
- "Test Connection" button is available before and after saving; it calls `POST /api/clusters/[id]/test-connection` (or a pre-save dry-run endpoint) and displays a success toast or inline error with the raw Kafka error message.
- Passwords and keys are never returned by the API after save; edit form shows a placeholder (`••••••••`) with a "Change" toggle to enter new values.

#### Delete Confirmation

- Clicking "Delete" on a cluster opens a confirmation modal that requires the user to type the cluster name before the confirm button is enabled.

### Acceptance Criteria

- [ ] A new cluster can be created with auth type `none` and a single broker.
- [ ] A new cluster can be created with auth type `sasl_plain` with username/password.
- [ ] A new cluster can be created with auth type `sasl_scram_256` and `sasl_scram_512`.
- [ ] A new cluster can be created with SSL/mTLS using PEM cert fields.
- [ ] "Test Connection" returns a clear success message (cluster ID, controller info) when the broker is reachable.
- [ ] "Test Connection" returns the Kafka error message when the broker is unreachable.
- [ ] Saving a cluster with a duplicate name shows an inline validation error.
- [ ] Saving a cluster with an invalid broker format (missing port) shows an inline validation error.
- [ ] After saving, the home page reflects the new cluster immediately without a full page reload.
- [ ] Editing a cluster updates `updated_at` and preserves all unchanged fields.
- [ ] Deleting a cluster removes it from the home page and the SQLite database.
- [ ] Cluster passwords/keys are not present in any API response body.
- [ ] All cluster cards on the home page show correct status badges after load.
- [ ] A cluster with a schema registry URL shows a "Schema Registry" chip on its card.

### Out of Scope (MVP)

- Role-based access control or per-user cluster visibility.
- Cluster import/export (e.g. JSON config file import).
- Support for Confluent Cloud or MSK-specific IAM authentication (beyond SASL).
- Automatic reconnection / heartbeat polling after the initial status check.
- Cluster tagging or grouping.

### Open Questions

1. Should passwords be encrypted with a server-side secret key (env var) or rely on OS keychain? For MVP, AES-256-GCM with a `KAFKALENS_SECRET` env var is assumed.
2. Should the home-page status check run in parallel for all clusters or sequentially to avoid overwhelming the server? Parallel with a concurrency limit of 5 is recommended.
3. Should deleting a cluster also clear any cached topic/offset data, or retain it for auditing? MVP: delete all associated data.

### Dependencies

- `kafkajs` — Kafka admin client for test-connection and broker metadata.
- `better-sqlite3` — persistent storage of cluster config.
- `shadcn/ui` components: `Dialog`, `Select`, `Form`, `Input`, `Badge`, `Toast`, `Card`.
- Next.js Route Handlers (App Router) for the REST API layer.
- Node.js `crypto` module for AES-256-GCM encryption of secrets.
