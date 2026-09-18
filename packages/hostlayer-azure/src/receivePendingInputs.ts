import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from "@azure/functions"
import { receivePendingInputs } from "@evixor/evixor-runtime"
import { getConfig } from "./configure"
import { AzureHostLayerLite } from "./hostLayer"

async function handlerReceivePendingInputs(
  req: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  let body: any
  try {
    body = await req.json()
  } catch {
    return { status: 400, jsonBody: { error: "Invalid JSON" } }
  }

  const { rootId, pipeline, inputs } = body
  if (!rootId || !pipeline) {
    return {
      status: 400,
      jsonBody: { error: "rootId and pipeline are required" },
    }
  }

  const config = getConfig()
  const hostLayer = AzureHostLayerLite.fromConfig()

  const pipelineId = await receivePendingInputs(
    rootId,
    pipeline,
    inputs,
    config.persistLayer,
    hostLayer
  )

  return { jsonBody: { ok: true, pipelineId } }
}

app.http("receivePendingInputs", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "receivePendingInputs",
  handler: handlerReceivePendingInputs,
})
