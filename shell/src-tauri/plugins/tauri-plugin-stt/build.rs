const COMMANDS: &[&str] = &[
    "start_listening",
    "stop_listening",
    "is_available",
    "get_supported_languages",
    "check_permission",
    "request_permission",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();

    // On desktop, ensure libvosk is available for linking and bundled for runtime
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    setup_vosk();
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn setup_vosk() {
    use std::path::PathBuf;

    let vosk_version = "0.3.45";
    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let vosk_dir = out_dir.join("vosk-lib");

    // Platform-specific library name and download URL
    #[cfg(target_os = "linux")]
    let (archive_name, lib_name) = (
        format!("vosk-linux-x86_64-{vosk_version}.zip"),
        "libvosk.so",
    );
    #[cfg(target_os = "macos")]
    let (archive_name, lib_name) = (
        format!("vosk-osx-universal-{vosk_version}.zip"),
        "libvosk.dylib",
    );
    #[cfg(target_os = "windows")]
    let (archive_name, lib_name) = (
        format!("vosk-win64-{vosk_version}.zip"),
        "libvosk.dll",
    );

    let lib_path = vosk_dir.join(lib_name);

    if !lib_path.exists() {
        std::fs::create_dir_all(&vosk_dir).unwrap();

        let url = format!(
            "https://github.com/alphacep/vosk-api/releases/download/v{vosk_version}/{archive_name}"
        );
        eprintln!("cargo:warning=Downloading libvosk from {url}");

        let archive_path = out_dir.join(&archive_name);

        // Download using curl (available on all platforms)
        let status = std::process::Command::new("curl")
            .args(["-L", "-o"])
            .arg(&archive_path)
            .arg(&url)
            .status()
            .expect("Failed to run curl. Please install curl.");

        if !status.success() {
            panic!("Failed to download libvosk from {url}");
        }

        // Extract the library file from the zip
        let file = std::fs::File::open(&archive_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i).unwrap();
            let name = entry.name().to_string();
            if name.ends_with(lib_name) {
                let mut out_file = std::fs::File::create(&lib_path).unwrap();
                std::io::copy(&mut entry, &mut out_file).unwrap();

                // Set executable permission on Unix
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    std::fs::set_permissions(&lib_path, std::fs::Permissions::from_mode(0o755))
                        .unwrap();
                }
                break;
            }
        }

        // Clean up archive
        let _ = std::fs::remove_file(&archive_path);

        if !lib_path.exists() {
            panic!("Failed to extract {lib_name} from archive");
        }
        eprintln!("cargo:warning=libvosk downloaded to {}", lib_path.display());
    }

    // Tell the linker where to find libvosk
    println!("cargo:rustc-link-search=native={}", vosk_dir.display());

    // Set rpath so the binary can find libvosk at runtime
    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN");
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path");

    // Copy libvosk next to the binary for development
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let target_dir = PathBuf::from(&manifest_dir)
            .parent() // plugins
            .and_then(|p| p.parent()) // src-tauri
            .map(|p| p.join("target"))
            .unwrap();

        // Copy to both debug and release target dirs
        let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
        let bin_dir = target_dir.join(&profile);
        if bin_dir.exists() {
            let dest = bin_dir.join(lib_name);
            if !dest.exists() {
                let _ = std::fs::copy(&lib_path, &dest);
                eprintln!("cargo:warning=Copied {lib_name} to {}", dest.display());
            }
        }
    }
}
