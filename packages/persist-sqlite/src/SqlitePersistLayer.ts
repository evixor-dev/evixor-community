import {
  EvixorCtx,
  EvixorCtxData,
  EvixorRunOptions,
  InitPayload,
  PendingInputEntry,
  PersistLayer,
  SubpipelineReturnsEntry,
  TimelineItem,
  TimelineMeta,
  PipelineId,
  createCtx,
  parsePipelineId,
  randomIdForDev,
  restoreCtx,
  PipelineIdToString,
  zeroLastThreeDigits,
} from "@evixor/evixor-runtime"
import { SqliteStore } from "./sqliteStore"

const LOCK_TTL_MS = 1000 * 900

// Module-level shared state (survives across instances)
const sharedLastTimestamps = new Map<string, number>()

/**
 * SqlitePersistLayer
 *
 * Single-threaded SQLite persistence layer for Evixor (open-source version, no tenant isolation).
 * - Uses module-level Map for monotonically increasing clock, does not touch ctx.meta._internal_lastTimestamp
 * - Safe for single-instance (single-process) deployments
 * - Service restart interval must be >1s: lastTimestamp is not persisted, restarting within the same second
 *   will recount from the current second, potentially colliding with old data and breaking timeline primary keys
 * - Multi-instance/multi-process concurrent writes to the same DB are not supported, will break timeline primary keys
 * - Lock supports TTL expiry: acquireLock force-reclaims expired stale locks (e.g., from killed processes)
 */
export class SqlitePersistLayer implements PersistLayer {
  private store: SqliteStore

  constructor(dbPath: string) {
    this.store = new SqliteStore(dbPath)
    this.store.ensureRuntimeTables()
  }

  async init(): Promise<void> {
    // Tables are created in the constructor
  }

  private nextTimestamp(rootId: string): number {
    const now = Date.now()
    const nowBase = zeroLastThreeDigits(now)
    const last = sharedLastTimestamps.get(rootId) ?? 0
    const next = Math.max(nowBase, last + 1)
    sharedLastTimestamps.set(rootId, next)

    if (next === nowBase && now % 10 === 0 && sharedLastTimestamps.size > 100) {
      const nextBase = zeroLastThreeDigits(next)
      for (const [k, v] of sharedLastTimestamps) {
        if (zeroLastThreeDigits(v) !== nextBase) {
          sharedLastTimestamps.delete(k)
        }
      }
    }

    return next
  }

  async newPipelineId(pipeline: string, rootId?: string, parentCtx?: EvixorCtx): Promise<PipelineId> {
    const effectiveRootId = rootId ?? randomIdForDev()
    const child: PipelineId = {
      rootId: effectiveRootId,
      timestamp: this.nextTimestamp(effectiveRootId),
      pipeline,
    }

    if (parentCtx) {
      const childId = PipelineIdToString(child)
      const parentId = PipelineIdToString(parentCtx.PipelineId)

      const row = this.store.db.prepare("SELECT subpipelines FROM payloads WHERE id = ?").get(parentId) as { subpipelines: string } | undefined
      if (row) {
        const subs: string[] = JSON.parse(row.subpipelines)
        subs.push(childId)
        this.store.db.prepare("UPDATE payloads SET subpipelines = ? WHERE id = ?").run(JSON.stringify(subs), parentId)
      }
    }

    return child
  }

  async saveCtx(PipelineId: PipelineId, ctx: EvixorCtx): Promise<void> {
    const id = PipelineIdToString(PipelineId)
    const ctxData: EvixorCtxData = {
      PipelineId: ctx.PipelineId,
      pipeline: ctx.pipeline,
      startTime: ctx.startTime,
      meta: ctx.meta,
      payload: ctx.payload,
      reference: ctx.reference,
      state: ctx.state,
      current: ctx.current,
      warnings: ctx.warnings,
      errors: ctx.errors,
      control: ctx.control,
    }

    this.store.db.prepare(`
      INSERT INTO workflows (id, rootId, pipeline, timestamp, lifecycleStatus, updatedAt, ctx)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        ctx = excluded.ctx,
        updatedAt = excluded.updatedAt,
        lifecycleStatus = excluded.lifecycleStatus
    `).run(
      id, PipelineId.rootId, PipelineId.pipeline,
      PipelineId.timestamp, ctx.meta.lifecycleStatus ?? "pending",
      Date.now(), JSON.stringify(ctxData),
    )

    this.store.db.prepare(`
      UPDATE timeline SET status = 'submitted'
      WHERE PipelineId = ? AND status = 'pending'
    `).run(id)
  }

