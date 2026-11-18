# Balance changelog

## Batch 14, drop B (2026-11-17): towns, sites, command buildings, an AI that plans and learns

Hard v Hard, 2,250 matches (15 sides, five 1 km maps, two seeds), friendly fire on, 40-minute limit. Full table:
`report.md`; the drop A table is kept as `report-batch14a.md`. Medium: `report-medium.md`. Sea maps: `report-sea.md`.

| Side | Drop A (Hard) | Drop B, first sweep | Drop B, final |
|---|---|---|---|
| ISIS: WMD General | 43% | 73% | 60% |
| United States (no general) | 49% | 62% | 58% |
| ISIS: Stealth General | 47% | 76% | 58% |
| ISIS (no general) | 44% | 71% | 56% |
| United States: Marine Corps General | 54% | 65% | 53% |
| Europe: Laser General | 47% | 51% | 51% |
| Russia: Vacation Command Group | 59% | 23% | 51% |
| Europe: Panzer General | 50% | 50% | 51% |
| Russia: Wagner Group | 58% | 31% | 50% |
| China: Mass Assault General | 58% | 43% | 49% |
| Europe (no general) | 48% | 49% | 46% |
| Russia (no general) | 40% | 22% | 45% |
| United States: Air Force General | 45% | 56% | 45% |
| China: Cyber General | 56% | 43% | 42% |
| China (no general) | 52% | 36% | 37% |

Fourteen of fifteen sides are inside 40 to 60%. China without a general is just under (37%) and is the first thing
to look at next time.

**Tempo** (targets: under 5% of matches over before 8 minutes, median 14 to 20 minutes):

| | Drop A | Drop B |
|---|---|---|
| Over before 6 minutes | 4.7% | 0.2% |
| Over before 8 minutes | 18.4% | 6.3% |
| Median length | 15.8 min | 17.4 min |
| Still running at 30 minutes | 5.8% | 12.4% |
| Draws at 40 minutes | 59 | 91 |

Early wins are a third of what they were; the 5% target is not quite reached (most of what is left is ISIS on
Arctic and Urban, the two maps with the shortest road between the bases).

**Start positions** (target: neither above 55%): canyon 44/56, forest 49/51, urban 52/48, arctic 43/57, open 45/55.
Drop A was 58/42, 45/55, 51/49, 44/56, 58/43. Canyon and Arctic are a point or two over, both toward the second
position.

### Two fairness bugs the first sweep found
The first drop B sweep had the **second start position winning 60% of matches on every map, 80% on Desert Canyon**.
Neither cause was a start position:
- **The plan draw.** The match's random stream starts from the seed, and for seeds 1, 2, 3... its first number is
  nearly the same (0.63, 0.73, 0.72). The first AI to draw therefore got the same plan (air cavalry) in almost every
  match, the second a varied one. The draw is now hashed from the seed, the side, the match-up and the map.
- **Ties.** From the middle of the map the two mirrored Artillery Platforms are exactly as far away as each other,
  and the scout's "nearest next" tour broke the tie by list order: one player's scout drove into the enemy half and
  died, the other toured its own half and found its sites. Each AI's points of interest are now sorted the same way
  seen from its own end (nearest to home first, then left before right), so both make mirror-image choices. Tested.

### What the AI was getting wrong (found by the new tests)
- It never saved up for its airfield, command building or first defense: anything it could not afford that second
  lost out to the next rifle squad. Those now score in the "save for it" band. On sea maps the same was true of
  the shipyard.
- A plan's pull on what it builds is a little weaker (+16 at most, was +22) and the report card a little stronger
  (plus or minus 14, was 8): what earns its keep is built more.

### Why the factions moved, and what was changed
- **ISIS rose 25 points** once its AI learned which of its units pay off: 15 Toxin Tractors a match instead of 40,
  more Scorpions and RPG teams. With learning and plans switched off it was back at 47%. Its core is now a little
  dearer: Guerrilla $250 (225), RPG Team $320 (300), Quad Cannon $575 (500), Scorpion $775 (700), Mortar Team $450
  (400).
