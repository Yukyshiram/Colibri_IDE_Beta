# Manual Testing: Agrupación de Diagnósticos en Problems Panel

**Objetivo**: Validar que la nueva UX agrupada por archivo funciona correctamente y mantiene toda la funcionalidad existente de navegación.

**Changes Made**:
- Agregar `DiagnosticFileGroup` tipo derivado (no modifica `DiagnosticItem` base)
- Función `groupDiagnosticsByFile()` en `diagnostic-grouping.ts`
- Renderizado con grupos colapsables en `BottomPanel.tsx`
- Estilos para grupos en `BottomPanel.css`
- Estado local para collapse/expand: `collapsedGroups` Set

**Validación**:
- ✅ TypeScript: TS_EXIT:0
- Pendiente: Manual testing en IDE

---

## Pruebas Manuales

### Setup Común
Para todos los casos:
1. Abre Colibrí IDE
2. Abre proyecto C/C++ multiarchivo (mín 2 archivos .c/.cpp)
3. Abre DevTools (F12) si necesitas ver debug logs

---

### Case 1: Agrupación Básica
**Obj**: Verificar que diagnósticos se agrupen por archivo.

**Steps**:
1. En archivo `main.c`: agregar error (ej: variable no declarada)
2. En archivo `utils.c`: agregar warning (ej: variable no usada)
3. Compilar (Ctrl+Shift+B)
4. Ir a tab **Problems**

**Expected**:
- [ ] Panel muestra 2 grupos:
  - Grupo 1: `main.c` (primero porque tiene error)
  - Grupo 2: `utils.c` (después porque solo tiene warning)
- [ ] Cada grupo muestra nombre de archivo
- [ ] Cada grupo muestra contador: `main.c [1]` (error) y `utils.c [1]` (warning)
- [ ] Dentro de cada grupo, los items del error/warning están listados

---

### Case 2: Collapse/Expand
**Obj**: Verificar que puede colapsar y expandir grupos.

**Setup**: Mismo que Case 1 (2 archivos con diagnósticos)

**Steps**:
1. Compilar para obtener diagnósticos agrupados
2. Click en el header del grupo `main.c`
3. Observar que el grupo colapsa (items desaparecen)
4. Click de nuevo en el header
5. Observar que el grupo expande (items reaparecen)

**Expected**:
- [ ] Toggle del grupo funciona suavemente
- [ ] Otros grupos no son afectados (mantienen su estado)
- [ ] Ícono toggle cambia de ▼ (expandido) a ▶ (colapsado)
- [ ] Estado de collapse persiste durante la misma compilación

---

### Case 3: Ordenamiento - Errores Primero
**Obj**: Verificar que archivos con errores aparecen antes que solo warnings.

**Setup**: 
- 3 archivos:
  - `main.c`: 1 error + 1 warning
  - `utils.c`: solo warnings (2+)
  - `math.c`: solo warnings (1)

**Steps**:
1. Introducir diagnósticos según setup
2. Compilar
3. Observar ordenamiento en Problems

**Expected**:
- [ ] Orden de grupos:
  1. `main.c` (1 error, primero porque tiene error)
  2. `utils.c` (solo warnings)
  3. `math.c` (solo warnings)
- [ ] Dentro del mismo nivel (solo warnings), orden alfabético

---

### Case 4: Globales al Final
**Obj**: Verificar que diagnósticos globales (Build & Linker) aparecen al final.

**Setup**:
- Proyecto multiarchivo con `undefined reference` a función no definida
- También un error sintáctico en un archivo

**Steps**:
1. Compilar (falla con error sintáctico + linker error)
2. Observar Problems tab

**Expected**:
- [ ] Primer grupo: archivo con error sintáctico
- [ ] Último grupo: "Build & Linker Diagnostics"
  - [ ] Header tiene fondo visual diferente (rojo tenue)
  - [ ] Contiene mensaje del linker (undefined reference, etc)
  - [ ] Click abre Output tab (no salta a archivo)

---

### Case 5: Contadores Precisos
**Obj**: Verificar que los contadores de errores/warnings son exactos.

**Setup**:
- Un archivo con múltiples errores y warnings (ej: 3 errores, 2 warnings)

**Steps**:
1. Compilar
2. Observar header del grupo

**Expected**:
- [ ] Badge rojo en header: "3" (errores)
- [ ] Badge amarillo en header: "2" (warnings)
- [ ] Suma visual: 3 + 2 = 5 items en la lista cuando expandido
- [ ] Si no hay errores, no aparece badge rojo (solo warnings)

---

### Case 6: Navegación Sigue Funcionando
**Obj**: Verificar que clicks en items siguen abriendo archivos/saltando a línea.

**Setup**: Mismo que Case 1

**Steps**:
1. Compilar
2. En grupo `main.c`, expandido
3. Click en el error dentro del grupo

**Expected**:
- [ ] `main.c` se abre (o enfoca si ya está abierto)
- [ ] Cursor salta a la línea del error
- [ ] Marker de error visible en el editor
- [ ] Comportamiento idéntico a antes (sin agrupar)

