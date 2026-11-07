# HoldMeToIt Virtual Economy & Coin Mechanics — Comprehensive Architecture & Implementation Plan

> **Document Type:** System Architecture & Implementation Roadmap  
> **Target Branch:** `feature/economy-coin-mechanics` (branched from `dev` @ `1f0b9b9`)  
> **Status:** Ratified Implementation Plan (Pre-Execution)  
> **Governing Standards:** [AGENTS.md](../../AGENTS.md), [FEATURES.md](../../FEATURES.md), [DESIGN.md](../../DESIGN.md), [docs/economy/README.md](README.md)  
> **Core Architectural Separation:** **Part 1: Pure Mechanics (Asset-Free)** vs **Part 2: Asset-Dependent Features (Media/Art/Audio)**

---

## 1. System Constraints & Active Platform Limits

Every mechanic in this plan is designed and calibrated against HoldMeToIt's active platform limits, mathematical constants, and non-negotiable laws:

```
Platform Daily Study Ceiling:
┌────────────────────────────────────────────────────────┐
│  Raw Input Ceiling: MAX_DAILY_LOG_SECONDS = 72,000s   │  (20h max raw entry)
└──────────────────────────┬─────────────────────────────┘
                           │ capDailyStudySeconds()
┌──────────────────────────▼─────────────────────────────┐
│  Scored Eligible Cap: 43,200s (12 hours)               │  (Hard scoring & reward ceiling)
└──────────────────────────┬─────────────────────────────┘
                           │ 1 coin / 36 eligible seconds
┌──────────────────────────▼─────────────────────────────┐
│  Max Study Reward: 1,200 coins/day (8,400 coins/week)  │
└────────────────────────────────────────────────────────┘
```

### 1.1 Hard-Coded Boundaries (Source of Truth)

- **Raw Daily Study Limit (`duration.ts`):** `MAX_DAILY_LOG_SECONDS = 72,000s` ($20\text{ hours}$). Raw logs exceeding 20h are rejected by Zod schemas and domain validators.
- **Scored Eligible Cap (`duration.ts`):** `MAX_COUNTED_DAILY_STUDY_SECONDS = 43,200s` ($12\text{ hours}$). All study scoring and reward minting passes through `capDailyStudySeconds()`, bounding daily study rewards to **$1,200\text{ coins/day}$**.
- **Base Rate Precision (`economy-constants.ts`):** $100\text{ coins}$ per $3,600\text{ seconds}$ ($1\text{ coin}$ per $36\text{ seconds}$). Fractional progress $P \in [0, 35]\text{s}$ is preserved across sessions in `Wallet.rewardProgressSeconds`.
- **Declared Target Ceiling (`ROADMAP.md` §5.2.2):** Maximum declared weekly target is $105\text{ hours/week}$ ($15\text{ hours/day}$) to safeguard participant well-being and prevent fraudulent commitments.
- **Host Challenge Victory Bonus (`challenge-admin.actions.ts`):** Host-funded bonus `rewardCoins` is capped at $10,000\text{ coins}$.
- **Dual Balance Invariant:** $\text{availableBalance} = \text{totalBalance} - \text{reservedBalance} \ge 0$.

### 1.2 Non-Negotiable Foundational Laws

- **Law L1 (Single Entity Unity):** Solos ($N=1$), Duos ($N=2$), and Teams are mathematically identical. Economy pots and settlement group over `Team` entities.
- **Law L3 (Catch-Up Deficit Model — Zero Grace Passes):** Grace passes, freeze days, and streak-repair purchases **do not exist and cannot be sold in the shop**. Deficits must be recovered dynamically via study catch-up pace.
- **Law L6 (Three-Condition Accountability Invariant):** Victory coins and pot shares are credited only if: (1) challenge-linked tasks are completed, (2) target hours are met, and (3) belonging to a winning team.
- **Law L7 (Pure Domain Isolation):** All calculation formulas, streak multipliers, rate fractions, and validation rules reside in pure TypeScript modules (`domain/`) with zero Next.js, React, or Prisma imports.
- **Law L8 (Second-Level Clock Precision):** Integer seconds and whole integer coins only. Floating-point currency calculations are strictly prohibited.
- **Law L9 (Zero-State & Error Resilience):** All UI views handle Loading (skeleton), Empty (CTA), and Error states gracefully.

