// Phase 3 constants — paths, limits, and version.
// BUILD_VERSION is injected at compile time via bun build --define.

export const VERSION = /* BUILD_VERSION via --define */ '0.0.0-dev'
export const DB_PATH = `${process.env.HOME}/.vibetime/data.db`
export const LOG_PATH = `${process.env.HOME}/.vibetime/hook.log`
export const CONFIG_PATH = `${process.env.HOME}/.vibetime/config.toml`
export const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
export const STALE_TURN_MAX_AGE = 6 * 60 * 60 // 6 hours (per REC-02)
