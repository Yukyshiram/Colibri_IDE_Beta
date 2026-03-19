use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use serde::Deserialize;
use serde::Serialize;
use std::env;
use std::fs;
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const DISCORD_APP_ID: &str = "1395321838411313162";
const DISCORD_ASSET_LARGE_IMAGE: &str = "colibri_logo";
const DISCORD_MIN_UPDATE_INTERVAL_MS: u128 = 700;

static DISCORD_SESSION_START_TS: OnceLock<i64> = OnceLock::new();
static DISCORD_PRESENCE_ENABLED: AtomicBool = AtomicBool::new(false);
static DISCORD_PRESENCE_RUNTIME: OnceLock<Mutex<DiscordPresenceRuntimeState>> = OnceLock::new();

#[derive(Default)]
struct DiscordPresenceRuntimeState {
    last_payload_key: String,
    last_update_ms: u128,
}

#[derive(Deserialize)]
pub struct DiscordPresencePayload {
    pub status: String,
    pub file_name: Option<String>,
    pub project_name: Option<String>,
}

#[derive(Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub command: String,
    pub source_files: Vec<String>,
    pub executable_path: Option<String>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize)]
pub struct RunTargetResult {
    pub executable_path: String,
    pub working_dir: String,
    pub command: String,
}

#[derive(Serialize)]
pub struct TerminalCommandResult {
    pub success: bool,
    pub command: String,
    pub cwd: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
}

#[derive(Serialize)]
pub struct ClangFormatToolStatus {
    pub status: String,
    pub system_path: Option<String>,
    pub managed_path: Option<String>,
    pub active_path: Option<String>,
}

fn get_compiler_and_output(source_path: &str) -> Result<(String, PathBuf), String> {
    let path = Path::new(source_path);

    let extension = path
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or("No se pudo detectar la extensión del archivo.")?
        .to_lowercase();

    let file_stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or("No se pudo obtener el nombre base del archivo.")?;

    let parent = path
        .parent()
        .ok_or("No se pudo obtener la carpeta del archivo.")?;

    let compiler = match extension.as_str() {
        "c" => "gcc".to_string(),
        "cpp" | "cc" | "cxx" => "g++".to_string(),
        "h" | "hpp" => {
            return Err("No se puede compilar directamente un archivo header (.h / .hpp).".into())
        }
        _ => return Err("Solo se pueden compilar archivos .c, .cpp, .cc y .cxx.".into()),
    };

    #[cfg(target_os = "windows")]
    let output_path = parent.join(format!("{file_stem}.exe"));

    #[cfg(not(target_os = "windows"))]
    let output_path = parent.join(file_stem);

    Ok((compiler, output_path))
}

fn collect_source_files_recursively(base_dir: &Path, extensions: &[&str]) -> Result<Vec<PathBuf>, String> {
    fn walk(dir: &Path, extensions: &[&str], files: &mut Vec<PathBuf>) -> Result<(), String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("No se pudo leer directorio {}: {}", dir.display(), e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("No se pudo leer entrada de directorio: {}", e))?;
            let path = entry.path();

            if path.is_dir() {
                walk(&path, extensions, files)?;
                continue;
            }

            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_lowercase());

            if let Some(ext) = ext {
                if extensions.iter().any(|allowed| *allowed == ext) {
                    files.push(path);
                }
            }
        }

        Ok(())
    }

    let mut files = Vec::new();
    walk(base_dir, extensions, &mut files)?;
    files.sort();
    Ok(files)
}

