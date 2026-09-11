import esbuild from "esbuild"
import path from "node:path"
import fs from "node:fs"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, "..")
const outDir = path.resolve(rootDir, "dist")
const outFile = path.join(outDir, "index.js")

if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true })
}
fs.mkdirSync(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(rootDir, "index.ts")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  format: "esm",
  sourcemap: "inline",
  target: "node20",
  treeShaking: true,
  external: ["@evixor/evixor-runtime", "better-sqlite3"],
})

const { execSync } = await import("node:child_process")
const _require = createRequire(import.meta.url)
const tscPath = _require.resolve("typescript/bin/tsc")
execSync(`node ${JSON.stringify(tscPath)} --project ${JSON.stringify(path.join(rootDir, "tsconfig.json"))} --outDir ${JSON.stringify(outDir)}`, {
  stdio: "inherit",
  cwd: rootDir,
})

fs.writeFileSync(
  path.join(outDir, "package.json"),
  JSON.stringify(
    {
      name: "@evixor/persist-sqlite",
      type: "module",
      main: "./index.js",
      types: "./index.d.ts",
      peerDependencies: {
        "@evixor/evixor-runtime": "^0.9.0",
      },
      peerDependenciesMeta: {
        "@evixor/evixor-runtime": { "optional": false },
      },
    },
    null,
    2,
  ),
)