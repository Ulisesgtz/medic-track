# Desviaciones del mock (spec 050)

Mock: Claude Design, proyecto `f4e28757-d885-471d-b5b9-6e6ca094449a` — «Exportar PDF - Pantallas.dc.html» (+ `ExportarPanel.dc.html`) y «Exportar PDF - Documento.dc.html» (copia en esta carpeta).

| # | Mock | App | Motivo |
|---|---|---|---|
| 1 | Talla y peso «anotada el 2 jun 2026» | Talla y peso sin fecha | La fecha no se guarda; decisión del dueño (2026-10-25). Llegará con las curvas de crecimiento. |
| 2 | Barra superior web (Hoy / Historial / Cartilla / Familia) y selector «Mateo ▾» | La app conserva su barra lateral (`AppShell`) | Es contexto del diseño, no una pantalla nueva. |
| 3 | «Página 4 de 5» mientras se genera | Avance por etapas (datos, fotos, armado) y el número de páginas al terminar | La biblioteca arma el documento de una vez, sin aviso por página (research R1). |
| 4 | Filtros del Historial web como lista de selectores a la izquierda | Los filtros actuales del Historial (spec 031) no cambian | El mock los dibuja como contexto; solo se agrega el botón. |

| 5 | El mock solo dibuja tres fichas (marcada, sin registrar, por venir) | Una toma cuya hora ya llegó y nadie marcó («por marcar») es una ficha de contorno ámbar **sólido** y el registro dice «1 por marcar» | El mock no la contempla; se distingue de «sin registrar» (punteada) por la línea, como pide FR-018. |
| 6 | «(continuación)» es un bloque grande con raya punteada dentro del contenido y «Continúa en la página 3 →» al final de la consulta | «(continuación)» es una línea de 13 px en el espacio bajo el encabezado y «Continúa en la página N →» va a la derecha sobre el pie; las páginas de consultas guardan 22 px más abajo para esa línea | Los elementos fijos dentro del contenido descomponen el acomodo de la biblioteca (textos encimados; visto el 2026-10-30). Se calculan en la primera pasada con marcas invisibles y se dibujan en los márgenes, donde no mueven nada. |
| 7 | Medicamento de una consulta «solo registro»: «una sola toma el 13 ago · sin registro de tomas en la app» | «cada 24 h · 1 día» y debajo «sin registro de tomas en la app» | La app guarda frecuencia y duración, no «una sola toma». |
| 8 | Dosis sin número: «Única» | «—» | La cartilla no guarda si una dosis es única; solo su número cuando el padre lo escribe. |
| 9 | Filtros del caso C: «Tipo: Consultas» | El tipo se escribe como en el Historial: «Con tratamiento» o «Solo registro»; «todas» no se escribe | No existe el tipo «Consultas» en la búsqueda (spec 031). |
| 10 | En el caso A la consulta del 12 sep cruza de la página 2 a la 3 | Cabe completa en la página 2 | El documento queda un poco más compacto que el mock (sin la foto de la receta, que es de la US2). El cruce se prueba con una consulta de notas largas (`HistoryDocument.test.tsx`). |

Se agregará a esta tabla cualquier otra diferencia que salga al medir la app contra el mock.
