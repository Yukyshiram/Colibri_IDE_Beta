# Build + Diagnostics Manual Checklist

Esta guia valida el flujo real de compilacion y diagnosticos para C/C++ en Colibri IDE.

## Preparacion sugerida

1. Crear carpeta de proyecto con archivos `main.c`, `utils.c`, `utils.h`.
2. En `main.c`, incluir llamada a una funcion definida en `utils.c`.
3. Abrir la carpeta en Colibri IDE.
4. Tener visible el panel inferior con tabs `Output` y `Problems`.

## Caso 1: Error sintactico en archivo abierto

1. Abrir `main.c`.
2. Introducir error de sintaxis (ejemplo: quitar `;`).
3. Ejecutar Build.

Esperado:
1. Se crea marker en Monaco en la linea/columna.
2. Aparece entrada en Problems.
3. Click en la entrada navega exactamente a linea/columna.

## Caso 2: Error sintactico en archivo no abierto

1. Cerrar `utils.c` si estaba abierto.
2. Introducir error en `utils.c` desde explorer (abrir, editar, guardar, cerrar).
3. Dejar abierto `main.c`.
4. Ejecutar Build.

Esperado:
1. Problema aparece en Problems con ruta de `utils.c`.
2. Click abre `utils.c`.
3. Cursor queda en linea/columna reportada.

## Caso 3: Warning sin error (-Wall -Wextra)

1. Crear warning (ejemplo: variable no usada).
2. Asegurar que no hay errores de compilacion.
3. Ejecutar Build.

Esperado:
1. Aparece warning en Problems con severidad warning.
2. No se clasifica como error.
3. Build se considera exitosa (genera binario) aunque existan warnings.

## Caso 4: Multiples errores en multiples archivos

1. Introducir al menos 2 errores en archivos distintos.
2. Ejecutar Build.

Esperado:
1. Se listan todos los diagnosticos.
2. No solo el primero.
3. Cada click navega al archivo correcto.

## Caso 5: Error global de linker

1. Declarar funcion en header y usarla, pero eliminar su implementacion real.
2. Ejecutar Build.

Esperado:
1. Aparece en Problems diagnostico global (por ejemplo `undefined reference`).
2. Entrada marcada como fallo de build/link (sin ubicacion exacta).
3. Click redirige a Output/Build log (no navegacion de archivo).

## Caso 6: Recompilar tras corregir parcialmente

1. Generar varios diagnosticos.
2. Corregir solo una parte.
3. Recompilar.

Esperado:
1. Desaparecen solo los diagnosticos corregidos.
2. Permanecen los restantes vigentes.

## Caso 7: Recompilar totalmente limpio

1. Corregir todos los errores/warnings.
2. Recompilar.

Esperado:
1. Problems queda vacio.
2. Todos los markers desaparecen.
3. No quedan diagnosticos fantasma.

## Caso 8: Click repetido en Problems

1. En un mismo diagnostico navegable, hacer varios clicks seguidos.

Esperado:
1. No se duplican tabs del mismo archivo.
2. No se duplican markers.
3. El foco del editor se mantiene estable.

## Caso 9: Compilaciones rapidas consecutivas

1. Lanzar Build varias veces en rapida sucesion con cambios de codigo entre builds.

Esperado:
1. No se mezclan resultados viejos/nuevos.
2. Problems muestra solo el resultado mas reciente.
3. Output refleja el comando y stderr de la ultima compilacion.

## Caso 10: Proyecto multiarchivo

1. Tener `main.c` y al menos otro `.c` (por ejemplo `utils.c`) necesarios para link.
2. Ejecutar Build desde `main.c` activo.
3. Revisar logs de debug del build.

Esperado:
1. El comando de build incluye todos los `.c` detectados del proyecto.
2. No compila solo el archivo activo.
3. Si todo esta correcto, link exitoso sin `undefined reference`.

## Nota de depuracion temporal

Durante estas pruebas, validar que se imprimen en consola:
1. Comando exacto de build.
2. Lista de fuentes detectadas.
3. stderr completo.
4. Diagnosticos parseados finales normalizados.
