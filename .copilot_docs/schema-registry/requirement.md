## Feature: Schema Registry

### Problem

When Kafka topics carry Avro or JSON Schema messages, the schema definitions living in a Confluent-compatible Schema Registry are a critical part of the data contract between producers and consumers. Without a UI, engineers must query the Schema Registry REST API directly with `curl` commands to look up subjects, view schema versions, or check compatibility settings. This is slow, requires knowing the API, and provides no visual context for how schemas relate to topics.

### Users

- **Data engineers** who design and evolve data schemas and need to verify that schema changes are compatible with existing consumers.
- **Backend developers** who consume Kafka messages and need to look up the current schema for a subject to understand the data structure.
- **Platform engineers** who manage the Schema Registry and need to audit compatibility settings across subjects.

### Success Metric

- A user can look up a schema for any subject in under 10 seconds without needing to know the Schema Registry REST API.
- Schema version history and compatibility mode are visible on a single page.
- The feature is only surfaced in the UI when a schema registry URL is actually configured for the cluster, keeping the interface uncluttered for users who do not use it.

### User Stories

1. As a data engineer, I want to see a list of all registered schema subjects so that I have an overview of all schemas in the registry.
2. As a backend developer, I want to search subjects by name so that I can quickly find the schema for a specific topic.
3. As a data engineer, I want to view all versions of a subject so that I can track schema evolution over time.
4. As a data engineer, I want to view the full schema content (JSON/Avro IDL) for any version so that I can understand the data structure.
5. As a platform engineer, I want to see the compatibility mode set on each subject (BACKWARD, FORWARD, FULL, NONE, etc.) so that I can audit schema governance.
6. As a developer, I want to see which schema type a subject uses (AVRO, JSON, PROTOBUF) so that I know how to deserialize messages.

### Functional Requirements

#### Conditional Visibility

- The "Schema Registry" navigation item and all sub-pages are only rendered when the active cluster has a non-empty `schema_registry_url`.
- If a user navigates directly to `/clusters/[id]/schema-registry` without a configured URL, show an informational empty state with instructions to add a schema registry URL in cluster settings.

#### API Routes (proxied through Next.js to avoid CORS and handle auth)

- `GET /api/clusters/[id]/schema-registry/subjects` — list all subjects.
  - Proxies to `GET {schemaRegistryUrl}/subjects`.
  - Response: `{ subjects: string[], schemaRegistryUrl: string }`.
- `GET /api/clusters/[id]/schema-registry/subjects/[subject]/versions` — list versions for a subject.
  - Proxies to `GET {schemaRegistryUrl}/subjects/{subject}/versions`.
  - Response: `{ subject: string, versions: number[], compatibility: string, schemaType: string }`.
  - `compatibility` fetched from `GET {schemaRegistryUrl}/config/{subject}` (falls back to global config if not set).
- `GET /api/clusters/[id]/schema-registry/subjects/[subject]/versions/[version]` — get schema content.
  - Proxies to `GET {schemaRegistryUrl}/subjects/{subject}/versions/{version}`.
  - Response: `{ subject, version, id, schemaType, schema: string }` (schema is the raw JSON string).

#### Schema Registry List Page (`/clusters/[id]/schema-registry`)

- Page header: "Schema Registry" title, registry URL shown as a chip (linkable to open the raw API in a new tab).
- Search input: filters the subject list by substring.
- Subject list: rendered as a table or card grid with columns:
  - **Subject Name**
  - **Schema Type** (AVRO / JSON / PROTOBUF) badge
  - **Versions** (count)
  - **Compatibility Mode** badge
- Clicking a subject navigates to the subject detail page.
- Subject count shown: "X subjects registered".

#### Subject Detail Page (`/clusters/[id]/schema-registry/[subject]`)

- Breadcrumb: Home > Cluster > Schema Registry > Subject Name.
- **Summary card**: subject name, schema type badge, compatibility mode badge, version count.
- **Version selector**: a `<Select>` or tab strip listing all version numbers plus "latest". Selecting a version loads its schema content.
- **Schema viewer**:
  - For AVRO: render the parsed JSON as a syntax-highlighted, collapsible JSON tree. Also show the Avro canonical form.
  - For JSON Schema: render as a syntax-highlighted JSON tree.
  - For PROTOBUF: render the raw proto definition in a monospace code block.
- **Schema metadata**: Schema ID (integer), registered timestamp (if available).
- **Raw schema** toggle: shows the unparsed JSON string in a monospace block with a copy button.
- **Version diff** (stretch goal, not MVP blocker): side-by-side diff between two selected versions.

#### Compatibility Mode Reference

Display an informational tooltip next to the compatibility badge explaining what each mode means:

| Mode | Meaning |
|---|---|
| BACKWARD | New schema can read old data |
| FORWARD | Old schema can read new data |
| FULL | Both backward and forward compatible |
| NONE | No compatibility checks |
| BACKWARD_TRANSITIVE | Backward compatible with all previous versions |
| FORWARD_TRANSITIVE | Forward compatible with all previous versions |
| FULL_TRANSITIVE | Both, with all previous versions |

### Acceptance Criteria

- [ ] Schema Registry navigation item is hidden when no schema registry URL is configured for the cluster.
- [ ] Schema Registry navigation item is visible when a schema registry URL is configured.
- [ ] Navigating to the page without a configured URL shows a clear informational empty state.
- [ ] Subject list loads all subjects from the registry within 3 seconds.
- [ ] Subject list shows schema type and compatibility mode for each subject.
- [ ] Search filters subjects by name substring in real time.
- [ ] Clicking a subject navigates to the subject detail page.
- [ ] Subject detail shows all available versions in the version selector.
- [ ] Selecting a version loads and displays that version's schema content.
- [ ] "Latest" version is selected by default.
- [ ] Schema content is syntax-highlighted and formatted (not a raw JSON string blob).
- [ ] "Copy schema" button copies the raw schema JSON to clipboard.
- [ ] Compatibility mode badge is shown with a tooltip explaining its meaning.
- [ ] Schema type (AVRO/JSON/PROTOBUF) is correctly displayed.
- [ ] Schema registry basic auth credentials (if configured in cluster settings) are applied to all proxy requests.

### Out of Scope (MVP)

- Creating or registering new schemas via the UI.
- Deleting subjects or versions via the UI.
- Checking schema compatibility before registration.
- Side-by-side version diff view.
- Global schema registry config management (changing global compatibility mode).
- Protobuf schema rendering beyond raw text.

### Open Questions

1. Should the subject list page pre-load compatibility mode for each subject? This requires one HTTP call per subject (`/config/{subject}`) which could be slow for large registries (e.g. 500+ subjects). Consider fetching compatibility lazily (only on detail page) for MVP.
2. The Schema Registry API does not include a `createdAt` timestamp in version responses on all implementations. Should we omit it rather than showing an inaccurate or empty value?
3. Should subjects that match the TopicNameStrategy pattern (`{topic}-key`, `{topic}-value`) have a direct link back to the corresponding topic in the topic explorer?

### Dependencies

- Confluent Schema Registry REST API (v1) — standard HTTP client (native `fetch`).
- F1 (Cluster Management) — `schema_registry_url` and optional basic auth stored per cluster.
- F4 (Message Browser) — schema chips in message browser link to this feature.
- `shadcn/ui` components: `Select`, `Badge`, `Tabs`, `Card`, `Button`, `Tooltip`, `Input`.
- A JSON/Avro syntax highlighter: `react-syntax-highlighter` or `shiki`.