#[tauri::command]
pub fn compile_file(file_path: String, project_path: String) -> Result<CompileResult, String> {
    let (compiler, output_path) = get_compiler_and_output(&file_path)?;

    let extension = Path::new(&file_path)
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or("No se pudo detectar la extensión del archivo activo.")?
        .to_lowercase();

    let extensions: Vec<&str> = match extension.as_str() {
        "c" => vec!["c"],
        "cpp" | "cc" | "cxx" => vec!["cpp", "cc", "cxx"],
        _ => return Err("Solo se pueden compilar proyectos C/C++.".into()),
    };

    let source_files = collect_source_files_recursively(Path::new(&project_path), &extensions)?;
    if source_files.is_empty() {
        return Err("No se encontraron archivos fuente para compilar en el proyecto.".into());
    }

    let source_files_display: Vec<String> = source_files
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect();

    let command_preview = format!(
        "{} {} -Wall -Wextra -o \"{}\"",
        compiler,
        source_files_display
            .iter()
            .map(|s| format!("\"{}\"", s))
            .collect::<Vec<String>>()
            .join(" "),
        output_path.display()
    );

    let mut command = Command::new(&compiler);
    for src in &source_files {
        command.arg(src);
    }
    command
        .arg("-Wall")
        .arg("-Wextra")
        .arg("-o")
        .arg(&output_path);

    let output = command
        .output()
        .map_err(|error| {
            format!(
                "No se pudo ejecutar {}. Verifica que esté instalado y disponible en PATH. Detalle: {}",
                compiler, error
            )
        })?;

    Ok(CompileResult {
        success: output.status.success(),
        command: command_preview,
        source_files: source_files_display,
        executable_path: if output.status.success() {
            Some(output_path.to_string_lossy().to_string())
        } else {
            None
        },
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
pub fn run_terminal_command(command: String, working_dir: String) -> Result<TerminalCommandResult, String> {
    let command = command.trim().to_string();

    if command.is_empty() {
        return Err("El comando no puede estar vacío.".into());
    }

    let cwd = PathBuf::from(&working_dir);
    if !cwd.exists() {
        return Err(format!("El directorio no existe: {}", cwd.display()));
    }

    #[cfg(target_os = "windows")]
    let output = Command::new("cmd")
        .args(["/C", &command])
        .current_dir(&cwd)
        .output();

    #[cfg(not(target_os = "windows"))]
    let output = Command::new("sh")
        .args(["-lc", &command])
        .current_dir(&cwd)
        .output();

    let output = output.map_err(|error| {
        format!(
            "No se pudo ejecutar el comando en terminal. Detalle: {}",
            error
        )
    })?;

    Ok(TerminalCommandResult {
        success: output.status.success(),
        command,
        cwd: cwd.to_string_lossy().to_string(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
    })
}

#[tauri::command]
pub fn resolve_run_target(file_path: String) -> Result<RunTargetResult, String> {
    let (_, executable_path) = get_compiler_and_output(&file_path)?;

    if !executable_path.exists() {
        return Err(format!(
            "No existe el binario para el archivo activo. Compílalo primero: {}",
            executable_path.display()
        ));
    }

    let working_dir = executable_path
        .parent()
        .ok_or("No se pudo obtener la carpeta del ejecutable.")?;

    Ok(RunTargetResult {
        executable_path: executable_path.to_string_lossy().to_string(),
        working_dir: working_dir.to_string_lossy().to_string(),
        command: format!("\"{}\"", executable_path.display()),
    })
}

fn resolve_user_home_dir() -> Result<PathBuf, String> {
    if let Some(home) = env::var_os("HOME") {
        return Ok(PathBuf::from(home));
    }

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        return Ok(PathBuf::from(user_profile));
    }

    let drive = env::var_os("HOMEDRIVE");
    let path = env::var_os("HOMEPATH");
    if let (Some(drive), Some(path)) = (drive, path) {
        let mut joined = PathBuf::from(drive);
        joined.push(path);
        return Ok(joined);
    }

    Err("No se pudo resolver la carpeta home del usuario.".into())
}

fn resolve_managed_tools_dir() -> Result<PathBuf, String> {
    let home_dir = resolve_user_home_dir()?;
    Ok(home_dir.join("ColibriTools").join("tools"))
}

fn resolve_managed_clang_format_path() -> Result<PathBuf, String> {
    let tools_dir = resolve_managed_tools_dir()?;

    #[cfg(target_os = "windows")]
    let executable_name = "clang-format.exe";

    #[cfg(not(target_os = "windows"))]
    let executable_name = "clang-format";

    Ok(tools_dir
        .join("clang-format")
        .join("bin")
        .join(executable_name))
}

fn detect_system_clang_format_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("where").arg("clang-format").output().ok()?;
        if !output.status.success() {
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            let candidate = PathBuf::from(line.trim());
            if candidate.exists() {
                return Some(candidate);
            }
        }

        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        let output = Command::new("which").arg("clang-format").output().ok()?;
        if !output.status.success() {
            return None;
        }

        let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path_str.is_empty() {
            return None;
        }

        let candidate = PathBuf::from(path_str);
        if candidate.exists() {
            Some(candidate)
        } else {
            None
        }
    }
}

fn build_clang_format_status() -> Result<ClangFormatToolStatus, String> {
    let managed_path = resolve_managed_clang_format_path()?;
    let managed_exists = managed_path.exists();
    let system_path = detect_system_clang_format_path();

    let (status, active_path) = if managed_exists {
        (
            "colibri-installed".to_string(),
            Some(managed_path.to_string_lossy().to_string()),
        )
    } else if let Some(system) = &system_path {
        (
            "system-installed".to_string(),
            Some(system.to_string_lossy().to_string()),
        )
    } else {
        ("not-installed".to_string(), None)
    };

    Ok(ClangFormatToolStatus {
        status,
        system_path: system_path.map(|p| p.to_string_lossy().to_string()),
        managed_path: if managed_exists {
            Some(managed_path.to_string_lossy().to_string())
        } else {
            None
        },
        active_path,
    })
}

#[tauri::command]
pub fn resolve_default_projects_directory() -> Result<String, String> {
    let home_dir = resolve_user_home_dir()?;
    let projects_dir = home_dir.join("ColibriProjects");

    fs::create_dir_all(&projects_dir).map_err(|error| {
        format!(
            "No se pudo crear la carpeta de proyectos por defecto ({}): {}",
            projects_dir.display(),
            error
        )
    })?;

    Ok(projects_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn get_clang_format_status() -> Result<ClangFormatToolStatus, String> {
    build_clang_format_status()
}

#[tauri::command]
pub fn install_clang_format_managed(source_path: Option<String>) -> Result<ClangFormatToolStatus, String> {
    let source_candidate = source_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(detect_system_clang_format_path)
        .ok_or(
            "No se encontró clang-format en PATH. Selecciona manualmente un ejecutable clang-format para instalarlo en Colibrí.",
        )?;

    if !source_candidate.exists() {
        return Err(format!(
            "La ruta seleccionada para clang-format no existe: {}",
            source_candidate.display()
        ));
    }

    let managed_path = resolve_managed_clang_format_path()?;
    if let Some(parent) = managed_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "No se pudo crear la carpeta administrada para clang-format ({}): {}",
                parent.display(),
                error
            )
        })?;
    }

    fs::copy(&source_candidate, &managed_path).map_err(|error| {
        format!(
            "No se pudo copiar clang-format a la carpeta administrada: {}",
            error
        )
    })?;

    #[cfg(unix)]
    {
        let metadata = fs::metadata(&managed_path)
            .map_err(|error| format!("No se pudo leer permisos de clang-format: {}", error))?;
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&managed_path, permissions)
            .map_err(|error| format!("No se pudo establecer permisos de ejecución: {}", error))?;
    }

    build_clang_format_status()
}

