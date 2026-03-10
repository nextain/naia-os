use log::{debug, info, warn};
use serde::de::DeserializeOwned;
use std::fs::{self, File};
use std::io::{self, Cursor};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{plugin::PluginApi, AppHandle, Emitter, Manager, Runtime};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use vosk::{Model, Recognizer};

use crate::models::*;

/// Default Vosk model configuration (small model for fast download)
const DEFAULT_MODEL_NAME: &str = "vosk-model-small-en-us-0.15";
const DEFAULT_MODEL_URL: &str =
    "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";

/// Available Vosk small models — on-demand download (~40-50 MB each)
/// Prioritizes small models for fast first-use experience.
/// See https://alphacephei.com/vosk/models for full list.
const AVAILABLE_MODELS: &[(&str, &str, &str)] = &[
    (
        "ko-KR",
        "vosk-model-small-ko-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-ko-0.22.zip",
    ),
    (
        "en-US",
        "vosk-model-small-en-us-0.15",
        "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
    ),
    (
        "zh-CN",
        "vosk-model-small-cn-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip",
    ),
    (
        "ja-JP",
        "vosk-model-small-ja-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-ja-0.22.zip",
    ),
    (
        "es-ES",
        "vosk-model-small-es-0.42",
        "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip",
    ),
    (
        "fr-FR",
        "vosk-model-small-fr-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip",
    ),
    (
        "de-DE",
        "vosk-model-small-de-0.15",
        "https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip",
    ),
    (
        "ru-RU",
        "vosk-model-small-ru-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip",
    ),
    (
        "pt-BR",
        "vosk-model-small-pt-0.3",
        "https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip",
    ),
    (
        "it-IT",
        "vosk-model-small-it-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-it-0.22.zip",
    ),
    (
        "vi-VN",
        "vosk-model-small-vn-0.4",
        "https://alphacephei.com/vosk/models/vosk-model-small-vn-0.4.zip",
    ),
    (
        "hi-IN",
        "vosk-model-small-hi-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-small-hi-0.22.zip",
    ),
];

use std::sync::atomic::{AtomicU64, Ordering};

/// Session counter - incremented each time a new listening session starts.
/// Audio callbacks capture their session ID and only process audio if it matches
/// the current session. This prevents old audio data from bleeding into new sessions.
static CURRENT_SESSION_ID: AtomicU64 = AtomicU64::new(0);

/// Shared audio processing state that can be reused across sessions.
/// This avoids creating new audio streams for each PTT press.
struct AudioProcessor {
    /// The audio buffer accumulating samples
    buffer: Vec<i16>,
    /// The Vosk recognizer
    recognizer: Recognizer,
    /// Last emitted partial result (to avoid duplicates)
    last_partial: String,
    /// Whether to emit interim results
    interim_results: bool,
    /// Resampling ratio (device_rate / target_rate). 1.0 = no resampling.
    resample_ratio: f64,
}

struct SttState {
    model: Option<Arc<Model>>,
    current_model_name: Option<String>,
    is_listening: bool,
    listen_start_time: Option<Instant>,
    max_duration_ms: Option<u64>,
    /// The session ID of the current listening session (0 = not listening)
    active_session_id: u64,
    /// Shared audio processor - reused across sessions
    audio_processor: Option<Arc<Mutex<AudioProcessor>>>,
    /// Whether the audio stream has been created
    stream_created: bool,
}

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<Stt<R>> {
    let state = Arc::new(Mutex::new(SttState {
        model: None,
        current_model_name: None,
        is_listening: false,
        listen_start_time: None,
        max_duration_ms: None,
        active_session_id: 0,
        audio_processor: None,
        stream_created: false,
    }));

    Ok(Stt {
        app: app.clone(),
        state,
    })
}

pub struct Stt<R: Runtime> {
    app: AppHandle<R>,
    state: Arc<Mutex<SttState>>,
}

impl<R: Runtime> Stt<R> {
    fn get_models_dir(&self) -> PathBuf {
        self.app
            .path()
            .app_data_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("vosk-models")
    }

