/**
 * Deklarativní rotace / spell priority (MIL — combat overhaul).
 *
 * Rotace = **seřazený seznam pravidel** `{ ability → podmínka }` uložený na
 * postavě. Combat engine při každém spuštění cooldownu ability vyhodnotí, zda
 * pravidlo dovolí seslání (podmínka nad levným deterministickým stavem actora:
 * HP% cíle, HP% sebe). Tím zůstává boj **plně deterministický a
 * server-authoritative** (lze přehrát ze snapshotu + seedu) a zároveň
 * **konfigurovatelný** (hloubka pro min-max).
 *
 * Návrh klade důraz na bezpečnost: **default = „always" → chování enginu beze
 * změny** oproti dnešku (ability se sešle vždy, když je ready). Hráč může
 * jednotlivé ability vypnout nebo je podmínit (např. „execute" jen pod 30 % HP
 * bosse), aniž by to ohrozilo determinismus.
 */

/** Typ podmínky pravidla rotace. */
export type RotationConditionType =
  | 'always'
  | 'enemy_hp_below'
  | 'enemy_hp_above'
  | 'self_hp_below';

export const ROTATION_CONDITION_TYPES: RotationConditionType[] = [
  'always',
  'enemy_hp_below',
  'enemy_hp_above',
  'self_hp_below',
];

export function isRotationConditionType(value: string): value is RotationConditionType {
  return (ROTATION_CONDITION_TYPES as string[]).includes(value);
}

/** Jedno pravidlo: zda a kdy seslat danou ability. */
export interface RotationRule {
  /** Id ability (== combat tag z talentu, viz `SIGNATURE_ABILITIES`). */
  abilityId: string;
  /** Vypnutá ability se nesešle nikdy (hráč ji „odebral" z rotace). */
  enabled: boolean;
  conditionType: RotationConditionType;
  /** Práh 0..1 pro HP-procentní podmínky (jinak ignorováno). */
  threshold?: number;
}

/** Rotace postavy = uspořádaná pravidla (priorita = pořadí). */
export interface CharacterRotation {
  rules: RotationRule[];
}

/** Levný deterministický stav actora pro vyhodnocení podmínek. */
export interface RotationContext {
  /** HP cíle jako podíl 0..1. */
  enemyHpPct: number;
  /** HP sesílatele jako podíl 0..1. */
  selfHpPct: number;
}

/** Default rotace: každá ability zapnutá s podmínkou `always` (chování beze změny). */
export function defaultRotation(abilityIds: string[]): CharacterRotation {
  return {
    rules: abilityIds.map((abilityId) => ({
      abilityId,
      enabled: true,
      conditionType: 'always' as const,
    })),
  };
}

/** Vyhodnotí jedno pravidlo proti kontextu. Vypnuté pravidlo = nikdy. */
export function evaluateRotationRule(rule: RotationRule, ctx: RotationContext): boolean {
  if (!rule.enabled) return false;
  switch (rule.conditionType) {
    case 'always':
      return true;
    case 'enemy_hp_below':
      return ctx.enemyHpPct <= (rule.threshold ?? 1);
    case 'enemy_hp_above':
      return ctx.enemyHpPct >= (rule.threshold ?? 0);
    case 'self_hp_below':
      return ctx.selfHpPct <= (rule.threshold ?? 1);
    default:
      return true;
  }
}

/**
 * Smí actér seslat danou ability právě teď? Engine to volá, když ability
 * „doběhla" (cooldown ready). Bez rotace nebo bez pravidla pro tuto ability =
 * **true** (default = always) → zpětně kompatibilní chování.
 */
export function shouldCastAbility(
  rotation: CharacterRotation | undefined,
  abilityId: string,
  ctx: RotationContext,
): boolean {
  if (!rotation) return true;
  const rule = rotation.rules.find((r) => r.abilityId === abilityId);
  if (!rule) return true;
  return evaluateRotationRule(rule, ctx);
}

/**
 * Očistí (z nedůvěryhodného vstupu, např. API) rotaci: ponechá jen pravidla pro
 * známé ability, validní typy podmínek a prahy v 0..1. Pořadí zachová a doplní
 * chybějící ability na konec jako default. Jediný zdroj pravdy pro validaci.
 */
export function sanitizeRotation(input: unknown, validAbilityIds: string[]): CharacterRotation {
  const valid = new Set(validAbilityIds);
  const seen = new Set<string>();
  const rules: RotationRule[] = [];

  const rawRules =
    input && typeof input === 'object' && Array.isArray((input as { rules?: unknown }).rules)
      ? ((input as { rules: unknown[] }).rules)
      : [];

  for (const raw of rawRules) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const abilityId = typeof r.abilityId === 'string' ? r.abilityId : '';
    if (!valid.has(abilityId) || seen.has(abilityId)) continue;
    const conditionType =
      typeof r.conditionType === 'string' && isRotationConditionType(r.conditionType)
        ? r.conditionType
        : 'always';
    const rule: RotationRule = {
      abilityId,
      enabled: r.enabled !== false,
      conditionType,
    };
    if (conditionType !== 'always') {
      const t = typeof r.threshold === 'number' && Number.isFinite(r.threshold) ? r.threshold : 0.3;
      rule.threshold = Math.min(1, Math.max(0, t));
    }
    rules.push(rule);
    seen.add(abilityId);
  }

  // Doplň chybějící známé ability (default always) na konec.
  for (const id of validAbilityIds) {
    if (!seen.has(id)) {
      rules.push({ abilityId: id, enabled: true, conditionType: 'always' });
      seen.add(id);
    }
  }

  return { rules };
}