---

## 2. Part 1: Pure Mechanics & System Engine (Asset-Free)

These features require **zero external graphics, media, audio files, or illustrations**. They are implemented completely using pure TypeScript domain math, Prisma schema extensions, server actions, and existing Obsidian dark design tokens.

---

### Mechanic 1.1: Task Checklist Bounties (Cockpit Integration)

Completing Daily and Weekly tasks in the Cockpit (`cockpit-tasks-section.tsx`) currently only gates accountability under Law L6. This mechanic adds direct coin bounties with anti-exploit rate limits.

| Action                      |       Coin Reward       | Hard Limits & Anti-Exploit Rules                                                                                                            | Transaction Type |
| :-------------------------- | :---------------------: | :------------------------------------------------------------------------------------------------------------------------------------------ | :--------------- |
| **Complete Daily Task**     |  **$+5\text{ coins}$**  | Max **5 rewarded tasks/day** ($+25\text{ coins/day}$ cap). Task title must be $\ge 5$ characters. Unchecking/rechecking does not re-reward. | `TASK_REWARD`    |
| **Complete Weekly Goal**    | **$+25\text{ coins}$**  | Max **4 rewarded tasks/week** ($+100\text{ coins/week}$). Must be linked to active challenge (`Task.challengeId != null`).                  | `TASK_REWARD`    |
| **Checklist Mastery Bonus** | **$+100\text{ coins}$** | Awarded automatically at challenge lock if $100\%$ of challenge-linked weekly goals are completed.                                          | `TASK_BONUS`     |

#### Architectural Guarantees:

- `Task` schema receives `isRewarded Boolean @default(false)` and `rewardedAt DateTime?`.
- Idempotency key pattern: `task-bounty:<taskId>`.
- UI feedback uses an inline floating badge (`+5 🪙`) styled with existing semantic tokens.

---

### Mechanic 1.2: Streak Multipliers & Milestone Chest Claims

Leveraging the existing streak calculation engine (`calculateStreakStatistics` in `participant-stats/domain/global-profile.ts`):

#### A. Paced Study Multiplier (Consistency Rate Boost)

Participants on an active study streak earn a modest multiplier on their study coin minting rate:

$$\text{Coins Earned} = \left\lfloor \frac{P_{\text{prev}} + (S \times \text{Multiplier})}{36} \right\rfloor$$

|     Streak Length      |    Multiplier    |       Coins / Hour        |  Seconds per Coin   |   Daily 12h Max Yield    |
| :--------------------: | :--------------: | :-----------------------: | :-----------------: | :----------------------: |
|      **0–6 Days**      |   $1.00\times$   |   $100\text{ coins/hr}$   |   $36.00\text{s}$   |   $1,200\text{ coins}$   |
|     **7–13 Days**      |   $1.05\times$   |   $105\text{ coins/hr}$   |   $34.28\text{s}$   |   $1,260\text{ coins}$   |
|     **14–29 Days**     |   $1.10\times$   |   $110\text{ coins/hr}$   |   $32.72\text{s}$   |   $1,320\text{ coins}$   |
| **30+ Days (Ceiling)** | **$1.15\times$** | **$115\text{ coins/hr}$** | **$31.30\text{s}$** | **$1,380\text{ coins}$** |

#### B. Streak Milestone Chests (One-Time Milestone Claims)

One-time milestone coin grants claimed via the Cockpit Streak Card upon reaching milestone thresholds:

- **7 Days:** $+150\text{ coins}$
- **14 Days:** $+350\text{ coins}$
- **30 Days:** $+1,000\text{ coins}$
- **60 Days:** $+2,500\text{ coins}$
- **100 Days:** $+5,000\text{ coins}$

**Anti-Reset Farming Guard:** Claims are persisted in a `StreakMilestoneClaim` table (`userId`, `milestoneDays`, `seasonId`). If a streak resets to 0 due to an inactive day, a participant cannot re-claim the 7-day or 14-day chest within the same season.

