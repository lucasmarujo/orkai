use serde::{Deserialize, Serialize};

use crate::{DomainError, Result, Vec2};

/// Estado da camera do canvas. `pan` esta em coordenadas do mundo.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Viewport {
    pub pan: Vec2,
    zoom: f32,
}

impl Viewport {
    pub const MIN_ZOOM: f32 = 0.1;
    pub const MAX_ZOOM: f32 = 4.0;

    pub fn new(pan: Vec2, zoom: f32) -> Result<Self> {
        if !zoom.is_finite() || !(Self::MIN_ZOOM..=Self::MAX_ZOOM).contains(&zoom) {
            return Err(DomainError::InvalidZoom(zoom));
        }
        Ok(Self { pan, zoom })
    }

    pub fn zoom(&self) -> f32 {
        self.zoom
    }

    /// Aplica zoom limitando ao intervalo valido em vez de falhar: a roda do mouse
    /// passa dos limites o tempo todo e isso nao e um erro do usuario.
    pub fn with_zoom_clamped(self, zoom: f32) -> Self {
        let zoom = if zoom.is_finite() {
            zoom.clamp(Self::MIN_ZOOM, Self::MAX_ZOOM)
        } else {
            self.zoom
        };
        Self { zoom, ..self }
    }
}

impl Default for Viewport {
    fn default() -> Self {
        Self {
            pan: Vec2::ZERO,
            zoom: 1.0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejeita_zoom_fora_do_intervalo_ou_nao_finito() {
        assert_eq!(
            Viewport::new(Vec2::ZERO, 0.0),
            Err(DomainError::InvalidZoom(0.0))
        );
        assert!(Viewport::new(Vec2::ZERO, f32::NAN).is_err());
        assert!(Viewport::new(Vec2::ZERO, 10.0).is_err());
        assert!(Viewport::new(Vec2::ZERO, 1.0).is_ok());
    }

    #[test]
    fn clamp_limita_em_vez_de_falhar_e_ignora_nan() {
        let v = Viewport::default();
        assert_eq!(v.with_zoom_clamped(99.0).zoom(), Viewport::MAX_ZOOM);
        assert_eq!(v.with_zoom_clamped(0.0001).zoom(), Viewport::MIN_ZOOM);
        assert_eq!(v.with_zoom_clamped(f32::NAN).zoom(), 1.0);
    }

    #[test]
    fn faz_round_trip_json() {
        let v = Viewport::new(Vec2::new(120.0, -80.0).unwrap(), 2.5).unwrap();
        let json = serde_json::to_string(&v).unwrap();
        assert_eq!(v, serde_json::from_str::<Viewport>(&json).unwrap());
    }
}