- **Russia fell to 20-30%.** It kills more than it loses (1.16) but has the smallest income of any faction: no
  income building, so everything comes from trucks and Oil Derricks. Changes: **an Oil Derrick pays Russia 30% more**
  ($39 every 2 s); T-90 and T-14 guns do half damage to infantry (35% for other tanks: high-explosive shells);
  Rifle Squad $250 and 290 health (280, 270); RPG Team $290 (320); BTR-82A $600 (650); BMP-3 $750 (900); T-90 $700
  (800); Tunguska $900 (1,000); TOS-1A and Msta-S $1,000 (1,100); Spetsnaz $650 (700); Su-25 $1,250 (1,350).
- **China**: Conscripts $240 (250), ZBD-04A $850 (900), Type 99 $700 (750).
- **United States**: Flashbang Ranger $320 (300), A-10 $1,600 (1,500).

### Medium and the sea maps
- **Medium v Medium** (1,125 matches, one seed): 29 to 65%. Marine Corps General 65, Laser General 64, Europe 63,
  United States 62, Wagner 59, Panzer 58, Stealth 52, Air Force 48, Russia 46, Vacation 44, Mass Assault 44, ISIS 41,
  Cyber 39, WMD 37, China 29. No match is over before 6 minutes; 6% before 8; median 18.7 minutes. China without a
  general is the weak side at both levels.
- **Sea maps, Hard** (Strait of Sand and Emerald Isles, 450 matches, one seed): 23 to 67% (batch 13: 10 to 75).
  Russia 67, China 62, Panzer 62 ... WMD 32, Stealth 28, ISIS 23. Start positions 54/46 on both. These maps are slow:
  the median decided match takes 34 minutes and 134 of 450 are undecided at 40. Still not tuned; they stay on the
  open list.

### What the AI builds now (Hard, per match)
Every unit type open to a side is built in the sweep; the only "never built" entries in the report are ships on
land maps. Examples: Russia 5.2 T-90s, 5.5 Su-25s, 4.8 Tunguskas, 2.8 TOS-1As and 2.4 Msta-S (drop A: 1.2, 2.5,
1.1, 0.5 and 0); every side builds its command building in nearly every match and has a defense up early.

## Batch 14, drop A (2026-11-17): new units for every faction, two new superweapons

Hard v Hard, 2,250 matches (15 sides, five 1 km maps, two seeds), friendly fire on, 40-minute limit. Full table:
`report.md`; the batch 13 table is kept as `report-batch13.md`. Medium and the two sea maps are re-run with drop B.

| Side | Batch 13 (Hard) | Batch 14 drop A (Hard) |
|---|---|---|
| Russia: Vacation Command Group | 40% | 59% |
| China: Mass Assault General | 61% | 58% |
| Russia: Wagner Group | 43% | 58% |
| China: Cyber General | 58% | 56% |
| United States: Marine Corps General | 46% | 54% |
| China (no general) | 52% | 52% |
| Europe: Panzer General | 56% | 50% |
| United States (no general) | 52% | 49% |
| Europe (no general) | 53% | 48% |
| ISIS: Stealth General | 50% | 47% |
| Europe: Laser General | 52% | 47% |
| United States: Air Force General | 53% | 45% |
| ISIS (no general) | 48% | 44% |
| ISIS: WMD General | 49% | 43% |
| Russia (no general) | 36% | 40% |

Every side is between 40% and 59% on the first sweep, so nothing was retuned for this drop.

What moved, and why:
- **Russia's two generals rose from 40-43% to 58-59%**; Russia without a general from 36% to 40%. The AI builds 13
  BTR-82As, 4 Spetsnaz Teams and 2.5 Su-25s a match on top of its BMP-3s; its tanks now shrug off the first rocket
  (Reactive Armour) and BMP-3s swim. It still builds very few T-90s (1.2 a match) and almost no Msta-S: the AI
  picks units by damage for the money, and that is what drop B's doctrines are for.