---

### Mechanic 1.3: Community Staked Challenge Pots (Buy-In Pools)

Host-configurable community wager pools that scale with challenge participation:

1. **Host Setup:** Host enables `isPotEnabled: true` with a buy-in stake $B \in [50, 1000]\text{ coins}$ (default: $100\text{ coins}$).
2. **Atomic Reservation:** Upon enrollment, $B$ coins are moved to `reservedBalance` (`totalDelta: 0, reservedDelta: +B`, type: `POT_RESERVATION`).
3. **Pot Aggregation:** For $N$ enrolled participants, the total pot is $P = N \times B$.
4. **Resolution at Host Lock:**
   - **Winning Teams:** The entire pot $P$ is divided equally among all surviving participants on winning teams (those who met hours + finished weekly tasks + won the team matchup).
   - **Tie / Cancel Policy:** In the event of a tie or event cancellation, $100\%$ of reserved stakes are unlocked and refunded (`POT_REFUND`).
   - **Deficit / Losers:** Stakes of punished participants or losing teams are transferred to winners (`POT_SETTLEMENT`).
5. **Zero Asset Overhead:** Uses existing challenge card UI elements, badge pills, and modal dialogs.

---

### Mechanic 1.4: 1v1 Mutual Study Sprint Duels (Phase 3 Evolution)

Spontaneous peer-to-peer study duels with coin stakes:

- **Handshake:** User A challenges User B to a sprint (1h, 2h, or 4h window) with stake $S \in [20, 500]\text{ coins}$.
- **Stake Reservation:** Both participants reserve $S$ coins (`DUEL_RESERVATION`).
- **Scoring:** Only verified study seconds logged during the sprint window count (subject to `capDailyStudySeconds`).
- **Resolution & Burn Tax:**
   - Winner receives $2 \times S \times 0.95$ coins.
   - The remaining $5\%$ ($2 \times S \times 0.05$) is permanently burned (`COMMUNITY_BURN_FEE`), acting as an active anti-inflation sink.
   - Ties refund stakes $100\%$ with zero fee.

---

### Mechanic 1.5: Text-Only & Code-Only Store Items (`/shop` v1)

A fully functional cosmetic store that launches **without requiring any external graphic assets**:

| Category                 | Item Name                | Implementation Method                                      |        Price         |
| :----------------------- | :----------------------- | :--------------------------------------------------------- | :------------------: |
| **Display Title Card**   | _"The Midnight Scholar"_ | String rendered beneath username in leaderboards & profile | $1,000\text{ coins}$ |
| **Display Title Card**   | _"Consistency Beast"_    | String rendered beneath username                           | $1,500\text{ coins}$ |
| **Display Title Card**   | _"The Caffeine Machine"_ | String rendered beneath username                           | $2,000\text{ coins}$ |
| **Display Title Card**   | _"Caterpie in Disguise"_ | Playful community title                                    |  $500\text{ coins}$  |
| **Profile Accent Theme** | _Amethyst Obsidian_      | CSS token switch: sets `--accent-primary` to purple        | $2,500\text{ coins}$ |
| **Profile Accent Theme** | _Emerald Study_          | CSS token switch: sets `--accent-primary` to emerald       | $2,500\text{ coins}$ |
| **Profile Accent Theme** | _Amber Sunburst_         | CSS token switch: sets `--accent-primary` to amber         | $2,500\text{ coins}$ |
| **Profile Status Tag**   | _Focus Master_           | Text pill rendered with Lucide icon `Sparkles`             |  $750\text{ coins}$  |

---

## 3. Part 2: Asset-Dependent Features (Media, Art & Audio)

These features provide deep sensory polish and social prestige, but depend on **creative design assets, audio engineering, or external integrations**:

```
Part 2: Asset-Dependent Features Pipeline
├── 2.1 Avatar Frames & Border Overlays (SVG / Animated CSS keyframes)
├── 2.2 Audio Soundpacks (Web Audio .mp3/.wav SFX for task chimes)
├── 2.3 Profile Header Banners (1200x320 illustrated banner art)
├── 2.4 Mascot Doodle Stickers (Community character sticker art)
└── 2.5 Discord Vanity Roles Sync (Discord Bot privileged role management)
```

