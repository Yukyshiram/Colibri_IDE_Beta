use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub command: String,
    pub executable_path: Option<String>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Serialize)]
pub struct RunResult {
    pub success: bool,
    pub command: String,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: Option<i32>,
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

#[tauri::command]
pub fn compile_file(file_path: String) -> Result<CompileResult, String> {
    let (compiler, output_path) = get_compiler_and_output(&file_path)?;

    let command_preview = format!(
        "{} \"{}\" -o \"{}\"",
        compiler,
        file_path,
        output_path.display()
    );

    let output = Command::new(&compiler)
        .arg(&file_path)
        .arg("-o")
        .arg(&output_path)
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
pub fn run_file(file_path: String) -> Result<RunResult, String> {
    let (_, executable_path) = get_compiler_and_output(&file_path)?;

    if !executable_path.exists() {
        return Err(format!(
            "No existe el binario para el archivo activo. Compílalo primero: {}",
            executable_path.display()
        ));
    }

    let command_preview = format!("\"{}\"", executable_path.display());

    let working_dir = executable_path
        .parent()
        .ok_or("No se pudo obtener la carpeta del ejecutable.")?;

    let output = Command::new(&executable_path)
        .current_dir(working_dir)
        .output()
        .map_err(|error| {
            format!("No se pudo ejecutar el binario. Detalle: {}", error)
        })?;

    Ok(RunResult {
        success: output.status.success(),
        command: command_preview,
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code(),
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