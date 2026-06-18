#!/usr/bin/env python3
"""
MR-11 — Level cap 20 + XP křivka.

Lineárně přeškáluje GATING LEVELY herního obsahu z WoW rozsahu 1–60 na D&D
rozsah 1–20 (mapping 1→1, 60→20) a u questů přepočítá `baseXp`/`baseGold` tak,
aby zůstaly kalibrované na referenční rychlost (`referenceXpPerHour/GoldPerHour`)
nového levelu (kontrakt `progression.test.ts`, viz `docs/systems/progression.md`).

Záměrně se NEDOTÝKÁ balanc čísel nepřátel (HP/AP/armor) ani fixních
dungeon/raid XP/gold odměn — ty patří do MR-10 (převzetí D&D čísel / CR).

Bezpečnost: matchuje jen rozlišitelné datové klíče s číselným literálem
(`requiredLevel: N,` apod.), nikdy `requiredLevel: number;` v typech ani
HP/AP argumenty builderů `enemy()/boss()`.
"""
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "packages" / "shared" / "src" / "data"

OLD_CAP = 60
NEW_CAP = 20
XP_BASE = 600   # XP_REWARD_RATE.base
GOLD_BASE = 40  # GOLD_REWARD_RATE.base
LVL_EXP = 0.5   # *_REWARD_RATE.levelExponent


def remap(level: int) -> int:
    """Lineární 1→1, 60→20; clamp do [1, NEW_CAP]; round-half-up."""
    scaled = (level - 1) * (NEW_CAP - 1) / (OLD_CAP - 1) + 1
    return max(1, min(NEW_CAP, math.floor(scaled + 0.5)))


def round_half_up(x: float) -> int:
    return math.floor(x + 0.5)


def reward(base: int, level: int, duration_sec: int) -> int:
    """base * sqrt(level) * hours, round-half-up (= JS Math.round)."""
    return round_half_up(base * (level ** LVL_EXP) * (duration_sec / 3600))


def rescale_simple(path: Path, keys: list[str]) -> int:
    """Přemapuje literály `key: N,` daných gating klíčů. Vrací počet změn."""
    text = path.read_text()
    changes = 0

    def sub(m: re.Match) -> str:
        nonlocal changes
        old = int(m.group("n"))
        new = remap(old)
        changes += 1
        return f'{m.group("pre")}{new}{m.group("post")}'

    for key in keys:
        pat = re.compile(rf'(?P<pre>\b{key}:\s*)(?P<n>\d+)(?P<post>\s*,)')
        text = pat.sub(sub, text)
    path.write_text(text)
    return changes


def rescale_quests(path: Path) -> int:
    """
    Forward pass přes quests.ts: drží poslední `requiredLevel`/`durationSec`
    v rámci objektu a podle nich přemapuje requiredLevel + přepočítá
    baseXp/baseGold. Pořadí polí v každém questu: requiredLevel → durationSec →
    baseXp → baseGold (vynuceno strukturou QuestDef v souboru).
    """
    lines = path.read_text().splitlines(keepends=True)
    cur_level = None
    cur_dur = None
    changes = 0

    re_req = re.compile(r'^(\s*requiredLevel:\s*)(\d+)(\s*,\s*)$')
    re_dur = re.compile(r'^(\s*durationSec:\s*)(\d+)(\s*,\s*)$')
    re_xp = re.compile(r'^(\s*baseXp:\s*)(\d+)(\s*,\s*)$')
    re_gold = re.compile(r'^(\s*baseGold:\s*)(\d+)(\s*,\s*)$')

    for i, line in enumerate(lines):
        m = re_req.match(line)
        if m:
            cur_level = remap(int(m.group(2)))
            lines[i] = f'{m.group(1)}{cur_level}{m.group(3)}'
            changes += 1
            continue
        m = re_dur.match(line)
        if m:
            cur_dur = int(m.group(2))
            continue
        m = re_xp.match(line)
        if m and cur_level is not None and cur_dur is not None:
            lines[i] = f'{m.group(1)}{reward(XP_BASE, cur_level, cur_dur)}{m.group(3)}'
            changes += 1
            continue
        m = re_gold.match(line)
        if m and cur_level is not None and cur_dur is not None:
            lines[i] = f'{m.group(1)}{reward(GOLD_BASE, cur_level, cur_dur)}{m.group(3)}'
            changes += 1
            continue
    path.write_text("".join(lines))
    return changes


def main() -> int:
    q = rescale_quests(SHARED / "quests.ts")
    d = rescale_simple(SHARED / "dungeons.ts", ["requiredLevel", "recommendedLevel"])
    r = rescale_simple(SHARED / "raids.ts", ["requiredLevel"])
    z = rescale_simple(SHARED / "zones.ts", ["minLevel", "maxLevel"])
    print(f"quests.ts: {q} fields, dungeons.ts: {d}, raids.ts: {r}, zones.ts: {z}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
