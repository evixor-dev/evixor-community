# @evixor/hostlayer-azure

Azure Functions host layer and HTTP handlers for Evixor workflow engine.

## Features

- Azure Functions HTTP triggers for workflow operations
- Storage Queue trigger for signal workflow
- QueueClient-based pipeline scheduling
- Works with any PersistLayer implementation

## Installation

```bash
npm install @evixor/hostlayer-azure @evixor/evixor-runtime
```

Peer dependencies:
- `@azure/functions` ^4.0.0

## Quick Start

```typescript
import { configure } from "@evixor/hostlayer-azure"
import { SqlitePersistLayer } from "@evixor/persist-sqlite"

// Define your pipelines
const pipelines = new Map()
pipelines.set("my-pipeline", (pl) =>
  pl.step("step1", step1Fn).step("step2", step2Fn)
)

// Configure once at startup
configure({
  persistLayer: new SqlitePersistLayer("./data/evixor.db"),
  queueConnectionString: process.env.STORAGE_CONN_SIGNAL!,
  pipelineRegistry: pipelines,  // Required for signalWorkflow
})
```

Importing `@evixor/hostlayer-azure` automatically registers all Azure Functions handlers:

- `POST /startWorkflow` - Start a new workflow
- `POST /receivePendingInputs` - Submit pending inputs
- `storageQueue: queue-signal` - Process workflow signals

## API

### `configure(config)`

Configure the Azure Functions host layer. Must be called before any handler executes.

```typescript
interface AzureHostLayerConfig {
  persistLayer: PersistLayer
  queueConnectionString: string
  queueName?: string  // default: "queue-signal"
}
```

### `AzureHostLayerLite`

Queue-based host layer for Azure Functions.

```typescript
import { AzureHostLayerLite } from "@evixor/hostlayer-azure"

const hostLayer = AzureHostLayerLite.fromConfig()
```

### `AzureHostLayerFull`

Full host layer with pipeline registry for signal workflow processing.

```typescript
import { AzureHostLayerFull } from "@evixor/hostlayer-azure"

const pipelines = new Map()
pipelines.set("my-pipeline", (pl) => pl.step("step1", step1Fn))

const hostLayer = AzureHostLayerFull.fromConfig(pipelines)
```

## HTTP Request Format

All handlers accept JSON POST requests.

### POST /startWorkflow

```json
{
  "pipeline": "my-pipeline",
  "payload": { "key": "value" },
  "rootId": "optional-root-id"
}
```

### POST /receivePendingInputs

```json
{
  "rootId": "workflow-root-id",
  "pipeline": "pipeline-name",
  "inputs": [{ "sessionId": "...", "role": "...", "input": {} }]
}
```

## License

MIT