#[tauri::command]
pub fn format_document_with_clang(file_path: String, content: String) -> Result<String, String> {
    let style = "{BasedOnStyle: LLVM, BreakBeforeBraces: Attach, IndentWidth: 2}";

    let tool_status = build_clang_format_status()?;
    let clang_path = tool_status
        .active_path
        .ok_or("clang-format no está instalado. Puedes usar una instalación existente desde la vista Tools.")?;

    let mut process = Command::new(clang_path)
        .arg("-assume-filename")
        .arg(&file_path)
        .arg("-style")
        .arg(style)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("No se pudo iniciar clang-format: {}", error))?;

    if let Some(mut stdin) = process.stdin.take() {
        stdin
            .write_all(content.as_bytes())
            .map_err(|error| format!("No se pudo enviar contenido a clang-format: {}", error))?;
    }

    let output = process
        .wait_with_output()
        .map_err(|error| format!("No se pudo ejecutar clang-format: {}", error))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err("clang-format terminó con error desconocido.".into());
        }

        return Err(format!("clang-format falló: {}", stderr));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn resolve_discord_session_start_ts() -> i64 {
    *DISCORD_SESSION_START_TS.get_or_init(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0)
    })
}

fn resolve_now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn should_dispatch_discord_presence(payload_key: &str) -> bool {
    let runtime = DISCORD_PRESENCE_RUNTIME.get_or_init(|| Mutex::new(DiscordPresenceRuntimeState::default()));
    let now = resolve_now_millis();

    let mut state = match runtime.lock() {
        Ok(state) => state,
        Err(_) => return false,
    };

    if state.last_payload_key == payload_key {
        return false;
    }

    if now.saturating_sub(state.last_update_ms) < DISCORD_MIN_UPDATE_INTERVAL_MS {
        return false;
    }

    state.last_payload_key = payload_key.to_string();
    state.last_update_ms = now;
    true
}

