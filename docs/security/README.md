# Security & Client Error Sanitization Architecture

> **Feature Scope:** SEC-09 / GitHub Issue #231 (`KAN-86`)  
> **Layer:** `core/errors/` (Web) & `src/lib/error-sanitizer.ts` (Tasker)  
> **Laws Governed:** Law L7 (Pure Domain Isolation), Law L9 (Zero-State & Error Resilience)  
> **Last Updated:** 2026-11-03

---

## 1. Overview & Threat Model

Prior to this implementation, several server actions, route handlers, and Tasker bot commands exposed raw `error.message` strings directly to callers (`error instanceof Error ? error.message : "..."`).

### The Threat

Unhandled exceptions originating from:

- **Prisma ORM / PostgreSQL**: Leaking connection strings (e.g. `postgres://user:password@internal-db:5432/hmt`), raw SQL queries, database table schemas, foreign key names, and constraint identifiers.
- **Supabase Storage**: Leaking bucket endpoints, bearer tokens, or internal storage object paths.
- **Discord API / Webhooks**: Leaking Discord guild IDs, channel IDs, webhook URLs, and rate limit bucket states.
- **Upstream Integrations (GitHub, Jira, Yeolpumta)**: Leaking personal access tokens, Jira workspace URLs, and API response payloads.

---

## 2. Architecture & Design Principles

```mermaid
flowchart TD
    E[Caught Exception / Unknown Error] --> C{isDomainError?}
    C -- Yes (Whitelisted / DomainError) --> W[Pass-through Actionable Message & Code]
    C -- No (Prisma, Discord, Network, DB) --> M[Mask with Generic Actionable Message & Code]
    W --> L[Emit Server-Side Structured Logger with Correlation ID]
    M --> L
    L --> R[Return Safe ClientError to Caller]
```

### 2.1 Pure Domain Isolation (Law L7)

The core error classifier and domain error representations reside in `apps/web/core/errors/domain/client-error.ts` with **zero external framework, React, Next.js, or ORM dependencies**.

- **`ClientError`**: Immutable interface returned to callers containing `code`, `message`, `correlationId`, and `isDomainError`.
- **`DomainError`**: Base class for domain-originated errors (`isDomainError = true`).
- **`WHITELISTED_DOMAIN_ERROR_NAMES`**: Curated set of trusted domain error classes designed to produce human-actionable, user-safe messages:
   - Authorization & Access: `AuthError`, `AdminAccessError`, `DevAccessError`, `ParticipantAccessError`
   - Challenge & Lifecycle: `ChallengeStateError`, `DuoTeamIdentityError`, `WithdrawalError`
   - Economy & Wagers: `WagerValidationError`, `BettingClosedError`, `InsufficientFundsError`, `InvalidReservationError`, `WalletInvariantViolationError`, `InvalidAmountError`
   - Study Time & Tracking: `InvalidDurationError`, `InvalidProgressError`, `DeficitCalculationError`, `DurationParseError`, `DurationRangeError`, `MaximumLeavesExceededError`
   - Pokemon Acquisition: `BannerNotFoundError`, `BannerInactiveError`, `InvalidBannerConfigError`, `EmptyRarityPoolError`, `SelectionEngineError`
   - Yeolpumta: `InvalidYptClaimTransitionError`

### 2.2 Server-Side Correlation Logging

`toClientError(error, options)` in `apps/web/core/errors/to-client-error.ts`:

1. Generates a unique UUID `correlationId` (using `crypto.randomUUID()` with fallback).
2. Resolves whether the error is a trusted domain exception or untrusted infrastructure failure.
3. Automatically logs the full raw error server-side via `createLogger` with structured context (`correlationId`, `code`, `isDomainError`, and custom parameters).
4. Returns the sanitized `ClientError` to the server action or route handler.

### 2.3 Tasker Bot Error Masking

In `apps/tasker/src/lib/error-sanitizer.ts`:

- Untrusted Discord API failures, Gemini API exceptions, and database errors in slash commands (e.g. `/yapperize`) are masked with user-friendly messages.
- Specific known error names (e.g. `DefaultCategoryDeletionError`, `DuplicateCategoryError`) pass their human-friendly explanations through.
- Correlation IDs are logged to stderr for administrator tracing without leaking credentials or upstream tokens into Discord channels.

---

## 3. Usage Examples

### Server Actions

```typescript
import { toClientError } from "@/core/errors";

export async function exampleAction(input: Input): Promise<ActionResult> {
   try {
      const user = await requireSessionUser();
      await repositoryFunction(input);
      return { ok: true };
   } catch (error) {
      const clientError = toClientError(error, {
         scope: "example.action",
         defaultCode: "ACTION_FAILED",
         defaultMessage: "Failed to perform action. Please try again.",
         context: { userId: input?.userId },
      });

      return {
         ok: false,
         code: clientError.code,
         message: clientError.message,
      };
   }
}
```

### Route Handlers

```typescript
import { toClientError } from "@/core/errors";

export async function POST(req: NextRequest) {
   try {
      // ...
   } catch (error) {
      const clientError = toClientError(error, {
         scope: "api.route",
         defaultCode: "INTERNAL_SERVER_ERROR",
         defaultMessage: "An unexpected error occurred.",
      });

      return NextResponse.json(
         {
            success: false,
            error: clientError.message,
            code: clientError.code,
            correlationId: clientError.correlationId,
         },
         { status: 500 }
      );
   }
}
```

---

## 4. Verification & Testing

Unit tests for `toClientError` and `sanitizeTaskerError` cover:

