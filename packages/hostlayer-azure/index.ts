export { AzureHostLayerLite, AzureHostLayerFull } from "./src/hostLayer"
export { configure, getConfig } from "./src/configure"
export type { AzureHostLayerConfig } from "./src/types"

import "./src/startWorkflow"
import "./src/receivePendingInputs"
import "./src/signalWorkflow"
