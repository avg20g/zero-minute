# Balance changelog

## Batch 9 (2026-11-15): play notes

The changes in this batch were asked for by the player (friendly fire, any number of superweapons at 3:30, AC-130,
F-22 with four missiles, Technical machine guns, stronger toxin, garrisons hurt in place, FPV dive, Suicide Bomber
charge). This entry records what they did to the Hard v Hard sweep (1,215 matches, friendly fire on, as in the lobby)
and what was adjusted to bring it back. Full table: `report.md`; the batch 8 table is kept as `report-batch8.md`.

| Loadout | Batch 8 | Play notes as first written | Batch 9 final |
|---|---|---|---|
| China: Mass Assault General | 61% | 46% | 62% |
| United States (no general) | 47% | 55% | 54% |
| ISIS: WMD General | 46% | 60% | 52% |
| China: Cyber General | 54% | 46% | 50% |
| ISIS (no general) | 45% | 62% | 50% |
| United States: Air Force General | 53% | 51% | 49% |
| China (no general) | 50% | 32% | 47% |
| ISIS: Stealth General | 37% | 54% | 46% |
| United States: Marine Corps General | 56% | 44% | 39% |

What the comparison sweeps showed:
- Friendly fire is not what moved the numbers: with it off, ISIS still won 55-67% and China 38-47%.
- The toxin buff was: with the old toxin values and everything else new, every side was inside 42-57%.

Adjustments made after the first sweep:

| What | First written | Final | Why |
|---|---|---|---|
| Toxin cloud against infantry / light armor | x1.6 / x0.5 | x1.3 / x0.45 | ISIS at 60-62% |
| Toxin spray against infantry / light armor | x1.5 / x0.45 | x1.25 / x0.4 | same |
| Conscript Squad health | 260 | 290 | China (no general) at 32-35%; conscripts die first in gas |
| Battlemaster Tank health | 440 | 470 | same |
| Suicide Bomber blast | 300 | 270 | 300 killed a Sentinel tank from the front in one hit |

Other numbers set in this batch: superweapon countdown 300 s to 210 s; F-22 4 missiles at 80 damage (was 2 at 115),
reload 110 to 140 ticks; F-15E bomb 300 to 320 and better against infantry, light and heavy armor; Fuel-Air Bomb heat
30 to 40 damage per second (so it still kills a garrison now that nobody is thrown out); FPV blast 230 to 210 with its
own damage profile; Suicide Bomber gets its own anti-tank profile.

Still open:
- Mass Assault (62%) and Marine Corps (39%) are just outside the 40-60% target.
- Medium v Medium was not re-run for this batch.
- Start positions: canyon 58/42, urban 55/45, arctic 31/69.
- The AI builds at most one superweapon and never fired one in this sweep; it never used the AC-130 (a Rank 5
  power in a 7-minute match), and still never builds a Saboteur or uses Sneak Attack. Mass-produced superweapons and
  the AC-130 are untested against a human.

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
