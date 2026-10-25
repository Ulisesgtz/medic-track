# Desviaciones del mock (spec 050)

Mock: Claude Design, proyecto `f4e28757-d885-471d-b5b9-6e6ca094449a` — «Exportar PDF - Pantallas.dc.html» (+ `ExportarPanel.dc.html`) y «Exportar PDF - Documento.dc.html» (copia en esta carpeta).

| # | Mock | App | Motivo |
|---|---|---|---|
| 1 | Talla y peso «anotada el 2 jun 2026» | Talla y peso sin fecha | La fecha no se guarda; decisión del dueño (2026-10-25). Llegará con las curvas de crecimiento. |
| 2 | Barra superior web (Hoy / Historial / Cartilla / Familia) y selector «Mateo ▾» | La app conserva su barra lateral (`AppShell`) | Es contexto del diseño, no una pantalla nueva. |
| 3 | «Página 4 de 5» mientras se genera | Avance por etapas (datos, fotos, armado) y el número de páginas al terminar | La biblioteca arma el documento de una vez, sin aviso por página (research R1). |
| 4 | Filtros del Historial web como lista de selectores a la izquierda | Los filtros actuales del Historial (spec 031) no cambian | El mock los dibuja como contexto; solo se agrega el botón. |

Se agregará a esta tabla cualquier otra diferencia que salga al medir la app contra el mock.