- **China fell back into range** (Mass Assault General 61% to 58%) as the others gained units. Its AI took to the
  ZBD-04A at once (18 a match) and builds 3 PGZ-09s.
- **ISIS: 43-47%** (was 48-50%). Its AI builds 17 Mortar Teams a match and hardly any T-55s.
- **United States: Air Force General 53% to 45%.** The stealth F-22 and the one-burst A-10 cannon did not help its AI,
  which flies its A-10s at targets one pass at a time; the Bradley (6 a match) and HIMARS (3) are in use.
- The A-10's cannon does 1,200 damage to armour in 1.5 s and is then empty; with the AC-130 at 84 m these are the
  two changes most likely to feel different in a person's hands than in the AI's.

Start positions (Hard): Desert Canyon 58 / 42, Forest River 45 / 55, Urban Megacity 51 / 49, Arctic Refinery
44 / 56, Open Desert 58 / 43. Two maps are now outside 55 / 45; drop B's tempo pass has that as a target.

Still open (for drop B): the AI's unit variety (see above); start positions; Medium and the sea maps not yet re-run;
the Kinzhal Strike and Sky Shield are tuned only by AI matches (the Russian AI fires a Kinzhal in about half its
matches; the European AI raises the Sky Shield in one match in twenty, because it waits for an enemy launch).

## Batch 13 (2026-11-17): US aircraft as units, new ISIS units, the AI's promotions

Hard v Hard, 2,250 matches (15 sides, five 1 km maps, two seeds), friendly fire on, 40-minute limit. Medium v
Medium, 1,125 matches (one seed). Full tables: `report.md` (Hard), `report-medium.md` (Medium); the batch 12 table
is kept as `report-batch12.md`. The two 2 km sea maps: `report-sea.md` (450 matches, one seed).

| Side | Batch 12 (Hard) | As first written (Hard) | Final (Hard) | Final (Medium) |
|---|---|---|---|---|
| China: Mass Assault General | 59% | 65% | 61% | 59% |
| China: Cyber General | 60% | 64% | 58% | 51% |
| Europe: Panzer General | 51% | 57% | 56% | 47% |
| United States: Air Force General | 54% | 59% | 53% | 53% |
| Europe (no general) | 53% | 57% | 53% | 48% |
| China (no general) | 49% | 53% | 52% | 49% |
| United States (no general) | 60% | 55% | 52% | 35% |
| Europe: Laser General | 49% | 54% | 52% | 50% |
| ISIS: Stealth General | 40% | 28% | 50% | 43% |
| ISIS: WMD General | 40% | 41% | 49% | 45% |
| ISIS (no general) | 42% | 35% | 48% | 44% |
| United States: Marine Corps General | 55% | 41% | 46% | 54% |
| Russia: Wagner Group | 51% | 53% | 43% | 57% |
| Russia: Vacation Command Group | 44% | 42% | 40% | 61% |
| Russia (no general) | 40% | 46% | 36% | 53% |

Thirteen of fifteen sides are between 40% and 60% at Hard. Outside it: China's Mass Assault General (61%) and
Russia without a general (36%).

Start positions (Hard): Desert Canyon 54 / 46, Forest River 53 / 47, Urban Megacity 55 / 45, Open Desert 51 / 49,
Arctic Refinery 45 / 55 (was 37 / 63). A match lasts 17.2 minutes on average; 62 of 2,250 reach the limit.

What the sweeps showed and what was changed:

