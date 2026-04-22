# KafkaLens — Claude Session Guide

## Project Overview

KafkaLens is a self-hosted, open-source Kafka management UI built with Next.js 14.
It lets engineers inspect clusters, browse topics, tail messages, monitor consumer
group lag, and manage Schema Registry subjects — all from a single browser tab.
Cluster connection configs are stored locally in a SQLite database; no cloud backend
is required.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 (strict mode) |
| Styling | Tailwind CSS + shadcn/ui |
| Component primitives | Radix UI |
| Icons | lucide-react |
| Charts | recharts |
| Kafka client | KafkaJS (`kafkajs`) |
| Local persistence | better-sqlite3 |
| Data fetching | @tanstack/react-query v5 |
| Validation | zod |

---

## Directory Structure

```
kafkalens/
├── src/
│   ├── app/                  # Next.js App Router pages & API routes
│   │   ├── layout.tsx        # Root layout (dark mode, sidebar, providers)
│   │   ├── globals.css       # Tailwind directives + shadcn/ui CSS variables
│   │   ├── page.tsx          # Dashboard (/)
│   │   ├── clusters/         # Cluster management pages
│   │   ├── topics/           # Topic browser pages
│   │   ├── messages/         # Message viewer pages
│   │   ├── consumer-groups/  # Consumer group pages
│   │   ├── metrics/          # Metrics / charts pages
│   │   ├── settings/         # App settings pages
│   │   └── api/              # Route handlers (Next.js API routes)
│   │       ├── clusters/     # CRUD for cluster configs
│   │       ├── kafka/        # Kafka admin operations (topics, brokers, etc.)
│   │       └── schema-registry/
│   ├── components/
│   │   ├── ui/               # shadcn/ui component copies (toast, dialog, etc.)
│   │   ├── sidebar.tsx       # Global navigation sidebar
│   │   └── providers.tsx     # QueryClientProvider wrapper
│   ├── lib/
│   │   ├── utils.ts          # `cn()` helper
│   │   ├── db.ts             # better-sqlite3 singleton + schema migrations
│   │   └── kafka.ts          # KafkaJS client factory (to be created)
│   └── types/
│       └── index.ts          # Shared TypeScript types
├── docker-compose.yml        # Local Kafka + Zookeeper + Schema Registry
├── .env.example              # Environment variable reference
├── kafkalens.db              # SQLite DB (gitignored, auto-created at runtime)
├── tailwind.config.ts
├── tsconfig.json             # strict: true
└── next.config.js
```

---

## Conventions

### API Routes
- All API routes live under `src/app/api/`.
- Every handler returns `ApiResponse<T>` (see `src/types/index.ts`).
- Wrap Kafka operations in try/catch and return `{ success: false, error: string }` on failure.
- Use `zod` to validate incoming request bodies — throw a 400 if validation fails.

### Database
- `src/lib/db.ts` exports a singleton `db` instance.
- All schema migrations happen inside `createDb()` using `db.exec()`.
- Add new migrations as additional `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE` statements in the same function — never drop and recreate.

### Kafka Client
- `src/lib/kafka.ts` (to be created) should export a `getKafkaClient(cluster: Cluster): Kafka` factory.
- Parse `cluster.brokers` (comma-separated string) into an array before passing to KafkaJS.
- Decode `cluster.auth_config` with `JSON.parse`.
- Cache clients by cluster id to avoid re-connecting on every request.

### Components
- Prefer shadcn/ui primitives (copied into `src/components/ui/`) over raw Radix.
- Use the `cn()` utility for conditional class merging.
- Client components must have `"use client"` at the top.
- Server components (default in App Router) should handle data-fetching or delegate to API routes via react-query on the client.

### Types
- All shared types live in `src/types/index.ts`.
- The `Cluster` type mirrors the DB row exactly.
- `ClusterFormData` is the UI-facing form shape (brokers as a raw textarea string).

### Styling
- Dark mode only — the `<html>` element always has the `dark` class.
- Use CSS variable tokens (`bg-background`, `text-foreground`, etc.) rather than raw colors.
- Sidebar uses `sidebar-*` color tokens defined in `globals.css`.

---

## Running Locally

```bash
# 1. Install dependencies
npm install

# 2. (Optional) Start a local Kafka stack
docker compose up -d

# 3. Start the dev server
npm run dev
```

The app will be available at http://localhost:3000.

The SQLite database (`kafkalens.db`) is created automatically on first run.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `KAFKALENS_DB_PATH` | `./kafkalens.db` | Path to the SQLite database file |

---

## Key Files to Edit When Adding Features

| Task | Files |
|---|---|
| Add a new page | `src/app/<route>/page.tsx` |
| Add an API endpoint | `src/app/api/<route>/route.ts` |
| Add a new DB table | `src/lib/db.ts` — add `CREATE TABLE IF NOT EXISTS` in `createDb()` |
| Add a new type | `src/types/index.ts` |
| Add a shadcn/ui component | `src/components/ui/<component>.tsx` |
| Add a sidebar nav item | `src/components/sidebar.tsx` |
