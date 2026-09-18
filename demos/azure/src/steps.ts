import type { EvixorRuntimeApi } from "@evixor/evixor-runtime"

export function add(runtime: EvixorRuntimeApi) {
  const { a, b } = runtime.getFeed<{ a: number; b: number }>()
  runtime.submitDrop(a + b)
}

export function subtract(runtime: EvixorRuntimeApi) {
  const { a, b } = runtime.getFeed<{ a: number; b: number }>()
  runtime.submitDrop(a - b)
}

export function multiply(runtime: EvixorRuntimeApi) {
  const { a, b } = runtime.getFeed<{ a: number; b: number }>()
  runtime.submitDrop(a * b)
}

export function divide(runtime: EvixorRuntimeApi) {
  const { a, b } = runtime.getFeed<{ a: number; b: number }>()
  if (b === 0) {
    runtime.error({}, "Division by zero", null, true)
    return
  }
  runtime.submitDrop(a / b)
}
