use thiserror::Error;

pub type Result<T> = std::result::Result<T, DomainError>;

#[derive(Debug, Error, PartialEq)]
pub enum DomainError {
    #[error("zoom invalido: {0} (esperado finito, entre {min} e {max})", min = crate::Viewport::MIN_ZOOM, max = crate::Viewport::MAX_ZOOM)]
    InvalidZoom(f32),

    #[error("coordenada invalida: {0}")]
    InvalidCoordinate(f32),

    #[error("dimensao invalida: {width}x{height}")]
    InvalidSize { width: f32, height: f32 },

    #[error("no nao encontrado: {0}")]
    NodeNotFound(String),

    #[error("conexao nao encontrada: {0}")]
    ConnectionNotFound(String),
}
