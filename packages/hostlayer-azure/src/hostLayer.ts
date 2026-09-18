import { QueueClient } from "@azure/storage-queue"
import {
  HostLayerFull,
  HostLayerLite,
  createPipeline,
  EvixorPipeline,
  PipelineBuilderFn,
} from "@evixor/evixor-runtime"
import { getConfig } from "./configure"

export class AzureHostLayerLite implements HostLayerLite {
  private queueClient: QueueClient

  constructor(queueClient: QueueClient) {
    this.queueClient = queueClient
  }

  static fromConfig(): AzureHostLayerLite
  static fromConfig(map: Map<string, PipelineBuilderFn>): AzureHostLayerFull
  static fromConfig(map?: Map<string, PipelineBuilderFn>): AzureHostLayerLite | AzureHostLayerFull {
    const config = getConfig()
    const queueClient = new QueueClient(
      config.queueConnectionString,
      config.queueName ?? "queue-signal"
    )
    if (map) {
      return new AzureHostLayerFull(queueClient, map)
    }
    return new AzureHostLayerLite(queueClient)
  }

  async queuePipeline(rootId: string, pipeline?: string): Promise<void> {
    await this.queueClient.createIfNotExists()
    await this.queueClient.sendMessage(JSON.stringify({ rootId }))
  }
}

export class AzureHostLayerFull
  extends AzureHostLayerLite
  implements HostLayerFull
{
  private map: Map<string, PipelineBuilderFn>

  constructor(
    queueClient: QueueClient,
    map: Map<string, PipelineBuilderFn>
  ) {
    super(queueClient)
    this.map = map
  }

  loadPipeline(pipeline: string): EvixorPipeline {
    const pl = createPipeline()
    const builder = this.map.get(pipeline)
    if (builder) {
      return builder(pl)
    }
    throw new Error(`unknown pipeline: ${pipeline}`)
  }
}
