// Hook binary constants. Version injected via bun build --define at compile time.

export const VERSION: string = (globalThis as Record<string, unknown>).__BUILD_VERSION__ as string ?? '0.0.0-dev'
export const DB_PATH = `${process.env.HOME}/.vibetime/data.db`
export const LOG_PATH = `${process.env.HOME}/.vibetime/hook.log`
export const CONFIG_PATH = `${process.env.HOME}/.vibetime/config.toml`
export const MAX_LOG_SIZE = 10 * 1024 * 1024 // 10MB
export const STALE_TURN_MAX_AGE = 6 * 60 * 60 // 6 hours (REC-02)