| What | First written | Final | Why |
|---|---|---|---|
| ISIS AI: order of promotions | Sneak Attack as soon as it is on offer (Rank 3 now), then Ambush, then Toxin Bomb | Cash Bounty first, then Sneak Attack, then Ambush | **the cause of ISIS falling to 28-35%.** With Sneak Attack at Rank 3 the AI spent its five points on three powers and never bought Cash Bounty (20% of the price of everything it destroys). Putting Sneak Attack back at Rank 5 in a trial gave 50%; keeping it at Rank 3 and telling the AI to take Cash Bounty first (`ai: 5` on the promotion) gives 48% with five Sneak Attacks a match |
| ISIS AI: what the forward tunnel exits carry (1 km maps) | the whole army goes down the home tunnel and comes up at the exit | the army marches together; reinforcements come up through the exit, retreats go home through it | a column leaving a hole a few units at a time was beaten in detail (38% to 41% in a trial). On the 2 km maps the army still goes underground |
| ISIS AI: Scud and Shahed launchers | keeps two, saving up for them ahead of everything else | keeps two, bought when the money is there | 6.5 launchers a match at $1,400, and the wait for each held up the army |
| Shahed Launcher | $1,400 | $1,200 | same |
| Stealth General's AI: quadcopter swarm | always topped up first, sent at the attack's target | topped up once there is an army and $900 to spare, not for 75 s after a wave; sent only at infantry, light vehicles and helicopters seen in the last 10 s, six at a time on the attack | 21 drones a match ($7,400) diving on buildings and tanks, which they barely scratch. Costs it about 5 points of win rate even so; see the next row |
| Stealth General | no price rule | infantry 10% cheaper | to pay for the swarm its AI must keep. The FPV drone itself is unchanged |
| Quad Cannon against infantry and light vehicles | 0.7 / 0.6 | unchanged | tried 0.4 / 0.26 so the AI would not buy it as an all-purpose unit: ISIS fell to 25-30%. It is the 23 mm quad; it stays good against soft ground targets |
| AH-1Z Viper | 20 mm 7 damage; rockets 36 every 2.2 s | 5 damage; rockets 30 every 2.5 s | it out-shot the Comanche for less money and the Marine AI built little else (41%). It still fires faster than the other gunships |
| A-10: cannon, Maverick against infantry | 30 damage, x1.0 infantry; Maverick x0.5 | 22 damage, x0.5 infantry, x0.7 tanks; Maverick x0.3 | the AI chose the A-10 against everything |
| Tomahawk Strike | 520 damage, 12 m, every 180 s | 650, 14 m, every 150 s | it replaces the A-10 Strafing Run for two of the three US sides, which lost firepower (Marine 41%) |
| China: Mass Assault General | tanks and infantry 8% cheaper | unchanged | tried 6%: 70% (one more Conscript wave changes the build order); back to 8% |
| China: Cyber General | infantry and tanks 12% dearer | 14% dearer | 64% |

Other AI changes that move the numbers: the Air Force General's AI builds the Air Field and the Strategic Airfield as
a matter of course (3.2 A-10s, 1.1 F-15Es, 0.9 Apaches, 0.3 AC-130s a match; the B-2 hardly ever: $3,000 for one
pass); an AI no longer plans for another general's aircraft.

The two sea maps (Hard, one seed):

| Side | Win rate of decided games | Draws of 60 |
|---|---|---|
| China: Cyber General | 75% | 4 |
| United States: Marine Corps General | 70% | 19 |
| United States (no general) | 68% | 22 |
| United States: Air Force General | 67% | 13 |
| China: Mass Assault General | 67% | 20 |
| ISIS: WMD General | 57% | 12 |
| China (no general) | 50% | 14 |
| ISIS (no general) | 50% | 14 |
| ISIS: Stealth General | 50% | 16 |
| Europe: Laser General | 49% | 17 |
| Europe: Panzer General | 43% | 7 |
| Europe (no general) | 33% | 13 |
| Russia (no general) | 20% | 26 |
| Russia: Wagner Group | 14% | 28 |
| Russia: Vacation Command Group | 10% | 25 |

