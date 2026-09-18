import type { PipelineBuilderFn } from "@evixor/evixor-runtime"
import mathPipeline from "./math-pipeline"
import fibonacciPipeline from "./fibonacci-pipeline"

const pipelines: [string, PipelineBuilderFn][] = [
  ["math", mathPipeline],
  ["fibonacci", fibonacciPipeline],
]

export const pipelineRegistry = new Map(pipelines)
