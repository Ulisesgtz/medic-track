# Plan de Implementación: Marcado inmediato de tomas y confirmaciones propias

**Rama**: `feature/066-marcado-inmediato-confirmaciones` | **Fecha**: 2026-11-11 | **Spec**: [spec.md](spec.md)
**Entrada**: Especificación de `specs/066-marcado-inmediato-confirmaciones/spec.md`. Sin mock.

## Resumen

Dos cambios en cómo responde la pantalla, sin tocar el servidor.

**Marcado inmediato.** Un registro en memoria de las marcas que aún no confirma el servidor (`shared/marks/`). Los hooks que leen tomas aplican ese registro a sus datos, así que la toma, los conteos y las barras cambian al instante en las siete pantallas donde se marca. Cada toma manda una petición a la vez; al responder se escribe en la caché lo que el servidor guardó, y al fallar la pantalla vuelve atrás con un aviso único (`MarkNotice`).

**Confirmaciones propias.** `ConfirmDialog` pasa de `features/family/` a `shared/ui/` y un hook, `useDiscardGuard`, reemplaza los 11 `window.confirm` de los formularios y del aviso de versión nueva.

**Alcance:** solo frontend. Sin API, migración ni dependencias nuevas (research R1–R13).

## Contexto Técnico

**Lenguaje/Versión**: TypeScript 5 · React 19
**Dependencias Principales**: TanStack Query, React Router, Clerk y Tailwind CSS v4. Ninguna nueva.
**Almacenamiento**: N/A. El registro de marcas vive en memoria; nada va a `localStorage`.
**Pruebas**: Vitest + Testing Library (> 90 %) y Playwright (`e2e/marcado-inmediato.spec.ts` y `e2e/confirmaciones.spec.ts` nuevas; cuatro E2E existentes actualizadas), a 390 y 1280 px.
**Plataforma Objetivo**: PWA (iPhone/Android y navegador de escritorio)
**Tipo de Proyecto**: aplicación web (frontend)
**Objetivos de Rendimiento**: el cambio se ve en menos de 100 ms tras el toque (SC-001); aplicar el registro es un recorrido de las tomas ya cargadas, que no hace nada cuando el registro está vacío.
**Restricciones**:
- Principio I: ningún texto evalúa ni aconseja; el aviso dice qué pasó con la marca.
- Nunca queda marcada una toma que el servidor no guardó (FR-005).
- El reloj del teléfono no decide ningún estado (FR-011).
- Dos diseños que nunca se mezclan (`useIsDesktop`).
- Colores solo por tokens; áreas táctiles de 44 px; contraste de 4.5:1.

**Escala/Alcance**: 2 módulos compartidos nuevos, 6 mutaciones, 8 hooks de lectura, 9 formularios, 1 aviso, y las pruebas de unos 14 archivos que hoy dependen del cuadro del navegador.

## Verificación de la Constitución

| Principio | Cumple | Cómo |
|---|---|---|
| I. Registra, nunca interpreta | ✅ | Los avisos dicen si la marca se guardó o no, y quién la marcó antes. Ninguno habla de la salud, de dosis ni de qué hacer con el medicamento. Sin rojo ni la palabra «error». La prueba de redacción cubre los textos nuevos. |
| II. Privacidad | ✅ | Nada nuevo sale del teléfono ni se guarda en él. El aviso solo repite el nombre y la hora que ya están en pantalla. |
| III. Captura de fotos | ✅ | Sin cambios. Cancelar el diálogo conserva la foto elegida (FR-017). |
| IV. Freemium sin perder datos | ✅ | Marcar nunca dependió del plan y sigue igual. |
| V. Piezas pequeñas | ✅ | El registro, la función que lo aplica y la función que ordena las peticiones son puros y chicos. Un diálogo y un hook compartidos sustituyen once llamadas sueltas. |
| VI. Pruebas | ✅ | Unitarias del registro, del orden de peticiones, del aviso y del hook; E2E con la respuesta retrasada, con la red cortada y con dos sesiones, a 390 y 1280 px. |

Sin violaciones. Se revisó de nuevo después del diseño y sigue igual.

**Riesgo que el diseño atiende**: mostrar algo que el servidor no ha confirmado es el punto delicado en datos de salud. Lo cubren tres reglas: una petición a la vez por toma (research R5), la reversión con aviso en toda falla (R7) y que al terminar siempre se vuelven a pedir los datos al servidor.

## Estructura del Proyecto

