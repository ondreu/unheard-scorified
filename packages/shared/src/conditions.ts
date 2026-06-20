/**
 * D&D conditiony / status efekty (Enemy schopnosti, Slice 2a). Čistá vrstva nad
 * dice-roll combatem (MR-5) + saving throwy (ADR 0032): nepřátelská (i hráčská)
 * ability může na **neúspěšný save** uvalit condition, která mění tahy a hody na
 * zásah.
 *
 * Záměrně **mechanické** (ne plný D&D RAW) — modelujeme jen to, co dává smysl v
 * našem idle/tahovém enginu:
 *   - `stunned`    — actér ztrácí svůj tah; útoky proti němu mají advantage.
 *   - `prone`      — disadvantage na vlastní útoky; útoky proti němu advantage.
 *   - `restrained` — disadvantage na vlastní útoky; útoky proti němu advantage.
 *   - `frightened` — disadvantage na vlastní útoky.
 *   - `slowed`     — disadvantage na vlastní útoky; žádná bonus-action.
 *   - `poisoned`   — disadvantage na vlastní útoky (D&D: útoky + ability checky).
 *   - `charmed`    — actér nemůže útočit na zdroj → ztrácí tah (idle model 1v1).
 *   - `blinded`    — disadvantage na vlastní útoky; útoky proti němu advantage.
 *
 * Čistá data + pure helpery (žádný import z `combat.ts` → žádný runtime cyklus;
 * z `dice.ts` jen typ `AdvantageMode`). Engine (`dungeon-run.ts` …) drží stav
 * conditionů na bojových aktérech a používá tyto helpery.
 */
import type { AdvantageMode } from './dice';

/** Druh conditiony (status efektu). */
export type ConditionType =
  | 'stunned'
  | 'prone'
  | 'restrained'
  | 'frightened'
  | 'slowed'
  | 'poisoned'
  | 'charmed'
  | 'blinded';

/** Všechny conditiony (pro validaci/iteraci). */
export const CONDITION_TYPES: readonly ConditionType[] = [
  'stunned',
  'prone',
  'restrained',
  'frightened',
  'slowed',
  'poisoned',
  'charmed',
  'blinded',
];

/**
 * Statický „rider" na ability: jakou condition na **neúspěšný save** uvalit a na
 * kolik tahů. Žije na `SignatureAbility.condition` / `EnemyAbility.condition`.
 */
export interface ConditionRider {
  type: ConditionType;
  /** Doba trvání v tazích postiženého aktéra (≥ 1). */
  durationTurns: number;
}

/** Aktivní condition na konkrétním aktérovi (serializovatelné do JSON run-stavu). */
export interface ActiveCondition {
  type: ConditionType;
  /** Zbývající tahy postiženého (dekrement na začátku jeho tahu, 0 = vyprší). */
  turns: number;
  /** Jméno zdroje (pro combat log). */
  source?: string;
}

/** Mechanické efekty conditionů vyhodnocené na **začátku tahu** postiženého. */
export interface TurnConditionEffects {
  /** Actér nemůže ve svém tahu jednat (stunned). */
  skipTurn: boolean;
  /** Vlastní hody na zásah mají disadvantage (frightened/prone/restrained/slowed). */
  attackDisadvantage: boolean;
  /** Actér nemůže použít bonus-action (slowed). */
  noBonusAction: boolean;
}

/** Mapování typu conditiony → její mechanické flagy. */
function flagsOf(type: ConditionType): {
  skipTurn: boolean;
  attackDisadvantage: boolean;
  incomingAdvantage: boolean;
  noBonusAction: boolean;
} {
  switch (type) {
    case 'stunned':
      return { skipTurn: true, attackDisadvantage: false, incomingAdvantage: true, noBonusAction: true };
    case 'prone':
    case 'restrained':
      return { skipTurn: false, attackDisadvantage: true, incomingAdvantage: true, noBonusAction: false };
    case 'frightened':
    case 'poisoned':
      // Poisoned (D&D): disadvantage na útoky/ability checky — mechanicky jako frightened.
      return { skipTurn: false, attackDisadvantage: true, incomingAdvantage: false, noBonusAction: false };
    case 'slowed':
      return { skipTurn: false, attackDisadvantage: true, incomingAdvantage: false, noBonusAction: true };
    case 'charmed':
      // Charmed: actér nemůže útočit na zdroj → v idle 1v1 ztrácí tah (jako stun,
      // ale BEZ advantage pro útočníka — není bezbranný, jen nechce ublížit).
      return { skipTurn: true, attackDisadvantage: false, incomingAdvantage: false, noBonusAction: true };
    case 'blinded':
      // Blinded (D&D): vlastní útoky disadvantage, útoky proti němu advantage.
      return { skipTurn: false, attackDisadvantage: true, incomingAdvantage: true, noBonusAction: false };
  }
}

/** Aktivní condition daného typu (nebo `undefined`). */
export function hasCondition(conditions: readonly ActiveCondition[] | undefined, type: ConditionType): boolean {
  return (conditions ?? []).some((c) => c.type === type && c.turns > 0);
}

