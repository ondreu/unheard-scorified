import { describe, expect, it } from 'vitest';
import {
  applyMountSpeed,
  isMountId,
  MOUNTS,
  MOUNT_LIST,
  MOUNT_TIER_SPEED,
  mountSpeedBonus,
} from './mounts';

describe('mounts data', () => {
  it('každý tier má konzistentní speed/level/cost', () => {
    for (const m of MOUNT_LIST) {
      expect(m.speedBonus).toBe(MOUNT_TIER_SPEED[m.tier]);
      expect(m.requiredLevel).toBeGreaterThan(0);
      expect(m.cost).toBeGreaterThan(0);
    }
  });

  it('epic je dražší, rychlejší a od vyššího levelu než basic', () => {
    expect(MOUNT_TIER_SPEED.epic).toBeGreaterThan(MOUNT_TIER_SPEED.basic);
    expect(MOUNTS.swift_palomino!.cost).toBeGreaterThan(MOUNTS.brown_horse!.cost);
    expect(MOUNTS.swift_palomino!.requiredLevel).toBeGreaterThan(MOUNTS.brown_horse!.requiredLevel);
  });

  it('kosmetické varianty téhož tieru sdílejí bonus (skin ≠ power)', () => {
    expect(MOUNTS.brown_horse!.speedBonus).toBe(MOUNTS.dire_wolf!.speedBonus);
    expect(MOUNTS.swift_palomino!.speedBonus).toBe(MOUNTS.ebon_gryphon!.speedBonus);
  });

  it('isMountId rozpozná známé id', () => {
    expect(isMountId('brown_horse')).toBe(true);
    expect(isMountId('nonexistent')).toBe(false);
  });
});

describe('mountSpeedBonus', () => {
  it('bez mountu = 0', () => {
    expect(mountSpeedBonus([])).toBe(0);
  });

  it('vrací nejlepší bonus z vlastněných (nezávisle na pořadí)', () => {
    expect(mountSpeedBonus(['brown_horse'])).toBe(MOUNT_TIER_SPEED.basic);
    expect(mountSpeedBonus(['brown_horse', 'swift_palomino'])).toBe(MOUNT_TIER_SPEED.epic);
    expect(mountSpeedBonus(['swift_palomino', 'brown_horse'])).toBe(MOUNT_TIER_SPEED.epic);
  });

  it('ignoruje neznámá id', () => {
    expect(mountSpeedBonus(['bogus'])).toBe(0);
  });
});

describe('applyMountSpeed', () => {
  it('bez bonusu nemění trvání', () => {
    expect(applyMountSpeed(1000, 0)).toBe(1000);
  });

  it('zkrátí trvání o bonus a zaokrouhlí', () => {
    expect(applyMountSpeed(1000, 0.3)).toBe(700);
    expect(applyMountSpeed(1000, 0.5)).toBe(500);
  });

  it('nikdy nejde pod 1 s', () => {
    expect(applyMountSpeed(1, 0.99)).toBe(1);
  });
});
