#!/usr/bin/env python3
"""
MR (deWoWčení) — Lore přejmenování na homebrew setting "The Caldmoor Reaches".
Jednorázový skript: aplikuje uspořádanou převodní mapu WoW vlastních názvů →
homebrew na uživatelsky viditelné texty (name/description/narativy). Engine ids
zůstávají. Generické D&D tvory (kobold, gnoll, centaur, satyr, naga, ogre, ghoul,
drak, lich, wraith, golem, elemental, demon, treant, raptor, scorpion) se nemění.
Spouští se jednou; je idempotentní jen omezeně (po přepsání už staré názvy nejsou).
"""
import re
import sys

FILES = [
    "packages/shared/src/data/zones.ts",
    "packages/shared/src/data/dungeons.ts",
    "packages/shared/src/data/raids.ts",
    "packages/shared/src/data/quests.ts",
    "packages/shared/src/grind.ts",
]

# Pořadí JE důležité: víceslovné / prefixované náhrady první, pak jednotlivé tokeny.
# Každý záznam: (regexový pattern, náhrada). Pattern obklopíme hranicemi (?<!\w)..(?!\w)
# automaticky, pokud nezačíná '#raw:' (pak se bere doslova bez hranic).
PAIRS = [
    # ── Named NPCs s problematickými substringy (musí PŘED 'fel' apod.) ──
    ("Morbent Fel", "Morbent the Blighted"),

    # ── Dungeon / raid bossové a místa (víceslovné první) ──
    ("Ragefire Chasm", "Emberfire Chasm"),
    ("Taragaman the Hungerer", "Tarrakal the Hungerer"),
    ("The Deadmines", "The Drowned Mines"),
    ("Deadmines", "Drowned Mines"),
    ("Edwin VanCleef", "Edmund Vance"),
    ("VanCleef", "Vance"),
    ("Rhahk'Zor", "Rahkzor"),
    ("Wailing Caverns", "Wailing Hollows"),
    ("Mutanus the Devourer", "Mutanis the Devourer"),
    ("Naralex", "Naralen"),
    ("Druids of the Fang", "Fang Wardens"),
    ("Druid of the Fang", "Fang Warden"),
    ("Shadowfang Keep", "Shadowmaw Keep"),
    ("Shadowfang", "Shadowmaw"),
    ("Archmage Arugal", "Archmage Argol"),
    ("Arugal", "Argol"),
    ("Fenrus the Devourer", "Fenris the Devourer"),
    ("Blackfathom Deeps", "Drownfathom Deeps"),
    ("Aku'mai", "Akhumai"),
    ("Scarlet Monastery", "Crimson Cloister"),
    ("High Inquisitor Whitemane", "High Inquisitor Palevane"),
    ("Whitemane", "Palevane"),
    ("Herod the Champion", "Herrod the Champion"),
    ("Herod", "Herrod"),
    ("Zul'Farrak", "Zarfarai"),
    ("Chief Ukorz Sandscalp", "Chief Ukor Dunescalp"),
    ("Ukorz Sandscalp", "Ukor Dunescalp"),
    ("Gahz'rilla", "Gazrilla"),
    ("Princess Theradras", "Princess Theradris"),
    ("Maraudon", "Maradoth"),
    ("Celebras", "Celebros"),
    ("Zaetar", "Zaethar"),
    ("Blackrock Depths", "Cinderdeep Halls"),
    ("Emperor Dagran Thaurissan", "Emperor Dagran Embermane"),
    ("Dagran Thaurissan", "Dagran Embermane"),
    ("Thaurissan", "Embermane"),
    ("General Angerforge", "General Emberforge"),
    ("Angerforge", "Emberforge"),
    ("Baron Rivendare", "Baron Ravendere"),
    ("Rivendare", "Ravendere"),
    ("Stratholme", "Pyrehold"),

    # ── Raidy ──
    ("Molten Core", "Cinderforge Depths"),
    ("Ragnaros the Firelord", "Ignaroth the Flamelord"),
    ("Ragnaros", "Ignaroth"),
    ("Magmadar", "Cindermaw"),
    ("Lucifron", "Pyrothul"),
    ("Blackwing Lair", "Drakefell Spire"),
    ("Razorgore the Untamed", "Razorwing the Untamed"),
    ("Razorgore", "Razorwing"),
    ("Vaelastrasz the Corrupt", "Vaelorin the Corrupt"),
    ("Vaelastrasz", "Vaelorin"),
    ("Nefarian", "Nefarius"),
    ("Zul'Gurub", "Zargubai"),
    ("Hakkar the Soulflayer", "Hazkar the Soulflayer"),
    ("Hakkar", "Hazkar"),
    ("High Priest Venoxis", "High Priest Venox"),
    ("Venoxis", "Venox"),
    ("Bloodlord Mandokir", "Bloodlord Mandok"),
    ("Mandokir", "Mandok"),
    ("Temple of Ahn'Qiraj", "Hollow Temple of Ankhareth"),
    ("Ahn'Qiraj", "Ankhareth"),
    ("C'Thun", "Xathun"),
    ("The Prophet Skeram", "The Prophet Shakram"),
    ("Skeram", "Shakram"),
    ("Battleguard Sartura", "Warden Sartha"),
    ("Sartura", "Sartha"),
    ("Qiraji", "Khareth"),
    ("silithid", "chitin-spawn"),

    # ── Zóny + regiony ──
    ("Northshire Valley", "Dawnhollow Vale"),
    ("Northshire", "Dawnhollow"),
    ("Westfall", "Harrowfield"),
    ("Duskwood", "Gloamwood"),
    ("Eastern Plaguelands", "Blighted Marches"),
    ("Durotar", "Emberwaste"),
    ("Thousand Needles", "Spire Canyons"),
    ("Felwood", "Witherwood"),
    ("The Barrens", "The Goldgrass Plains"),
    ("the Barrens", "the Goldgrass Plains"),
    ("Barrens", "Goldgrass Plains"),
    ("Elwynn", "Aldermere"),
    ("Ashenvale", "Greywood"),
    ("Tanaris", "Sunscar"),
    ("Lordaeron", "Caldmoor"),
    ("Silverpine", "Greypine"),
    ("Orgrimmar", "Karngar"),
    ("Blackrock Spire", "Cinderpeak Spire"),
    ("Blackrock Mountain", "Cinderpeak"),
    ("Blackrock", "Cinderpeak"),
    ("Tyr's Hand", "Warden Hold"),
    ("Light's Hope Chapel", "Dawnlight Chapel"),
    ("Camp Taurajo", "Camp Karro"),
    ("Taurajo", "Karro"),
    ("Sentinel Hill", "Wardenwatch"),
    ("Darkshire", "Duskmere"),
    ("Andorhal", "Andmoor"),
    ("Timbermaw", "Timberden"),
    ("Emerald Sanctuary", "Verdant Sanctuary"),
    ("Emerald Nightmare", "Verdant Nightmare"),
    ("Emerald Dream", "Verdant Dream"),

    # ── Organizace / frakce ──
    ("Defias Brotherhood", "Ashen Hand"),
    ("Defias", "Ashen Hand"),
    ("Argent Dawn", "Dawnward Order"),
    ("Argent", "Dawnward"),
    ("Scarlet Crusade", "Crimson Tribunal"),
    ("Scarlet", "Crimson"),
    ("Searing Blade Cultist", "Ember Cultist"),
    ("Searing Blade", "Ember Cult"),
    ("Burning Blade Cultist", "Cinder Cultist"),
    ("Burning Blade", "Cinder Cabal"),
    ("Twilight's Hammer", "Duskhammer"),
    ("Twilight Acolyte", "Dusk Acolyte"),
    ("Twilight Priestess", "Dusk Priestess"),
    ("Twilight", "Dusk"),
    ("Shadow Council", "Duskcabal"),
    ("Cenarion Circle", "Wildwarden Circle"),
    ("Cenarion", "Wildwarden"),
    ("Grimtotem", "Greyhorn"),
    ("Kolkar", "Kharzul"),
    ("Galak", "Galuk"),
    ("Bristleback", "Thornback"),
    ("Razormane", "Thornroot"),
    ("Sandfury", "Dunescale"),
    ("Gurubashi", "Gurubai"),
    ("Zandalari", "Zalandri"),
    ("Zandalar", "Zalandar"),
    ("Thorium Brotherhood", "Anvil League"),
    ("Thorium", "Anvil"),
    ("Dark Iron", "Cinderforge"),
    ("Scourge", "Pale Legion"),
    ("Warsong", "Bloodsong"),
    ("warchief", "warlord"),
    ("Warchief", "Warlord"),
    ("the Horde", "the warband"),
    ("Horde", "Warband"),
    ("Alliance", "Coalition"),

    # ── Tvorové specifičtí pro WoW (D&D tvory necháváme) ──
    ("Nightbane Worgen", "Nightbane Lycan"),
    ("Worgen", "Lycan"),
    ("worgen", "lycan"),
    ("Tainted Furbolg", "Tainted Ursafolk"),
    ("Furbolg", "Ursafolk"),
    ("furbolg", "ursafolk"),
    ("Coastal Murloc", "Coastal Marshlurker"),
    ("Murloc", "Marshlurker"),
    ("murloc", "marshlurker"),
    ("Quilboar", "Boarkin"),
    ("quilboar", "boarkin"),
    ("Tauren", "Beastfolk"),
    ("tauren", "beastfolk"),
    ("Night Elf", "Elf"),
    ("night elf", "elf"),
    ("Felpine", "Blightpine"),
    ("felhound", "shadowhound"),

    # ── Misc lore-ismy ──
    ("Twisting Nether", "Void Between"),
    ("Deathwing", "Worldbreaker"),
    ("Old Gods", "Elder Horrors"),
    ("Old God", "Elder Horror"),
    ("chromatic", "prismatic"),
    ("the Light", "the Radiance"),
    # 'fel' jako samostatné slovo / prefix (po Morbent Fel a Felwood/Felpine)
    ("Fel-", "Blight-"),
    ("fel-", "blight-"),
    ("Fel", "Blight"),
    ("fel", "blight"),
]


