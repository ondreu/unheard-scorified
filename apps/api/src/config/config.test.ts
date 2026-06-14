import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from './config';

describe('loadConfig', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('má rozumné defaulty', () => {
    delete process.env.PORT;
    const cfg = loadConfig();
    expect(cfg.port).toBe(3000);
    expect(cfg.databaseUrl).toContain('postgres://');
    expect(cfg.redisUrl).toContain('redis://');
  });

  it('čte PORT z prostředí', () => {
    process.env.PORT = '4567';
    expect(loadConfig().port).toBe(4567);
  });
});
