# Tareas: Homologar las pantallas a los mocks

**Spec**: [spec.md](./spec.md)

- [x] **T001** Inventario de mocks disponibles y estado por pantalla (tabla de la spec).
- [x] **T002** Home: verificar por diff contra el código del diseño (`repo-pr/`): idéntico salvo `AppShell` y portal.
- [x] **T003** Escritorio: `/home` abre el detalle del hijo activo (mock 6, "Home con detalle").
- [x] **T004** Mocks recibidos (tablero + `repo-pr/mockups/01…15`).
- [x] **T005** Registro (01 / 11): dos diseños, sin contraseña, primer hijo dentro del formulario.
- [x] **T006** Home móvil (tablero 2: saludo, avatar, chips por hijo) y web (15).
- [x] **T007** Detalle del hijo móvil (02) y web (tablero 6); "Marcar tomas".
- [x] **T008** Detalle de consulta móvil (03) y web (13): chips por día, visor de la receta.
- [x] **T009** Nueva consulta como página (04 / 14) con OCR, progreso y confirmación al salir.
- [x] **T010** Modales: límite del plan gratuito (05 / 15) y "Agregar hijo" (tablero 7).
- [x] **T011** Barra lateral web (280 px) y separación móvil/web con `useIsDesktop`.
- [x] **T012** Comparación lado a lado por pantalla (mock vs app al mismo ancho) y lista de desviaciones (spec).
- [x] **T013** Pruebas unitarias (>90 %) y E2E en ambos diseños (móvil 390 y web 1280) de cada flujo: botones,
  campos, validaciones, foco, Escape, pop-ups.
- [x] **T014** Revisión página por página (2026-09-20): registro web (11) y móvil (01), detalle del hijo móvil (02); E2E propio del detalle móvil (`detalle-hijo-movil.spec.ts`).
