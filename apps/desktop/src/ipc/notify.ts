import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

/**
 * Notificação nativa do Windows quando um agente encerra.
 *
 * A permissão é pedida na primeira vez; se negada, a função vira no-op silencioso —
 * não vale interromper o fluxo por causa de uma notificação.
 */
export async function notifyAgentExit(nome: string, code: number): Promise<void> {
  try {
    let permitido = await isPermissionGranted();
    if (!permitido) {
      permitido = (await requestPermission()) === 'granted';
    }
    if (!permitido) return;

    sendNotification({
      title: code === 0 ? 'Agente concluído' : 'Agente encerrado',
      body: code === 0 ? `${nome} terminou.` : `${nome} saiu com código ${code}.`,
    });
  } catch (erro) {
    console.warn('falha ao notificar', erro);
  }
}
