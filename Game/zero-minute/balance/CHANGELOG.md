# Balance changelog

## Batch 8 (2026-11-14): first balance pass

Method: 1,215 AI-versus-AI matches per sweep (9 loadouts x 9, both start positions, five maps, three seeds).
Tuned against Hard v Hard; Medium v Medium run as a cross-check. Full tables: `report-before.md`, `report.md`.

### Win rate of decided games

| Loadout | Hard before | Hard after | Medium before* | Medium after |
|---|---|---|---|---|
| China: Cyber General | 99% | 54% | 99% | 55% |
| China: Mass Assault General | 79% | 61% | 60% | 46% |
| United States (no general) | 62% | 47% | 72% | 74% |
| United States: Air Force General | 60% | 53% | 69% | 72% |
| United States: Marine Corps General | 45% | 56% | 55% | 66% |
| China (no general) | 43% | 50% | 41% | 36% |
| ISIS: WMD General | 21% | 46% | 22% | 36% |
| ISIS (no general) | 20% | 45% | 15% | 33% |
| ISIS: Stealth General | 19% | 37% | 15% | 31% |

*Medium "before" was measured on two maps (486 matches); every other column is five maps.

Median decided match: 5.9 min before, 7.3 min after (Hard).

### Changes

| What | Before | After | Why |
|---|---|---|---|
| Powers a general starts with | ready at 0:00 | start on their full recharge | Cyber stole money in the first seconds |
| Cyber: Cash Hack | $2,500 / 150 s | $2,000 / 180 s | 99% win rate |
| Cyber: infantry and tank cost | normal | +12% | permanent sight of the enemy base needed a price |
| Mass Assault: discount | 25% | 8% | 79-92% win rate |
| Battlemaster Tank cost | 800 | 750 | base China was low once its generals were reined in |
| Inferno Cannon cost | 900 | 850 | same |
| Toxin Tractor health | 220 | 300 | 92% of them died before reaching spray range |
| Toxin spray range | 15 m | 18 m | same |
| Arms Dealer cost | 1,800 | 1,500 | ISIS lost before its vehicles arrived |
| Guerrilla Squad cost | 250 | 225 | ISIS win rate about 20% |
| RPG Trooper cost | 350 | 300 | same |
| Technical Pickup cost | 500 | 450 | same |
| LAV-25 | $900, 300 hp | $850, 340 hp | Marine general lagged the other US loadouts |
| Pathfinder Sniper cost | 600 | 650 | US base was the strongest non-general loadout |

### Still open

- Medium AI: the United States wins 66-74% and ISIS 31-36%. The tuning targeted Hard.
- ISIS Stealth General is at 37% on Hard and draws 23 games (hidden units stall the enemy AI).
- Start positions are uneven on four maps (urban 64/36, forest 40/60, open 42/58, canyon 56/44).
- The AI never builds a Saboteur, never uses Sneak Attack, and almost never finishes a superweapon:
  matches end in about 7 minutes, before late-game units matter.
- These are AI-versus-AI results. They show what the AI can do with each side, not what a person can.
