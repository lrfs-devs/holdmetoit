# CI Security Scanning & Supply-Chain Hardening

> **Feature Scope:** SEC-19 / GitHub Issue #237  
> **Layer:** `.github/` (workflows, Dependabot, CODEOWNERS) and repository settings  
> **Last Updated:** 2026-11-08

---

## 1. Overview

Before this slice, CI ran typecheck, lint, tests, and build only. Nothing scanned dependencies, secrets, or source for vulnerabilities, actions were pinned to mutable tags, the workflow token had default permissions, and `CODEOWNERS` was malformed so it enforced nothing.

## 2. What Lives in the Repository

| File                             | Purpose                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | Existing quality gates, now with a read-only token (`permissions: contents: read`), SHA-pinned actions, and `persist-credentials: false`. |
| `.github/workflows/security.yml` | `npm audit` for production dependencies (push, PR, weekly) and dependency review on pull requests.                                        |
| `.github/workflows/codeql.yml`   | CodeQL static analysis for JavaScript/TypeScript (push, PR, weekly) with the `security-extended` query suite.                             |
| `.github/dependabot.yml`         | Weekly grouped npm and GitHub Actions update PRs with a 7-day cooldown on brand-new releases.                                             |
| `.github/CODEOWNERS`             | Single owner (`@Afnanpathan2004`), with the security-sensitive paths listed explicitly.                                                   |

### 2.1 Action pinning

Every third-party action is pinned to a full commit SHA with the release in a trailing comment (for example `actions/checkout@11d5960… # v4.4.0`). Tags are mutable, so a compromised or force-moved tag could otherwise run attacker code with our workflow token. Dependabot proposes SHA bumps as reviewable PRs.

When pinning by hand, use a release that has been public for at least two weeks, and confirm the SHA belongs to the tag:

```bash
git ls-remote --tags https://github.com/<owner>/<repo>.git "<tag>*"
# use the commit line (the "^{}" peeled entry for annotated tags)
```

### 2.2 Gates and their current behavior

| Check                             | Blocks merge?                  | Notes                                                                                                         |
| --------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `quality-gates` (CI)              | Yes (make it a required check) | Unchanged apart from hardening.                                                                               |
| `Dependency review`               | Yes (make it a required check) | Fails a PR that **introduces** a dependency with a high or critical advisory. Only looks at the PR's changes. |
| `Analyze (javascript-typescript)` | Yes (make it a required check) | CodeQL results also appear under Security → Code scanning.                                                    |
| `npm audit (production)`          | Yes (make it a required check) | Fails on any high or critical advisory in the lockfile's production dependencies. Also runs weekly.           |

## 3. The `npm audit` Gate Blocks

`npm audit --package-lock-only --omit=dev --audit-level=high` runs against the lockfile, so it needs no install and executes no package scripts. A high or critical advisory in a production dependency fails the job.

The lockfile was clean when this gate was added, after the Next.js 16 and Prisma 7 migration cleared the earlier `next@14` and `prisma` advisories. Advisories are published without any change to our code, so the job also runs weekly (Monday 04:23 UTC); a red scheduled run means a new advisory landed.

### 3.1 When the audit fails

1. Run `npm audit --omit=dev` locally to see the advisory and the fix version.
2. Prefer a non-breaking `npm audit fix`, or bump the direct dependency that pulls in the vulnerable package.
3. If no fixed version exists yet, do not weaken the gate. Pin or replace the dependency, or record the exception in the PR with the advisory ID and a follow-up issue.

## 4. CODEOWNERS Policy

- The previous file was `*@Afnanpathan2004` with no space, so GitHub read it as a pattern with no owner and enforced nothing. The corrected default is `* @Afnanpathan2004`.
- Security-sensitive paths are listed explicitly with the same owner so they stay visible: `.github/`, `apps/web/core/auth/`, `apps/web/features/auth/`, `apps/web/app/api/auth/`, `apps/web/core/security/`, `apps/web/middleware.ts`, and `packages/database/prisma/`. To require a second reviewer later, add another handle to those lines.
- Code owners only take effect when **Require review from Code Owners** is enabled in branch protection (section 5). Owners must have write access to the repository. When the team changes, edit the handles in `.github/CODEOWNERS`.

## 5. Repository Settings (Admin Checklist)

These cannot be committed to the repository. An organization or repository admin must apply them, then tick the verification list.

### 5.1 Code security and analysis

Settings → Code security:

- [ ] Dependency graph: **enabled** (required by dependency review).
- [ ] Dependabot alerts: **enabled**.
- [ ] Dependabot security updates: **enabled**.
- [ ] Secret scanning: **enabled**.
- [ ] Push protection: **enabled**, so commits containing detected secrets are blocked at push time.
- [ ] Code scanning: do **not** enable "Default setup". The advanced `codeql.yml` workflow is the source of truth, and both together conflict.

### 5.2 Branch protection for `main` and `dev`

Settings → Rules (or Branches) → protect `main` and `dev` with the same rules:

- [ ] Require a pull request before merging.
- [ ] Require at least 1 approving review.
- [ ] Require review from Code Owners.
- [ ] Dismiss stale approvals when new commits are pushed.
- [ ] Require status checks to pass: `quality-gates`, `npm audit (production)`, `Dependency review`, `Analyze (javascript-typescript)`.
- [ ] Require conversations to be resolved.
- [ ] Block force pushes.
- [ ] Block branch deletion.

Status check names are the job names shown in the Actions UI. A check only becomes selectable after it has run once on the repository.

### 5.3 Actions settings

Settings → Actions → General:

- [ ] Workflow permissions: **Read repository contents**, so the default token is read-only.
- [ ] Fork pull request workflows: require approval for all outside collaborators.

### 5.4 Verification

- [ ] Open a throwaway PR touching `.github/`: it requests review from both owners and cannot merge without an approval.
- [ ] The `Security` and `CodeQL` workflows appear in the PR checks.
- [ ] Security → Code scanning shows a CodeQL analysis after the first run on `dev`.
- [ ] Security → Dependabot lists the weekly update PRs after the first Monday.

## 6. Operational Notes

- **Dependabot volume:** version updates are grouped into one minor/patch PR per ecosystem per week, capped at 5 open PRs, with a 7-day cooldown on brand-new releases. Security updates are not delayed by the cooldown.
- **Husky:** `prepare` is `husky || true`. It is intentionally unchanged here, since Docker builds run `npm ci` without a `.git` directory. Tightening it is a separate change.
- **Weekly schedules:** the audit and CodeQL also run on a weekly cron, because new advisories and new CodeQL queries appear without any change to our code.
