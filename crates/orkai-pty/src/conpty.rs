use std::io::Read;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder};

use crate::{
    PtyBackend, PtyError, PtyEvent, PtyEventSink, PtySession, PtySpec, Result, Scrollback,
};

/// Tamanho de leitura. Blocos grandes reduzem eventos IPC em saidas volumosas
/// (`cargo build`, `btop`) sem atrasar perceptivelmente o eco de digitacao.
const READ_BUFFER: usize = 8 * 1024;

/// Shell padrao do Windows: `pwsh` quando instalado, senao `powershell.exe`.
pub fn default_shell() -> String {
    if which("pwsh.exe") {
        "pwsh.exe".to_string()
    } else {
        "powershell.exe".to_string()
    }
}

fn which(binario: &str) -> bool {
    std::env::var_os("PATH")
        .map(|path| std::env::split_paths(&path).any(|dir| dir.join(binario).is_file()))
        .unwrap_or(false)
}

/// Backend nativo do sistema. No Windows, `portable-pty` usa ConPTY.
#[derive(Debug, Default)]
pub struct ConPtyBackend;

/// Intervalo de checagem do processo filho. Ver a nota sobre EOF em [`ConPtyBackend::spawn`].
const WAIT_POLL: std::time::Duration = std::time::Duration::from_millis(50);

impl PtyBackend for ConPtyBackend {
    fn spawn(&self, spec: PtySpec, on_event: PtyEventSink) -> Result<PtySession> {
        let pair = native_pty_system()
            .openpty(spec.pty_size())
            .map_err(PtyError::Open)?;

        // Resolve pelo PATHEXT: CLIs instalados por npm so tem `.cmd` no Windows, e o
        // arquivo sem extensao e um script bash que o CreateProcessW recusa (os error 193).
        // Sem resolucao, cai no default e deixa o proprio SO reportar o erro.
        let (programa, args) = match crate::program::resolve(&spec.shell) {
            Some(p) => p.command_line(&spec.args),
            None => (spec.shell.clone(), spec.args.clone()),
        };

        let mut cmd = CommandBuilder::new(&programa);
        cmd.args(&args);
        cmd.cwd(&spec.cwd);

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|source| PtyError::Spawn {
                command: spec.shell.clone(),
                source,
            })?;
        // O slave precisa ser fechado aqui, senao o leitor nunca ve EOF.
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader().map_err(PtyError::Open)?;
        let writer = pair.master.take_writer().map_err(PtyError::Open)?;

        // Pre-carrega o historico antes de a thread de leitura comecar: sem race, o
        // seed sempre precede o primeiro byte do processo.
        let mut scrollback = Scrollback::default();
        if !spec.seed.is_empty() {
            scrollback.push(&spec.seed);
        }
        let scrollback = Arc::new(Mutex::new(scrollback));
        let child = Arc::new(Mutex::new(child));

        // Thread de leitura. Termina quando a PtySession e derrubada e o master fecha.
        let scrollback_leitor = Arc::clone(&scrollback);
        let sink_leitor = Arc::clone(&on_event);
        std::thread::spawn(move || {
            let mut buf = vec![0u8; READ_BUFFER];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        scrollback_leitor
                            .lock()
                            .expect("scrollback envenenado")
                            .push(&buf[..n]);
                        sink_leitor(PtyEvent::Data(buf[..n].to_vec()));
                    }
                    Err(erro) => {
                        tracing::debug!(%erro, "leitura do pty encerrada");
                        break;
                    }
                }
            }
        });

        // Thread de espera, separada da leitura: o ConPTY mantem o pipe aberto enquanto
        // seguramos o master, entao EOF nunca chega e nao serve para detectar a saida.
        // ponytail: poll de 50ms em vez de `wait()` bloqueante, que seguraria o mutex
        // e travaria o `kill()`.
        let child_espera = Arc::clone(&child);
        std::thread::spawn(move || loop {
            let status = child_espera.lock().expect("child envenenado").try_wait();
            match status {
                Ok(Some(status)) => {
                    // Carencia para a thread de leitura drenar o ultimo bloco: sem isto o
                    // "processo encerrado" pode aparecer antes da ultima linha do comando.
                    std::thread::sleep(WAIT_POLL);
                    on_event(PtyEvent::Exit {
                        code: status.exit_code() as i32,
                    });
                    break;
                }
                Ok(None) => std::thread::sleep(WAIT_POLL),
                Err(erro) => {
                    tracing::debug!(%erro, "falha ao consultar o processo do terminal");
                    on_event(PtyEvent::Exit { code: -1 });
                    break;
                }
            }
        });

        Ok(PtySession {
            master: pair.master,
            writer: Mutex::new(writer),
            child,
            scrollback,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;

    /// Consulta de posicao do cursor (DSR) que o ConPTY envia ao iniciar. Ele bloqueia
    /// ate ser respondido; no app quem responde e o xterm.js, aqui o teste faz o papel.
    const DSR: &[u8] = b"\x1b[6n";

    /// Executa um comando ate a saida e devolve todo o output capturado.
    fn rodar(args: &[&str]) -> (String, i32) {
        let (tx, rx) = mpsc::channel();
        let spec = PtySpec::new("cmd.exe", ".")
            .with_args(args.iter().map(|a| a.to_string()).collect())
            .with_size(80, 24);

        let sessao = ConPtyBackend
            .spawn(
                spec,
                Arc::new(move |evento| {
                    let _ = tx.send(evento);
                }),
            )
            .expect("spawn deve funcionar");

        let mut saida = Vec::new();
        let mut code = -1;
        while let Ok(evento) = rx.recv_timeout(Duration::from_secs(20)) {
            match evento {
                PtyEvent::Data(bytes) => {
                    if bytes.windows(DSR.len()).any(|j| j == DSR) {
                        sessao.write(b"\x1b[1;1R").expect("responder DSR");
                    }
                    saida.extend_from_slice(&bytes);
                }
                PtyEvent::Exit { code: c } => {
                    code = c;
                    break;
                }
            }
        }

        let texto = String::from_utf8_lossy(&saida).into_owned();
        assert_eq!(
            sessao.scrollback(),
            saida,
            "scrollback deve espelhar o output"
        );
        (texto, code)
    }

    #[test]
    fn executa_comando_e_captura_o_output() {
        let (saida, code) = rodar(&["/c", "echo orkai"]);
        assert!(saida.contains("orkai"), "output inesperado: {saida:?}");
        assert_eq!(code, 0);
    }

    #[test]
    fn propaga_o_codigo_de_saida_do_processo() {
        let (_, code) = rodar(&["/c", "exit 3"]);
        assert_eq!(code, 3);
    }

    #[test]
    fn falha_ao_iniciar_binario_inexistente() {
        let spec = PtySpec::new("orkai-binario-que-nao-existe.exe", ".");
        // `matches!` em vez de `unwrap_err`: PtySession envolve trait objects e nao e Debug.
        let resultado = ConPtyBackend.spawn(spec, Arc::new(|_| {}));
        assert!(matches!(resultado, Err(PtyError::Spawn { .. })));
    }

    #[test]
    fn resize_aceita_zero_sem_quebrar() {
        let spec = PtySpec::new("cmd.exe", ".").with_args(vec!["/c".into(), "pause".into()]);
        let sessao = ConPtyBackend.spawn(spec, Arc::new(|_| {})).unwrap();
        sessao.resize(0, 0).expect("resize deve normalizar zero");
    }
}
