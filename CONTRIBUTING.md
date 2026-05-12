# Contributing to VibeTime

Thanks for your interest in contributing!

## Getting Started

1. Fork and clone the repo
2. Install dependencies: `pnpm install`
3. Start the dev server: `pnpm dev`

## Project Structure

```
packages/
├── core/       # Domain logic and SQLite schema
├── hook/       # Bun-compiled hook and CLI binary
└── desktop/    # Electron + React UI
```

## Development

- **Lint**: `pnpm lint`
- **Test**: `pnpm test`
- **Build**: `pnpm build`

## Submitting Changes

1. Create a branch from `main`
2. Make your changes
3. Run `pnpm lint && pnpm test`
4. Open a pull request with a clear description

## Reporting Issues

Open an issue on GitHub. Include your OS, VibeTime version, and steps to reproduce.