### Asset Group 2.1: Avatar Frames & Border Overlays

- **Concept:** Cosmetic frames displayed around user avatars in the Header, Cockpit, Challenge Standings, and Global Profile.
- **Deliverables Required:** Square transparent SVGs ($128 \times 128\text{px}$) or CSS keyframe animations (Golden Wreath, Pixel Shield, Ember Ring).
- **Storage:** `packages/database/seeds/assets/frames/` or Supabase Storage `shop-assets/frames/`.

### Asset Group 2.2: Audio Soundpacks (Task & Milestone SFX)

- **Concept:** Selectable audio feedback replacing or augmenting default cockpit completion chimes:
   - _8-Bit Arcade Pack:_ Retro coin pickup chime, 8-bit level-up jingle.
   - _Cozy Lo-Fi Pack:_ Soft vinyl crackle, gentle kalimba note.
   - _Zen Temple Pack:_ Tibetan singing bowl resonance, bamboo water click.
- **Deliverables Required:** Web-optimized `.mp3` or `.ogg` audio files ($< 40\text{KB}$, duration $0.3\text{s} - 1.2\text{s}$).

### Asset Group 2.3: Profile Header Banners

- **Concept:** Illustrative banners displayed across the top of public member profiles (`/profile/[userId]`).
- **Deliverables Required:** High-resolution responsive banner artwork ($1200 \times 320\text{px}$, optimized WebP format, $< 150\text{KB}$).

### Asset Group 2.4: Mascot Doodle Stickers & Wrapped Collectibles

- **Concept:** Collectible stickers featuring community mascots (Honey Bee, Lavender Butterfly, Owl, Lark) pinnable to user profiles and post-challenge Wrapped stories.
- **Deliverables Required:** Transparent PNG or SVG sticker illustrations ($256 \times 256\text{px}$).

### Asset Group 2.5: Discord Vanity Role Sync

- **Concept:** Purchasing a prestige tier in the shop unlocks an exclusive Discord role with a unique name color in the community Discord server.
- **Technical & Asset Requirements:** Discord Bot token with `MANAGE_ROLES` permission in `DISCORD_GUILD_ID`, plus server role hierarchy configuration.

---

## 4. Economic Limits & Monetary Equilibrium Model

### 4.1 Daily Inflow Budget Under All Platform Limits

Taking into account the $12\text{h}$ counted cap ($43,200\text{s}$) and all proposed mechanics:

| Participant Archetype       |       Study Hours        |   Streak Multiplier    |       Study Coins        |         Daily Tasks         | Weekly Goals (Prorated)  |       Total Daily Inflow       |        Total Weekly Inflow        |
| :-------------------------- | :----------------------: | :--------------------: | :----------------------: | :-------------------------: | :----------------------: | :----------------------------: | :-------------------------------: |
| **Casual Scholar**          |      $2.0\text{h}$       |      $1.00\times$      |    $200\text{ coins}$    | $10\text{ coins}$ (2 tasks) |    $+14\text{ coins}$    |   **$224\text{ coins/day}$**   | **$\approx 1,568\text{ coins}$**  |
| **Consistent Grinder**      |      $5.0\text{h}$       |      $1.05\times$      |    $525\text{ coins}$    | $20\text{ coins}$ (4 tasks) |    $+28\text{ coins}$    |   **$573\text{ coins/day}$**   | **$\approx 4,011\text{ coins}$**  |
| **Hardcore Achiever**       |      $10.0\text{h}$      |      $1.15\times$      |   $1,150\text{ coins}$   | $25\text{ coins}$ (5 tasks) |    $+28\text{ coins}$    |  **$1,203\text{ coins/day}$**  | **$\approx 8,421\text{ coins}$**  |
| **Theoretical Max Ceiling** | **$12.0\text{h}$ (Cap)** | **$1.15\times$ (Cap)** | **$1,380\text{ coins}$** | **$25\text{ coins}$ (Cap)** | **$+28.5\text{ coins}$** | **$1,433.5\text{ coins/day}$** | **$\approx 10,035\text{ coins}$** |

