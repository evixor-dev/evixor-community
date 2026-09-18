import { EvixorPipeline, EvixorCtx, type EvixorRuntimeApi, type SubpipelineReturnsEntry } from "@evixor/evixor-runtime"
import { add, divide, multiply, subtract } from "./steps"

export default (pl: EvixorPipeline) =>
  pl
    .next((ctx: EvixorCtx) => {
      const { a, b } = ctx.payload
      ctx.state = {
        ...ctx.state,
        absPayload: { a: Math.abs(a), b: Math.abs(b) },
      }
      ctx.current.feed = { a: ctx.state.absPayload.a, b: 8 }
    })
    .step("add", add)
    .next((ctx: EvixorCtx) => {
      ctx.current.feed = { a: ctx.state.absPayload.b, b: ctx.current.drop[0] }
    })
    .step("multiply", multiply)
    .next((ctx: EvixorCtx) => {
      ctx.current.feed = { a: ctx.state.absPayload.a, b: ctx.current.drop[0] }
    })
    .step("subtract", subtract)
    .next((ctx: EvixorCtx) => {
      ctx.current.feed = { a: Math.abs(ctx.current.drop[0]), b: ctx.state.absPayload.b }
    })
    .step("divide", divide)
    .next((ctx: EvixorCtx) => {
      let target = Math.floor(ctx.current.drop[0]) % 10
      target = target < 5 ? 5 : target
      ctx.current.feed = { target }
    })
    .subpipeline("fibonacci", (ctx: EvixorCtx, returns: SubpipelineReturnsEntry) => {
      ctx.current.feed = returns.drops[0]
    })
    .step("submit", (runtime: EvixorRuntimeApi) => {
      runtime.submitDrop(runtime.getFeed())
    })
