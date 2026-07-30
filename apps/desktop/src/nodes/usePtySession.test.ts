import { describe, expect, it } from 'vitest';

import { nextFontSize } from './usePtySession';

describe('nextFontSize', () => {
  it('aumenta ao rolar para cima e diminui ao rolar para baixo', () => {
    expect(nextFontSize(13, -100)).toBe(14);
    expect(nextFontSize(13, 100)).toBe(12);
  });

  it('respeita os limites', () => {
    expect(nextFontSize(32, -100)).toBe(32);
    expect(nextFontSize(8, 100)).toBe(8);
  });

  it('nao muda sem rolagem e cai no padrao com valor invalido', () => {
    expect(nextFontSize(13, 0)).toBe(13);
    expect(nextFontSize(NaN, -100)).toBe(13);
  });
});