### 4.2 Outflow Sinks & Price Calibration

| Tier               |            Price Range             | Study Effort Equivalent            | Items in Tier                                                                     |
| :----------------- | :--------------------------------: | :--------------------------------- | :-------------------------------------------------------------------------------- |
| **Micro-Sinks**    |      $200 - 500\text{ coins}$      | $1 - 2\text{ days}$ of study       | Common Titles, Lo-Fi Soundpacks, Basic Tag Pills                                  |
| **Mid-Sinks**      |    $1,500 - 3,500\text{ coins}$    | $1 - 2\text{ weeks}$ of study      | Theme Accents (Amethyst, Emerald), Rare Titles, Avatar Frames                     |
| **Prestige Sinks** |   $10,000 - 25,000\text{ coins}$   | $1 - 3\text{ months}$ of study     | Standard Pokémon Banner Pull ($10\text{k}$), Animated Frames, Discord Vanity Role |
| **Endgame Sinks**  | $100,000 - 1,000,000\text{ coins}$ | $6\text{ months} - 2\text{ years}$ | Rare/Epic/Mythical Pokémon Summon Banners                                         |
| **Dynamic Sinks**  |           $5\%$ burn fee           | Per duel / transaction             | Permanent coin removal from circulation on peer wagers                            |

---

## 5. Phased Implementation Roadmap

Work is structured into two sequential sprints. **Sprint A (Pure Mechanics Core)** executes immediately without media dependencies, delivering an end-to-end functioning gamified economy. **Sprint B (Asset Integration)** executes when design and audio assets are ready.

```
Implementation Phasing:
Sprint A: Pure Mechanics Core (Branch: feature/economy-coin-mechanics)
├── Slice 1: Task Checklist Bounties & Cockpit Coin Badges
├── Slice 2: Streak Multipliers & Milestone Chest Claims
├── Slice 3: Storefront /shop v1 (Text Titles & Obsidian Themes)
└── Slice 4: Community Staked Challenge Pots & Duel 5% Burn Engine

Sprint B: Asset Integration (Subsequent Milestone)
├── Slice 5: Audio Soundpacks & Cockpit SFX Player
├── Slice 6: Avatar Frames & Profile Banners
└── Slice 7: Discord Bot Vanity Roles Sync Worker
```

### Sprint A Delivery Breakdown (Ready for Execution)

1. **Slice 1 — Task Checklist Bounties:**
   - Schema: Add `isRewarded Boolean @default(false)` and `rewardedAt DateTime?` to `Task`.
   - Domain: `calculateTaskBounty` in pure domain math with anti-exploit daily caps (max 5/day).
   - Hook: Integrate with `toggleTask` repository and trigger double-entry ledger credit (`TASK_REWARD`).
   - Presentation: Floating coin reward indicator (`+5 🪙`) in Cockpit.
2. **Slice 2 — Streak Multipliers & Milestone Chests:**
   - Domain: Streak pace multiplier formula ($1.00\times - 1.15\times$) in `features/economy/domain/streak-rewards.ts`.
   - Schema: `StreakMilestoneClaim` model with unique constraint `[userId, milestoneDays, seasonId]`.
   - Presentation: Interactive milestone chest card and claim modal in Cockpit.
3. **Slice 3 — Storefront `/shop` (Text Titles & Obsidian Themes):**
   - Schema: `ShopItem` and `UserShopPurchase` models in `packages/database/prisma/schema.prisma`.
   - Seed: Initial text titles and Obsidian CSS accent theme tokens.
   - Presentation: Responsive `/shop` storefront with category filtering and purchase confirmation modal.
4. **Slice 4 — Community Staked Pots:**
   - Schema: `isPotEnabled Boolean @default(false)` and `potStakeAmount Int @default(0)` on `Challenge`.
   - Domain: Pot division engine honoring Law L6 three-condition outcome.
   - Repository: Atomic buy-in reservation at enrollment and settlement at challenge lock.
