import { app, InvocationContext } from "@azure/functions"
import { signalWorkflow } from "@evixor/evixor-runtime"
import { getConfig } from "./configure"
import { AzureHostLayerFull } from "./hostLayer"

async function handlerSignalWorkflow(
  msg: { rootId: string; [key: string]: any },
  context: InvocationContext
): Promise<void> {
  const { rootId } = msg
  if (!rootId) {
    context.log("signalWorkflow: missing rootId, skipping")
    return
  }

  const config = getConfig()
  if (!config.pipelineRegistry) {
    context.log("signalWorkflow: pipelineRegistry not configured, skipping")
    return
  }

  const hostLayer = AzureHostLayerFull.fromConfig(config.pipelineRegistry)

  await signalWorkflow(
    rootId,
    config.persistLayer,
    hostLayer,
    {}
  )
}

app.storageQueue("signalWorkflow", {
  queueName: "queue-signal",
  connection: "STORAGE_CONN_SIGNAL",
  handler: handlerSignalWorkflow,
})