### Documentación (esta funcionalidad)

```text
specs/066-marcado-inmediato-confirmaciones/
├── spec.md
├── plan.md              # este archivo
├── research.md          # R1–R13: qué hay hoy, qué responde el servidor y cada decisión
├── data-model.md        # el estado en memoria (sin datos nuevos)
├── quickstart.md        # cómo validarlo con pruebas y a mano
├── contracts/ui.md      # lo que se ve: estados de la toma, textos del aviso y del diálogo
└── checklists/requirements.md
```

### Código Fuente (raíz del repositorio)

```text
frontend/src/
├── shared/marks/                      # NUEVO
│   ├── pendingMarks.ts                # el registro: set, clear, subscribe; «slow» a los 2 s
│   ├── applyPendingMarks.ts           # puro: datos + registro → datos mostrados
│   ├── requestMark.ts                 # una petición a la vez por toma; último toque gana
│   ├── writeDoseToCaches.ts           # la toma del servidor a toda caché que la tenga
│   ├── markNotices.ts                 # el registro de avisos
│   ├── markText.ts                    # los textos del aviso y «guardando…»
│   ├── MarkNotice.tsx                 # la barra (teléfono) o tarjeta (web)
│   ├── usePendingMark.ts              # { pending, slow } de una toma
│   └── *.test.ts(x)
├── shared/ui/
│   ├── ConfirmDialog.tsx              # movido desde features/family/, + `body`
│   ├── useDiscardGuard.tsx            # NUEVO: guardLink, guardAction, dialog
│   └── noWindowConfirm.test.ts        # NUEVO: falla si vuelve un window.confirm
├── shared/appVersion/UpdateNotice.tsx # usa el diálogo
├── features/consultations/
│   ├── useDoseToggle.ts               # las dos mutaciones pasan por requestMark
│   ├── hooks de lectura               # aplican applyPendingMarks
│   ├── DoseRow.tsx                    # sin `disabled` por espera; «guardando…»
│   ├── ConsultationForm.tsx           # confirmLeave → onLeaveClick
│   └── NewConsultationPage.tsx, EditConsultationPage.tsx
├── features/supplements/              # hooks.ts, RoutineDoseChip, RealizadoButton, RoutineDetailPage, RoutineFormPage
├── features/childDetail/ChildTodayCard.tsx
├── features/home/                     # ChildDayCard, TuDia, useChildDay, AppShell (monta MarkNotice)
├── features/profile/hooks.ts
├── features/childDevice/phone/        # hooks.ts, ChildTodayPage (monta MarkNotice)
├── features/appointments/AppointmentFormPage.tsx
├── features/medicineCabinet/CabinetFormPage.tsx
├── features/growth/GrowthFormPage.tsx
├── features/childProfile/EditChildPage.tsx
├── features/vaccinations/VaccineDialog.tsx
└── (12 archivos que importan ConfirmDialog: solo cambia la ruta del import)

frontend/e2e/
├── marcado-inmediato.spec.ts          # NUEVO
├── confirmaciones.spec.ts             # NUEVO
└── actualizar, cartilla, detalle-consulta-hijo, nueva-consulta-web  # dejan de aceptar el cuadro del navegador

CLAUDE.md, frontend/CLAUDE.md          # la spec 066 y los módulos nuevos
```

**Decisión de Estructura**: lo de marcar va en `shared/marks/` porque lo usan cinco funcionalidades (consultas, suplementos, inicio, perfil y teléfono del hijo) y ninguna es su dueña. `ConfirmDialog` sube a `shared/ui/` por la misma razón: ya lo usan doce archivos fuera de «Familia».

## Orden de construcción

1. **Base**: `shared/marks/` completo con sus pruebas, sin conectar a ninguna pantalla.
2. **Historia 1 y 2 juntas** (son la misma pieza vista por los dos lados): conectar las seis mutaciones y los hooks de lectura, pantalla por pantalla, empezando por el detalle de la consulta; montar `MarkNotice`.
3. **Historia 3**: mover `ConfirmDialog`, escribir `useDiscardGuard` y cambiar los formularios uno por uno; `UpdateNotice` y la vacuna al final.
4. **Cierre**: E2E, cobertura, la prueba que prohíbe `window.confirm` y los mapas de `CLAUDE.md`.

Las historias 1–2 y la 3 no comparten archivos, salvo `AppShell`, y cada una se puede entregar sola.

## Seguimiento de Complejidad

Sin violaciones que justificar.