Start positions there: Strait of Sand 35 / 65, Emerald Isles 51 / 49. 30% of matches reach the 40-minute limit
(37% in batch 12). ISIS was at 11%, 21% and 29% on these maps in batch 12 and is at 50% to 57% now: Cash Bounty,
Sneak Attack exits every 150 s and the Shahed Launcher's reach all count for more on a long map. Russia fell from
19-28% to 10-20%.

Still open:
- **Russia is the weakest faction at Hard (36 / 40 / 43%)** now that ISIS has recovered; its line-up and numbers
  are placeholders until the player's unit lists arrive, so it was not retuned here.
- **China: Mass Assault General 61%.** One point over; its only rule is the 8% discount, and 6% made it stronger.
- **Sea maps: 10% to 75%, still not balanced**, but the gap is now Russia alone (10-20%) and Europe without a
  general (33%); the other eleven sides are between 43% and 75%. Strait of Sand favours the second start (35 / 65).
- **Medium: 35% to 61%** (was 31% to 62%). Fourteen sides are between 43% and 61%; the United States without a
  general is at 35%. Hard is the level the numbers are tuned against.
- The AI's B-2 and AC-130 use is thin: it builds few and loses most of them.
- The Shahed Launcher and the Quad Cannon were tuned only through AI matches; in a person's hands the launcher
  (three flying bombs every 16 s from 110 m) may want another look.

## Batch 12 (2026-11-17): Russia and Europe; fifteen sides

Hard v Hard, 2,250 matches (15 sides, five 1 km maps, two seeds), friendly fire on, 40-minute limit. Medium v
Medium, 1,125 matches (one seed). Full tables: `report.md` (Hard), `report-medium.md` (Medium); the batch 11 table
is kept as `report-batch11.md`. The two 2 km sea maps: `report-sea.md` (450 matches, one seed).

| Side | As first written (Hard) | Final (Hard) | Final (Medium) |
|---|---|---|---|
| China: Cyber General | 53% | 60% | 62% |
| United States (no general) | 44% | 60% | 39% |
| China: Mass Assault General | 53% | 59% | 62% |
| United States: Marine Corps General | 45% | 55% | 52% |
| United States: Air Force General | 47% | 54% | 44% |
| Europe (no general) | 62% | 53% | 46% |
| Europe: Panzer General | 64% | 51% | 45% |
| Russia: Wagner Group | 62% | 51% | 59% |
| Europe: Laser General | 63% | 49% | 49% |
| China (no general) | 41% | 49% | 62% |
| Russia: Vacation Command Group | 71% | 44% | 61% |
| ISIS (no general) | 31% | 42% | 39% |
| ISIS: WMD General | 31% | 40% | 45% |
| Russia (no general) | 45% | 40% | 52% |
| ISIS: Stealth General | 36% | 40% | 31% |

Start positions (Hard): Desert Canyon 50 / 50, Forest River 53 / 47, Urban Megacity 49 / 51, Open Desert 49 / 51,
Arctic Refinery 37 / 63 (still open).

What the sweeps showed and what was changed:

| What | First written | Final | Why |
|---|---|---|---|
| Leonidas: spear | 240 damage every 0.6 s, 1,500 health | 195 every 0.7 s, 1,300 health | Europe won 62-64%; with him at 150 damage and 1,100 health it fell to 33-38%, so the answer is in between. Still the hardest-hitting and toughest hero |
| Gepard and Tunguska guns against infantry | 0.9 | 0.7 (Gepard), 0.6 (Tunguska); light vehicles 0.7 / 0.6 | an anti-aircraft gun was the best infantry killer in both armies |
| MILAN Team | 82 damage, 48 m, $380 | 70 damage, 44 m, $430 | Europe's cheap infantry carried it |
| Legion Squad | $320, 280 health | $340, 260 health | same |
| Puma | $900; Spike 125 damage, x1.8 against tanks | $950; 118 damage, x1.5 | same; and the AI now picks the MILAN Team against armor and the Puma against infantry instead of the Puma for both |
| Wagner Group | 15% cheaper, 10% less health | 12% cheaper, 15% less health | 62% |
| Vacation Command Group: cash from kills | 25% of the price | 6% | 71%, and it earned far more than anyone ($51,900 a match) |
| T-14 Armata | $1,500, 700 health | $1,650, 640 health | same |
| BMP-3 | $800; 100 mm 50 damage every 3 s; 30 mm 9 | $900; 40 damage every 3.5 s; 30 mm 8 | Russia built 32 a match and beat ISIS nine times in ten |
| T-90 | $850 | $800 | Russia's AI hardly built it |

