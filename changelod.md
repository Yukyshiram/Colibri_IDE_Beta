# changelod

## Resumen breve

- Se amplió la UI principal del IDE con mejoras en top bar, panel inferior y pantalla de bienvenida.
- Se integraron cambios para agrupación de diagnósticos y mejoras en el parser GCC.
- Se añadieron pruebas y utilidades nuevas para la lógica de agrupación.
- Se actualizaron componentes del editor para una mejor experiencia de navegación y edición.
- Se incorporaron documentos de implementación y checklist de QA manual.

## Archivos clave

- Frontend: ajustes en App, paneles, top bar y editor.
- Core: parser GCC y tipos de IDE.
- Tauri backend: comandos y capacidades.
- Documentación: resumen de implementación y estado del pipeline.

## Beta V0.3

### Resumen breve

- Reestructuración amplia de la experiencia principal en App para mejorar flujo y estado global.
- Nuevas vistas laterales de explorador, búsqueda y herramientas.
- Nuevos diálogos para creación de proyecto y clases C++.
- Ampliación de comandos backend en Tauri y ajustes de configuración/persistencia.

### Cambios destacados

- UI/Layout:
	- Nuevos componentes de sidebar y estilos asociados.
	- Mejoras en Activity Bar, Top Bar y Bottom Panel.
	- Ajustes en Welcome Screen y Settings Dialog.
- Plantillas y utilidades:
	- Nuevas plantillas para proyectos y clases C++.
	- Mejoras en command palette y settings.
- Backend Tauri:
	- Extensión de comandos y actualizaciones de integración en lib.

### Nota de alcance

- En esta subida se excluye la eliminación de `src-tauri/2` para evitar borrar un archivo rastreado sin validación funcional adicional.