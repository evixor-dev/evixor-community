# @evixor/persist-sqlite

Single-threaded SQLite persistence layer for [Evixor](https://evixor.org).

## Overview

`SqlitePersistLayer` implements the `PersistLayer` interface from `@evixor/evixor-runtime` using [better-sqlite3](https://github.com/WiseLibs/better-sqlite3). It is designed for:

- **Local development** — zero-config persistence for testing pipelines
- **Embedded deployments** — single-process applications where SQLite is a natural fit
- **Reference implementation** — a clear, complete example for building your own `PersistLayer`

## Installation

```bash
npm install @evixor/persist-sqlite
```

## Usage

```ts
import { SqlitePersistLayer } from "@evixor/persist-sqlite"
import { startWorkflow, InMemoryHostLayer } from "@evixor/evixor-runtime"

const persistLayer = new SqlitePersistLayer("./data/evixor.db")
const hostLayer = new InMemoryHostLayer(persistLayer, pipelineRegistry)

const pipelineId = await startWorkflow("my-pipeline", { a: 1 }, {}, persistLayer, hostLayer)
await hostLayer.doLoop({})
```

## Limitations

| Constraint | Detail |
|------------|--------|
| Single-threaded | Only one process may write to the same database file concurrently |
| Single-instance | Multi-process deployments will break timeline primary keys |
| Lock TTL | Stale locks are reclaimed after 900 seconds; restart interval should exceed 1 second |

For multi-instance or multi-tenant deployments, use this as a reference to build a `PersistLayer` backed by your database of choice (Postgres, MySQL, Cosmos DB, etc.).

## Extending

The full source is under `src/`. Key files:

| File | Purpose |
|------|---------|
| `SqlitePersistLayer.ts` | `PersistLayer` implementation — all SQL lives here |
| `sqliteStore.ts` | Low-level SQLite wrapper (table creation, queries) |

To derive a Postgres or MySQL variant:

1. Copy this package as a starting point
2. Replace `SqliteStore` with your database client
3. Adapt the SQL dialect (the queries are straightforward)
4. Run the Evixor test suite to verify correctness

## License

MIT — see [LICENSE](LICENSE) for details.