def _token_regex(tok):
    # Sestaví regex z tokenu; apostrof matchuje i escapovaný \' (single-quoted TS
    # narativy). Ostatní speciální znaky escapujeme.
    out = []
    for ch in tok:
        if ch == "'":
            out.append(r"\\?'")  # volitelný backslash před apostrofem
        else:
            out.append(re.escape(ch))
    return "".join(out)


def boundary_sub(pattern, repl, text):
    # Hranice = nesmí těsně sousedit s alfanum/_ (apostrof boundary NEVYLUČUJEME,
    # aby fungovaly i názvy na okraji TS řetězců '…').
    rx = re.compile(r"(?<![A-Za-z0-9_])" + _token_regex(pattern) + r"(?![A-Za-z0-9_])")
    # repl je apostrof-free → žádné escapování apostrofů; jen backslashe.
    return rx.sub(repl.replace("\\", "\\\\"), text)


def main():
    total = 0
    for path in FILES:
        with open(path, encoding="utf-8") as f:
            text = f.read()
        before = text
        for pat, repl in PAIRS:
            text = boundary_sub(pat, repl, text)
        if text != before:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            # hrubý odhad počtu změněných řádků
            changed = sum(1 for a, b in zip(before.splitlines(), text.splitlines()) if a != b)
            total += changed
            print(f"{path}: ~{changed} změněných řádků")
        else:
            print(f"{path}: beze změny")
    print(f"Hotovo, ~{total} řádků.")


if __name__ == "__main__":
    sys.exit(main())
