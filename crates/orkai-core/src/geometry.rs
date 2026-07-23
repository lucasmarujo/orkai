use serde::{Deserialize, Serialize};

use crate::{DomainError, Result};

/// Ponto ou deslocamento no espaco do mundo (nao em pixels de tela).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Vec2 {
    pub x: f32,
    pub y: f32,
}

impl Vec2 {
    pub const ZERO: Self = Self { x: 0.0, y: 0.0 };

    pub fn new(x: f32, y: f32) -> Result<Self> {
        if !x.is_finite() {
            return Err(DomainError::InvalidCoordinate(x));
        }
        if !y.is_finite() {
            return Err(DomainError::InvalidCoordinate(y));
        }
        Ok(Self { x, y })
    }
}

impl Default for Vec2 {
    fn default() -> Self {
        Self::ZERO
    }
}

/// Dimensoes de um no no espaco do mundo.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Size {
    pub width: f32,
    pub height: f32,
}

impl Size {
    pub const MIN_SIDE: f32 = 80.0;

    pub fn new(width: f32, height: f32) -> Result<Self> {
        if !width.is_finite()
            || !height.is_finite()
            || width < Self::MIN_SIDE
            || height < Self::MIN_SIDE
        {
            return Err(DomainError::InvalidSize { width, height });
        }
        Ok(Self { width, height })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vec2_rejeita_nao_finitos() {
        assert!(Vec2::new(f32::NAN, 0.0).is_err());
        assert!(Vec2::new(0.0, f32::INFINITY).is_err());
        assert!(Vec2::new(-1_000.0, 42.5).is_ok());
    }

    #[test]
    fn size_rejeita_menor_que_minimo_e_nao_finitos() {
        assert!(Size::new(10.0, 500.0).is_err());
        assert!(Size::new(f32::NAN, 500.0).is_err());
        assert!(Size::new(Size::MIN_SIDE, Size::MIN_SIDE).is_ok());
    }

    #[test]
    fn geometria_faz_round_trip_json() {
        let v = Vec2::new(1.5, -2.5).unwrap();
        assert_eq!(
            v,
            serde_json::from_str(&serde_json::to_string(&v).unwrap()).unwrap()
        );

        let s = Size::new(320.0, 240.0).unwrap();
        assert_eq!(
            s,
            serde_json::from_str(&serde_json::to_string(&s).unwrap()).unwrap()
        );
    }
}
