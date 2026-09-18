import type { PersistLayer, PipelineBuilderFn } from "@evixor/evixor-runtime"

export interface AzureHostLayerConfig {
  persistLayer: PersistLayer
  queueConnectionString: string
  queueName?: string
  pipelineRegistry?: Map<string, PipelineBuilderFn>
}
