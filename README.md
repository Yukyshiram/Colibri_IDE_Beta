# 🐦 Colibrí IDE

Un entorno de desarrollo integrado (IDE) de escritorio para **C y C++**, diseñado como alternativa moderna a Code::Blocks para uso académico y proyectos pequeños/medianos.

Construido con **Tauri v2 + React + TypeScript + Monaco Editor**.

---

## ¿Para qué sirve?

Colibrí IDE está pensado para estudiantes y programadores que necesitan un IDE **ligero, rápido y sin configuración** para escribir, compilar y ejecutar programas en C/C++. A diferencia de Code::Blocks, Colibrí IDE tiene una interfaz moderna, es fácil de instalar y no requiere configurar compiladores manualmente si GCC/G++ ya está en el PATH del sistema.

---

## Características actuales

### Editor de código
- Editor Monaco (el mismo motor de VS Code) con resaltado de sintaxis para C y C++
- Pestañas múltiples con indicador de cambios sin guardar (`●`)
- Cierre de pestañas con clic central
- Breadcrumbs de ruta relativa al proyecto
- Guardado con `Ctrl+S`
- Auto-guardado configurable (debounce 800 ms)
- Subrayados rojos/amarillos inline de errores y warnings de GCC/G++ directamente en el editor

### Explorador de archivos
- Vista de árbol del proyecto con carpetas y archivos
- Drag & drop para mover archivos y carpetas
- Menú contextual: nuevo archivo, nueva carpeta, renombrar, eliminar
- Watcher del sistema de archivos (detecta cambios externos en disco con debounce 250 ms)
- Soporte para mostrar/ocultar archivos ocultos

### Compilación y ejecución
- **Build**: compila el archivo activo con `gcc` (`.c`) o `g++` (`.cpp`, `.cc`, `.cxx`, `.h`, `.hpp`)
- **Run**: ejecuta el binario generado en el mismo directorio
- **Build & Run**: compila y ejecuta en un solo paso (botón principal)
- Detección automática del compilador según la extensión del archivo
- Output de compilación y ejecución en el panel inferior

### Panel inferior (3 tabs)
- **Output**: resultado de compilación y ejecución con detalles del comando, stdout y stderr
- **Problemas**: lista de errores y warnings parseados de GCC, con severidad (error/warning/note), archivo, línea y columna. Click en un problema salta directamente a esa línea en el editor
- **Terminal**: terminal de comandos integrada con historial de output

### Panel de problemas (diagnósticos GCC)
- Parseo automático del stderr de GCC/G++ tras cada compilación
- Badge con conteo de errores en la pestaña "Problemas"
- Cada diagnóstico muestra: icono de severidad · mensaje · archivo:línea:columna
- Click en un diagnóstico abre el archivo (si no estaba abierto) y posiciona el cursor en la línea exacta
- Los marcadores de error/warning se sincronizan con Monaco en tiempo real

### Navegación y productividad
- `Ctrl+P` — Quick Open: búsqueda difusa de archivos del proyecto
- `Ctrl+Shift+P` — Paleta de comandos (Build, Run, abrir carpeta, nueva pestaña, etc.)
- Proyectos recientes (hasta 8) con timestamps relativos y badge "Último"/"No encontrado"
- Auto-apertura del último proyecto al iniciar (configurable)

### Pantalla de bienvenida
- Modo inicial (sin proyecto): acceso rápido a proyectos recientes
- Modo proyecto (sin archivo activo): tips de atajos y acciones rápidas

### Configuración
- Tamaño de fuente del editor (11–24 px)
- Tamaño de tab (2–8 espacios)
- Word wrap
- Auto-guardado
- Archivos ocultos
- Tema: `colibri-dark` / `colibri-light`
- Mostrar/ocultar pantalla de bienvenida al iniciar

