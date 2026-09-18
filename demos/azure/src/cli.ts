const API_BASE = process.env.API_BASE || "http://localhost:7071/api"

async function startWorkflow(pipeline: string, payload: any): Promise<string> {
  console.log(`Starting workflow: pipeline="${pipeline}", payload=${JSON.stringify(payload)}`)
  const res = await fetch(`${API_BASE}/startWorkflow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pipeline, payload }),
  })
  const data = await res.json() as any
  if (!data.ok) {
    console.error("Failed to start workflow:", data)
    process.exit(1)
  }
  console.log(`Workflow started: pipelineId=${data.pipelineId}`)
  return data.pipelineId
}

async function getTimelineByRootId(rootId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/getTimeline?rootId=${encodeURIComponent(rootId)}`)
  return await res.json()
}

function extractRootId(pipelineId: string): string {
  return pipelineId.split(":")[0]
}

function printTimeline(data: any) {
  const timelines = data?.timelines ?? []
  if (timelines.length === 0) {
    console.log("Timeline is empty (workflow may still be processing)")
    return
  }
  console.log("\n" + JSON.stringify(data, null, 2))
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]

  if (command === "start") {
    const pipeline = args[1] || "math"
    const payloadStr = args[2] || '{"a": 3, "b": 7}'
    const payload = JSON.parse(payloadStr)

    const pipelineId = await startWorkflow(pipeline, payload)
    const rootId = extractRootId(pipelineId)
    console.log(`\nWaiting 3s for workflow to process...`)
    await sleep(3000)

    const data = await getTimelineByRootId(rootId)
    printTimeline(data)
  } else if (command === "timeline") {
    const input = args[1]
    if (!input) {
      console.error("Usage: cli.ts timeline <rootId or pipelineId>")
      process.exit(1)
    }
    const rootId = input.includes(":") ? extractRootId(input) : input
    const data = await getTimelineByRootId(rootId)
    printTimeline(data)
  } else {
    console.log("Evixor Azure Functions Demo CLI\n")
    console.log("Usage:")
    console.log("  pnpm cli start [pipeline] [payload]   Start a workflow")
    console.log("  pnpm cli timeline <rootId>             Get timeline for a workflow")
    console.log("\nExamples:")
    console.log('  pnpm cli start math \'{"a": 3, "b": 7}\'')
    console.log("  pnpm cli timeline abc123def")
  }
}

main().catch(err => {
  console.error("Error:", err)
  process.exit(1)
})
