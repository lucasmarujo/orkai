import { ask, message } from '@tauri-apps/plugin-dialog';
import { relaunch } from '@tauri-apps/plugin-process';
import { check } from '@tauri-apps/plugin-updater';

// O StrictMode monta o App duas vezes em dev; sem isso o usuário veria dois diálogos.
let jaChecou = false;

/**
 * Checagem de atualização no boot.
 *
 * Já está na versão mais recente (ou a checagem falhou, ex. offline) → não faz nada e o
 * app segue abrindo normalmente. Existe versão nova → pergunta ao usuário; se ele aceitar,
 * o instalador é baixado e executado pelo próprio app e o Orkai reinicia já atualizado.
 */
export async function checkForUpdate(): Promise<void> {
  if (jaChecou) return;
  jaChecou = true;

  let update;
  try {
    update = await check();
  } catch (erro) {
    // Sem rede ou endpoint fora do ar: abrir o app importa mais que atualizar.
    console.warn('falha ao checar atualização', erro);
    return;
  }
  if (!update) return;

  const aceitou = await ask(
    `A versão ${update.version} está disponível — você está na ${update.currentVersion}.\n\n` +
      'Atualizar agora? O Orkai reinicia ao terminar.',
    {
      title: 'Atualização disponível',
      kind: 'info',
      okLabel: 'Atualizar agora',
      cancelLabel: 'Depois',
    },
  );
  if (!aceitou) return;

  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (erro) {
    // Aqui o usuário pediu a atualização: falhar calado o deixaria esperando sem resposta.
    await message(`Não foi possível atualizar: ${erro}`, {
      title: 'Falha na atualização',
      kind: 'error',
    });
  }
}

/** Só para os testes: o guard de execução única é estado de módulo. */
export function resetUpdateCheckForTests(): void {
  jaChecou = false;
}