AI changes that also move the numbers: the ISIS AI opens forward Tunnel Network exits and moves attacks through
them (a second Worker does the walking, so the base keeps its builder).

The two sea maps (Hard, one seed):

| Side | Win rate of decided games | Draws of 60 |
|---|---|---|
| China: Cyber General | 80% | 1 |
| United States: Air Force General | 78% | 24 |
| China: Mass Assault General | 76% | 14 |
| United States: Marine Corps General | 76% | 23 |
| United States (no general) | 71% | 28 |
| China (no general) | 61% | 12 |
| Europe: Laser General | 51% | 19 |
| Europe: Panzer General | 47% | 9 |
| Europe (no general) | 39% | 15 |
| ISIS (no general) | 29% | 25 |
| Russia (no general) | 28% | 27 |
| Russia: Wagner Group | 22% | 29 |
| ISIS: Stealth General | 21% | 28 |
| Russia: Vacation Command Group | 19% | 30 |
| ISIS: WMD General | 11% | 20 |

Start positions there: Strait of Sand 41 / 59, Emerald Isles 56 / 44. 37% of matches reach the 40-minute limit.

Still open:
- **Sea maps:** **the two 2 km maps are not balanced: 11% to 80%.** Teaching the ISIS AI to tunnel moved ISIS from 25 / 21 /
  11% (batch 11) to 29 / 21 / 11%: it opens exits and uses them, but the exits are lost and the armies still arrive
  piecemeal. Russia, new this batch, is as weak there (19-28%). What the weak sides share is an AI army of infantry
  and ground vehicles; the United States and China put far more into aircraft, which ignore a 3 km land route. The
  1 km maps do not show this. It needs its own pass: either the Russian and ISIS AIs must fly and ferry more, or
  the sea maps need a shorter land route.
- **Medium: 31% to 62%.** China's three sides and Russia's two generals win about 60%; ISIS Stealth General 31%, ISIS
  and the United States without a general 39%. Hard is the level the numbers are tuned against.
- Arctic Refinery favours the second start (37 / 63).
- The Russia and Europe line-ups and all their numbers are placeholders until the player's unit lists arrive.
  Their AIs lean on infantry and light vehicles (Russia builds about 30 BMP-3s and 2 T-90s a match).
- Hero numbers come from AI-versus-AI matches; Leonidas in a person's hands will need another look.

## Batch 11 (2026-11-16): navy, sea maps, the five maps at 1 km

Hard v Hard and Medium v Medium, 1,215 matches each on the five 1 km maps, friendly fire on, match limit raised
from 25 to 40 minutes (longer marches). Full tables: `report.md` (Hard), `report-medium.md` (Medium); the batch 10
table is kept as `report-batch10.md`. A separate 162-match sweep on the two 2 km sea maps is in `report-sea.md`.

| Loadout | Batch 10 final (Hard, 0.5 km maps) | Batch 11 as first built (Hard, 1 km maps) | Batch 11 final (Hard) | Batch 11 final (Medium) |
|---|---|---|---|---|
| China: Mass Assault General | 60% | 58% | 59% | 73% |
| China: Cyber General | 46% | 52% | 57% | 53% |
| ISIS: WMD General | 42% | 32% | 50% | 36% |
| China (no general) | 43% | 50% | 50% | 63% |
| United States: Air Force General | 58% | 54% | 48% | 46% |
| United States: Marine Corps General | 58% | 63% | 47% | 55% |
| United States (no general) | 59% | 58% | 47% | 46% |
| ISIS (no general) | 43% | 34% | 46% | 39% |
| ISIS: Stealth General | 40% | 48% | 46% | 39% |