- `apps/web/core/errors/to-client-error.test.ts` (10/10 green)
- `apps/tasker/test/error-sanitizer.test.ts` (3/3 green)
- Representative server action suites verifying infrastructure exception masking across:
   - `admin-pardon.actions.test.ts`
   - `challenge-admin.actions.test.ts`
   - `withdraw-participant.actions.test.ts`
   - `sick-mode.actions.test.ts`
   - `feature-flags.actions.test.ts`
   - `admin-override.actions.test.ts`
   - `wallet.actions.test.ts`
   - `wager.actions.test.ts`
   - `user-directory.actions.test.ts`
   - `ypt-connection.actions.test.ts`
   - `feedback/route.test.ts`
   - `yapperize.test.ts`

## 5. Authentication, Sessions & Role Revalidation (SEC-05 / SEC-20, GH #227)

### 5.1 Source of truth

Discord is the single source of truth for privileged roles:

| Role          | Granted by                                                                     |
| :------------ | :----------------------------------------------------------------------------- |
| `DEV`         | Discord snowflake listed in `DEV_DISCORD_IDS` (legacy alias `DISCORD_DEV_IDS`) |
| `ADMIN`       | Holds a role from `DISCORD_ADMIN_ROLE_IDS` in the `DISCORD_GUILD_ID` server    |
| `PARTICIPANT` | Everyone else                                                                  |

Roles are derived at sign-in (`syncUserRoleFromDiscord`) and kept honest between sign-ins by revalidation (below).
The pure rules live in `features/auth/domain/role-policy.ts` (Law L7).

### 5.2 Sessions

Auth.js uses `strategy: "database"` with:

| Setting     | Value  | Why                                                          |
| :---------- | :----- | :----------------------------------------------------------- |
| `maxAge`    | 7 days | Bounds how long a session (and any stale privilege) can live |
| `updateAge` | 1 day  | An active session is extended at most once a day             |

Both are constants in `role-policy.ts` (`SESSION_MAX_AGE_SECONDS`, `SESSION_UPDATE_AGE_SECONDS`); the previous behavior was the Auth.js default of 30 days.

### 5.3 Revalidation window

The `session` callback (`core/auth/index.ts`) calls `revalidatePrivilegedRole` (`features/auth/data/role-revalidation.service.ts`) for `ADMIN` and `DEV` sessions only. Because `requireAdminUser`, `requireDevUser` and every admin page read the role through `auth()`, a revoked admin loses access everywhere within the window.

- **Window:** `ROLE_REVALIDATION_TTL_MS` = 5 minutes per user, per server process. In serverless deployments each warm instance checks independently, so the worst case is one Discord lookup per instance per user per window.
- **Demote-only:** revalidation can remove privileges (or apply a `DEV` id an operator explicitly configured). It never grants `ADMIN`; that happens at sign-in. This keeps a manual revoke from being silently undone minutes later.
- **Demotions are persisted** (`User.role`) by the service. The `session` callback performs no role writes of its own (the old fire-and-forget DEV update was removed).
- **Left the server:** only Discord's "Unknown Member" response (HTTP 404, JSON code 10007) is treated as "no admin role" and demotes. Any other 404, such as an unknown guild from a wrong `DISCORD_GUILD_ID` (code 10004), counts as unavailable and keeps the stored role.
- **Discord unavailable** (outage, missing bot token, unset `DISCORD_GUILD_ID`): the stored role is kept, a `auth.role_revalidation_unavailable` warning is logged, and the check is retried after 30 seconds (`ROLE_REVALIDATION_RETRY_MS`). This favours availability; alert on that log event if you need a stricter posture.
- **No `discordId`:** the user cannot be verified and keeps the stored role.
- `DISCORD_ADMIN_ROLE_IDS` empty while the bot is configured means "nobody is an admin", matching sign-in behavior.

Changes to `DEV_DISCORD_IDS` take effect for an existing `ADMIN` session within the window, and for a `PARTICIPANT` session at the next sign-in.

### 5.4 Manual role editor (`updateUserRoleAction`)

The editor in `/admin/users` is **revoke-only**:

- It may demote `ADMIN` to `PARTICIPANT` (audited, reason required).
- It cannot grant `ADMIN` (`ROLE_GRANT_FORBIDDEN`): assign the Discord admin role instead; the user gets it on next sign-in.
- It cannot change a `DEV` user for any actor, admin or dev (`DEV_ROLE_PROTECTED`), because `DEV` is re-derived from `DEV_DISCORD_IDS`.
- Self-demotion remains blocked (`SELF_DEMOTION_FORBIDDEN`).

A manual revoke lasts until the user next signs in; if they still hold the Discord admin role at that point they regain `ADMIN`. To remove access permanently, remove the Discord role as well.

### 5.5 Host URL policy (`AUTH_URL` / trusted hosts)

- Set `AUTH_URL` to the canonical public origin in every deployed environment (for example `https://holdmetoit.example`). It pins callback and redirect URLs.
- The Auth.js config sets **no** `trustHost` and the repo does not set `AUTH_TRUST_HOST`. Do not add a blanket `AUTH_TRUST_HOST=true`: it makes Auth.js derive its URL from the request `Host` header.
- Vercel provides its own trusted host handling. On any other host (Docker, VM), keep `AUTH_URL` set and verify the sign-in redirect lands on the intended origin before go-live.
- `AUTH_SECRET` must be set per environment and rotated if exposed.

### 5.6 Tests

- `features/auth/domain/role-policy.test.ts`: demote-only rule, DEV protection, revoke-only rule, window constants.
- `features/auth/data/role-revalidation.service.test.ts`: demotion within the window, TTL caching, outage handling, DEV add/remove, persistence failure.
- `features/auth/data/discord-guild.service.test.ts` (`checkDiscordAdminRole`): found / left server / outage / unconfigured.
- `features/admin/api/user-directory.actions.test.ts`: admins cannot modify DEV users, grants rejected, revoke audited.
