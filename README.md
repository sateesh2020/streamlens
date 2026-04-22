# StreamLens

A self-hosted, open-source Kafka observability and data exploration UI. Inspect clusters, browse topics, tail messages, monitor consumer group lag, and manage Schema Registry subjects — all from a single browser tab.

---

## Features

### Cluster Management
- Add and manage multiple Kafka cluster connections from the dashboard
- Supports multiple authentication modes: No Auth, SASL Plain, SASL SCRAM-256, SASL SCRAM-512, and SSL/TLS
- Test connectivity before saving a cluster config
- Cluster overview showing broker count, topic count, consumer group count, and active controller

### Topics
- Browse all topics in a cluster with partition count, replication factor, message count, and under-replication status
- Distinguishes internal topics (prefixed with `__`) from user topics
- Sync topics on demand — pulls live metadata from Kafka and caches it in the database
- Per-topic message count retry if the initial sync fails for a specific topic
- Daily message count snapshots automatically recorded on every sync for trend analysis

### Message Viewer
- Browse messages in a topic with offset, key, value, and timestamp
- Supports paging through messages

### Consumer Groups
- List all consumer groups in a cluster with member count and overall lag
- Drill into a consumer group to see per-partition lag, current offset, and last committed offset

### Schema Registry
- Browse all Schema Registry subjects for a cluster
- Displays schema type (Avro, Protobuf, JSON), version count, latest version, and compatibility mode
- Sync subjects on demand — fetches from the registry and caches in the database
- View the full schema content for any version of a subject with a built-in copy button

### Background Sync (Cron)
- Automatic topic sync runs every 6 hours via an in-process cron job (no Redis or queue required)
- Daily message count snapshots are written automatically on every sync

---

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- A running PostgreSQL instance (see options below)
- A Kafka cluster to connect to

---

## Running Locally

### 1. Clone the repository

```bash
git clone https://github.com/your-org/streamlens.git
cd streamlens
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up PostgreSQL

Choose one of the two options below.

#### Option A — Docker (recommended for local dev)

The included `docker-compose.yml` starts a PostgreSQL 16 container:

```bash
docker compose up -d
```

This starts PostgreSQL on **port 5438** (to avoid clashing with a local install) with:

| Setting  | Value              |
|----------|--------------------|
| Host     | `localhost`        |
| Port     | `5438`             |
| Database | `streamlens`       |
| User     | `streamlens`       |
| Password | `D0n1f0rg3tm3!`   |

Your `DATABASE_URL` for this setup:
```
postgresql://streamlens:D0n1f0rg3tm3!@localhost:5438/streamlens
```

#### Option B — Local PostgreSQL installation

If you already have PostgreSQL installed locally, create a database and user:

```sql
CREATE USER streamlens WITH PASSWORD 'your_password';
CREATE DATABASE streamlens OWNER streamlens;
```

Your `DATABASE_URL` will be:
```
postgresql://streamlens:your_password@localhost:5432/streamlens
```

---

### 4. Configure environment variables

Copy the example env file and fill in your database URL:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Use the connection string that matches your PostgreSQL setup above
DATABASE_URL=postgresql://streamlens:D0n1f0rg3tm3!@localhost:5438/streamlens
```

---

### 5. Run database migrations

```bash
npx prisma migrate deploy
```

This creates all required tables. The migration is idempotent — safe to run multiple times.

---

### 6. Start the development server

```bash
npm run dev
```

The app will be available at **http://localhost:3008**.

---

## (Optional) Local Kafka Stack

If you don't have a Kafka cluster to connect to, the Docker Compose file also works as a starting point. You can extend it with a Kafka + Zookeeper setup, or use a tool like [Redpanda](https://redpanda.com/) locally and point StreamLens at it.

---

## Available Scripts

| Command           | Description                        |
|-------------------|------------------------------------|
| `npm run dev`     | Start dev server on port 3008      |
| `npm run build`   | Build for production               |
| `npm run start`   | Start production server            |
| `npm run lint`    | Run ESLint                         |

---

## Tech Stack

| Layer              | Technology                          |
|--------------------|-------------------------------------|
| Framework          | Next.js 15 (App Router)             |
| Language           | TypeScript 5 (strict mode)          |
| Styling            | Tailwind CSS + shadcn/ui            |
| Icons              | lucide-react                        |
| Charts             | Recharts                            |
| Kafka client       | KafkaJS                             |
| Database           | PostgreSQL via Prisma ORM           |
| Data fetching      | TanStack React Query v5             |
| Validation         | Zod                                 |
| Background jobs    | node-cron (in-process, no Redis)    |

---

## Environment Variables

| Variable       | Required | Description                                  |
|----------------|----------|----------------------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL connection string (Prisma format) |
