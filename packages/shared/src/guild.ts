/**
 * Guild (M9 social). Sdílené typy, konstanty a čisté helpery (jediný zdroj
 * pravdy pro API i web). Guild je **per-postava** (stejně jako friends) — drží
 * konzistenci s character-centric architekturou a odemyká ruční formace
 * (M8.5-B raid lobby, M8.5-C týmové arény).
 *
 * UI strings drž odděleně od logiky (i18n-ready).
 */

/** Ranky v guildě (od nejnižšího). */
export const GUILD_RANKS = ['member', 'officer', 'leader'] as const;
export type GuildRank = (typeof GUILD_RANKS)[number];

const RANK_ORDER: Record<GuildRank, number> = { member: 0, officer: 1, leader: 2 };

/** True, pokud `rank` je alespoň `min`. */
export function rankAtLeast(rank: GuildRank, min: GuildRank): boolean {
  return RANK_ORDER[rank] >= RANK_ORDER[min];
}

/**
 * Smí `actor` spravovat (kick/promote/demote) člena s rankem `target`?
 * Pravidlo: actor musí být officer+ a mít **striktně vyšší** rank než target
 * (officer nesmí na officera ani leadera; leader na kohokoli pod sebou).
 */
export function canManageMember(actor: GuildRank, target: GuildRank): boolean {
  return rankAtLeast(actor, 'officer') && RANK_ORDER[actor] > RANK_ORDER[target];
}

/** Smí `actor` zvát nové členy? (officer+). */
export function canInvite(actor: GuildRank): boolean {
  return rankAtLeast(actor, 'officer');
}

export const MAX_GUILD_MEMBERS = 50;

/** Pravidla pro jméno guildy: 3–24 znaků, písmena + jednoduché mezery uvnitř. */
export const GUILD_NAME = {
  minLength: 3,
  maxLength: 24,
  pattern: /^[A-Za-zÀ-ÿ]+(?: [A-Za-zÀ-ÿ]+)*$/,
} as const;

export function isValidGuildName(name: string): boolean {
  return (
    name.length >= GUILD_NAME.minLength &&
    name.length <= GUILD_NAME.maxLength &&
    GUILD_NAME.pattern.test(name)
  );
}

/**
 * Guild charter (vanilla-WoW styl založení): místo okamžitého vytvoření musí
 * zakladatel zaplatit **zlatý poplatek** a získat **podpisy** od dalších hráčů.
 * Teprve s dostatkem podpisů lze guildu založit. Hodnoty = laditelné konstanty
 * (jediný zdroj pravdy pro API i web).
 */
export const GUILD_CHARTER_COST = 1000;

/** Počet podpisů (od jiných postav) nutných k založení guildy. */
export const GUILD_CHARTER_SIGNATURES_REQUIRED = 5;

/** True, pokud charter posbíral dost podpisů na založení guildy. */
export function canFoundGuild(signedSignatures: number): boolean {
  return signedSignatures >= GUILD_CHARTER_SIGNATURES_REQUIRED;
}
