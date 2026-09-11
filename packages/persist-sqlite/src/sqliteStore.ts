import fs from "node:fs"
import path from "node:path"
import Database from "better-sqlite3"

const DB_CACHE = new Map<string, Database.Database>()

export class SqliteStore {
  db: Database.Database

  constructor(dbPath: string) {
    const cached = DB_CACHE.get(dbPath)
    if (cached) {
      this.db = cached
      return
    }
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    this.db = new Database(dbPath)
    this.db.pragma("journal_mode = WAL")
    this.db.pragma("foreign_keys = ON")
    DB_CACHE.set(dbPath, this.db)
  }

  ensureRuntimeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        rootId TEXT NOT NULL,
        pipeline TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        lifecycleStatus TEXT NOT NULL DEFAULT 'pending',
        updatedAt INTEGER NOT NULL,
        ctx TEXT NOT NULL DEFAULT '{}',
        blobKey TEXT
      );

      CREATE TABLE IF NOT EXISTS timeline (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        PipelineId TEXT NOT NULL,
        rootId TEXT NOT NULL,
        pipeline TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        item TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS pending_inputs (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        inputs TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS subpipeline_returns (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        pipeline TEXT NOT NULL,
        drops TEXT NOT NULL DEFAULT '[]',
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payloads (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        pipeline TEXT NOT NULL,
        bootstrap INTEGER NOT NULL DEFAULT 0,
        blobKey TEXT,
        payload TEXT,
        PipelineId TEXT NOT NULL,
        subpipelines TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS locks (
        id TEXT PRIMARY KEY,
        tenantId TEXT NOT NULL,
        lockedBy TEXT NOT NULL,
        expiresAt INTEGER NOT NULL,
        missedEvent INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_workflows_rootId ON workflows(rootId);
      CREATE INDEX IF NOT EXISTS idx_workflows_tenantId ON workflows(tenantId);
      CREATE INDEX IF NOT EXISTS idx_workflows_lifecycle ON workflows(rootId, lifecycleStatus);
      CREATE INDEX IF NOT EXISTS idx_timeline_PipelineId ON timeline(PipelineId);
      CREATE INDEX IF NOT EXISTS idx_timeline_rootId ON timeline(rootId);
      CREATE INDEX IF NOT EXISTS idx_payloads_bootstrap ON payloads(tenantId, bootstrap);
    `)

    this.migrateTimelineStatus()
  }

  private migrateTimelineStatus(): void {
    const cols = this.db.prepare("PRAGMA table_info(timeline)").all() as { name: string }[]
    if (!cols.some(c => c.name === "status")) {
      this.db.exec(`ALTER TABLE timeline ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`)
    }
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_timeline_status ON timeline(status)`)
  }

  close(): void {
    this.db.close()
    for (const [key, value] of DB_CACHE) {
      if (value === this.db) {
        DB_CACHE.delete(key)
        break
      }
    }
  }
}