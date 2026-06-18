# Setting — The Caldmoor Reaches (homebrew)

Homebrew D&D svět hry (MR deWoWčení). Nahradil původní WoW lore. **Engine, `id`
identifikátory, mechaniky a balanc zůstávají beze změny** — přejmenovaly se jen
uživatelsky viditelné texty (`name` / `description` / questové narativy).

> Pravidlo: ID v datech (zóny, dungeony, raidy, questy, nepřátelé) jsou
> historicky WoW-odvozená a **nemění se** (refaktor ids = zbytečné migrace).
> Měň jen zobrazované řetězce. Generické D&D tvory (kobold, gnoll, centaur,
> satyr, naga, ogre, ghoul, drak, lich, elemental, demon, treant…) zůstávají.

## Svět

**The Caldmoor Reaches** — pohraniční marky kolem padlého království **Caldmoor**.
Dawnward Order drží linii proti nemrtvé **Pale Legion** na severu; na jihu a v
divočině operují kultisté (Ember Cult, Cinder Cabal, Duskhammer, Duskcabal),
banditi (Ashen Hand) a klany (Greyhorn beastfolk, Kharzul centaur, Galuk ogři).

## Převodní mapa (WoW → homebrew)

Aplikováno skriptem `scripts/lore-rename.py` (jednorázově). Klíčové položky:

### Zóny (id → název)
| id | Caldmoor Reaches |
| -- | ---------------- |
| `northshire` | Dawnhollow Vale |
| `westfall` | Harrowfield |
| `duskwood` | Gloamwood |
| `eastern_plaguelands` | Blighted Marches |
| `durotar` | Emberwaste |
| `barrens` | The Goldgrass Plains |
| `thousand_needles` | Spire Canyons |
| `felwood` | Witherwood |

### Dungeony / raidy (názvy)
Ragefire Chasm→**Emberfire Chasm**, Deadmines→**Drowned Mines**, Wailing
Caverns→**Wailing Hollows**, Shadowfang Keep→**Shadowmaw Keep**, Blackfathom
Deeps→**Drownfathom Deeps**, Scarlet Monastery→**Crimson Cloister**,
Zul'Farrak→**Zarfarai**, Maraudon→**Maradoth**, Blackrock Depths→**Cinderdeep
Halls**, Stratholme→**Pyrehold**. Molten Core→**Cinderforge Depths**, Blackwing
Lair→**Drakefell Spire**, Zul'Gurub→**Zargubai**, Temple of Ahn'Qiraj→**Hollow
Temple of Ankhareth**.

### Bossové (výběr)
Ragnaros→**Ignaroth the Flamelord**, Nefarian→**Nefarius**, Hakkar→**Hazkar**,
C'Thun→**Xathun**, Edwin VanCleef→**Edmund Vance**, Archmage Arugal→**Argol**,
Baron Rivendare→**Baron Ravendere**, Emperor Dagran Thaurissan→**Dagran
Embermane**, High Inquisitor Whitemane→**Palevane**.

### Organizace / frakce (lore, ne herní)
Defias Brotherhood→**Ashen Hand**, Argent Dawn→**Dawnward Order**, Scarlet
Crusade→**Crimson Tribunal**, Scourge→**Pale Legion**, Searing Blade→**Ember
Cult**, Burning Blade→**Cinder Cabal**, Twilight's Hammer→**Duskhammer**, Shadow
Council→**Duskcabal**, Cenarion Circle→**Wildwarden Circle**,
Grimtotem→**Greyhorn**, Kolkar→**Kharzul**, Galak→**Galuk**,
Bristleback→**Thornback**, Dark Iron→**Cinderforge**. Frakce Alliance/Horde byly
odstraněny úplně (viz ROADMAP — předchozí přírůstek).

### Tvorové specifičtí pro WoW
tauren→**beastfolk**, worgen→**lycan**, furbolg→**ursafolk**,
murloc→**marshlurker**, quilboar→**boarkin**. (Trolly: kmeny Sandfury→Dunescale,
Gurubashi→Gurubai, Zandalar→Zalandar.)

### Misc
fel→**blight**, the Light→**the Radiance**, Old God→**Elder Horror**,
Twisting Nether→**Void Between**, Deathwing→**Worldbreaker**, Emerald
Dream/Nightmare→**Verdant Dream/Nightmare**.

> Plnou uspořádanou mapu (vč. menších míst) viz `scripts/lore-rename.py`.
