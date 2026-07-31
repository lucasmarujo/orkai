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
  await notificar(
    code === 0 ? 'Agente concluído' : 'Agente encerrado',
    code === 0 ? `${nome} terminou.` : `${nome} saiu com código ${code}.`,
  );
}

/**
 * Aviso de que um agente parou numa pergunta.
 *
 * É a notificação que justifica a camada de atenção: o agente encerrado o usuário
 * descobre cedo ou tarde, o agente parado esperando um "sim" fica parado para sempre.
 */
export async function notifyAgentWaiting(nome: string): Promise<void> {
  await notificar('Agente esperando você', `${nome} parou numa pergunta.`);
}

async function notificar(title: string, body: string): Promise<void> {
  try {
    let permitido = await isPermissionGranted();
    if (!permitido) {
      permitido = (await requestPermission()) === 'granted';
    }
    if (!permitido) return;

    sendNotification({ title, body });
  } catch (erro) {
    console.warn('falha ao notificar', erro);
  }
}
