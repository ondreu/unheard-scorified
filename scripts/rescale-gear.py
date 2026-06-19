#!/usr/bin/env python3
"""Rescale gear katalogu na D&D-věrnou magnitudu (gear & balance follow-up / MR-10e).

Rozhodnutí PM:
  - D&D-věrný model: gear dává primárně attack_power / spell_power (≈ magic weapon)
    a armor (AC). Raw ability skóre jen malé a vzácné (+1/+2 na rare+ špercích).
  - Cílová váha: full BiS na lvl 20 ≈ 1.5–2× efektivní síla nahé postavy.

Skript přepíše `stats: { ... }` u každého itemu v packages/shared/src/data/items.ts
podle budgetu odvozeného z (itemLevel, rarity, slot, role). Role (martial vs caster)
se odvodí ze stávajících statů (str/dex/attack_power → martial; int/wis/cha/spell_power
→ caster). Idempotentní (lze pustit opakovaně). Batohy (stats: {}) zůstávají.

Finální magnitudy se ladí konstantami níže + ověřují harnessem
(src/gear-balance.test.ts).
"""
from __future__ import annotations
import re
import sys
from pathlib import Path

ITEMS = Path(__file__).resolve().parent.parent / "packages/shared/src/data/items.ts"

MAX_ILVL = 68

RARITY_MULT = {
    "common": 0.5,
    "uncommon": 0.7,
    "rare": 0.85,
    "epic": 1.0,
    "legendary": 1.2,
}

WEAPON_SLOTS = {"main_hand"}
OFFHAND_SLOTS = {"off_hand"}
ARMOR_SLOTS = {"head", "shoulder", "chest", "waist", "legs", "feet", "wrist", "hands"}
JEWELRY_SLOTS = {"neck", "finger", "back"}
TRINKET_SLOTS = {"trinket"}

# ── Budget (hodnoty při t=1 / epic; finální ladění přes harness) ────────────────
WEAPON_POWER_MAX = 4     # main_hand attack/spell power
OFFHAND_POWER_MAX = 2
NECK_POWER_MAX = 2
FINGER_POWER_MAX = 2
BACK_POWER_MAX = 1
ARMOR_AC_MAX = 16        # armor pointů na armor piece (→ AC přes dělitel v combat.ts)
TRINKET_CRIT_MAX = 10    # crit_rating na trinket
# Vzácný ability bump (D&D „stat stick" trinket) — jen epic+ trinkety, +1 každý.
ABILITY_BUMP_AMOUNT = 1


def tfrac(ilvl: int) -> float:
    return max(0.0, min(1.0, ilvl / MAX_ILVL))


def scaled(value_max: float, ilvl: int, rarity: str) -> int:
    return round(value_max * tfrac(ilvl) * RARITY_MULT[rarity])


def infer_role(stats: dict[str, int]) -> str:
    """martial vs caster z dominantních statů (≥ vyhrává; default martial)."""
    caster = stats.get("intelligence", 0) + stats.get("wisdom", 0) + stats.get("charisma", 0) + 2 * stats.get("spell_power", 0)
    martial = stats.get("strength", 0) + stats.get("dexterity", 0) + 2 * stats.get("attack_power", 0)
    return "caster" if caster > martial else "martial"


def primary_ability(role: str) -> str:
    return "intelligence" if role == "caster" else "strength"


def parse_stats(inner: str) -> dict[str, int]:
    out: dict[str, int] = {}
    for m in re.finditer(r"([a-z_]+):\s*(-?\d+)", inner):
        out[m.group(1)] = int(m.group(2))
    return out


def fmt_stats(stats: dict[str, int]) -> str:
    if not stats:
        return "{}"
    parts = [f"{k}: {v}" for k, v in stats.items() if v != 0]
    return "{ " + ", ".join(parts) + " }" if parts else "{}"


def new_stats(slot: str, rarity: str, ilvl: int, old: dict[str, int]) -> dict[str, int]:
    role = infer_role(old)
    power_key = "spell_power" if role == "caster" else "attack_power"
    out: dict[str, int] = {}

    if slot in WEAPON_SLOTS:
        out[power_key] = max(1, scaled(WEAPON_POWER_MAX, ilvl, rarity))
    elif slot in OFFHAND_SLOTS:
        out[power_key] = max(1, scaled(OFFHAND_POWER_MAX, ilvl, rarity))
    elif slot in ARMOR_SLOTS:
        out["armor"] = max(1, scaled(ARMOR_AC_MAX, ilvl, rarity))
    elif slot in NECK_POWER_SLOT:
        p = scaled(NECK_POWER_MAX, ilvl, rarity)
        if p > 0:
            out[power_key] = p
    elif slot == "finger":
        p = scaled(FINGER_POWER_MAX, ilvl, rarity)
        if p > 0:
            out[power_key] = p
    elif slot == "back":
        p = scaled(BACK_POWER_MAX, ilvl, rarity)
        if p > 0:
            out[power_key] = p
    elif slot in TRINKET_SLOTS:
        c = scaled(TRINKET_CRIT_MAX, ilvl, rarity)
        if c > 0:
            out["crit_rating"] = c

    # Vzácný ability bump — JEN trinkety (klasický D&D „stat stick"), epic+, vyšší
    # ilvl, +1. Drží to ability skóre na gearu minimální a vzácné (rozhodnutí PM) →
    # žádná kaskáda přes AC/attack/DC. Cap +2 z gearu napříč celým setem (2 trinkety).
    if slot in TRINKET_SLOTS and rarity in ("epic", "legendary") and ilvl >= 48:
        out[primary_ability(role)] = ABILITY_BUMP_AMOUNT

    if not out:  # fallback ať item není prázdný (low-tier jewelry)
        out[power_key] = 1
    return out


NECK_POWER_SLOT = {"neck"}


def main() -> int:
    text = ITEMS.read_text()
    lines = text.splitlines(keepends=True)
    cur_slot = cur_rarity = None
    cur_ilvl = None
    changed = 0

    for i, line in enumerate(lines):
        ms = re.search(r"slot:\s*'([a-z_]+)'", line)
        if ms:
            cur_slot = ms.group(1)
        mr = re.search(r"rarity:\s*'([a-z]+)'", line)
        if mr:
            cur_rarity = mr.group(1)
        mi = re.search(r"itemLevel:\s*(\d+)", line)
        if mi:
            cur_ilvl = int(mi.group(1))

        mstat = re.search(r"stats:\s*\{([^}]*)\}", line)
        if not mstat:
            continue
        inner = mstat.group(1).strip()
        old = parse_stats(inner)
        # batoh / bezstatový item → nech být
        if not old or cur_slot in (None, "bag"):
            continue
        assert cur_rarity and cur_ilvl is not None, f"chybí rarity/ilvl pro řádek {i+1}"
        ns = new_stats(cur_slot, cur_rarity, cur_ilvl, old)
        replacement = f"stats: {fmt_stats(ns)}"
        lines[i] = line[: mstat.start()] + replacement + line[mstat.end():]
        changed += 1

    ITEMS.write_text("".join(lines))
    print(f"Rescaled {changed} item stat blocks.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
