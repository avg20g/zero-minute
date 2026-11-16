# Balance changelog

## Batch 10 (2026-11-16): heroes and second play notes

Hard v Hard and Medium v Medium, 1,215 matches each, five maps, friendly fire on. Full tables: `report.md` (Hard),
`report-medium.md` (Medium); the batch 9 table is kept as `report-batch9.md`.

| Loadout | Batch 9 (Hard) | Batch 10 without heroes | Heroes as first written | Batch 10 final (Hard) | Batch 10 final (Medium) |
|---|---|---|---|---|---|
| China: Mass Assault General | 62% | 61% | 49% | 60% | 65% |
| United States (no general) | 54% | 58% | 68% | 59% | 56% |
| United States: Marine Corps General | 39% | 32% | 47% | 58% | 62% |
| United States: Air Force General | 49% | 56% | 64% | 58% | 58% |
| China: Cyber General | 50% | 51% | 47% | 46% | 60% |
| ISIS (no general) | 50% | 52% | 51% | 43% | 28% |
| China (no general) | 47% | 43% | 33% | 43% | 59% |
| ISIS: WMD General | 52% | 54% | 45% | 42% | 35% |
| ISIS: Stealth General | 46% | 42% | 47% | 40% | 25% |

"Without heroes" is this batch's other changes alone (EMP removed, jets repaired on the pad, new airfields, Scud
Launcher reload 12 s), measured by taking the heroes out of the Barracks lists.

What the sweeps showed and what was changed:

| What | First written | Final | Why |
|---|---|---|---|
| Disabled Vet: M60 damage | 16 | 10 | United States at 64-68% with him; he killed a tank in 3.6 s |
| Disabled Vet: RPG damage | 90 | 70 | same |
| Disabled Vet: health | 500 | 400 | same |
| Fook Mie: health | 150 | 300 | she died in 57-75% of the matches she was built in, and China fell to 33% |
| Fook Mie: phone range | 36 m | 42 m | same: she had to stand inside rifle range to use it |
| LAV-25 | $850, 340 health | $800, 380 health | Marine Corps General at 32-39% for two batches |
| Car Bomb price (used for scoring only) | 0 | 400 | a price of zero broke the AI's unit-value table for all of ISIS |

Fook Mie's recharge rule is as the player asked: unit cost / 150 seconds, between 2 and 14 (2 s for a squad, 6 s for
a $900 tank, 13.3 s for an Overlord); against a hero the call does 100 damage instead. The Phantom was left as first
written (one call every 10 s; airliner 600 damage over 14 m, car 350 over 8 m, four ambush squads for 10 s).

Still open:
- **Medium: ISIS wins only 25-35%.** The Medium AI gets little out of ISIS's cheap units and tunnels; this was 31-36%
  in batch 8 and has not been tuned since. Hard is the level the numbers are tuned against.
- Start positions: urban 56/44, arctic 36/64.
- The AI builds at most one superweapon and rarely fires it; it does not use Sneak Attack or build Saboteurs.
- Hero numbers come from AI-versus-AI matches. A person will use a cloaked hero far better than the AI does, so
  expect to revisit them after play.

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
