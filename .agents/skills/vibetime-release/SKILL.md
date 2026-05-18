---
name: vibetime-release
description: Use for VibeTime release work, including bumping the date-based version, creating and pushing release tags, triggering GitHub Actions CI packaging, creating or updating GitHub Releases with notes from the previous version, and verifying uploaded macOS/Windows assets. Trigger on requests such as 发版, 发布新版, release, bump version, 触发 CI 更新, 更新 release note, or publish VibeTime.
metadata:
  short-description: Release VibeTime with tag CI and GitHub notes
---

# VibeTime Release

This project releases from `main` with date-based versions such as `2026.5.18`. Tags use `v<version>`, for example `v2026.5.18`.

## Source of truth

- Workspace package versions live in:
  - `package.json`
  - `packages/core/package.json`
  - `packages/hook/package.json`
  - `packages/desktop/package.json`
- GitHub Actions release packaging is triggered by pushing tags matching `v*`.
- The CI workflow creates the GitHub Release after quality, macOS, and Windows packaging jobs pass.

## Release workflow

1. Inspect state first.

```bash
rtk git status -sb
rtk git tag --sort=-creatordate | head -20
gh release list --limit 10
```

Do not continue if the worktree has unrelated uncommitted changes. Preserve user changes.

2. Determine the target version.

- If the user says a short date like `5.18`, use the existing version scheme and current release year to form `YYYY.5.18`.
- Confirm the target tag does not already exist:

```bash
rtk git tag --list 'v<version>'
gh release view 'v<version>' --json tagName,name,url 2>/dev/null || true
```

3. Collect release-note source commits before creating the version bump commit.

```bash
rtk git log --oneline --decorate 'v<previous-version>..HEAD'
git log --format='- %s (%h)' 'v<previous-version>..HEAD'
```

Use the actual user-facing changes between the previous release tag and the target release. Omit pure version-bump commits from notes.

4. Bump all workspace package versions.

Only update the four package manifests listed above unless the package manager actually changes the lockfile. Keep the diff limited to version fields.

5. Validate the bump.

For a version-only release bump after code was already verified in the same thread:

```bash
rtk pnpm typecheck
rtk pnpm lint
```

If code changes have not already been verified, run the broader relevant test suite or `rtk pnpm run ci` before tagging.

6. Commit and tag.

```bash
rtk git add package.json packages/core/package.json packages/hook/package.json packages/desktop/package.json
rtk git commit -m "Bump version to <version>"
rtk git tag 'v<version>'
```

7. Prepare release notes in a temporary file.

Use concise bullets derived from the commit range. Example shape:

```markdown
## Changes since v<previous-version>

- ...
- ...
```

8. Push main and the tag.

```bash
rtk git push origin main
rtk git push origin 'v<version>'
```

The tag push should trigger the full release CI.

9. Watch the tag CI, not only the `main` push CI.

```bash
gh run list --workflow CI --limit 5
gh run watch <tag-run-id> --interval 30 --exit-status
```

Expected tag jobs:

- `Quality`
- `Package macOS arm64`
- `Package Windows x64`
- `Create GitHub Release`

Node/action deprecation warnings are non-blocking unless the run fails.

10. Update the GitHub Release body after CI creates it.

```bash
gh release edit 'v<version>' --notes-file /tmp/vibetime-<version>-notes.md
```

11. Verify the release.

```bash
gh release view 'v<version>' --json tagName,name,url,assets,body,isDraft,isPrerelease,publishedAt
rtk git status -sb
```

Expected assets:

- `VibeTime-<version>-arm64.dmg`
- `VibeTime-<version>-x64.exe`
- `VibeTime-Setup-<version>-x64.exe`

## Final response

Report:

- version, commit hash, tag, and release URL
- CI result and uploaded assets
- release-note update status
- any non-blocking warnings worth tracking separately

If a commit, push, or PR was actually performed, include the appropriate Codex git directive in the final answer.
