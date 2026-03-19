use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

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