# Contrato: el correo del digest

Texto plano (`text/plain`), sin HTML, imágenes ni enlaces. Lo escribe `errordigest.Render`; este documento fija su forma para las pruebas y para quien lo lea.

## Asunto

```text
[PediTrack <ENTORNO>] Errores del <d mes> al <d mes año>: <N> (<±M> vs. semana anterior)
```

- `<ENTORNO>` viene de `APP_ENV_LABEL` (p. ej. `DEV`); si está vacío, el asunto empieza por `[PediTrack]`.
- Las fechas son las de la ventana en hora de Ciudad de México, con los nombres fijos de mes del proyecto (`oct`, `nov`…).
- `<N>` es el total de errores de la semana (peticiones + procesos). `(<±M> vs. semana anterior)` solo aparece si hay comparación (`+12`, `-3`, `igual`); si no, se omite.
- Una semana sin errores: `… : 0`.

Ejemplos:

```text
[PediTrack DEV] Errores del 5 oct al 12 oct 2026: 38 (+12 vs. semana anterior)
[PediTrack] Errores del 5 oct al 12 oct 2026: 0
```

## Cuerpo

```text
PediTrack · DEV
Errores del 5 oct al 12 oct 2026 (hora de Ciudad de México)

RESUMEN
- Total: 38 errores en 31 grupos (14 cuentas afectadas)
- Semana anterior: 26 errores (+12)
- Peticiones: 33
- Procesos en segundo plano: 5

PETICIONES (10 grupos más frecuentes)
 1. 14 × 404  /accounts/me — Account not found
    primera: lun 5 oct 09:12 · última: dom 11 oct 22:40
 2. 9 × 500  /children/{childId}/consultations — Could not create consultation
    primera: mar 6 oct 11:03 · última: sáb 10 oct 18:21
 …
 y 21 grupos más que no caben aquí.

PROCESOS EN SEGUNDO PLANO
 1. 3 ×  job:reminders — reminder tick failed: could not read the due doses
    primera: mié 7 oct 03:00 · última: mié 7 oct 03:10
 …

Este correo lo genera el servicio de PediTrack y no incluye datos de personas.
Lo que se ve aquí son los mensajes fijos de error y su conteo; el detalle está en error_logs.
```

### Reglas del cuerpo

1. **Cuentas**: solo el número («14 cuentas afectadas»). Nunca una lista ni un identificador.
2. **Estado HTTP**: en las peticiones va delante del endpoint (`404`); en los procesos no hay estado y la línea empieza por el endpoint `job:…`.
3. **Mensajes**: los de `error_logs`, **limpios** (sin saltos de línea ni caracteres de control, recortados a 160 caracteres con `…`, y con `[correo]`, `[id]` y `[token]` en lugar de cualquier correo, UUID o cadena larga de token que contuvieran).
4. **Hora**: de Ciudad de México, `lun 5 oct 09:12`.
5. **Semana sin errores**: el bloque RESUMEN dice `- Total: 0 errores` y debajo, en lugar de las secciones, **«No hubo errores esta semana.»**
6. **Sin comparación**: la línea de semana anterior dice `- Semana anterior: sin comparación (no hay datos suficientes)`.
7. **Diez grupos por sección** como máximo; si hay más: `y N grupos más que no caben aquí.`
8. **Pie** fijo (las dos líneas finales), siempre presente.

## Lo que el correo NUNCA lleva (verificado por pruebas, SC-004)

Correos electrónicos de personas, tokens, claves, direcciones de dispositivos, identificadores de cuenta o de otro recurso, ni el texto de notas, doctores o medicamentos.
