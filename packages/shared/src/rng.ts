/**
 * Deterministický, seedovatelný RNG (mulberry32).
 *
 * Veškerá herní náhoda (loot, combat) MUSÍ jít přes seedovaný RNG,
 * aby šel výsledek reprodukovat a validovat na serveru (anti-cheat,
 * konzistence FE/BE). Nikdy nepoužívat Math.random() v herní logice.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    // Zajistí 32-bit unsigned počáteční stav.
    this.state = seed >>> 0;
  }

  /** Další float v intervalu [0, 1). */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Celé číslo v intervalu [min, max] včetně. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True s pravděpodobností `p` (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Deterministicky odvodí 32-bit seed z libovolného řetězce (FNV-1a). */
export function seedFromString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
