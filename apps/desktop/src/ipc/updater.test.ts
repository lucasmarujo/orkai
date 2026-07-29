import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkForUpdate, resetUpdateCheckForTests } from './updater';

// Os plugins do updater só existem dentro do webview do Tauri.
vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn() }));
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }));

const updateFake = () => ({
  version: '0.2.0',
  currentVersion: '0.1.0',
  downloadAndInstall: vi.fn(async () => undefined),
});

describe('checkForUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    resetUpdateCheckForTests();
  });

  it('não incomoda o usuário quando já está na versão mais recente', async () => {
    vi.mocked(check).mockResolvedValueOnce(null);

    await checkForUpdate();

    expect(ask).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('baixa, instala e reinicia quando o usuário aceita', async () => {
    const update = updateFake();
    vi.mocked(check).mockResolvedValueOnce(update as never);
    vi.mocked(ask).mockResolvedValueOnce(true);

    await checkForUpdate();

    expect(update.downloadAndInstall).toHaveBeenCalledOnce();
    expect(relaunch).toHaveBeenCalledOnce();
  });

  it('não instala nada quando o usuário recusa', async () => {
    const update = updateFake();
    vi.mocked(check).mockResolvedValueOnce(update as never);
    vi.mocked(ask).mockResolvedValueOnce(false);

    await checkForUpdate();

    expect(update.downloadAndInstall).not.toHaveBeenCalled();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('segue abrindo o app em silêncio quando a checagem falha', async () => {
    vi.mocked(check).mockRejectedValueOnce(new Error('sem rede'));

    await checkForUpdate();

    expect(ask).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
  });

  it('avisa quando a instalação falha depois do usuário aceitar', async () => {
    const update = updateFake();
    update.downloadAndInstall.mockRejectedValueOnce(new Error('asset corrompido') as never);
    vi.mocked(check).mockResolvedValueOnce(update as never);
    vi.mocked(ask).mockResolvedValueOnce(true);

    await checkForUpdate();

    expect(message).toHaveBeenCalledOnce();
    expect(relaunch).not.toHaveBeenCalled();
  });

  it('checa uma única vez, mesmo com o StrictMode montando o App duas vezes', async () => {
    vi.mocked(check).mockResolvedValue(null);

    await checkForUpdate();
    await checkForUpdate();

    expect(check).toHaveBeenCalledOnce();
  });
});
