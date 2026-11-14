#!/bin/sh
# Trial a registry change: balance/try.sh name '{"UNITS.x.hp":300}' [extra run.mjs args]  -> prints the loadout table
name="$1"; tweak="$2"; shift 2
ZM_TWEAK="$tweak" node balance/run.mjs --out "balance/runs/try-$name.jsonl" "$@" >/dev/null 2>&1 && node balance/report.mjs "balance/runs/try-$name.jsonl" "balance/runs/try-$name.md" >/dev/null && echo "== $name $tweak" && awk '/^## Loadouts/{f=1;next} /^## Pairings/{f=0} f' "balance/runs/try-$name.md" | grep '^| [A-Z]' | grep -v Loadout | awk -F'|' '{printf "%-38s %5s  k/l %s  win %s min\n",$2,$4,$9,$8}' && grep -h "Decided matches" "balance/runs/try-$name.md" | cut -c1-140
