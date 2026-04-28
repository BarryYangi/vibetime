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

export const DDL_INDICES = [
  'CREATE INDEX idx_events_ts ON events(ts);',
  'CREATE INDEX idx_events_project ON events(project);',
  'CREATE INDEX idx_events_agent_project ON events(agent, project);',
  'CREATE INDEX idx_events_session_id ON events(session_id);',
] as const