/** Vyhodnotí kumulativní efekty pro tah postiženého aktéra. */
export function turnConditionEffects(
  conditions: readonly ActiveCondition[] | undefined,
): TurnConditionEffects {
  const eff: TurnConditionEffects = { skipTurn: false, attackDisadvantage: false, noBonusAction: false };
  for (const c of conditions ?? []) {
    if (c.turns <= 0) continue;
    const f = flagsOf(c.type);
    if (f.skipTurn) eff.skipTurn = true;
    if (f.attackDisadvantage) eff.attackDisadvantage = true;
    if (f.noBonusAction) eff.noBonusAction = true;
  }
  return eff;
}

/**
 * Má aktér s těmito conditiony udělit útočníkovi advantage (prone/restrained/
 * stunned)? Čte se kdykoli někdo na aktéra útočí (nezávisle na dekrementu).
 */
export function grantsIncomingAdvantage(conditions: readonly ActiveCondition[] | undefined): boolean {
  return (conditions ?? []).some((c) => c.turns > 0 && flagsOf(c.type).incomingAdvantage);
}

/**
 * Sloučí advantage/disadvantage zdroje (D&D: advantage + disadvantage = normal).
 * Jeden+ advantage a žádná disadvantage → 'advantage' a naopak; oboje → 'normal'.
 */
export function combineAdvantage(...modes: (AdvantageMode | undefined)[]): AdvantageMode {
  let adv = false;
  let dis = false;
  for (const m of modes) {
    if (m === 'advantage') adv = true;
    else if (m === 'disadvantage') dis = true;
  }
  if (adv === dis) return 'normal';
  return adv ? 'advantage' : 'disadvantage';
}

/**
 * Uvalí condition na seznam aktivních conditionů (in-place na kopii). Stejný typ
 * se **obnoví na delší dobu** (max ze stávajícího a nového trvání) místo skládání.
 * Vrací nový seznam (volající ho přiřadí mutabilnímu aktérovi).
 */
export function applyCondition(
  conditions: ActiveCondition[] | undefined,
  rider: ConditionRider,
  source?: string,
): ActiveCondition[] {
  const list = conditions ? [...conditions] : [];
  const existing = list.find((c) => c.type === rider.type);
  if (existing) {
    existing.turns = Math.max(existing.turns, rider.durationTurns);
    if (source) existing.source = source;
    return list;
  }
  list.push({ type: rider.type, turns: rider.durationTurns, source });
  return list;
}

/**
 * Dekrement conditionů na začátku tahu postiženého (po vyhodnocení efektů): sníží
 * `turns` o 1 a odfiltruje vypršelé. Vrací nový seznam.
 */
export function tickConditions(conditions: ActiveCondition[] | undefined): ActiveCondition[] {
  return (conditions ?? [])
    .map((c) => ({ ...c, turns: c.turns - 1 }))
    .filter((c) => c.turns > 0);
}

/**
 * Začátek tahu aktéra: vyhodnotí efekty conditionů platné PRO TENTO tah (stun →
 * ztráta tahu, disadvantage na útoky, blok bonus-action) a hned dekrementuje jejich
 * trvání. Conditiony se uvalují během cizích tahů, tikají na začátku vlastního →
 * každá vydrží přesně svůj počet tahů a nově uvalená nezmizí dřív, než se projeví.
 * Mutuje `holder.conditions` (přiřadí nový oříznutý seznam).
 */
export function beginActorTurn(holder: { conditions?: ActiveCondition[] }): TurnConditionEffects {
  const eff = turnConditionEffects(holder.conditions);
  holder.conditions = tickConditions(holder.conditions);
  return eff;
}

/**
 * UI metadata conditiony — ikona + anglický štítek (EN = jazyk hry). Jediný zdroj
 * pravdy pro zobrazení status efektů na kartách aktérů (Slice 2d UI); web jen
 * renderuje, nic si nehardcoduje.
 */
export const CONDITION_META: Record<ConditionType, { icon: string; label: string }> = {
  stunned: { icon: '💫', label: 'Stunned' },
  prone: { icon: '⬇️', label: 'Prone' },
  restrained: { icon: '🕸️', label: 'Restrained' },
  frightened: { icon: '😱', label: 'Frightened' },
  slowed: { icon: '🐌', label: 'Slowed' },
  poisoned: { icon: '🤢', label: 'Poisoned' },
  charmed: { icon: '💗', label: 'Charmed' },
  blinded: { icon: '🌫️', label: 'Blinded' },
};

/** Hláška pro combat log při uvalení conditiony (anglicky = jazyk hry). */
const CONDITION_VERB: Record<ConditionType, string> = {
  stunned: 'is stunned',
  prone: 'is knocked prone',
  restrained: 'is restrained',
  frightened: 'is frightened',
  slowed: 'is slowed',
  poisoned: 'is poisoned',
  charmed: 'is charmed',
  blinded: 'is blinded',
};

/** Combat-log řádek o uvalení conditiony: „Goblin → Hero is stunned (1 turn)!". */
export function conditionAppliedMessage(targetName: string, rider: ConditionRider): string {
  const turns = rider.durationTurns === 1 ? '1 turn' : `${rider.durationTurns} turns`;
  return `💫 ${targetName} ${CONDITION_VERB[rider.type]} (${turns})!`;
}
