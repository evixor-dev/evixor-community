import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions"
import { startWorkflow } from "@evixor/evixor-runtime"
import { getConfig } from "./configure"
import { AzureHostLayerLite } from "./hostLayer"

async function handlerStartWorkflow(
  req: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON" } }
  }

  const { rootId, pipeline, payload } = body
  if (!pipeline) {
    return { status: 400, jsonBody: { error: "pipeline is required" } }
  }

  const config = getConfig()
  const hostLayer = AzureHostLayerLite.fromConfig()

  const pipelineId = await startWorkflow(
    pipeline,
    payload,
    { rootId },
    config.persistLayer,
    hostLayer
  )

  return { jsonBody: { ok: true, pipelineId } }
}

app.http("startWorkflow", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "startWorkflow",
  handler: handlerStartWorkflow,
})
