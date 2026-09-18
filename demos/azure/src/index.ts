import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { configure } from "@evixor/hostlayer-azure"
import { SqlitePersistLayer } from "@evixor/persist-sqlite"
import { pipelineRegistry } from "./register"

const dbPath = resolve("./data/evixor.db")
mkdirSync("./data", { recursive: true })

configure({
  persistLayer: new SqlitePersistLayer(dbPath),
  queueConnectionString: "UseDevelopmentStorage=true",
  queueName: "queue-signal",
  pipelineRegistry,
})

import "@evixor/hostlayer-azure"
import "./getTimeline"
