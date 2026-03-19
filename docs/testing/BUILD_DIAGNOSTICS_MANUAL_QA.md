# Manual QA Checklist: Build Pipeline & Diagnostics

**Objetivo**: Validar end-to-end que el sistema de compilación multiarchivo, parseo de diagnosticos (compiler + linker), y UX del Problems panel funciona correctamente en 10 escenarios críticos.

**Precedentes**:
- Automated tests (vitest): `npm test` - 6 tests de parser lógica ✓
- Este documento: 10 escenarios UI/integration end-to-end

**Instrucciones generales**:
1. Para cada caso, sigue los pasos exactos
2. Verifica el resultado esperado
3. Marca ✓ cuando pase, anota ❌ y detalles si falla
4. Los cases están ordenados de simple a complejo

---

## Case 1: Error Sintáctico en Archivo Abierto
**Obj**: Verificar que errores de compilador aparecen en Problems con ubicación navegable cuando el archivo está abierto.

**Setup**:
- Abre proyecto C/C++ con múltiples archivos
- Abre `main.c` en editor

**Steps**:
1. Agregar error sintáctico a propósito: quitar `;` en una línea
2. Presionar Ctrl+Shift+B para compilar (o Build en command palette)
3. Verificar que la compilación falle
4. Ir a tab **Problems**

**Expected**:
- [ ] Problems panel muestra error con ubicación `main.c:LINE:COL`
- [ ] Click en el error abre `main.c` (ya está abierto)
- [ ] Editor muestra marker de error en la línea correcta
- [ ] Cursor salta a línea/columna exacta del error

---

## Case 2: Error en Archivo Cerrado (Debe Abrir)
**Obj**: Verificar que clicking en diagnostic de archivo cerrado lo abre automáticamente.

**Setup**:
- Proyecto multiarchivo abierto
- `utils.c` NO está abierto en editor
- `utils.c` está en el árbol de archivos

**Steps**:
1. Introducir error sintáctico en `utils.c`
2. Compilar (Ctrl+Shift+B)
3. Ir a tab **Problems**
4. Click en el diagnostic que apunta a `utils.c`

**Expected**:
- [ ] `utils.c` se abre automáticamente en una nueva pestaña
- [ ] Se convierte en archivo activo
- [ ] Cursor salta a línea:columna del error
- [ ] Marker visible en la línea

---

## Case 3: Warning sin Error (Bloqueo de Compilación)
**Obj**: Verificar que warnings aparecen con `-Wall -Wextra`, pero NO bloquean compilación exitosa.

**Setup**:
- Crear variable no usada en `main.c`: `int unused = 5;`
- Compilar

**Steps**:
1. Compilar (Ctrl+Shift+B)
2. Observar Output tab

**Expected**:
- [ ] Compilación marca **exitosa** (mensaje "Compilación exitosa" en Output)
- [ ] Problems tab muestra warning con severidad "warning" (ícono ⚠)
- [ ] Binario se genera (output message muestra `[Binario] ...`)
- [ ] El tab "problems" muestra 0 errores, N advertencias

---

## Case 4: Múltiples Errores en Múltiples Archivos
**Obj**: Verificar que parseo simultáneo de múltiples errores identifica archivo/línea/columna correcto para cada uno.

**Setup**:
- Proyecto con al menos 3 archivos fuente (e.g., `main.c`, `math.c`, `utils.c`)

**Steps**:
1. Introducir error diferente en cada archivo:
   - `main.c`: variable no declarada
   - `math.c`: `}` mismatched o similar
   - `utils.c`: falta return en función int
2. Compilar
3. Review Problems panel

**Expected**:
- [ ] Todos los 3 errores aparecen listados
- [ ] Cada uno muestra ubicación correcta: `filename:line:column`
- [ ] Orden es consistente (por archivo vs línea)
- [ ] Click en cada uno navega al archivo correcto
- [ ] Counter en Problems muestra "3 error(es)"

---

## Case 5: Linker Error (Undefined Reference)
**Obj**: Verificar que errores del linker sin ubicación de archivo se muestran como "build:global" y son no-navegables.

**Setup**:
- Proyecto multiarchivo
- `main.c` llama función `void my_function();`
- `other.c` tiene `void other_function() { ... }` (la función llamada NO existe)

**Steps**:
1. Compilar
2. Observar que compilación falla
3. Review Problems panel

**Expected**:
- [ ] Problems tab abre automáticamente
- [ ] Al menos un diagnostic tiene ubicación **"build:global"**
- [ ] Message contiene "undefined reference" o similar
- [ ] El diagnostic está marcado con clase `diagnostic-global` (visually distinct)
- [ ] Click en el diagnostic navega a **Output tab** (no a editor)
- [ ] Output tab muestra el mensaje del linker

---

## Case 6: Recompilación Después de Arreglar Parcialmente
**Obj**: Verificar que al arreglar algunos errores, solo esos desaparecen del Problems panel.

**Setup**:
- Usando setup del Case 4 (3 archivos con 3 errores)
- Todos los 3 errores visibles en Problems

**Steps**:
1. Arreglar el error en `main.c` solamente (dejar otros 2)
2. Recompilación (Ctrl+Shift+B)
3. Review Problems panel

