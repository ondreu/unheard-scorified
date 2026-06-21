/**
 * Bestiář — in-game encyklopedie nepřátel.
 *
 * Čistá (pure) vrstva nad katalogem nestvůr (`data/enemies.ts`, ADR 0043):
 * - **view typy** pro UI (jeden zdroj pravdy, kontraktní testy),
 * - **odvození odemčení** z dokončeného obsahu (`questTemplateCounts` /
 *   `dungeonTemplateCounts`) — instance v obsahu nesou `templateId`
 *   (`instantiateEnemy`), takže lze spolehlivě spárovat „co jsem porazil"
 *   s katalogovým záznamem,
 * - **labely / grupování** (creature type, CR), aby UI nehardcodovalo nic.
 *
 * Odemčení samotné (kdo co potkal / kolikrát zabil) je per-postava stav v DB —
 * tady jen statická pravidla, ze kterých API počítá kill countery při claimu.
 */
import { CREATURE_TYPES, formatChallengeRating, xpForChallengeRating, type ChallengeRating, type CreatureType, type DamageType } from './data/damage';
import { BESTIARY, BESTIARY_IDS, type EnemyAbility, type EnemyTemplate } from './data/enemies';
import { DUNGEONS } from './data/dungeons';
import { QUESTS, type QuestFoe } from './data/quests';

/** Lidsky čitelný štítek creature typu (UI nehardcoduje). */
export const CREATURE_TYPE_LABEL: Record<CreatureType, string> = {
  aberration: 'Aberration',
  beast: 'Beast',
  celestial: 'Celestial',
  construct: 'Construct',
  dragon: 'Dragon',
  elemental: 'Elemental',
  fey: 'Fey',
  fiend: 'Fiend',
  giant: 'Giant',
  humanoid: 'Humanoid',
  monstrosity: 'Monstrosity',
  ooze: 'Ooze',
  plant: 'Plant',
  undead: 'Undead',
};

/** Ikona creature typu (emoji placeholder — pixel-art rámeček = pozdější polish). */
export const CREATURE_TYPE_ICON: Record<CreatureType, string> = {
  aberration: '👁️',
  beast: '🐺',
  celestial: '😇',
  construct: '🗿',
  dragon: '🐉',
  elemental: '🔥',
  fey: '🧚',
  fiend: '😈',
  giant: '🗻',
  humanoid: '🧍',
  monstrosity: '🦂',
  ooze: '🫧',
  plant: '🌿',
  undead: '💀',
};

/** Shrnutí enemy ability pro UI bestiáře (bez magnitudových čísel). */
export interface BestiaryAbilityView {
  id: string;
  name: string;
  description: string;
  damageType: DamageType;
  cooldownSec: number;
  /** Saving throw atribut (zkratka), pokud ability hází save. */
  saveAbility?: string;
  /** Status efekt, který ability uvalí (stun/prone/…), pokud nějaký. */
  condition?: string;
}

/** Statický stat-block záznamu (z katalogu — nezávislý na postavě). */
export interface BestiaryEntry {
  templateId: string;
  name: string;
  description: string;
  creatureType: CreatureType;
  creatureTypeLabel: string;
  creatureTypeIcon: string;
  /** Challenge Rating (číselně). */
  cr: ChallengeRating;
  /** CR k zobrazení (1/4, 5, …). */
  crLabel: string;
  /** XP za poražení (D&D dle CR). */
  xp: number;
  /** Typ základního útoku. */
  attackType: DamageType;
  resistances: readonly DamageType[];
  vulnerabilities: readonly DamageType[];
  immunities: readonly DamageType[];
  abilities: readonly BestiaryAbilityView[];
  isBoss: boolean;
}

/** Per-postava stav záznamu (objeveno + kolikrát poraženo). */
export interface BestiaryProgress {
  discovered: boolean;
  kills: number;
}

/** Záznam pro UI = statický stat-block + per-postava stav. */
export interface BestiaryEntryView extends BestiaryEntry {
  discovered: boolean;
  kills: number;
}

/** Souhrnný pohled na bestiář postavy. */
export interface BestiaryView {
  entries: BestiaryEntryView[];
  discoveredCount: number;
  totalCount: number;
  totalKills: number;
}

