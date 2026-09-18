import type { AzureHostLayerConfig } from "./types"

let globalConfig: AzureHostLayerConfig | null = null

export function configure(config: AzureHostLayerConfig): void {
  globalConfig = config
}

export function getConfig(): AzureHostLayerConfig {
  if (!globalConfig) {
    throw new Error(
      "Azure Functions host layer not configured. Call configure() first."
    )
  }
  return globalConfig
}
