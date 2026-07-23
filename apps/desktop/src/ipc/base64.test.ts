import { describe, expect, it } from 'vitest';

import { decodeBase64, encodeBase64, encodeTextBase64 } from './base64';

describe('base64', () => {
  it('faz round-trip de bytes arbitrarios', () => {
    const bytes = new Uint8Array([0, 27, 91, 255, 128, 10]);
    expect(Array.from(decodeBase64(encodeBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('preserva UTF-8 multibyte', () => {
    const texto = 'ação — 🚀';
    const voltou = new TextDecoder().decode(decodeBase64(encodeTextBase64(texto)));
    expect(voltou).toBe(texto);
  });

  it('lida com entrada vazia', () => {
    expect(decodeBase64(encodeBase64(new Uint8Array())).length).toBe(0);
  });
});
