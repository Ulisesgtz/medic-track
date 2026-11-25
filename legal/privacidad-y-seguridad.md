# Privacidad y seguridad en PediTrack

> **BORRADOR — 2026-11-22.** Texto para la página pública «Privacidad y seguridad». Explica en lenguaje simple lo que el
> Aviso de privacidad dice en términos legales. Debe revisarlo un abogado antes de publicarse. Lo que va entre
> corchetes `[ ]` lo completa el dueño.

PediTrack guarda información de la salud de tu familia. Por eso la tratamos con el mismo cuidado con que tú la
guardarías: solo la usamos para que la app funcione, nunca la vendemos y siempre puedes llevártela o borrarla.

## Lo que sí hacemos

- **Usamos tus datos solo para que la app funcione**: mostrarte tus consultas, tus tomas, tus avisos y lo que compartes con
  tu familia.
- **La receta se lee en tu teléfono.** Cuando tomas la foto de una receta, de la cartilla o de una caja de medicina, el
  texto se lee en tu propio teléfono. La foto solo se guarda en tu cuenta para que la vuelvas a ver.
- **Tú decides quién ve qué.** Solo las personas que tú invitas a tu familia ven la información de tus hijos, y con el
  permiso que les das (Tutor o Cuidador). Tus propias consultas son privadas hasta que tú decidas compartirlas.
- **Puedes llevarte todo.** En «Mi cuenta» descargas todos tus datos en un archivo, cuando quieras y en cualquier plan.
- **Puedes borrar tu cuenta.** Al pedirlo, tu cuenta queda en pausa 30 días (por si cambias de opinión) y después se
  borra por completo.

## Lo que nunca hacemos

- **No vendemos ni rentamos tus datos**, a nadie.
- **No mostramos anuncios** ni usamos tu información para publicidad.
- **No mandamos tus recetas a servicios de inteligencia artificial** para leerlas.
- **No interpretamos tu información**: PediTrack no diagnostica ni da consejos médicos. Registra y te recuerda; no
  sustituye a tu médico.
- **No guardamos tu contraseña.** El inicio de sesión lo maneja un proveedor especializado ([Clerk](https://clerk.com)).
- **No vemos tu tarjeta.** El pago del plan completo se hace en la página de Mercado Pago.
- **No te seguimos en el sitio.** El sitio público (pedi-track.com) solo usa estadísticas de visitas agregadas que calcula
  Cloudflare en su servidor, sin cookies ni identificarte. La app vive en app.pedi-track.com.

## Cómo protegemos tu información

- **Conexión cifrada** (HTTPS) entre tu teléfono y nuestros servidores.
- **Cada petición se revisa**: el servidor comprueba en cada momento quién eres y qué puedes ver; si alguien deja la
  familia, pierde el acceso al instante.
- **Los textos de salud no viajan en las direcciones** de las páginas ni quedan en nuestros registros técnicos de errores.
- **Respaldos cifrados**: las copias de seguridad de la base de datos se cifran antes de guardarse. [Activar cuando el
  servicio de respaldos esté en marcha; ver `RESPALDOS.md`.]
- **En tu teléfono**: si instalas la app, puede guardar una copia de lo último que viste para abrirla sin conexión. Esa
  copia no incluye fotos y se borra al cerrar sesión.
- **Límites contra abusos**: el servicio limita las peticiones repetidas para evitar ataques.

## Quién nos ayuda a dar el servicio

Usamos proveedores que procesan la información solo para dar el servicio, bajo nuestras instrucciones:

| Proveedor | Para qué |
|---|---|
| Clerk | Inicio de sesión y cuentas |
| Railway | Servidores y base de datos |
| Cloudflare | Publicar la app, dominio, correo del dominio [y respaldos] |
| Mercado Pago | Cobro del plan completo |
| Resend | Correos de invitación a la familia |
| Servicios de notificaciones de Apple, Google y Mozilla | Entregar los recordatorios a tu teléfono o navegador |
| [Better Stack] | [Vigilar que el servicio esté disponible; no recibe datos de salud] |

Algunos de estos servidores están fuera de México. El detalle legal está en el [Aviso de privacidad](/aviso-de-privacidad).

## Tus derechos

Puedes **acceder, corregir, cancelar u oponerte** al uso de tus datos (derechos ARCO), y retirar tu consentimiento.
Gran parte lo haces tú mismo desde la app (editar, descargar, borrar). Para todo lo demás escríbenos a
**[privacidad@pedi-track.com]**.

¿Dudas? Escríbenos a **[privacidad@pedi-track.com]**.
