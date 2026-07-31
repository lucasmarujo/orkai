//! Entrega automatica: avisa o agente ocioso de que ha recado esperando na caixa.
//!
//! O `orkai_send` so enfileira; sem isto o destinatario nunca saberia que tem mensagem,
//! porque nada o faz chamar `orkai_inbox` — e o fluxo parava esperando um humano digitar
//! "leia sua caixa". Aqui uma varredura periodica fecha esse laco: quem tem mensagem
//! parada e acabou de encerrar o turno recebe o gatilho no proprio processo.
//!
//! O aviso e so o gatilho, nao o conteudo: a mensagem continua na caixa, lida pelo
//! `orkai_inbox`. Assim existe um caminho unico de entrega, e um texto longo nao entra
//! empurrado no meio do TUI do agente.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use orkai_core::NodeId;
use orkai_mcp::AgentBus;
use orkai_pty::PtyRegistry;

use crate::attention::{agora_ms, AgentStatus, Attention};

/// Intervalo entre varreduras. Mesma cadencia do polling de atencao do front: e o atraso
/// que o humano ja aceita para ver uma mudanca de estado.
const INTERVALO: Duration = Duration::from_millis(2000);

/// Piso entre dois avisos ao mesmo agente. Quem ignorou o primeiro nao melhora com dez, e
/// repetir a cada volta viraria ruido no meio do trabalho dele.
const REAVISO_MS: i64 = 30_000;

/// Sobe a varredura numa tarefa propria, viva enquanto o app estiver aberto.
pub fn start(bus: Arc<AgentBus>, attention: Arc<Attention>, ptys: Arc<PtyRegistry>) {
    tauri::async_runtime::spawn(async move {
        let mut ultimos: HashMap<NodeId, i64> = HashMap::new();

        loop {
            tokio::time::sleep(INTERVALO).await;
            let agora = agora_ms();

            for id in bus.pending_nodes() {
                if !deve_avisar(
                    attention.state_of(id, agora),
                    ultimos.get(&id).copied(),
                    agora,
                ) {
                    continue;
                }
                let aviso = aviso(bus.pending(id));
                match ptys.with(id, |sessao| sessao.write(aviso.as_bytes())) {
                    Ok(()) => {
                        ultimos.insert(id, agora);
                    }
                    // Sem sessao viva nao ha para onde empurrar; a mensagem espera na
                    // caixa e o agente a le quando for reaberto.
                    Err(erro) => tracing::debug!(%erro, %id, "agente sem processo para avisar"),
                }
            }

            // Nao guarda o aviso de um no que ja saiu do canvas.
            ultimos.retain(|id, _| ptys.contains(*id));
        }
    });
}

/// O agente deve ser avisado agora?
///
/// So quando esta ocioso: cutucar quem esta no meio de um turno atrapalha a saida, e
/// quem parou numa pergunta responderia a pergunta com o texto do aviso. Ocioso e
/// justamente o sinal de "terminou o que estava fazendo".
fn deve_avisar(estado: Option<AgentStatus>, ultimo_aviso: Option<i64>, agora: i64) -> bool {
    if estado != Some(AgentStatus::Idle) {
        return false;
    }
    match ultimo_aviso {
        None => true,
        Some(ultimo) => agora - ultimo >= REAVISO_MS,
    }
}

/// O texto empurrado no processo do agente, submetido como um prompt (o `\r`).
fn aviso(pendentes: usize) -> String {
    format!(
        "[orkai] Voce tem {pendentes} mensagem(ns) na caixa. Use a tool orkai_inbox para ler e continuar.\r"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn avisa_o_agente_ocioso_que_ainda_nao_foi_avisado() {
        assert!(deve_avisar(Some(AgentStatus::Idle), None, 10_000));
    }

    #[test]
    fn nao_avisa_quem_esta_no_meio_do_trabalho() {
        for estado in [
            Some(AgentStatus::Running),
            Some(AgentStatus::Waiting),
            Some(AgentStatus::Exited),
            None,
        ] {
            assert!(!deve_avisar(estado, None, 10_000), "{estado:?}");
        }
    }

    #[test]
    fn nao_repete_o_aviso_antes_do_piso() {
        let agora = 100_000;
        assert!(!deve_avisar(
            Some(AgentStatus::Idle),
            Some(agora - REAVISO_MS + 1),
            agora
        ));
        assert!(deve_avisar(
            Some(AgentStatus::Idle),
            Some(agora - REAVISO_MS),
            agora
        ));
    }

    #[test]
    fn o_aviso_manda_ler_a_caixa_e_submete_o_prompt() {
        let texto = aviso(3);
        assert!(texto.contains("3 mensagem(ns)"));
        assert!(texto.contains("orkai_inbox"), "diz qual tool chamar");
        assert!(texto.ends_with('\r'), "submete em vez de so digitar");
    }
}