Start positions (share of decided games won by the first / second start):

| Map | As first built | Final (Hard) |
|---|---|---|
| Desert Canyon | 42 / 58 | 49 / 51 |
| Forest River | 36 / 64 | 50 / 50 |
| Urban Megacity | 38 / 62 | 47 / 53 |
| Arctic Refinery | 31 / 69 | 41 / 59 |
| Open Desert | 46 / 54 | 50 / 50 |

What the sweeps showed and what was changed:

| What | Before | After | Why |
|---|---|---|---|
| AI base layout | each side searched for building sites in the same compass order | the two sides search in mirrored order; first choice is behind the Command Center | on a mirrored map the same compass order gave the second side a sheltered base and the first an exposed one: the second start won 54-69% on every map. This was already there on the small maps (arctic 36/64); doubling them made it plain |
| Cyber General: permanent watch | every enemy building, from the first second | from 5:00 on, every enemy building this side has found | with fair starts on 1 km maps the Cyber General won 72%: knowing the whole enemy base from the start is worth far more when the map is big. Without the watch at all it won 48%. Price and Cash Hack changes moved it by 2 points; delay alone 62%; found-only alone 63%; both together 54-57% |
| Vehicle routes | shortest way | prefer roads (a road cell counts as 0.8 of a cell) | vehicles are 25% faster on roads but drifted off them |
| AI fleet spending | replace every lost ship at once | at most 60% of the army's value afloat, and a 30 s wait after a loss | on the sea maps ISIS built 29 Drone Boats and 14 Missile Boats a game and lost 92-96% of them |
| Missile Boat | 380 health, 8 x 55 damage, 70 m | 520 health, 8 x 60 damage, 74 m | it died before a second salvo |
| Drone Boat | 110 health | 150 health | it was shot before reaching anything |

New units whose numbers are first guesses (AI v AI only; the AI never loads Landing Craft and does not build the
Mk V): RHIB $500, Frigate $2,200, Mk V $1,400, SEAL Team $900, Landing Craft $700, Corvette $1,900, Missile Boat
$1,500, Drone Boat $400, shipyards $2,000 ($1,700 for ISIS).

The two sea maps (Hard, one seed, 18 pairings each way; 2 km, so 4 in 10 matches reach the 40-minute limit):

| Loadout | Win rate of decided games | Draws of 36 |
|---|---|---|
| United States (no general) | 71% | 11 |
| United States: Air Force General | 63% | 13 |
| United States: Marine Corps General | 63% | 16 |
| China: Cyber General | 62% | 3 |
| China (no general) | 59% | 10 |
| China: Mass Assault General | 54% | 6 |
| ISIS (no general) | 25% | 16 |
| ISIS: Stealth General | 21% | 18 |
| ISIS: WMD General | 11% | 13 |

Start positions there: Strait of Sand 47 / 53, Emerald Isles 46 / 54. Decided matches run 20 to 31 minutes.

Still open:
- **ISIS on the two sea maps: it wins 11-25% of decided games.** Ships are not the cause: with every AI fleet switched off ISIS still
  won only 12-25% there. ISIS has no aircraft, and on a 2 km map the land route is nearly 3 km, so the sides with
  jets and helicopters strike first. Worth a decision with the player: an ISIS answer to distance (the AI using
  Tunnel Networks and Sneak Attack to move armies, or a new unit).
- **Medium: China Mass Assault wins 73%, ISIS 36-39%.** Hard is the level the numbers are tuned against. ISIS at
  Medium is up from 25-35% in batch 10.
- Arctic Refinery still favours the second start (41/59).
- Ship prices and strengths have only been seen in AI hands, and the AI makes no landings.
- The AI builds at most one superweapon and rarely fires it; it does not use Sneak Attack or build Saboteurs.

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
