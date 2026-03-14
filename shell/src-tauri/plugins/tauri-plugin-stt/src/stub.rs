//! Stub STT implementation for platforms without native STT support (Windows, macOS).
//! All methods return "not available" — STT features are Linux-only for now.

use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;

pub struct Stt<R: Runtime> {
    #[allow(dead_code)]
    app: AppHandle<R>,
}

pub fn init<R: Runtime>(
    app: &AppHandle<R>,
    _api: PluginApi<R, ()>,
) -> crate::Result<Stt<R>> {
    Ok(Stt {
        app: app.clone(),
    })
}

impl<R: Runtime> Stt<R> {
    pub fn start_listening(&self, _config: ListenConfig) -> crate::Result<()> {
        Ok(())
    }

    pub fn stop_listening(&self) -> crate::Result<()> {
        Ok(())
    }

    pub fn is_available(&self) -> crate::Result<AvailabilityResponse> {
        Ok(AvailabilityResponse {
            available: false,
            reason: Some("STT is not available on this platform".into()),
        })
    }

    pub fn get_supported_languages(&self) -> crate::Result<SupportedLanguagesResponse> {
        Ok(SupportedLanguagesResponse { languages: vec![] })
    }

    pub fn check_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Denied,
            speech_recognition: PermissionStatus::Denied,
        })
    }

    pub fn request_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Denied,
            speech_recognition: PermissionStatus::Denied,
        })
    }
}