### Barra de estado
- Lenguaje del archivo activo (con color)
- Codificación (UTF-8) y fin de línea (LF)
- Nombre del archivo y estado (Modified / Saved)
- Posición del cursor (Ln X, Col Y)

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Framework de escritorio | [Tauri v2](https://tauri.app/) |
| UI | React 19 + TypeScript |
| Editor | Monaco Editor (`@monaco-editor/react`) |
| Build tool | Vite 7 |
| Backend (Rust) | `tauri-plugin-fs` (con watch), `tauri-plugin-dialog`, `tauri-plugin-opener` |
| Compilador objetivo | GCC / G++ (debe estar en PATH) |

---

## Requisitos previos

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (con `cargo`)
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- GCC / G++ en el PATH del sistema  
  - Windows: [MSYS2 + MinGW-w64](https://www.msys2.org/) o [WinLibs](https://winlibs.com/)  
  - Linux/macOS: `gcc` y `g++` generalmente ya disponibles

---

## Instalación y desarrollo

```bash
# Clonar el repositorio
git clone https://github.com/<tu-usuario>/colibri-ide.git
cd colibri-ide

# Instalar dependencias de Node
npm install

# Iniciar en modo desarrollo (abre la ventana de escritorio)
npm run tauri dev
```

### Compilar para producción

```bash
npm run tauri build
```

El instalador se genera en `src-tauri/target/release/bundle/`.

---

## Estructura del proyecto

```
colibri-ide/
├── src/                        # Frontend React + TypeScript
│   ├── App.tsx                 # Estado global y lógica principal
│   ├── types/ide.ts            # Tipos compartidos (IDEFile, DiagnosticItem, etc.)
│   ├── lib/
│   │   ├── file-utils.ts       # Detección de lenguaje por extensión
│   │   ├── file-icons.tsx      # Iconos SVG por tipo de archivo
│   │   ├── gcc-parser.ts       # Parser de stderr de GCC/G++ → DiagnosticItem[]
│   │   ├── project-files.ts    # Aplanar árbol para Quick Open
│   │   ├── command-palette.ts  # Definiciones de la paleta de comandos
│   │   └── settings.ts         # Carga/guardado de ajustes (localStorage)
│   └── components/
│       ├── editor/             # CodeEditor, Tabs, Breadcrumbs, WelcomeScreen, Palettes, UnsavedDialog
│       ├── explorer/           # FileExplorer, ExplorerTreeNode (con DnD)
│       ├── layout/             # TopBar, ActivityBar, StatusBar, SettingsDialog
│       └── panels/             # BottomPanel (Output + Problemas + Terminal)
├── src-tauri/                  # Backend Rust (Tauri)
│   ├── src/
│   │   ├── commands.rs         # compile_file, run_file, run_terminal_command
│   │   └── lib.rs              # Registro de plugins y comandos
│   └── tauri.conf.json         # Configuración de la app (nombre, ventana, permisos)
└── package.json
```

---

## Comandos Tauri (Rust)

| Comando | Descripción |
|---|---|
| `compile_file(file_path)` | Detecta extensión → ejecuta `gcc`/`g++` → devuelve resultado con stdout/stderr |
| `run_file(file_path)` | Ejecuta el binario generado en el mismo directorio del fuente |
| `run_terminal_command(command, working_dir)` | Ejecuta comando arbitrario en `cmd /C` (Windows) o `sh -lc` (Unix) |

---

## Roadmap (próximos sprints)

- [ ] **Menú clásico tipo IDE** (Archivo / Proyecto / Compilar / Ver)
- [ ] **Templates de proyectos** (Hello World C/C++, estudiante, con Makefile, lista enlazada)
- [ ] **Consola interactiva** con soporte de stdin para programas que usan `scanf` / `cin`
- [ ] Soporte de Makefile y CMake básico
- [ ] Depurador integrado (GDB)

---

## Licencia

MIT — libre para uso personal, académico y comercial.
# Colibri_IDE_Beta
