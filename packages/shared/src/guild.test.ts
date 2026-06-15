import { describe, expect, it } from 'vitest';
import {
  canInvite,
  canManageMember,
  GUILD_RANKS,
  isValidGuildName,
  rankAtLeast,
} from './guild';

describe('guild: ranks', () => {
  it('rankAtLeast respektuje pořadí', () => {
    expect(rankAtLeast('leader', 'officer')).toBe(true);
    expect(rankAtLeast('officer', 'officer')).toBe(true);
    expect(rankAtLeast('member', 'officer')).toBe(false);
    expect(GUILD_RANKS).toEqual(['member', 'officer', 'leader']);
  });

  it('canManageMember = officer+ a striktně vyšší než target', () => {
    expect(canManageMember('leader', 'member')).toBe(true);
    expect(canManageMember('leader', 'officer')).toBe(true);
    expect(canManageMember('officer', 'member')).toBe(true);
    expect(canManageMember('officer', 'officer')).toBe(false);
    expect(canManageMember('officer', 'leader')).toBe(false);
    expect(canManageMember('member', 'member')).toBe(false);
  });

  it('canInvite vyžaduje officer+', () => {
    expect(canInvite('officer')).toBe(true);
    expect(canInvite('leader')).toBe(true);
    expect(canInvite('member')).toBe(false);
  });
});

describe('guild: name validation', () => {
  it('přijme rozumná jména s mezerami', () => {
    expect(isValidGuildName('Knights')).toBe(true);
    expect(isValidGuildName('Knights of the Realm')).toBe(true);
  });

  it('odmítne příliš krátká/dlouhá a divné znaky', () => {
    expect(isValidGuildName('ab')).toBe(false);
    expect(isValidGuildName('x'.repeat(25))).toBe(false);
    expect(isValidGuildName('Knights123')).toBe(false);
    expect(isValidGuildName(' Knights')).toBe(false);
    expect(isValidGuildName('Knights  Realm')).toBe(false);
  });
});