    fn get_model_info_for_language(&self, language: &str) -> Option<(&'static str, &'static str)> {
        // First try exact match
        if let Some((_, name, url)) = AVAILABLE_MODELS
            .iter()
            .find(|(lang, _, _)| *lang == language)
        {
            return Some((*name, *url));
        }

        // If not found, try to match by language prefix (e.g., "pt" matches "pt-BR")
        if let Some(prefix) = language.split('-').next() {
            if let Some((_, name, url)) = AVAILABLE_MODELS
                .iter()
                .find(|(lang, _, _)| lang.split('-').next() == Some(prefix))
            {
                return Some((*name, *url));
            }
        }

        None
    }

    /// Download and extract a Vosk model in a separate thread to avoid tokio conflicts
    fn download_model(&self, model_name: &str, url: &str) -> crate::Result<PathBuf> {
        let models_dir = self.get_models_dir();
        fs::create_dir_all(&models_dir).map_err(|e| {
            crate::Error::Recording(format!("Failed to create models directory: {}", e))
        })?;

        let model_path = models_dir.join(model_name);

        // If already exists, return path
        if model_path.exists() {
            return Ok(model_path);
        }

        println!("Downloading model '{}' from {}", model_name, url);

        // Emit download start event
        let _ = self.app.emit(
            "stt://download-progress",
            serde_json::json!({
                "status": "downloading",
                "model": model_name,
                "progress": 0
            }),
        );

        // Download in a separate thread to avoid tokio runtime conflicts
        let url_owned = url.to_string();
        let model_name_owned = model_name.to_string();
        let app_handle = self.app.clone();

        let handle = std::thread::spawn(move || -> Result<Vec<u8>, String> {
            let client = reqwest::blocking::Client::builder()
                .timeout(std::time::Duration::from_secs(3000)) // Timeout total de 3000s
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

            let response = client
                .get(&url_owned)
                .send()
                .map_err(|e| format!("Failed to download model from {}: {}", url_owned, e))?;

            let status = response.status();

            if !status.is_success() {
                return Err(format!(
                    "Failed to download model: HTTP {} - {}",
                    status,
                    response
                        .text()
                        .unwrap_or_else(|_| "Failed to get error details".to_string())
                ));
            }

            // Get content length if available
            let total_size = response.content_length();

            // Read bytes in chunks with progress tracking
            use std::io::Read;
            let mut reader = response;
            let mut buffer = Vec::new();
            let mut downloaded: usize = 0;
            let chunk_size = 64 * 1024; // 64KB chunks for better performance
            let mut chunk = vec![0u8; chunk_size];
            let mut last_progress_mb = 0;

            loop {
                match reader.read(&mut chunk) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        buffer.extend_from_slice(&chunk[..n]);
                        downloaded += n;

                        // Show progress every 5MB
                        let current_mb = downloaded / (5 * 1024 * 1024);
                        if current_mb > last_progress_mb {
                            last_progress_mb = current_mb;

                            if let Some(total) = total_size {
                                let progress = ((downloaded as f64 / total as f64) * 90.0) as u8;
                                print!(
                                    "\rProgress: {:.2} / {:.2} MB   ",
                                    downloaded as f64 / 1_048_576.0,
                                    total as f64 / 1_048_576.0
                                );
                                std::io::Write::flush(&mut std::io::stdout()).ok();

                                let _ = app_handle.emit(
                                    "stt://download-progress",
                                    serde_json::json!({
                                        "status": "downloading",
                                        "model": model_name_owned,
                                        "progress": progress
                                    }),
                                );
                            } else {
                                print!("\rProgress: {:.2} MB   ", downloaded as f64 / 1_048_576.0);
                                std::io::Write::flush(&mut std::io::stdout()).ok();
                            }
                        }
                    }
                    Err(e) => {
                        println!(); // New line after progress
                        return Err(format!("Failed to read chunk: {}", e));
                    }
                }
            }

            println!(); // New line after progress bar
            println!(
                "Download complete: {:.2} MB",
                downloaded as f64 / 1_048_576.0
            );

            // Emit extraction event
            let _ = app_handle.emit(
                "stt://download-progress",
                serde_json::json!({
                    "status": "extracting",
                    "model": model_name_owned,
                    "progress": 95
                }),
            );

            Ok(buffer)
        });

        // Wait for download to complete
        let bytes = handle
            .join()
            .map_err(|_| crate::Error::Recording("Download thread panicked".to_string()))?
            .map_err(crate::Error::Recording)?;

        println!("Extracting model...");

        // Extract the zip (this is fast enough to do on main thread)
        let cursor = Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor)
            .map_err(|e| crate::Error::Recording(format!("Failed to open zip: {}", e)))?;

        for i in 0..archive.len() {
            let mut file = archive
                .by_index(i)
                .map_err(|e| crate::Error::Recording(format!("Failed to read zip entry: {}", e)))?;

            let outpath = match file.enclosed_name() {
                Some(path) => models_dir.join(path),
                None => continue,
            };

            if file.name().ends_with('/') {
                fs::create_dir_all(&outpath).ok();
            } else {
                if let Some(p) = outpath.parent() {
                    if !p.exists() {
                        fs::create_dir_all(p).ok();
                    }
                }
                let mut outfile = File::create(&outpath).map_err(|e| {
                    crate::Error::Recording(format!("Failed to create file: {}", e))
                })?;
                io::copy(&mut file, &mut outfile).map_err(|e| {
                    crate::Error::Recording(format!("Failed to extract file: {}", e))
                })?;
            }
        }

        // Emit completion event
        let _ = self.app.emit(
            "stt://download-progress",
            serde_json::json!({
                "status": "complete",
                "model": model_name,
                "progress": 100
            }),
        );

        Ok(model_path)
    }

    fn ensure_model(&self, language: Option<&str>) -> crate::Result<Arc<Model>> {
        let (model_name, model_url) = if let Some(lang) = language {
            match self.get_model_info_for_language(lang) {
                Some((name, url)) => (name, url),
                None => (DEFAULT_MODEL_NAME, DEFAULT_MODEL_URL),
            }
        } else {
            (DEFAULT_MODEL_NAME, DEFAULT_MODEL_URL)
        };

        let mut state = self.state.lock().unwrap();

        // Check if we already have this model loaded
        if let Some(current) = &state.current_model_name {
            if current == model_name {
                if let Some(model) = &state.model {
                    return Ok(model.clone());
                }
            }
        }

        // Drop existing model if switching
        state.model = None;
        state.current_model_name = None;
        // Also invalidate the audio processor since it has the old recognizer
        state.audio_processor = None;
        state.stream_created = false;

        drop(state);

        // Download model if needed
        let model_path = self.download_model(model_name, model_url)?;

        if !model_path.exists() {
            return Err(crate::Error::NotAvailable(format!(
                "Vosk model not found at {:?}",
                model_path
            )));
        }

        let model = Model::new(model_path.to_str().unwrap())
            .ok_or_else(|| crate::Error::Recording("Failed to load Vosk model".to_string()))?;

        let model = Arc::new(model);

        let mut state = self.state.lock().unwrap();
        state.model = Some(model.clone());
        state.current_model_name = Some(model_name.to_string());

        Ok(model)
    }

    pub fn start_listening(&self, config: ListenConfig) -> crate::Result<()> {
        let model = self.ensure_model(config.language.as_deref())?;

        let mut state = self.state.lock().unwrap();

        if state.is_listening {
            return Err(crate::Error::Recording("Already listening".to_string()));
        }

        // Generate a new session ID
        let session_id = CURRENT_SESSION_ID.fetch_add(1, Ordering::SeqCst) + 1;
        state.active_session_id = session_id;

        // Store maxDuration config (in milliseconds)
        state.listen_start_time = Some(Instant::now());
        state.max_duration_ms = if config.max_duration > 0 {
            Some(config.max_duration as u64)
        } else {
            None
        };

        let interim_results = config.interim_results;

        // Check if we need to create a new stream or can reuse existing one
        let need_new_stream = !state.stream_created || state.audio_processor.is_none();

        if need_new_stream {
            // Suppress noisy ALSA probe messages (e.g. "unable to open slave")
            // that come from the C library when enumerating devices on PipeWire.
            #[cfg(target_os = "linux")]
            {
                extern "C" {
                    fn snd_lib_error_set_handler(
                        handler: Option<
                            extern "C" fn(
                                file: *const std::ffi::c_char,
                                line: std::ffi::c_int,
                                function: *const std::ffi::c_char,
                                err: std::ffi::c_int,
                                fmt: *const std::ffi::c_char,
                                ...
                            ),
                        >,
                    ) -> std::ffi::c_int;
                }
                unsafe { snd_lib_error_set_handler(None); }
            }

            // Create new audio processor and stream
            let host = cpal::default_host();

            // Collect candidate (device, config) pairs — try all before giving up.
            // On PipeWire/ALSA, the unnamed "default" device often builds a stream
            // successfully but produces NO audio data.  Card-specific devices like
            // "sysdefault:CARD=..." work reliably, so we try them first.
            let mut candidates: Vec<(cpal::Device, cpal::SupportedStreamConfig)> = Vec::new();

            // 1) All input devices — sorted by priority (sysdefault:CARD > default:CARD > others).
            //    Skip "null" and monitor devices.
            let mut priority_candidates: Vec<(cpal::Device, cpal::SupportedStreamConfig, u8)> = Vec::new();
            if let Ok(devices) = host.input_devices() {
                for dev in devices {
                    // Use ALSA device ID (name()) for filtering/priority — it returns
                    // identifiers like "sysdefault:CARD=Generic_1", "null", "default".
                    // description().name() returns human-readable names which don't match.
                    #[allow(deprecated)]
                    let alsa_name = dev.name().unwrap_or_default();
                    let display_name = dev.description()
                        .map(|d| d.name().to_string())
                        .unwrap_or_else(|_| alsa_name.clone());

                    if alsa_name == "null" || alsa_name.contains("monitor")
                        || display_name.contains("Discard all samples") {
                        debug!("STT: skip — '{}' ({})", display_name, alsa_name);
                        continue;
                    }
                    if let Ok(cfg) = dev.default_input_config() {
                        let prio = if alsa_name == "default" || alsa_name == "pipewire" {
                            0 // PipeWire default — most reliable on modern Linux
                        } else if alsa_name.starts_with("default:CARD=") {
                            1
                        } else if alsa_name.starts_with("sysdefault:CARD=") {
                            2 // card-specific — may get POLLERR on PipeWire
                        } else if alsa_name.starts_with("plughw:") {
                            4 // often has timestamp issues
                        } else if alsa_name.starts_with("hw:") {
                            5 // raw hw, may not support f32
                        } else {
                            3
                        };
                        debug!("STT: candidate — '{}' [{}] (prio {}): {}ch {}Hz {:?}",
                            display_name, alsa_name, prio,
                            cfg.channels(), cfg.sample_rate(), cfg.sample_format());
                        priority_candidates.push((dev, cfg, prio));
                    }
                }
            }
            priority_candidates.sort_by_key(|(_, _, p)| *p);
            for (dev, cfg, _) in priority_candidates {
                candidates.push((dev, cfg));
            }

            // 2) Fallback: default device (last resort, may not produce data on PipeWire)
            if candidates.is_empty() {
                if let Some(ref dev) = host.default_input_device() {
                    if let Ok(cfg) = dev.default_input_config() {
                        info!("STT: fallback — default device: {}ch {}Hz {:?}",
                            cfg.channels(), cfg.sample_rate(), cfg.sample_format());
                        candidates.push((dev.clone(), cfg));
                    }
                }
            }

            if candidates.is_empty() {
                return Err(crate::Error::Recording(
                    "No input device available".to_string(),
                ));
            }

            // Vosk expects 16kHz
            let target_sample_rate = 16000.0;

            // Try each candidate until one successfully builds a stream
            let mut last_err = String::new();
            let mut found = false;

            info!("STT: {} candidate device(s) to try", candidates.len());

            let total_candidates = candidates.len();
            for (idx, (candidate_dev, candidate_cfg)) in candidates.into_iter().enumerate() {
                #[allow(deprecated)]
                let alsa_name = candidate_dev.name().unwrap_or_default();
                let dev_name = candidate_dev.description()
                    .map(|d| d.name().to_string())
                    .unwrap_or_else(|_| alsa_name.clone());
                let channels = candidate_cfg.channels() as usize;
                let sample_format = candidate_cfg.sample_format();
                let device_sample_rate = candidate_cfg.sample_rate() as f32;

                info!("STT: trying candidate {}/{} — '{}' [{}] {}ch {}Hz {:?}",
                    idx + 1, total_candidates, dev_name, alsa_name,
                    channels, device_sample_rate as u32, sample_format);

                let mut recognizer = match Recognizer::new(&model, target_sample_rate) {
                    Some(r) => r,
                    None => {
                        warn!("STT: failed to create Vosk recognizer for '{}'", dev_name);
                        continue;
                    }
                };
                recognizer.set_max_alternatives(config.max_alternatives.unwrap_or(1) as u16);
                recognizer.set_partial_words(interim_results);

                let resample_ratio = device_sample_rate as f64 / target_sample_rate as f64;
                debug!("STT: resample_ratio={:.4} (device {}Hz → Vosk {}Hz)",
                    resample_ratio, device_sample_rate as u32, target_sample_rate as u32);

                let audio_processor = Arc::new(Mutex::new(AudioProcessor {
                    buffer: Vec::new(),
                    recognizer,
                    last_partial: String::new(),
                    interim_results,
                    resample_ratio,
                }));

                let app_handle = self.app.clone();
                let processor_for_callback = audio_processor.clone();
                let sample_counter = Arc::new(AtomicU64::new(0));
                let sample_counter_cb = sample_counter.clone();
                let last_heartbeat = Arc::new(Mutex::new(Instant::now()));
                let last_heartbeat_cb = last_heartbeat.clone();

                let process_audio = move |samples_i16: Vec<i16>| {
                    let current_session = CURRENT_SESSION_ID.load(Ordering::SeqCst);
                    if current_session == 0 {
                        return;
                    }

                    let total = sample_counter_cb.fetch_add(samples_i16.len() as u64, Ordering::Relaxed)
                        + samples_i16.len() as u64;

                    // Heartbeat: log every 3 seconds at info level
                    let mut hb = last_heartbeat_cb.lock().unwrap();
                    if hb.elapsed() >= Duration::from_secs(3) || total == samples_i16.len() as u64 {
                        let max_amp = samples_i16.iter().map(|s| s.unsigned_abs() as u32).max().unwrap_or(0);
                        info!("STT: audio heartbeat — {} total samples, chunk={}, max_amp={} {}",
                            total, samples_i16.len(), max_amp,
                            if max_amp < 100 { "(SILENCE)" } else { "" });
                        *hb = Instant::now();
                    }

                    let mut processor = processor_for_callback.lock().unwrap();
                    processor.buffer.extend_from_slice(&samples_i16);

                    // Accumulate enough samples for ~100ms of audio at target rate (1600 samples)
                    let required_samples = (1600.0 * processor.resample_ratio) as usize;
                    let required_samples = required_samples.max(1600);
                    if processor.buffer.len() < required_samples {
                        return;
                    }

                    let samples_to_process: Vec<i16> = processor.buffer.drain(..).collect();
                    let resampled: Vec<i16> = if (processor.resample_ratio - 1.0).abs() < 0.001 {
                        // No resampling needed
                        samples_to_process
                    } else {
                        // Linear interpolation resampling (e.g. 44100→16000)
                        let ratio = processor.resample_ratio;
                        let out_len = (samples_to_process.len() as f64 / ratio) as usize;
                        let mut out = Vec::with_capacity(out_len);
                        for i in 0..out_len {
                            let pos = i as f64 * ratio;
                            let idx = pos as usize;
                            let frac = pos - idx as f64;
                            if idx + 1 < samples_to_process.len() {
                                let s = samples_to_process[idx] as f64 * (1.0 - frac)
                                    + samples_to_process[idx + 1] as f64 * frac;
                                out.push(s as i16);
                            } else if idx < samples_to_process.len() {
                                out.push(samples_to_process[idx]);
                            }
                        }
                        out
                    };

                    debug!("STT: feeding {} resampled samples to Vosk", resampled.len());
                    let result = processor.recognizer.accept_waveform(&resampled);
                    let is_final = matches!(result, Ok(vosk::DecodingState::Finalized));
                    debug!("STT: Vosk accept_waveform → {:?}, is_final={}", result, is_final);

                    if is_final {
                        let result = processor.recognizer.result();
                        let text = match result {
                            vosk::CompleteResult::Single(ref single) => single.text.to_string(),
                            vosk::CompleteResult::Multiple(ref multiple) => multiple
                                .alternatives.first()
                                .map(|alt| alt.text.to_string())
                                .unwrap_or_default(),
                        };
                        debug!("STT: final result — '{}'", text);
                        if !text.is_empty() {
                            processor.last_partial = String::new();
                            let result = RecognitionResult {
                                transcript: text.clone(), is_final: true, confidence: Some(1.0),
                            };
                            info!("STT: recognized — '{}'", text);
                            if let Err(e) = app_handle.emit("stt://result", &result) {
                                warn!("STT: emit stt://result failed: {}", e);
                            }
                            if let Err(e) = app_handle.emit("plugin:stt:result", &result) {
                                warn!("STT: emit plugin:stt:result failed: {}", e);
                            }
                        }
                    } else if processor.interim_results {
                        let partial = processor.recognizer.partial_result();
                        let partial_text = partial.partial.to_string();
                        if !partial_text.is_empty() && processor.last_partial != partial_text {
                            debug!("STT: partial — '{}'", partial_text);
                            processor.last_partial = partial_text.clone();
                            let result = RecognitionResult {
                                transcript: partial_text, is_final: false, confidence: None,
                            };
                            let _ = app_handle.emit("stt://result", &result);
                            let _ = app_handle.emit("plugin:stt:result", &result);
                        }
                    }
                };

                // Try to actually build the stream — this is where PipeWire/ALSA may fail
                let stream_result = match sample_format {
                    cpal::SampleFormat::F32 => candidate_dev.build_input_stream(
                        &candidate_cfg.into(),
                        move |data: &[f32], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.iter().map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16).collect()
                            } else {
                                data.chunks(channels).map(|frame| {
                                    let avg = frame.iter().sum::<f32>() / channels as f32;
                                    (avg.clamp(-1.0, 1.0) * 32767.0) as i16
                                }).collect()
                            };
                            process_audio(mono_i16);
                        },
                        |err| debug!("STT audio stream callback: {}", err),
                        None,
                    ),
                    cpal::SampleFormat::I16 => candidate_dev.build_input_stream(
                        &candidate_cfg.into(),
                        move |data: &[i16], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.to_vec()
                            } else {
                                data.chunks(channels).map(|frame| {
                                    let sum: i32 = frame.iter().map(|&s| s as i32).sum();
                                    (sum / channels as i32) as i16
                                }).collect()
                            };
                            process_audio(mono_i16);
                        },
                        |err| debug!("STT audio stream callback: {}", err),
                        None,
                    ),
                    cpal::SampleFormat::U16 => candidate_dev.build_input_stream(
                        &candidate_cfg.into(),
                        move |data: &[u16], _: &cpal::InputCallbackInfo| {
                            let mono_i16: Vec<i16> = if channels == 1 {
                                data.iter().map(|&s| (s as i32 - 32768) as i16).collect()
                            } else {
                                data.chunks(channels).map(|frame| {
                                    let avg = frame.iter().map(|&s| s as i32).sum::<i32>() / channels as i32;
                                    (avg - 32768) as i16
                                }).collect()
                            };
                            process_audio(mono_i16);
                        },
                        |err| debug!("STT audio stream callback: {}", err),
                        None,
                    ),
                    _ => continue,
                };

                match stream_result {
                    Ok(stream) => {
                        stream.play().map_err(|e| {
                            crate::Error::Recording(format!("Failed to start stream: {}", e))
                        })?;
                        info!("STT: stream opened — {}ch {}Hz {:?}",
                            channels, device_sample_rate as u32, sample_format);
                        state.audio_processor = Some(audio_processor);
                        state.stream_created = true;
                        // Keep the stream alive — callback checks session ID
                        std::mem::forget(stream);
                        found = true;
                        break;
                    }
                    Err(e) => {
                        warn!("STT: build_input_stream failed ({}), trying next candidate...", e);
                        last_err = format!("{}", e);
                        continue;
                    }
                }
            }

            if !found {
                return Err(crate::Error::Recording(format!(
                    "Failed to build stream on any device: {}", last_err
                )));
            }
        } else {
            // Reuse existing stream - just reset the audio processor state
            if let Some(processor) = &state.audio_processor {
                let mut proc = processor.lock().unwrap();
                // Clear accumulated audio buffer from previous session
                proc.buffer.clear();
                // Clear last partial to avoid duplicate detection issues
                proc.last_partial.clear();
                // Reset the recognizer to clear any accumulated state
                // Note: Vosk doesn't have a reset method, so we create a new one
                let target_sample_rate = 16000.0;
                if let Some(ref model) = state.model {
                    if let Some(mut new_recognizer) = Recognizer::new(model, target_sample_rate) {
                        new_recognizer
                            .set_max_alternatives(config.max_alternatives.unwrap_or(1) as u16);
                        new_recognizer.set_partial_words(interim_results);
                        proc.recognizer = new_recognizer;
                    }
                }
                proc.interim_results = interim_results;
            }
        }

        state.is_listening = true;

        // Emit stateChange event with RecognitionStatus
        let _ = self.app.emit(
            "plugin:stt:stateChange",
            RecognitionStatus {
                state: RecognitionState::Listening,
                is_available: true,
                language: config.language.clone(),
            },
        );

        // Start maxDuration timer thread if configured
        if config.max_duration > 0 {
            let max_ms = config.max_duration as u64;
            let app_handle_timer = self.app.clone();
            let state_clone = self.state.clone();
            let timer_session_id = session_id;
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(max_ms));

                // Check if this timer's session is still active
                let mut state = state_clone.lock().unwrap();
                if state.is_listening && state.active_session_id == timer_session_id {
                    // Set session to 0 to stop audio processing
                    CURRENT_SESSION_ID.store(0, Ordering::SeqCst);
                    state.is_listening = false;
                    state.listen_start_time = None;
                    state.max_duration_ms = None;
                    state.active_session_id = 0;

                    // Emit events
                    let _ = app_handle_timer.emit(
                        "plugin:stt:stateChange",
                        RecognitionStatus {
                            state: RecognitionState::Idle,
                            is_available: true,
                            language: None,
                        },
                    );
                    let _ = app_handle_timer.emit(
                        "stt://error",
                        serde_json::json!({
                            "error": "Maximum duration reached",
                            "code": -2
                        }),
                    );
                }
            });
        }

        Ok(())
    }

    pub fn stop_listening(&self) -> crate::Result<()> {
        let mut state = self.state.lock().unwrap();

        if !state.is_listening {
            return Ok(());
        }

        // Set session to 0 to signal audio callback to stop processing
        // (but the stream itself keeps running for reuse)
        CURRENT_SESSION_ID.store(0, Ordering::SeqCst);

        state.is_listening = false;
        state.listen_start_time = None;
        state.max_duration_ms = None;
        state.active_session_id = 0;

        // Emit stateChange event
        let _ = self.app.emit(
            "plugin:stt:stateChange",
            RecognitionStatus {
                state: RecognitionState::Idle,
                is_available: true,
                language: None,
            },
        );

        Ok(())
    }

    pub fn is_available(&self) -> crate::Result<AvailabilityResponse> {
        Ok(AvailabilityResponse {
            available: true,
            reason: None,
        })
    }

    pub fn get_supported_languages(&self) -> crate::Result<SupportedLanguagesResponse> {
        let models_dir = self.get_models_dir();

        let languages: Vec<SupportedLanguage> = AVAILABLE_MODELS
            .iter()
            .map(|(code, model_name, _)| {
                let installed = models_dir.join(model_name).exists();
                SupportedLanguage {
                    code: code.to_string(),
                    name: get_language_display_name(code),
                    installed: Some(installed),
                }
            })
            .collect();

        Ok(SupportedLanguagesResponse { languages })
    }

    pub fn check_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Granted,
            speech_recognition: PermissionStatus::Granted,
        })
    }

    pub fn request_permission(&self) -> crate::Result<PermissionResponse> {
        Ok(PermissionResponse {
            microphone: PermissionStatus::Granted,
            speech_recognition: PermissionStatus::Granted,
        })
    }
}

fn get_language_display_name(code: &str) -> String {
    match code {
        "en-US" => "English (United States)".to_string(),
        "pt-BR" => "Portuguese (Brazil)".to_string(),
        "es-ES" => "Spanish (Spain)".to_string(),
        "fr-FR" => "French (France)".to_string(),
        "de-DE" => "German (Germany)".to_string(),
        "ru-RU" => "Russian (Russia)".to_string(),
        "zh-CN" => "Chinese (Simplified)".to_string(),
        "ja-JP" => "Japanese (Japan)".to_string(),
        "it-IT" => "Italian (Italy)".to_string(),
        _ => code.to_string(),
    }
}
