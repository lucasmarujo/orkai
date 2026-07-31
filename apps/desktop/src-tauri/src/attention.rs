//! Camada de atencao: em que estado esta cada agente.
//!
//! Com mais de dois agentes vivos o custo do humano deixa de ser ler a saida e passa a
//! ser *descobrir qual deles parou esperando por ele*. A deteccao mora aqui, no Rust,
//! porque o front so recebe os bytes dos nos montados — um agente fora da tela
//! (virtualizado) e justamente o que mais precisa avisar.

use std::collections::HashMap;
use std::sync::Mutex;

use orkai_core::NodeId;
use serde::Serialize;

/// Silencio a partir do qual o agente conta como ocioso: terminou o turno.
const OCIOSO_APOS_MS: i64 = 8_000;

/// Cauda de saida guardada por no, em bytes. Um prompt de confirmacao cabe nisto com
/// folga, e o buffer nao pode crescer: sao N agentes vivos ao mesmo tempo.
const CAUDA_MAX: usize = 512;

/// Milissegundos desde a epoch. O snapshot resolve o status contra este relogio.
pub fn agora_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Estado de um agente do ponto de vista de quem supervisiona.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    /// Produzindo saida agora.
    Running,
    /// Parou numa pergunta: espera decisao humana.
    Waiting,
    /// Calado ha um tempo, sem pergunta na tela.
    Idle,
    /// Processo encerrado.
    Exited,
}

/// Estado de um agente, como o front o consome.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAttention {
    pub node_id: String,
    pub status: AgentStatus,
    /// Instante da ultima saida — o front mostra ha quanto tempo esta assim.
    pub since: i64,
}

#[derive(Default)]
struct Estado {
    /// Ultimos bytes emitidos, ja sem ANSI, para procurar a pergunta.
    cauda: String,
    ultimo_ms: i64,
    esperando: bool,
    exit_code: Option<i32>,
}

/// Registro de atencao de todos os agentes vivos.
///
/// `Mutex` simples: escreve no caminho do PTY (algumas vezes por segundo por agente) e
/// le no polling do front (uma vez a cada poucos segundos). Nao e caminho de frame.
#[derive(Default)]
pub struct Attention {
    por_no: Mutex<HashMap<NodeId, Estado>>,
}

impl Attention {
    /// Registra um bloco de saida do PTY de um agente.
    pub fn record_output(&self, id: NodeId, bytes: &[u8], agora: i64) {
        let mut mapa = self.por_no.lock().expect("atencao envenenada");
        let estado = mapa.entry(id).or_default();

        estado
            .cauda
            .push_str(&sem_ansi(&String::from_utf8_lossy(bytes)));
        cortar_inicio(&mut estado.cauda, CAUDA_MAX);
        estado.ultimo_ms = agora;
        estado.esperando = pede_atencao(&estado.cauda);
        estado.exit_code = None;
    }

    pub fn record_exit(&self, id: NodeId, code: i32, agora: i64) {
        let mut mapa = self.por_no.lock().expect("atencao envenenada");
        let estado = mapa.entry(id).or_default();
        estado.exit_code = Some(code);
        estado.esperando = false;
        estado.ultimo_ms = agora;
    }

    /// Descarta o no: deletado do canvas ou processo morto pelo usuario.
    pub fn forget(&self, id: NodeId) {
        self.por_no.lock().expect("atencao envenenada").remove(&id);
    }

    /// Status de cada agente conhecido, resolvido no instante `agora`.
    pub fn snapshot(&self, agora: i64) -> Vec<AgentAttention> {
        let mapa = self.por_no.lock().expect("atencao envenenada");
        mapa.iter()
            .map(|(id, estado)| AgentAttention {
                node_id: id.to_string(),
                status: status_de(estado, agora),
                since: estado.ultimo_ms,
            })
            .collect()
    }
}

fn status_de(estado: &Estado, agora: i64) -> AgentStatus {
    if estado.exit_code.is_some() {
        return AgentStatus::Exited;
    }
    // Esperando vence ocioso: um agente parado numa pergunta tambem esta em silencio, e
    // trata-lo como ocioso esconderia exatamente o caso que motiva esta camada.
    if estado.esperando {
        return AgentStatus::Waiting;
    }
    if agora - estado.ultimo_ms >= OCIOSO_APOS_MS {
        AgentStatus::Idle
    } else {
        AgentStatus::Running
    }
}

/// Corta o comeco da string para caber em `max`, respeitando fronteira de char.
fn cortar_inicio(texto: &mut String, max: usize) {
    if texto.len() <= max {
        return;
    }
    let mut corte = texto.len() - max;
    while corte < texto.len() && !texto.is_char_boundary(corte) {
        corte += 1;
    }
    texto.drain(..corte);
}