**Expected**:
- [ ] Problems ahora muestra solo 2 errores (los de `math.c` y `utils.c`)
- [ ] Error de `main.c` desapareció
- [ ] Error de `math.c` aún en lista con ubicación correcta
- [ ] Counter muestra "2 error(es)"

---

## Case 7: Recompilación Limpia (Sin Errores)
**Obj**: Verificar que compilación exitosa sin warnings limpia el Problems panel completamente.

**Setup**:
- Caso anterior con 2 errores pendientes
- Arreglar ambos errores
- Sin warnings nuevos

**Steps**:
1. Arreglar los 2 errores restantes
2. Recompilación (Ctrl+Shift+B)
3. Review Problems panel

**Expected**:
- [ ] Compilación marca exitosa
- [ ] Problems tab muestra "No se encontraron problemas."
- [ ] Bottom message muestra "[Compilación exitosa]" + binario path
- [ ] No hay "phantom diagnostics" del build anterior

---

## Case 8: Clicks Repetidos en Mismo Diagnostic (No Duplica)
**Obj**: Verificar que clicking múltiples veces en el mismo error no abre múltiples tabs del mismo archivo.

**Setup**:
- Proyecto con al menos 1 error
- Problems panel visible
- Archivo del error cerrado inicialmente

**Steps**:
1. Click en diagnostic 1 (abre archivo, muestra marker)
2. Click en mismo diagnostic again
3. Click en mismo diagnostic 3era vez
4. Observar tab list en editor

**Expected**:
- [ ] Archivo se abre en tab 1
- [ ] Después de clicks adicionales: **MISMO tab enfocado**, no múltiples tabs duplicados
- [ ] Tab count en editor no cambia después del click inicial
- [ ] Cursor saltó al punto del error en cada click

---

## Case 9: Compilaciones Consecutivas Rápidas (Race Condition)
**Obj**: Verificar que al ejecutar N compilaciones rápidas seguidas, el Problems panel muestra solo los resultados del **último build**, no mezcla.

**Setup**:
- Proyecto multiarchivo
- 3 archivos con errores diferentes en cada uno

**Steps**:
1. Introducir Error A en `main.c`
2. Compilar (Ctrl+Shift+B) → observa resultado
3. Cambiar error para Error B en `utils.c` (quitar A del editor)
4. Compilar inmediatamente (antes de que tab anterior cierre)
5. Cambiar error para Error C en `math.c`
6. Compilar inmediatamente
7. Review final Problems after ~2s estabilización

**Expected**:
- [ ] Problems panel muestra solo errores del **último build** (Error C context)
- [ ] No hay entradas de Error A o Error B del build anterior
- [ ] Message en Output tab refleja último comando ejecutado
- [ ] Source files list muestra compilación #3 (latest)
- [ ] [DEBUG][Build] logs en console (F12) muestran 3 compilaciones sin mezcla

---

## Case 10: Proyecto Multiarchivo - Todos los Fuentes Compilados
**Obj**: Verificar que comando de compilación incluye TODOS los .c/.cpp del proyecto recursivamente, no solo archivo activo.

**Setup**:
- Proyecto con estructura: 
  ```
  project/
    main.c       (tiene main())
    src/
      utils.c    (función helper)
    lib/
      math.c     (función math)
  ```

**Steps**:
1. Abrir solo `main.c` en editor (utils.c y math.c cerrados)
2. En `main.c`: Llamar `my_helper_function()` (definida en `src/utils.c`)
3. Compilar (Ctrl+Shift+B)

**Expected**:
- [ ] Compilación **EXITOSA** (no hay undefined reference)
- [ ] Source files logged (f12 console): contém los 3 archivos: `main.c`, `src/utils.c`, `lib/math.c`
- [ ] Debug log `[DEBUG][Build] Command:` muestra comando con todos 3 archivos
- [ ] `-Wall -Wextra` flags presente en command preview
- [ ] Binario generado y reportado en Output

---

## Summary / Signing Off

After completing all 10 cases, fill in:

| Case | Status | Notes |
|------|--------|-------|
| 1    | ☐✓/☐❌ | |
| 2    | ☐✓/☐❌ | |
| 3    | ☐✓/☐❌ | |
| 4    | ☐✓/☐❌ | |
| 5    | ☐✓/☐❌ | |
| 6    | ☐✓/☐❌ | |
| 7    | ☐✓/☐❌ | |
| 8    | ☐✓/☐❌ | |
| 9    | ☐✓/☐❌ | |
| 10   | ☐✓/☐❌ | |

**Final**: ` ` Todos los 10 casos pasaron → Pipeline listo para producción  
**Fallidas**: Indicar cuáles fallaron y reproducción

---

## Debugging Tips

**If a case fails**:
1. Open Browser DevTools (F12) → Console tab
2. Look for `[DEBUG][Build]` logs that show:
   - Exact command being run
   - Source files discovered
   - Raw stderr from compiler
   - Parsed diagnostics array
3. For linker errors, search stderr for `undefined reference`, `ld returned`, `collect2`
4. For UI issues, check if diagnostic has `navigable: true` vs `false`

**Reset between cases**:
- Delete generated binaries manually if needed
- Restart IDE if diagnostics panel seems stuck
- Clear browser console between test runs
