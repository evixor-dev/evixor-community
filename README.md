# @evixor/evixor-community

Community-maintained, open-source components for the [Evixor](https://evixor.org) runtime ecosystem.

## Philosophy

Evixor Community provides **reference implementations** of the most common infrastructure components needed to run Evixor in production. These are intentionally minimal — built to be correct, readable, and easy to fork.

We believe that a well-crafted base implementation, combined with modern AI tooling, empowers developers to derive production-grade variants tailored to their specific constraints (database choice, deployment model, tenancy requirements, etc.) faster than a one-size-fits-all library ever could.

**What you get here:**
- A solid starting point that passes the full Evixor test suite
- Clear, auditable code that AI models can reliably extend or adapt
- No opinionated abstractions beyond what the `PersistLayer` / `HostLayer` contracts require

**What you build yourself (or with AI):**
- Multi-tenant isolation, connection pooling, sharding
- Database-specific optimizations (Postgres, MySQL, Cosmos DB, DynamoDB …)
- Cloud-native persistence (S3, GCS, Azure Blob)
- Custom timeline UI components

## Packages

| Package | Description |
|---------|-------------|
| [`@evixor/persist-sqlite`](./packages/persist-sqlite) | Single-threaded SQLite persistence layer — ideal for local development, embedded deployments, and as a reference for building your own `PersistLayer` |

### Roadmap

- Timeline visualization components (React)
- Additional reference implementations as community demand grows

## Getting Started

```bash
npm install @evixor/persist-sqlite
```

```ts
import { SqlitePersistLayer } from "@evixor/persist-sqlite"
import { startWorkflow, InMemoryHostLayer } from "@evixor/evixor-runtime"

const persistLayer = new SqlitePersistLayer("./data/evixor.db")
const hostLayer = new InMemoryHostLayer(persistLayer, pipelineRegistry)

const pipelineId = await startWorkflow("my-pipeline", payload, {}, persistLayer, hostLayer)
await hostLayer.doLoop({})
```

## Contributing

Community contributions are welcome. When adding a new package:

1. Place it under `packages/<name>/`
2. Implement the corresponding interface from `@evixor/evixor-runtime`
3. Include a `README.md` with usage examples
4. Ensure it passes the shared Evixor test suite

## License

MIT — see [LICENSE](LICENSE) for details.