/// Remove sequencias de escape ANSI. Sem isso a cor do prompt entra no meio das
/// palavras e nenhum marcador casa.
fn sem_ansi(texto: &str) -> String {
    let mut saida = String::with_capacity(texto.len());
    let mut chars = texto.chars();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            saida.push(c);
            continue;
        }
        // CSI (`\x1b[...X`) e OSC (`\x1b]...BEL`) sao o que aparece na pratica; para os
        // dois basta consumir ate o primeiro terminador plausivel.
        match chars.next() {
            Some('[') => {
                for f in chars.by_ref() {
                    if f.is_ascii_alphabetic() || f == '~' {
                        break;
                    }
                }
            }
            Some(']') => {
                for f in chars.by_ref() {
                    if f == '\u{7}' || f == '\u{1b}' {
                        break;
                    }
                }
            }
            _ => {}
        }
    }
    saida
}

/// A cauda da saida termina pedindo uma decisao humana?
///
/// Heuristica sobre texto, nao contrato: cada CLI pergunta do seu jeito e nenhum expoe
/// "estou esperando" de forma estruturada no modo interativo. Errar para menos (deixar
/// de avisar) e melhor que errar para mais (notificar a cada linha de log), entao os
/// marcadores sao especificos.
pub fn pede_atencao(cauda: &str) -> bool {
    const MARCADORES: [&str; 12] = [
        "(y/n)",
        "[y/n]",
        "(yes/no)",
        "y/n?",
        "(y)es",
        "[a]llow",
        "do you want",
        "would you like",
        "press enter",
        "pressione enter",
        "continue?",
        "continuar?",
    ];

    let texto = cauda.to_lowercase();
    // So a cauda importa: o marcador tem de estar no que esta na tela agora, senao um
    // "do you want" citado no meio de um diff marcaria o agente como esperando para sempre.
    let inicio = texto
        .char_indices()
        .rev()
        .nth(200)
        .map(|(i, _)| i)
        .unwrap_or(0);
    let fim = &texto[inicio..];

    MARCADORES.iter().any(|m| fim.contains(m))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detecta_pergunta_de_confirmacao() {
        assert!(pede_atencao("Do you want to proceed?\n> 1. Yes\n  2. No"));
        assert!(pede_atencao("Overwrite file? (y/n) "));
        assert!(pede_atencao("Apply edit? (Y)es/(N)o/(D)on't ask again"));
        assert!(pede_atencao("Press Enter to continue"));
    }

    #[test]
    fn saida_normal_nao_pede_atencao() {
        assert!(!pede_atencao("Rodando testes...\n34 passed, 0 failed"));
        assert!(!pede_atencao("instalando yarn/npm no projeto"));
        assert!(!pede_atencao(""));
    }

    #[test]
    fn enxerga_a_pergunta_sob_as_cores_do_terminal() {
        let com_ansi = "\u{1b}[1;33mDo you want to proceed?\u{1b}[0m";
        assert!(pede_atencao(&sem_ansi(com_ansi)));
    }

    #[test]
    fn pergunta_antiga_sai_da_janela_quando_a_saida_continua() {
        let antiga = format!("Do you want to proceed?{}", "log de execucao. ".repeat(40));
        assert!(!pede_atencao(&antiga));
    }

    #[test]
    fn cauda_nao_cresce_alem_do_teto() {
        let atencao = Attention::default();
        let id = NodeId::new_v4();
        for _ in 0..50 {
            atencao.record_output(id, &b"x".repeat(100), 1_000);
        }
        let mapa = atencao.por_no.lock().unwrap();
        assert!(mapa[&id].cauda.len() <= CAUDA_MAX);
    }

    #[test]
    fn status_percorre_running_ocioso_e_esperando() {
        let atencao = Attention::default();
        let id = NodeId::new_v4();

        atencao.record_output(id, b"compilando...", 1_000);
        assert_eq!(atencao.snapshot(1_100)[0].status, AgentStatus::Running);
        assert_eq!(
            atencao.snapshot(1_000 + OCIOSO_APOS_MS)[0].status,
            AgentStatus::Idle
        );

        atencao.record_output(id, b"\nApply patch? (y/n) ", 2_000);
        // Esperando continua esperando mesmo depois do tempo de ocioso.
        assert_eq!(
            atencao.snapshot(2_000 + OCIOSO_APOS_MS * 2)[0].status,
            AgentStatus::Waiting
        );
    }

    #[test]
    fn exit_vence_qualquer_outro_estado() {
        let atencao = Attention::default();
        let id = NodeId::new_v4();
        atencao.record_output(id, b"Continue? ", 1_000);
        atencao.record_exit(id, 0, 1_500);
        assert_eq!(atencao.snapshot(1_600)[0].status, AgentStatus::Exited);

        atencao.forget(id);
        assert!(atencao.snapshot(1_600).is_empty());
    }
}