  async loadCtx(PipelineId: PipelineId, options?: EvixorRunOptions): Promise<EvixorCtx | null> {
    const id = PipelineIdToString(PipelineId)

    this.store.db.prepare(`
      UPDATE timeline SET status = 'discard'
      WHERE PipelineId = ? AND status = 'pending'
    `).run(id)

    const row = this.store.db.prepare("SELECT ctx FROM workflows WHERE id = ?").get(id) as { ctx: string } | undefined

    let ctxData: EvixorCtxData
    if (!row) {
      const payload = await this.loadPayload(id)
      if (!payload || payload.pipeline !== PipelineId.pipeline) {
        return null
      }
      ctxData = await createCtx({
        PipelineId,
        pipeline: PipelineId.pipeline,
        startTime: PipelineId.timestamp,
        payload: payload.payload,
        options,
      })
    } else {
      ctxData = JSON.parse(row.ctx) as EvixorCtxData
    }

    return restoreCtx(ctxData, options)
  }

  async getWorkflowToActivate(rootId: string): Promise<PipelineId | null> {
    const payloadRows = this.store.db.prepare(`
      SELECT id, json_extract(PipelineId, '$.timestamp') AS ts
      FROM payloads
      WHERE json_extract(PipelineId, '$.rootId') = ?
      ORDER BY ts DESC
    `).all(rootId) as { id: string; ts: number }[]

    if (payloadRows.length === 0) return null
    const latestPayload = payloadRows[0]

    const workflowRows = this.store.db.prepare(`
      SELECT id, timestamp, lifecycleStatus
      FROM workflows
      WHERE rootId = ?
      ORDER BY timestamp DESC
    `).all(rootId) as { id: string; timestamp: number; lifecycleStatus: string }[]

    if (workflowRows.length === 0) {
      return parsePipelineId(latestPayload.id)
    }

    const latestWorkflow = workflowRows[0]
    if (latestPayload.ts !== latestWorkflow.timestamp) {
      return parsePipelineId(latestPayload.id)
    }

    for (const wf of workflowRows) {
      if (!["done", "abort", "timeout", "error", "doneWithContinue"].includes(wf.lifecycleStatus)) {
        return parsePipelineId(wf.id)
      }
      if (wf.lifecycleStatus === "doneWithContinue" && wf === workflowRows[0]) {
        return parsePipelineId(wf.id)
      }
    }

    return null
  }

  async acquireLock(rootId: string): Promise<string | null> {
    const ownerToken = randomIdForDev()
    try {
      this.store.db.prepare(`
        INSERT INTO locks (id, lockedBy, expiresAt, missedEvent)
        VALUES (?, ?, ?, 0)
      `).run(rootId, ownerToken, Date.now() + LOCK_TTL_MS)
      return ownerToken
    } catch {
      try {
        const row = this.store.db.prepare("SELECT expiresAt FROM locks WHERE id = ?").get(rootId) as { expiresAt: number } | undefined
        if (row && row.expiresAt < Date.now()) {
          this.store.db.prepare("DELETE FROM locks WHERE id = ?").run(rootId)
          this.store.db.prepare(`
            INSERT INTO locks (id, lockedBy, expiresAt, missedEvent)
            VALUES (?, ?, ?, 0)
          `).run(rootId, ownerToken, Date.now() + LOCK_TTL_MS)
          return ownerToken
        }
        this.store.db.prepare("UPDATE locks SET missedEvent = 1 WHERE id = ?").run(rootId)
      } catch {
        // ignore
      }
      return null
    }
  }

  async refreshLock(rootId: string, ownerToken: string): Promise<boolean> {
    const result = this.store.db.prepare(`
      UPDATE locks SET expiresAt = ? WHERE id = ? AND lockedBy = ?
    `).run(Date.now() + LOCK_TTL_MS, rootId, ownerToken)
    return result.changes > 0
  }