---

### Case 7: Recompilación Limpia
**Obj**: Verificar que recompilación limpia limpia todos los grupos.

**Setup**: Está de Case 1 con diagnósticos

**Steps**:
1. Arreglar todos los errores
2. Recompilación (Ctrl+Shift+B)

**Expected**:
- [ ] Problems panel muestra "No se encontraron problemas."
- [ ] No hay grupos ni items fantasma
- [ ] Tab "Problems" badge desaparece o muestra 0

---

### Case 8: Cambio de Tamaño - Nombres Largos
**Obj**: Verificar que nombres de archivo muy largos no rompen la UI.

**Setup**:
- Proyecto con archivo: `src/components/very_long_descriptive_name_for_utilities_module.c`

**Steps**:
1. Agregar error en ese archivo
2. Compilar
3. Observar header del grupo en Problems

**Expected**:
- [ ] Nombre del archivo se trunca con `...` si es muy largo
- [ ] No causa scroll horizontal
- [ ] Contadores de errores/warnings aún visibles
- [ ] Hover muestra el nombre completo en tooltip (opcional)

---

### Case 9: Múltiples Builds Consecutivos
**Obj**: Verificar que collapse state no genera confusión en builds consecutivos.

**Setup**: 2 compilaciones seguidas

**Steps**:
1. Compilación 1: obtener diagnósticos, colapsar algunos grupos
2. Inmediatamente: Compilación 2 (cambiar un error a otro archivo)

**Expected**:
- [ ] Después de compilación 2, estado de collapse se **resetea**
- [ ] Todos los grupos nuevos aparecen expandidos por default
- [ ] No hay items fantasma del build anterior

---

### Case 10: Mixed Scenarios - Todo Junto
**Obj**: Validar UX completa en escenario realista.

**Setup**: Proyecto real o realista con:
- 3+ archivos
- Mix de errores sintácticos + warnings + linker errors
- Algunos diagnósticos navegables, otros globales

**Steps**:
1. Compilar (fallará con mix de diagnosticos)
2. Review Problems:
   - [ ] Agrupados por archivo, orden correcto
   - [ ] Globales al final
   - [ ] Contadores visibles
3. Click en varios items:
   - [ ] Navegables (sintáctica): abren archivo, saltan a línea
   - [ ] Globales (linker): abren Output tab
4. Colapsar/expandir algunos grupos
5. Arreglar algunos errores
6. Recompilación: verifica que solo desaparecen los arreglados

**Expected**:
- [ ] Todo funciona sin errores
- [ ] UX es intuitiva y no confusa
- [ ] Performance es responsiva (sin lag)

---

## Regresión Testing

Verify que cambios no rompieron funcionalidad existente:

### Compilación y Diagnosticos Base
- [ ] Compilación exitosa genera binario
- [ ] stderr se parsea correctamente
- [ ] Compiler diagnostics tienen file:line:column
- [ ] Linker errors se detectan como globales

### Navegación
- [ ] Click en error de compilador abre archivo
- [ ] Click en linker error abre Output tab
- [ ] Cursor salta a línea correcta
- [ ] No se abren tabs duplicados

### UI General
- [ ] Tab Problems muestra badge con conteo de errores
- [ ] Output tab aún muestra compilación exitosa/fallida
- [ ] Console y Terminal tabs no son afectados

---

## Summary

After completing all 10 manual cases:

| Case | Status | Notes |
|------|--------|-------|
| 1    | ☐✓/☐❌ | Agrupación |
| 2    | ☐✓/☐❌ | Collapse/Expand |
| 3    | ☐✓/☐❌ | Ordenamiento |
| 4    | ☐✓/☐❌ | Globales |
| 5    | ☐✓/☐❌ | Contadores |
| 6    | ☐✓/☐❌ | Navegación |
| 7    | ☐✓/☐❌ | Limpieza |
| 8    | ☐✓/☐❌ | Nombres |
| 9    | ☐✓/☐❌ | Builds |
| 10   | ☐✓/☐❌ | Completo |

**Regresión**: ☐ Pass / ☐ Fail

---

## Debugging

**If a case fails**:
1. F12 Console → look for errors or warnings
2. Check that `groupDiagnosticsByFile()` is correctly imported
3. Verify `collapsedGroups` state is being managed
4. Check CSS classes are applied correctly
5. Verify no console.error related to DiagnosticFileGroup type

**CSS Classes to Inspect**:
- `.diagnostic-group`
- `.diagnostic-group-header`
- `.diagnostic-group-toggle` (toggle ícono)
- `.diagnostic-count-error` / `.diagnostic-count-warning` (badges)
- `.diagnostic-group-items`

---

## Rollback Plan

If something breaks:
1. Revert BottomPanel.tsx to render flat `.diagnostics-list` (comentar `.diagnostics-groups`)
2. Revert state deletion: remove `collapsedGroups` y `toggleGroupCollapse`
3. TS will still compile (DiagnosticFileGroup type es additive)
4. Redeploy

**Minimal loss**: Solo pierde la agrupación UX, funcionalidad base intacta.
