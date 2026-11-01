# Desviaciones del diseño del inicio (spec 055)

Lo que la app hace distinto de `Inicio PediTrack.dc.html`, con su motivo. Se llena al construir y comparar lado a lado
(390 y 1280 px).

| # | Qué | Diseño | App | Motivo | Estado |
|---|---|---|---|---|---|
| 1 | Familia de un Cuidador en «Lo demás» | «Familia Morales · cuidadora» | «Familia Morales · Cuidador» (la etiqueta del rol de `family/roles.ts`) | La app no sabe ni supone el género de la persona | Abierta |
| 2 | Nombre de la familia de un Cuidador (subtítulo de los hijos) | «Familia Morales · puedes ver y marcar» | «Familia de Ana · puedes ver y marcar» | El API da el nombre de pila de la dueña (`family.ownerName`), no un apellido de familia; es la misma forma de «Incluido por la familia de Ana» (spec 034) | Abierta |
| 3 | La tarjeta del hijo tras «Marcar» | «✓ 13:22» se queda | «✓ HH:MM» un minuto (un refresco) y luego la siguiente toma por marcar | Si se quedara, la siguiente toma no aparecería hasta salir del inicio | Abierta |
| 4 | La barra lateral web | Inicio, hijos, «+ Agregar hijo», Personal y la cuenta | Además conserva «Familia» y «Planes» | La barra está en todas las pantallas; sin ellos, en la web no habría cómo llegar a Familia o a Planes desde otra pantalla que no sea el inicio | Abierta |
| 5 | «Recordatorios» en «Lo demás» | Una fila con «Activados» | La fila abre debajo la tarjeta de recordatorios (activar, desactivar, qué muestran) | No hay una pantalla de recordatorios y el permiso del navegador se pide desde esa tarjeta (spec 011) | Abierta |
| 6 | El menú de la cuenta | Botón «Menú de cuenta» (no dibuja el panel) | Un panel con nombre, plan y «Cerrar sesión» | El diseño no dibuja el contenido del menú | Abierta |