  async releaseLock(rootId: string, ownerToken: string): Promise<boolean> {
    const row = this.store.db.prepare("SELECT missedEvent, lockedBy FROM locks WHERE id = ?").get(rootId) as { missedEvent: number; lockedBy: string } | undefined
    if (!row) return false
    if (row.lockedBy !== ownerToken) return false
    const missedEvent = row.missedEvent === 1
    this.store.db.prepare("DELETE FROM locks WHERE id = ? AND lockedBy = ?").run(rootId, ownerToken)
    return missedEvent
  }

  async submitTimelineItem(ctx: EvixorCtx, item: TimelineItem): Promise<void> {
    const PipelineIdStr = PipelineIdToString(ctx.PipelineId)
    const nextTs = this.nextTimestamp(ctx.PipelineId.rootId)
    item.timestamp = nextTs

    const id = `${PipelineIdStr}:${nextTs}`

    try {
      this.store.db.prepare(`
        INSERT INTO timeline (id, PipelineId, rootId, pipeline, timestamp, createdAt, item, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(id, PipelineIdStr, ctx.PipelineId.rootId, ctx.PipelineId.pipeline, nextTs, Date.now(), JSON.stringify(item))
    } catch {
      // ignore duplicate
    }
  }

  async getPipelineTimeline(PipelineIdStr: string): Promise<TimelineMeta | undefined> {
    const pid = parsePipelineId(PipelineIdStr)

    const items = this.store.db.prepare(`
      SELECT item, timestamp, status FROM timeline
      WHERE PipelineId = ?
      ORDER BY timestamp ASC
      LIMIT 2000
    `).all(PipelineIdStr) as { item: string; timestamp: number; status: string }[]

    if (items.length === 0) return undefined

    const workflowRow = this.store.db.prepare("SELECT lifecycleStatus FROM workflows WHERE id = ?").get(PipelineIdStr) as { lifecycleStatus: string } | undefined

    return {
      PipelineId: pid,
      createdAt: pid.timestamp,
      items: items.map(r => ({ ...JSON.parse(r.item) as TimelineItem, status: r.status })),
      lifecycleStatus: workflowRow?.lifecycleStatus,
    }
  }

  async markPipelineLifecycle(PipelineId: PipelineId, lifecycleStatus: "done" | "doneWithContinue" | "abort" | "timeout" | "error" | "pending"): Promise<void> {
    const id = PipelineIdToString(PipelineId)
    try {
      const row = this.store.db.prepare("SELECT ctx FROM workflows WHERE id = ?").get(id) as { ctx: string } | undefined
      if (row) {
        const ctxData = JSON.parse(row.ctx) as EvixorCtxData
        ctxData.meta.lifecycleStatus = lifecycleStatus
        this.store.db.prepare(`
          UPDATE workflows SET lifecycleStatus = ?, ctx = ?, updatedAt = ? WHERE id = ?
        `).run(lifecycleStatus, JSON.stringify(ctxData), Date.now(), id)
      } else {
        this.store.db.prepare(`
          UPDATE workflows SET lifecycleStatus = ?, updatedAt = ? WHERE id = ?
        `).run(lifecycleStatus, Date.now(), id)
      }
    } catch {
      // ignore
    }
  }

  async terminatePendingPipelines(rootId: string, lifecycleStatus: "error" | "timeout" | "abort"): Promise<PipelineId[]> {
    const rows = this.store.db.prepare(`
      SELECT id, ctx FROM workflows
      WHERE rootId = ? AND lifecycleStatus = 'pending'
    `).all(rootId) as { id: string; ctx: string }[]

    if (rows.length === 0) return []

    const updateStmt = this.store.db.prepare(`
      UPDATE workflows SET lifecycleStatus = ?, ctx = ?, updatedAt = ? WHERE id = ?
    `)

    const updateMany = this.store.db.transaction(() => {
      for (const row of rows) {
        const ctxData = JSON.parse(row.ctx) as EvixorCtxData
        ctxData.meta.lifecycleStatus = lifecycleStatus
        updateStmt.run(lifecycleStatus, JSON.stringify(ctxData), Date.now(), row.id)
      }
    })
    updateMany()

    return rows.map(r => parsePipelineId(r.id))
  }

  async getPendingPipelineToResume(rootId: string): Promise<PipelineId | null> {
    const row = this.store.db.prepare(`
      SELECT id FROM workflows
      WHERE rootId = ? AND lifecycleStatus = 'pending'
      ORDER BY timestamp DESC LIMIT 1
    `).get(rootId) as { id: string } | undefined

    if (!row) return null
    return parsePipelineId(row.id)
  }

  async getWorkflowTreeTimeline(rootId: string): Promise<TimelineMeta[]> {
    const timelineRows = this.store.db.prepare(`
      SELECT PipelineId, item, timestamp, status FROM timeline
      WHERE rootId = ?
    `).all(rootId) as { PipelineId: string; item: string; timestamp: number; status: string }[]

    if (timelineRows.length === 0) return []

    const workflowRows = this.store.db.prepare(`
      SELECT id, lifecycleStatus FROM workflows
      WHERE rootId = ?
    `).all(rootId) as { id: string; lifecycleStatus: string }[]

    const statusMap = new Map(workflowRows.map(w => [w.id, w.lifecycleStatus]))
    const grouped = new Map<string, TimelineMeta>()

    for (const row of timelineRows) {
      const pidStr = row.PipelineId
      const ti = JSON.parse(row.item) as TimelineItem
      const itemWithStatus = { ...ti, status: row.status }

      let meta = grouped.get(pidStr)
      if (!meta) {
        meta = {
          PipelineId: ti.PipelineId,
          createdAt: ti.timestamp ?? Date.now(),
          items: [],
          lifecycleStatus: statusMap.get(pidStr),
        }
        grouped.set(pidStr, meta)
      }
      meta.items.push(itemWithStatus)
    }

    for (const meta of grouped.values()) {
      meta.items.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    }

    return Array.from(grouped.values())
      .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  }

  async listRootPipelines(): Promise<string[]> {
    const rows = this.store.db.prepare(`
      SELECT id FROM payloads
      WHERE bootstrap = 1
      ORDER BY json_extract(PipelineId, '$.timestamp') DESC
    `).all() as { id: string }[]

    return rows.map(r => r.id)
  }

  async listDoneWithContinueRootIds(): Promise<string[]> {
    const rows = this.store.db.prepare(`
      SELECT DISTINCT rootId FROM workflows
      WHERE lifecycleStatus = 'doneWithContinue'
    `).all() as { rootId: string }[]

    return rows.map(r => r.rootId)
  }

  async listPendingSubpipelineParents(): Promise<{ rootId: string; parentPipelineId: string; childPipelineId: string }[]> {
    const rows = this.store.db.prepare(`
      SELECT id AS parentPipelineId, rootId,
             json_extract(ctx, '$.control.continue.PipelineId') AS childPipelineId
      FROM workflows
      WHERE lifecycleStatus = 'pending'
        AND json_extract(ctx, '$.control.continue.type') = 'subpipeline'
        AND json_extract(ctx, '$.control.continue.PipelineId') IS NOT NULL
    `).all() as { rootId: string; parentPipelineId: string; childPipelineId: string }[]

    return rows
  }

  async enqueuePendingInputs(rootId: string, inputs: { sessionId: string; role: string; input: any }[]): Promise<void> {
    const now = Date.now()
    const entries: PendingInputEntry[] = inputs.map(i => ({
      ...i,
      timestamp: now,
    }))

    const existing = this.store.db.prepare("SELECT inputs FROM pending_inputs WHERE id = ?").get(rootId) as { inputs: string } | undefined
    if (existing) {
      const arr: PendingInputEntry[] = JSON.parse(existing.inputs)
      arr.push(...entries)
      this.store.db.prepare("UPDATE pending_inputs SET inputs = ? WHERE id = ?").run(JSON.stringify(arr), rootId)
    } else {
      this.store.db.prepare("INSERT INTO pending_inputs (id, inputs) VALUES (?, ?)").run(rootId, JSON.stringify(entries))
    }
  }

  async dequeuePendingInputs(rootId: string): Promise<PendingInputEntry[] | null> {
    const row = this.store.db.prepare("SELECT inputs FROM pending_inputs WHERE id = ?").get(rootId) as { inputs: string } | undefined
    if (!row) return null
    const arr = JSON.parse(row.inputs) as PendingInputEntry[]
    if (arr.length === 0) return null

    this.store.db.prepare("DELETE FROM pending_inputs WHERE id = ?").run(rootId)
    return arr
  }

  async getPendingInputsSessionId(PipelineId: PipelineId): Promise<string> {
    const currentId = PipelineIdToString(PipelineId)
    const currentPipeline = PipelineId.pipeline

    try {
      const rows = this.store.db.prepare(`
        SELECT id, subpipelines FROM payloads
        WHERE json_extract(PipelineId, '$.rootId') = ?
      `).all(PipelineId.rootId) as { id: string; subpipelines: string }[]

      const parentOf = new Map<string, string>()
      for (const r of rows) {
        const subs: string[] = JSON.parse(r.subpipelines)
        for (const child of subs) {
          parentOf.set(child, r.id)
        }
      }

      let ts = PipelineId.timestamp
      let childId = currentId
      while (true) {
        const parentId = parentOf.get(childId)
        if (!parentId) break

        const parentWid = parsePipelineId(parentId)
        if (parentpid.pipeline !== currentPipeline) break

        ts = parentpid.timestamp
        childId = parentId
      }

      return `${currentId}:${ts}`
    } catch {
      return `${currentId}:${PipelineId.timestamp}`
    }
  }

  async enqueueSubpipelineReturns(rootId: string, pipeline: string, drops: any[]): Promise<void> {
    try {
      this.store.db.prepare(`
        INSERT INTO subpipeline_returns (id, pipeline, drops, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(rootId, pipeline, JSON.stringify(drops), Date.now())
    } catch {
      // Row already exists 鈥?already enqueued
    }
  }

  async dequeueSubpipelineReturns(rootId: string): Promise<SubpipelineReturnsEntry | null> {
    const row = this.store.db.prepare("SELECT * FROM subpipeline_returns WHERE id = ?").get(rootId) as Record<string, unknown> | undefined
    if (!row) return null

    const drops = JSON.parse(row.drops as string) as unknown[]
    if (drops.length === 0) return null

    const data: SubpipelineReturnsEntry = {
      pipeline: row.pipeline as string,
      drops,
      timestamp: row.timestamp as number,
    }

    this.store.db.prepare("DELETE FROM subpipeline_returns WHERE id = ?").run(rootId)
    return data
  }

  async savePayload(PipelineIdStr: string, pipeline: string, payload: any, bootstrap: boolean): Promise<void> {
    const pid = parsePipelineId(PipelineIdStr)

    try {
      this.store.db.prepare(`
        INSERT INTO payloads (id, pipeline, bootstrap, payload, PipelineId)
        VALUES (?, ?, ?, ?, ?)
      `).run(PipelineIdStr, pipeline, bootstrap ? 1 : 0, JSON.stringify(payload), JSON.stringify(pid))
    } catch {
      // Row already exists
    }
  }

  async loadPayload(PipelineIdStr: string): Promise<InitPayload | null> {
    const row = this.store.db.prepare("SELECT payload, pipeline, PipelineId FROM payloads WHERE id = ?").get(PipelineIdStr) as { payload: string; pipeline: string; PipelineId: string } | undefined
    if (!row) return null

    return {
      PipelineId: JSON.parse(row.PipelineId) as PipelineId,
      pipeline: row.pipeline,
      payload: JSON.parse(row.payload),
    }
  }

  async getBundleName(rootId: string, bundleName: string): Promise<string> {
    const rows = this.store.db.prepare(`
      SELECT payload, id FROM payloads
      WHERE json_extract(PipelineId, '$.rootId') = ?
      ORDER BY json_extract(PipelineId, '$.timestamp') ASC
    `).all(rootId) as { payload: string; id: string }[]

    if (rows.length === 0) return bundleName

    const first = rows[0]
    const parsed = JSON.parse(first.payload) as Record<string, unknown>

    if (rows.length === 1) {
      if (!parsed.bundleName) {
        parsed.bundleName = bundleName
        this.store.db.prepare("UPDATE payloads SET payload = ? WHERE id = ?").run(JSON.stringify(parsed), first.id)
      }
      return (parsed.bundleName as string) ?? bundleName
    }

    return (parsed.bundleName as string) ?? bundleName
  }
}
