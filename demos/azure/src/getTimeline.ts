import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions"
import { getConfig } from "@evixor/hostlayer-azure"

async function handlerGetTimeline(
  req: HttpRequest,
  _context: InvocationContext
): Promise<HttpResponseInit> {
  const rootId = req.query.get("rootId")
  const pipelineId = req.query.get("pipelineId")

  const config = getConfig()

  if (rootId) {
    const timelines = await config.persistLayer.getWorkflowTreeTimeline(rootId)
    return { jsonBody: { timelines, record: [] } }
  }

  if (!pipelineId) {
    return { status: 400, jsonBody: { error: "pipelineId or rootId is required" } }
  }

  const timeline = await config.persistLayer.getPipelineTimeline(pipelineId)
  return { jsonBody: { ok: true, pipelineId, timeline } }
}

app.http("getTimeline", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "getTimeline",
  handler: handlerGetTimeline,
})