#[tauri::command]
pub fn start_discord_presence() -> Result<(), String> {
    DISCORD_PRESENCE_ENABLED.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub fn stop_discord_presence() -> Result<(), String> {
    DISCORD_PRESENCE_ENABLED.store(false, Ordering::Relaxed);

    if let Some(runtime) = DISCORD_PRESENCE_RUNTIME.get() {
        if let Ok(mut state) = runtime.lock() {
            state.last_payload_key.clear();
            state.last_update_ms = 0;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn update_discord_presence(payload: DiscordPresencePayload) -> Result<(), String> {
    if !DISCORD_PRESENCE_ENABLED.load(Ordering::Relaxed) {
        return Ok(());
    }

    let payload_key = format!(
        "{}|{}|{}",
        payload.status,
        payload.file_name.as_deref().unwrap_or(""),
        payload.project_name.as_deref().unwrap_or("")
    );

    if !should_dispatch_discord_presence(&payload_key) {
        return Ok(());
    }

    let details = match payload.status.as_str() {
        "editing" => payload
            .file_name
            .as_ref()
            .map(|file_name| format!("Editing {}", file_name))
            .unwrap_or_else(|| "Browsing files".to_string()),
        "browsing_files" => "Browsing files".to_string(),
        "compiling" => "Compiling".to_string(),
        "build_failed" => "Build failed".to_string(),
        "running" => "Running".to_string(),
        _ => "Browsing files".to_string(),
    };

    let project_name = payload
        .project_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Sin proyecto");

    let state = format!("Workspace: {}", project_name);

    let start_ts = resolve_discord_session_start_ts();

    std::thread::spawn(move || {
        let mut client = match DiscordIpcClient::new(DISCORD_APP_ID) {
            Ok(client) => client,
            Err(_) => return,
        };

        if client.connect().is_err() {
            return;
        }

        let presence = activity::Activity::new()
            .details(&details)
            .state(&state)
            .timestamps(activity::Timestamps::new().start(start_ts))
            .assets(
                activity::Assets::new()
                    .large_image(DISCORD_ASSET_LARGE_IMAGE)
                    .large_text("Colibri IDE"),
            );

        let _ = client.set_activity(presence);
        let _ = client.close();
    });

    Ok(())
}