function abilityView(a: EnemyAbility): BestiaryAbilityView {
  return {
    id: a.id,
    name: a.name,
    description: a.description,
    damageType: a.damageType,
    cooldownSec: a.cooldownSec,
    ...(a.save ? { saveAbility: a.save.ability } : {}),
    ...(a.condition ? { condition: a.condition.type } : {}),
  };
}

/** Statický stat-block ze šablony katalogu. */
export function bestiaryEntry(template: EnemyTemplate): BestiaryEntry {
  return {
    templateId: template.id,
    name: template.name,
    description: template.description,
    creatureType: template.creatureType,
    creatureTypeLabel: CREATURE_TYPE_LABEL[template.creatureType],
    creatureTypeIcon: CREATURE_TYPE_ICON[template.creatureType],
    cr: template.cr,
    crLabel: formatChallengeRating(template.cr),
    xp: xpForChallengeRating(template.cr),
    attackType: template.attackType,
    resistances: template.resistances ?? [],
    vulnerabilities: template.vulnerabilities ?? [],
    immunities: template.immunities ?? [],
    abilities: (template.abilities ?? []).map(abilityView),
    isBoss: template.isBoss ?? false,
  };
}

/** Všechny katalogové záznamy (statické stat-blocky), seřazené dle CR pak jména. */
export function allBestiaryEntries(): BestiaryEntry[] {
  return BESTIARY_IDS.map((id) => bestiaryEntry(BESTIARY[id]!)).sort(
    (a, b) => a.cr - b.cr || a.name.localeCompare(b.name),
  );
}

/** Bezpečně přičte výskyt template do mapy (jen existující katalogové id). */
function addTemplate(counts: Record<string, number>, templateId: string | undefined): void {
  if (!templateId || !(templateId in BESTIARY)) return;
  counts[templateId] = (counts[templateId] ?? 0) + 1;
}

function addFoe(counts: Record<string, number>, foe: QuestFoe | undefined): void {
  addTemplate(counts, foe?.template);
}

/**
 * Katalogové šablony (+počty), které daný quest obsahuje — z combat kroků i
 * z poolu náhodných událostí. Quest foe bez `template` (generický) se ignoruje
 * (není v katalogu → není v bestiáři). Slouží k odemčení/kill counteru při claimu.
 */
export function questTemplateCounts(questId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const quest = QUESTS[questId];
  if (!quest) return counts;
  for (const step of quest.steps ?? []) {
    if (step.kind === 'combat') addFoe(counts, step.foe);
  }
  for (const event of quest.events ?? []) addFoe(counts, event.foe);
  return counts;
}

/**
 * Katalogové šablony (+počty výskytů napříč encountery) v daném dungeonu.
 * Instance nesou `templateId` (`instantiateEnemy`), takže clear dungeonu = pro
 * každou šablonu tolik killů, kolik jejích instancí v něm je.
 */
export function dungeonTemplateCounts(dungeonId: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const dungeon = DUNGEONS[dungeonId];
  if (!dungeon) return counts;
  for (const encounter of dungeon.encounters) {
    for (const enemy of encounter.enemies) addTemplate(counts, enemy.templateId);
  }
  return counts;
}

/**
 * Sestaví `BestiaryView` z per-postava progress mapy (templateId → {kills}).
 * Záznam bez progresu = neobjevený (kills 0) — UI ho ukáže zašedlý.
 */
export function buildBestiaryView(progress: Record<string, BestiaryProgress>): BestiaryView {
  const entries = allBestiaryEntries().map<BestiaryEntryView>((entry) => {
    const p = progress[entry.templateId];
    return { ...entry, discovered: p?.discovered ?? false, kills: p?.kills ?? 0 };
  });
  return {
    entries,
    discoveredCount: entries.filter((e) => e.discovered).length,
    totalCount: entries.length,
    totalKills: entries.reduce((sum, e) => sum + e.kills, 0),
  };
}

/** Pořadí creature typů pro grupování v UI. */
export const BESTIARY_CREATURE_ORDER: readonly CreatureType[] = CREATURE_TYPES;
