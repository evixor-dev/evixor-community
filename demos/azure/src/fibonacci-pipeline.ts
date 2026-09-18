import { EvixorPipeline, EvixorCtx, type EvixorRuntimeApi, controlReRun } from "@evixor/evixor-runtime"
import { add } from "./steps"

export default (pl: EvixorPipeline) =>
  pl
    .next((ctx: EvixorCtx) => {
      const { current } = ctx.payload
      if (!current) {
        ctx.current.feed = { a: 1, b: 2 }
      } else {
        ctx.current.feed = { a: current[current.length - 2], b: current[current.length - 1] }
      }
    })
    .step("add", add)
    .next((ctx: EvixorCtx) => {
      const result = ctx.current.drop[0]
      const { target, current } = ctx.payload
      if (current) {
        ctx.current.feed = { target, current: [...current, result] }
      } else {
        ctx.current.feed = { target, current: [1, 2, result] }
      }

      if (result < target) {
        controlReRun(ctx)
        return
      }
    })
    .step("submit", (runtime: EvixorRuntimeApi) => {
      const { current } = runtime.getFeed()
      runtime.submitDrop(current)
    })
