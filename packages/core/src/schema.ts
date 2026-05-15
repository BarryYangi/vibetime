// Source: PRD §6 / CON-schema-events-table / CON-schema-open-turns-table — byte-exact verbatim.
//
// FND-03 invariant: these DDL strings match PRD §6 byte-for-byte. No
// existence-guard clause is added between CREATE TABLE and the table name —
// the Phase 3 store-init layer is responsible for idempotency (e.g., by
// checking `sqlite_master` first or running DDL once at first-launch only).
// Pushing idempotency into the string here would leak a Phase 3 concern
// into a Phase 1 contract.
//
// V0 always writes schema_version = 1. No migration logic in V0 (DEC-009).
// `meta` is a nullable JSON blob reserved for forward-extensibility.

export const SCHEMA_VERSION = 1 as const

export const DDL_EVENTS = `CREATE TABLE events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version  INTEGER NOT NULL DEFAULT 1,
    agent           TEXT    NOT NULL,
    event_type      TEXT    NOT NULL,
    project         TEXT    NOT NULL,
    session_id      TEXT    NOT NULL,
    turn_id         TEXT,
    ts              REAL    NOT NULL,
    timezone        TEXT    NOT NULL,
    duration_sec    REAL,
    meta            TEXT
);` as const

export const DDL_OPEN_TURNS = `CREATE TABLE open_turns (
    turn_id     TEXT    PRIMARY KEY,
    agent       TEXT    NOT NULL,
    project     TEXT    NOT NULL,
    session_id  TEXT    NOT NULL,
    started_at  REAL    NOT NULL,
    timezone    TEXT    NOT NULL,
    meta        TEXT
);` as const

export const DDL_USAGE_RECORDS = `CREATE TABLE usage_records (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version              INTEGER NOT NULL DEFAULT 1,
    agent                       TEXT    NOT NULL,
    source_file_key             TEXT    NOT NULL,
    source_row_key              TEXT    NOT NULL,
    source_file_basename        TEXT    NOT NULL,
    session_id                  TEXT,
    turn_id                     TEXT,
    project                     TEXT,
    ts                          REAL,
    model                       TEXT    NOT NULL,
    input_tokens                INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens         INTEGER NOT NULL DEFAULT 0,
    cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens               INTEGER NOT NULL DEFAULT 0,
    reasoning_output_tokens     INTEGER NOT NULL DEFAULT 0,
    total_tokens                INTEGER NOT NULL DEFAULT 0,
    attribution_method          TEXT    NOT NULL DEFAULT 'unmatched',
    attribution_confidence      REAL    NOT NULL DEFAULT 0,
    meta                        TEXT,
    created_at                  REAL    NOT NULL,
    updated_at                  REAL    NOT NULL,
    UNIQUE(agent, source_file_key, source_row_key)
);` as const

export const DDL_USAGE_SCAN_STATE = `CREATE TABLE usage_scan_state (
    agent                TEXT    NOT NULL,
    source_file_key      TEXT    NOT NULL,
    source_file_basename TEXT    NOT NULL,
    mtime_ms             REAL    NOT NULL,
    size_bytes           INTEGER NOT NULL,
    last_scanned_at      REAL    NOT NULL,
    last_row_key         TEXT,
    PRIMARY KEY(agent, source_file_key)
);` as const

export const DDL_USAGE_PRICING_CACHE = `CREATE TABLE usage_pricing_cache (
    model                                TEXT PRIMARY KEY,
    provider                             TEXT    NOT NULL,
    input_usd_per_million                REAL,
    cached_input_usd_per_million         REAL,
    cache_creation_input_usd_per_million REAL,
    output_usd_per_million               REAL,
    reasoning_output_usd_per_million     REAL,
    source                               TEXT    NOT NULL,
    fetched_at                           TEXT    NOT NULL,
    raw_version                          TEXT    NOT NULL
);` as const

export const DDL_INDICES = [
  'CREATE INDEX idx_events_ts ON events(ts);',
  'CREATE INDEX idx_events_project ON events(project);',
  'CREATE INDEX idx_events_agent_project ON events(agent, project);',
  'CREATE INDEX idx_events_session_id ON events(session_id);',
  // Speed up turn reconciliation / `hasTurnEnd` lookups by turn_id.
  'CREATE INDEX idx_events_turn_id ON events(turn_id) WHERE turn_id IS NOT NULL;',
] as const

export const DDL_USAGE_INDICES = [
  'CREATE INDEX idx_usage_records_ts ON usage_records(ts) WHERE ts IS NOT NULL;',
  'CREATE INDEX idx_usage_records_agent_ts ON usage_records(agent, ts) WHERE ts IS NOT NULL;',
  'CREATE INDEX idx_usage_records_model ON usage_records(model);',
  'CREATE INDEX idx_usage_records_project ON usage_records(project) WHERE project IS NOT NULL;',
  'CREATE INDEX idx_usage_records_turn_id ON usage_records(turn_id) WHERE turn_id IS NOT NULL;',
  'CREATE INDEX idx_usage_scan_state_agent ON usage_scan_state(agent);',
] as const
