use std::collections::VecDeque;

/// Buffer circular do output do terminal.
///
/// Existe para o canvas poder desmontar o `xterm.js` de um no fora da tela sem
/// perder o historico: ao remontar, o front recarrega daqui.
#[derive(Debug)]
pub struct Scrollback {
    buffer: VecDeque<u8>,
    capacity: usize,
}

impl Scrollback {
    pub const DEFAULT_CAPACITY: usize = 256 * 1024;

    pub fn new(capacity: usize) -> Self {
        Self {
            buffer: VecDeque::with_capacity(capacity.min(64 * 1024)),
            capacity,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) {
        // Bloco maior que o buffer: so a cauda cabe, descarta o resto de uma vez.
        let bytes = if bytes.len() > self.capacity {
            &bytes[bytes.len() - self.capacity..]
        } else {
            bytes
        };

        let excedente = (self.buffer.len() + bytes.len()).saturating_sub(self.capacity);
        self.buffer.drain(..excedente);
        self.buffer.extend(bytes);
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.buffer.iter().copied().collect()
    }

    pub fn len(&self) -> usize {
        self.buffer.len()
    }

    pub fn is_empty(&self) -> bool {
        self.buffer.is_empty()
    }
}

impl Default for Scrollback {
    fn default() -> Self {
        Self::new(Self::DEFAULT_CAPACITY)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acumula_enquanto_cabe() {
        let mut s = Scrollback::new(10);
        s.push(b"abc");
        s.push(b"de");
        assert_eq!(s.snapshot(), b"abcde");
    }

    #[test]
    fn descarta_o_inicio_ao_estourar_a_capacidade() {
        let mut s = Scrollback::new(5);
        s.push(b"abcde");
        s.push(b"fg");
        assert_eq!(s.snapshot(), b"cdefg");
        assert_eq!(s.len(), 5);
    }

    #[test]
    fn bloco_maior_que_a_capacidade_guarda_so_a_cauda() {
        let mut s = Scrollback::new(4);
        s.push(b"0123456789");
        assert_eq!(s.snapshot(), b"6789");
    }

    #[test]
    fn nasce_vazio() {
        assert!(Scrollback::default().is_empty());
    }
}
