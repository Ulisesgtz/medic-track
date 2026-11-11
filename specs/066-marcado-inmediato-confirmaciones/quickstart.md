# Quickstart: validar el marcado inmediato y las confirmaciones propias

## Requisitos

- La base local al día (sin migración nueva).
- El backend y el frontend corriendo (`npm run dev`).
- Una cuenta de pago con un hijo, una consulta con un medicamento con tomas hoy, un suplemento y una actividad; una segunda persona Tutora en la familia para el caso de dos teléfonos.

## 1. Pruebas automáticas

```bash
cd frontend
npx vitest run --coverage
npx tsc --noEmit && npx eslint src
npx playwright test marcado-inmediato confirmaciones actualizar cartilla detalle-consulta-hijo nueva-consulta-web
```

Resultado esperado:

- todo pasa y la cobertura sigue arriba del 90 %;
- `shared/marks/` y `shared/ui/useDiscardGuard` tienen sus pruebas;
- la prueba que prohíbe `window.confirm` en `src/` pasa;
- la prueba de redacción (Principio I) cubre los textos nuevos;
- las E2E corren a 390 y a 1280 px.

## 2. Marcado inmediato, a mano

En las herramientas del navegador, pestaña Red, elige «3G lenta» (o un retraso de 3 s).

| # | Haz esto | Debe pasar |
|---|---|---|
| 1 | En el detalle de la consulta toca «Marcar» | La toma se ve marcada al instante; a los 2 s dice «guardando…»; al responder, «✓ HH:MM · por <tu nombre>» |
| 2 | Marca cinco tomas seguidas sin esperar | Las cinco responden al toque y las cinco quedan guardadas (recarga para comprobar) |
| 3 | Toca la misma toma tres veces rápido | Queda en el estado del último toque; al recargar, igual |
| 4 | Pon la red «Sin conexión» y toca «Marcar» | Se marca, vuelve atrás y aparece «No se guardó la marca de … Revisa tu conexión e inténtalo de nuevo.» |
| 5 | Vuelve la conexión y toca otra vez | Se guarda y el aviso desaparece |
| 6 | Con dos sesiones (dos navegadores), marca la misma toma en las dos casi a la vez | La segunda ve «<Nombre> ya había marcado …» y la marca de la otra persona, con candado si no puede quitarla |
| 7 | Deja una marca esperando más de 60 s (retraso largo) | El refresco automático no la borra |
| 8 | «✓ Realizado» en una actividad | «N de M», la barra y «Última» avanzan al instante |
| 9 | Repite 1, 4 y 8 en: «Hoy» del hijo, tarjeta del hijo y «Tu día» del inicio, `/yo`, detalle de suplemento y `/hijo/hoy` | Igual en todas |
| 10 | Con VoiceOver o NVDA, repite 4 | El aviso se anuncia y el foco no se mueve |

## 3. Confirmaciones, a mano

En cada formulario de la tabla de [contracts/ui.md](contracts/ui.md), a 390 y a 1280 px:

1. Escribe algo y toca «← Cancelar» (o cerrar): aparece el diálogo de la app, no el del navegador, con el foco en «Seguir editando».
2. Escape, «×», tocar fuera y «Seguir editando»: se cierra y lo escrito sigue ahí. En «Nueva consulta», también la foto.
3. «Descartar»: sale a donde ibas.
4. Sin escribir nada: sale sin preguntar.
5. Tab y Mayús+Tab no salen del diálogo.

«Actualizar»: con un formulario a medias, publica un build nuevo (o cambia `version.json`), espera el aviso y toca «Actualizar»: pregunta con el diálogo de la app y solo recarga con «Actualizar».

Vacuna: con el diálogo de vacuna a medias, ciérralo: la confirmación queda encima; «Seguir editando» regresa a la vacuna con lo escrito.

## 4. Antes de dar por terminado

- Ningún texto nuevo evalúa ni aconseja (Principio I).
- Ningún color literal en las clases (`noColorLiterals`).
- `CLAUDE.md` y `frontend/CLAUDE.md` nombran la spec 066, `shared/marks/` y el `ConfirmDialog` en `shared/ui/`.
