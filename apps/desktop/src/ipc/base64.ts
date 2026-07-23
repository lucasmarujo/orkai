/**
 * Os bytes do PTY trafegam em base64: um bloco pode cortar um caractere UTF-8 ao
 * meio, e converter para string na fronteira corromperia acentos e emoji.
 */

export function decodeBase64(value: string): Uint8Array {
  const binario = atob(value);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i);
  }
  return bytes;
}

export function encodeBase64(bytes: Uint8Array): string {
  let binario = '';
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function encodeTextBase64(text: string): string {
  return encodeBase64(new TextEncoder().encode(text));
}
