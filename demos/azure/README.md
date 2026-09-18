# Azure Functions Demo

A ready-to-run demo that executes [Evixor](https://evixor.org) pipelines on a local Azure Functions instance. Includes two sample pipelines — **math** (multi-step arithmetic with subpipeline call) and **fibonacci** (iterative loop) — and outputs a timeline JSON you can paste into [evixor.org](https://evixor.org) to visualize the execution as an interactive Gantt chart.

> **Note:** This demo uses SQLite as the persist layer for simplicity, which is **not suitable for production serverless deployments**. For real deployments on Azure, Cloudflare Workers, AWS Lambda, or other serverless platforms, use a production-grade persist layer such as PostgreSQL or PostgreSQL + Redis. See `@evixor/persist-sqlite` for a reference implementation that you can adapt to your own environment.

## Prerequisites

| Tool | Install | Notes |
|------|---------|-------|
| **Node.js** >= 18 | [nodejs.org](https://nodejs.org) | LTS recommended |
| **pnpm** | `npm install -g pnpm` | [pnpm.io](https://pnpm.io) |
| **Azure Functions Core Tools v4** | See below | Includes Azurite (local emulator) |
| **Azurite** | Included with Core Tools | Or install separately: `npm install -g azurite` |

### Azure Functions Core Tools

```bash
# Windows
npm install -g azure-functions-core-tools@4 --unsafe-perm true

# macOS
brew tap azure/functions && brew install azure-functions-core-tools@4

# Linux — see https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local
```

> Reference: [Install Azure Functions Core Tools](https://learn.microsoft.com/en-us/azure/azure-functions/functions-run-local#install-the-azure-functions-core-tools)

## Quick Start

### 1. Clone & Enter the Repo

```bash
git clone https://github.com/evixor-dev/evixor-community.git
cd evixor-community
```

### 2. Approve Native Module Builds

`better-sqlite3` and `esbuild` need to compile native modules. Run:

```bash
pnpm approve-builds
```

When prompted, select **better-sqlite3** and **esbuild** (press <kbd>Space</kbd> to toggle, <kbd>Enter</kbd> to confirm), then confirm with **y**.

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Build All Packages

```bash
pnpm build
```

### 5. Enter the Demo Directory

```bash
cd demos/azure
```

### 6. Start Azurite (Local Azure Storage Emulator)

`func start` expects Azurite to be already running. Start it in the background:

```bash
# Windows (PowerShell)
Start-Process -FilePath "node" -ArgumentList "node_modules\azurite\dist\src\azurite.js --silent --location __azurite_data__" -WorkingDirectory "$PWD" -WindowStyle Minimized

# macOS / Linux
node node_modules/azurite/dist/src/azurite.js --silent --location __azurite_data__ &
```

Wait a few seconds, then verify ports 10000 (blob), 10001 (queue), 10002 (table) are listening.

### 7. Create the Azurite Queue

Azurite does not auto-create queues. The `signalWorkflow` function requires a queue named `queue-signal`:

```bash
node -e "const{QueueClient}=require('@azure/storage-queue');const q=new QueueClient('DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;','queue-signal');q.create().then(()=>console.log('Queue created')).catch(e=>console.error(e.message))"
```

### 8. Start the Azure Functions Host

```bash
func start
```

You should see the four functions registered:

```
Functions:
    getTimeline: [GET] http://localhost:7071/api/getTimeline
    receivePendingInputs: [POST] http://localhost:7071/api/receivePendingInputs
    startWorkflow: [POST] http://localhost:7071/api/startWorkflow
    signalWorkflow: queueTrigger
```

> **Keep this terminal open.** The host must stay running for the demo to work.

### 9. Run the Demo

Open a **new terminal** and run:

```bash
pnpm cli start math
```

Output:

```
Starting workflow: pipeline="math", payload={"a":3,"b":7}
Workflow started: pipelineId=xxxxxx:1234567890:math

Waiting 3s for workflow to process...

{ "timelines": [ ... ], "record": [] }
```

The CLI starts a math workflow, waits 3 seconds for execution, then queries and prints the timeline JSON.

### 10. View the Timeline on evixor.org

Follow the visual guide in [workflow-demo/README.md](https://github.com/evixor-dev/workflow-demo/blob/master/README.md#view-the-timeline-on-evixororg) — it includes screenshots for each step:

1. **Copy** the entire JSON output (from `{` to `}`)
2. Open [evixor.org](https://evixor.org), log in, and navigate to the **Timelines** page
3. Click **Load JSON**, paste the JSON, and click **Load**
4. Click the **math** pipeline to view its Gantt timeline

## Project Structure

| File | Description |
|------|-------------|
| `src/index.ts` | Entry point — configures SQLite persist layer, queue connection, and pipeline registry |
| `src/register.ts` | Pipeline registry (maps `"math"` and `"fibonacci"` to their builders) |
| `src/steps.ts` | Reusable arithmetic steps: `add`, `subtract`, `multiply`, `divide` |
| `src/math-pipeline.ts` | Math pipeline — chains arithmetic operations, calls fibonacci as a subpipeline |
| `src/fibonacci-pipeline.ts` | Fibonacci pipeline — computes sequence via `controlReRun` loop |
| `src/getTimeline.ts` | HTTP GET endpoint for querying timeline data |
| `src/cli.ts` | CLI tool — starts workflows and displays timeline JSON |

## Pipelines

### Math Pipeline

```
payload { a, b }
  → add(|a|, 8)
  → multiply(|b|, addResult)
  → subtract(|a|, multiplyResult)
  → divide(|subtractResult|, |b|)
  → fibonacci({ target })
  → submit
```

Demonstrates: step chaining, state management, subpipeline invocation.

### Fibonacci Pipeline

```
payload { target }
  → add(1, 2)
  → if result < target: reRun (loop back)
  → submit accumulated sequence
```

Demonstrates: iterative loops via `controlReRun`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `404 The specified queue does not exist` | Run Step 7 to create the `queue-signal` queue in Azurite |
| Timeline is empty after `pnpm cli start` | Code changes require rebuild: run `pnpm build` in the demo directory, then restart `func start` |
| `better-sqlite3` build fails | Run `pnpm approve-builds` before `pnpm install` |
| `func start` shows old behavior after code change | Stop with <kbd>Ctrl</kbd>+<kbd>C</kbd>, run `pnpm build`, then `func start` again |
| `CommandNotFoundException: az` | Azure CLI is not required — use the `node -e` command in Step 7 instead |
| `func start` fails with "connection refused 127.0.0.1:10001" | Azurite is not running — run Step 6 to start it first |

## License

MIT
