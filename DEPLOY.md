# Despliegue de pruebas

Dos formas de probar PediTrack desde el teléfono:

1. **Entorno DEV desplegado — `https://dev.pedi-track.com`** (desde 2026-10-05): fijo, con HTTPS y el backend siempre
   encendido, para que otras personas prueben. Sale de la rama `develop`. Ver "Entorno DEV (desplegado)" más abajo y, para
   quien lo prueba, `PROBAR.md`.
2. **Túnel HTTPS temporal hacia tu PC** (decidido 2026-09-28): para revisar lo que estás desarrollando y aún no está en
   `develop`, sin hosting. Ver la sección siguiente.

## Prueba con túnel (para lo que aún no está en `develop`)

El teléfono solo llega al frontend que corre en tu PC, por un túnel HTTPS gratuito de Cloudflare
(`cloudflared`, sin cuenta). El frontend reenvía `/api/*` al backend local (`vite.config.ts`), así que basta **un solo
túnel** y no hay CORS.

1. **Backend** corriendo en tu PC (`backend/`, con `DATABASE_URL` y `backend/.env.local`, que ya tiene
   `CLERK_SECRET_KEY` y las claves de recordatorios).
2. **Frontend**, en `frontend/`, una de dos:
   - `npm run preview:tunnel` — compila como en producción y sirve en el puerto **4173**. **Úsalo para el teléfono**:
     el service worker es el real (el de desarrollo es un módulo y algunos navegadores móviles no lo aceptan).
     Después de cambiar código hay que volver a correrlo.
   - `npm run dev:tunnel` — el de desarrollo (puerto **5173**), con recarga en vivo; bien para revisar pantallas.
   Los dos usan `VITE_API_BASE_URL=/api` (`frontend/.env.tunnel`) y la llave de Clerk de `frontend/.env.local`.
3. **Túnel**: `cloudflared tunnel --url http://localhost:4173` (o `5173`). Imprime una dirección
   `https://<algo>.trycloudflare.com`: ábrela en el teléfono.
4. **iPhone**: Safari → esa dirección → Compartir → **Agregar a inicio**, y abre la app desde el ícono (los recordatorios
   solo funcionan así en iPhone). **Android**: Chrome, instalarla es opcional.

Tener en cuenta:

- **La dirección cambia cada vez** que reinicias `cloudflared`: hay que volver a instalar la app en el iPhone y volver
  a activar los recordatorios. (Una dirección fija la da el entorno DEV de más abajo, o una cuenta de ngrok.)
- **Los recordatorios salen de tu PC**: el backend debe estar corriendo (y la PC encendida, sin suspenderse) a la hora
  de la toma. El aviso llega al teléfono por el servicio de avisos del navegador aunque el túnel esté cerrado; lo que
  necesita el túnel es tocar el aviso o "Tomada".
- Clerk sigue en modo desarrollo y funciona con la dirección del túnel. Vite solo acepta los dominios de túnel
  `*.trycloudflare.com` y `*.ngrok-free.app` (`allowedHosts`).
- Todo lo que hagas en el teléfono va a tu base de datos local.

---

# Entorno DEV (desplegado)

Entorno de pruebas fijo, con HTTPS y el backend siempre encendido (los recordatorios de la spec 011 lo necesitan), para que
otras personas prueben PediTrack sin depender de tu PC. **No es producción**: usa las llaves de *desarrollo* de Clerk, una
base de datos de pruebas y sale de la rama `develop` (la constitución reserva `master` para producción). Montado el
2026-10-05.

| Pieza | Dónde | Dirección |
|---|---|---|
| Frontend PWA (`frontend/`) | Cloudflare Pages, proyecto `medic-track` | `https://dev.pedi-track.com` (también `https://medic-track.pages.dev`) |
| Backend Go (`backend/`) | Railway, servicio `medic-track` (`backend/Dockerfile` + `backend/railway.json`) | `https://api-dev.pedi-track.com` (también `https://medic-track-production.up.railway.app`) |
| Base de datos | Railway, servicio PostgreSQL del mismo proyecto | red interna de Railway |
| DNS | HostGator (el dominio se queda ahí), tres registros | `dev`, `api-dev` y `_railway-verify.api-dev` |
| Autenticación | instancia de **desarrollo** de Clerk (`pk_test_…` / `sk_test_…`) | — |

- **Despliegue automático:** cada push o merge a `develop` redespliega el backend (Railway, *Auto deploys*) y el frontend
  (Cloudflare Pages). Railway puede esperar al CI (*Wait for CI*).
- **Para quien lo prueba:** `PROBAR.md` (instalación en iPhone y Android, y qué probar).

## Orden de despliegue (importante)

1. **Migraciones primero** — se aplican **a mano** (aún no hay herramienta de migraciones), en orden, y solo las que falten
   (`backend/migrations/00NN_….sql`; la última a la fecha es la `0023`). **Las `0017` y `0018` son de compartir con la familia (spec 032)**: la `0018` además **rellena** `dose_reminders` con lo que ya se había avisado (`reminder_sent_at`) para que al desplegar no se reenvíe ningún aviso; aplícalas **antes** del backend (el backend nuevo las necesita) y una sola vez. **La `0019` es de las rutinas de suplementos (spec 033)**: crea cuatro tablas nuevas (`supplement_*`), no toca nada existente y también va **antes** del backend; el aviso «Antes de empezar» cambió de versión (`2026-10-07`), así que cada cuenta lo verá una vez más. **La `0020` es de la próxima cita (spec 033, parte 2)**: crea cuatro tablas nuevas (`consultation_appointments`, `appointment_notices`, `appointment_notice_reminders`, `appointment_muted`), no toca nada existente y también va **antes** del backend; el backend anterior sigue funcionando sin ella, el nuevo no. **La `0021` es de las rutinas personales (spec 033, parte 3)**: una tabla nueva (`personal_routine_notices`), un índice y un CHECK sobre `supplement_routines` (una rutina sin hijo es de su propia creadora; las existentes cumplen); también va **antes** del backend. **La `0022` es de suplementos y actividades por separado (spec 035)**: agrega el tipo (`kind`) y la ventana del día a `supplement_routines`, **convierte en actividades** las rutinas «cada N horas» que ya existían (empiezan a su primera hora y siguen hasta las 23:59; borra sus tomas futuras sin marcar y sin aviso y el proceso del API las vuelve a crear) y **quita** las columnas `interval_hours` y `first_time`; va **antes** del backend (el backend anterior no entiende el periodo `window`, el nuevo no arranca sin las columnas) y una sola vez. El aviso «Antes de empezar» cambió de versión (`2026-10-08`: ahora nombra también las actividades), así que cada cuenta lo verá una vez más. **La `0023` es de la actividad a una hora fija (spec 036)**: solo relaja un CHECK de `supplement_routines` (no cambia ningún dato) y puede ir antes o después del backend nuevo; sin ella, guardar una actividad a una hora fija responde 500.
2. **Backend después** (el *healthcheck* es `GET /catalog/countries`, que necesita el catálogo ya cargado).
3. **Frontend al final.** El backend es compatible hacia atrás con el frontend anterior; al revés no.

## Cómo se montó

### 1. Railway: base de datos
1. En Railway, **New Project → Database → PostgreSQL**. Región US East o US West (no hay región en México).
2. Servicio **Postgres → Settings → Networking → TCP Proxy** (puerto **5432**) y pulsa **Deploy** (Railway deja el cambio
   en cola, «Apply changes»). Con eso aparece el acceso público.
3. Aplica las migraciones **desde tu PC**, una sola vez y en orden. Necesitas la dirección **pública** (host
   `…proxy.rlwy.net` con puerto de 5 dígitos), no la interna (`postgres.railway.internal`, que solo existe dentro de
   Railway): en Railway, **Postgres → Database → Connect → Public Network → Connection URL**. En Git Bash, desde la raíz
   del repo, con la URL entre **comillas simples** (nunca pegues en la terminal el texto con `${{…}}` que muestra la
   pestaña *Variables*: son referencias que solo entiende Railway):

   ```bash
   export RAILWAY_DB='<Connection URL de Public Network>'
   export PGCLIENTENCODING=UTF8                             # sin esto, en Windows los acentos quedan como "MÃ©xico"
   psql "$RAILWAY_DB" -c "select current_database();"      # prueba: debe decir "railway"
   for f in backend/migrations/*.sql; do echo "== $f"; psql "$RAILWAY_DB" -v ON_ERROR_STOP=1 -f "$f" || break; done
   ```

   Comprueba con `psql "$RAILWAY_DB" -c "select count(*) from symptoms;"` → **23**. Si una migración falla a la mitad no
   repitas las anteriores (volver a crear una tabla falla): corrige y sigue desde la que falló.

### 2. Claves de los recordatorios
Genera claves **nuevas** para este entorno (no reutilices las de `backend/.env.local`):

```bash
node -e "
const c = require('crypto');
const k = c.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = k.publicKey.export({ format: 'jwk' }), priv = k.privateKey.export({ format: 'jwk' });
console.log('VAPID_PUBLIC_KEY=' + Buffer.concat([Buffer.from([4]), Buffer.from(pub.x, 'base64url'), Buffer.from(pub.y, 'base64url')]).toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + priv.d);
console.log('REMINDER_ACTION_SECRET=' + c.randomBytes(32).toString('base64url'));
"
```

Guárdalas **solo en Railway**. No las pegues en el repo, en un chat ni en una captura de pantalla.

### 3. Railway: backend
1. Instala la app de Railway en GitHub: https://github.com/apps/railway-app/installations/new → tu cuenta → *Only select
   repositories* → `medic-track`. Sin eso Railway no ve el repo (`Could not load branches`).
2. En el mismo proyecto, **New → GitHub Repo → `Ulisesgtz/medic-track`**.
3. **Settings:** *Root Directory* `/backend` (usa `backend/Dockerfile` y `backend/railway.json`) y *Branch connected to
   production* `develop`. Opcional: *Wait for CI*.
4. **Variables** (todas antes del primer despliegue: el API no arranca sin `CLERK_SECRET_KEY`):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base, por la red interna; aquí sí va así) |
   | `CLERK_SECRET_KEY` | la `sk_test_…` de la instancia de desarrollo |
   | `FRONTEND_ORIGIN` | `https://dev.pedi-track.com` (exacta, sin `/` al final: es el **único** origen que acepta CORS) |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_ACTION_SECRET` | las del paso 2 |
   | `VAPID_SUBJECT` | un correo de contacto |
   | `OPS_API_KEY` | (opcional, spec 021) una clave **larga y aleatoria** (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`): abre `GET /ops/error-logs` (`Authorization: Bearer …`). Sin ella esas rutas no existen. No uses la de tu PC |
   | `ERROR_LOGS_RETENTION_DAYS` | (opcional, spec 021) 90 por omisión; **no dejes la variable vacía**, bórrala |

   `PORT` no se pone: Railway la define. Réplicas: **1**.
5. **Deploy.** En *Deployments* el build del `Dockerfile` tarda 1 a 3 minutos y termina con el healthcheck en verde.
6. **Settings → Networking:** *Generate Domain* (da `…up.railway.app`) y **+ Custom Domain** → `api-dev.pedi-track.com`
   (puerto 8080). Railway muestra *Show DNS records* con dos registros (CNAME y TXT de verificación); el valor del TXT sale
   cortado en la ventana: cópialo entero con el icono de copiar.

### 4. Cloudflare Pages: frontend
1. **Workers & Pages → Create → Pages → Import an existing Git repository** (no *Workers*; el enlace de Pages está al
   final de la pantalla de creación). Da acceso a `medic-track` a la app de Cloudflare en GitHub si lo pide.
2. Build: *Production branch* `develop`, *Root directory* `frontend`, *Build command* `npm run build`, *Build output
   directory* `dist`.
3. **Variables de entorno (Production):**

   | Variable | Valor |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_API_BASE_URL` | `https://api-dev.pedi-track.com` |
   | `VITE_CLERK_PUBLISHABLE_KEY` | la `pk_test_…` de la **misma** instancia de Clerk que la `sk_test_…` del backend |

   Son variables de *build*: si las cambias, **vuelve a desplegar** (*Deployments → Retry deployment*). Cambiarlas no
   basta.
4. **Custom domains → Set up a custom domain → `dev.pedi-track.com` → «My DNS provider» → Begin CNAME setup.** No
   elijas *Cloudflare DNS / Begin DNS transfer* (movería todo el DNS del dominio). Cloudflare muestra el CNAME a crear.

`vite build` también escribe `dist/version.json` y `public/_headers` lo sirve con `Cache-Control: no-store`: con eso la
app instalada sabe que hay una versión nueva y muestra «Hay una versión nueva · Actualizar» (spec 017). Sin un
`404.html`, Pages sirve `index.html` para cualquier ruta (SPA) y el service worker queda en `/sw.js`.

### 5. HostGator: DNS
En `cliente.hostgator.mx` → **Dominios** → `pedi-track.com` → **Configurar dominio** → elige **«Sin alojamiento (apenas Zona
de DNS)»** → **«Editar Zona avanzada de DNS»**. **No uses «Cambiar plataforma» ni las plataformas de correo** de esa pantalla:
reescriben el DNS y los registros MX. Solo **agrega** (no borres ni edites los que ya existen: `A`, `MX`, `ftp`, `www`,
`mail`…). Clase `IN`, TTL `3600` (o el que ofrezca el panel):

| Tipo | Nombre | Valor |
|---|---|---|
| CNAME | `dev` | `medic-track.pages.dev` |
| CNAME | `api-dev` | el destino que muestra Railway (`xxxx.up.railway.app`) |
| TXT | `_railway-verify.api-dev` | el `railway-verify=…` **completo** que muestra Railway |

Si el panel pide el nombre completo, usa `dev.pedi-track.com.` (con punto final); si lo duplica
(`dev.pedi-track.com.pedi-track.com`), bórralo y créalo con el nombre corto. La propagación tarda de minutos a unas horas;
los certificados HTTPS salen solos (Cloudflare y Railway) cuando ven el DNS.

### 6. Comprobar

```bash
curl https://api-dev.pedi-track.com/catalog/countries                # 200 y la lista de países
curl https://dev.pedi-track.com/version.json                         # 200 y {"version":"…"}
curl -i -X OPTIONS https://api-dev.pedi-track.com/accounts/me \
  -H "Origin: https://dev.pedi-track.com" -H "Access-Control-Request-Method: GET"   # access-control-allow-origin: https://dev.pedi-track.com
curl -o /dev/null -w "%{http_code}\n" https://api-dev.pedi-track.com/ops/error-logs   # 404 sin la clave
```

Luego abre `https://dev.pedi-track.com` en la PC: registro, login y home funcionan (Clerk mostrará que está en modo
desarrollo; es normal). En el teléfono sigue `PROBAR.md` (instalar, **Activar recordatorios**, y una toma para dentro de
3 a 5 minutos con la app cerrada; prueba también «Tomada» y tocar el aviso: es el `quickstart.md` de la spec 011).

## Mantenimiento

- **Cambiar una variable del backend** (Railway → Variables): Railway redespliega solo. **Una del frontend** (Cloudflare):
  hay que reintentar el despliegue.
- **Un solo origen de CORS:** `FRONTEND_ORIGIN` solo acepta uno. Para probar con otra dirección (p. ej.
  `medic-track.pages.dev`) cámbiala temporalmente y devuélvela.
- **Rotar secretos** si alguna llave se mostró en un chat, una captura o un repositorio: la contraseña de Postgres
  (regenerar credenciales del servicio; `DATABASE_URL` es una referencia y se actualiza sola), `CLERK_SECRET_KEY` (panel de
  Clerk; actualízala también en `backend/.env.local` y en el secreto `CLERK_SECRET_KEY` de GitHub Actions),
  `VAPID_*`/`REMINDER_ACTION_SECRET` (genera un juego nuevo con el comando del paso 2 y reemplázalo; las suscripciones
  push existentes dejan de servir y cada persona vuelve a pulsar **Activar recordatorios**) y `OPS_API_KEY`.
- **Dar el plan de pago (premium) a quien prueba** (spec 029): no hay pantalla ni endpoint, se hace en la base (conéctate
  como en el paso 1, con `PGCLIENTENCODING` y `RAILWAY_DB`). La persona debe haber creado ya su cuenta; si no, responde `UPDATE 0`:

  ```bash
  psql "$RAILWAY_DB" -c "UPDATE accounts SET plan = 'paid' WHERE lower(email) = lower('correo@ejemplo.com');"
  psql "$RAILWAY_DB" -c "SELECT email, plan FROM accounts ORDER BY created_at DESC;"   # ver quién tiene qué plan
  ```

  El plan gratuito admite 1 hijo y el de pago hasta **10**. Con `'free'` en lugar de `'paid'` se le quita (los hijos que ya
  creó se quedan). Para que la app lo note, la persona cierra y vuelve a abrir la app. Para varias personas a la vez:
  `WHERE lower(email) IN (lower('a@…'), lower('b@…'))`.
- **Datos de prueba:** quienes prueban comparten esta base. Se puede vaciar cuando haga falta (con cuidado: no es
  producción, pero tampoco hay respaldos).
- **Costos y límites:** Cloudflare Pages es gratis. Railway cobra por uso (el plan de prueba da un crédito inicial y
  limita los dominios propios a uno). La instancia de desarrollo de Clerk tiene límites bajos y la comparten los E2E del CI.
- **Claves de Clerk:** `pk_test_` (frontend) y `sk_test_` (backend) deben ser de la **misma** instancia.

## Solución de problemas

| Síntoma | Causa y arreglo |
|---|---|
| `psql: no se pudo traducir el nombre «postgres.railway.internal»` | Usaste la dirección **interna**. Usa la pública (*Connect → Public Network*), con el TCP Proxy activado y desplegado |
| `bad substitution` al exportar la URL | Pegaste la plantilla con `${{…}}`. Usa la *Connection URL* ya resuelta, entre comillas simples |
| `psql` pide la contraseña de tu usuario de Windows | `RAILWAY_DB` quedó vacío y se conectó a tu Postgres **local**. Cancela (`Ctrl+C`) y exporta la URL |
| Railway: `Could not load branches` / la rama `main` | La app de Railway no está instalada en el repo, o la rama conectada no existe (aquí es `develop`) |
| La compilación no encuentra el `Dockerfile` | Falta el *Root Directory* `/backend` |
| El API se cae al arrancar | Falta `CLERK_SECRET_KEY` (o alguna variable de recordatorios mal puesta) |
| El navegador dice error de CORS | `FRONTEND_ORIGIN` no coincide **exactamente** con el origen de la página (sin `/` al final) |
| La app dice «Falta terminar tu registro» | El usuario existe en Clerk pero no la cuenta de PediTrack (el `POST /accounts` falló, p. ej. por CORS). Pulsa **Terminar registro** |
| «Could not resolve the session's email» (500) | La `sk_test_` del backend y la `pk_test_` del frontend son de instancias distintas de Clerk |
| Los países/estados/síntomas salen como `MÃ©xico`, `CanadÃ¡` | Las migraciones se aplicaron con la codificación de Windows en vez de UTF-8. Arreglo: `export PGCLIENTENCODING=UTF8` y, en la base, `UPDATE countries SET name = convert_from(convert_to(name,'WIN1252'),'UTF8') WHERE position(chr(195) in name) > 0;` (igual con `states` y `symptoms`). Ejecuta el `UPDATE` **una sola vez**. No escribas la letra «Ã» en el comando: algunas terminales de Windows la mandan mal y el servidor responde `invalid byte sequence for encoding "UTF8"`; por eso se usa `chr(195)` |
| Cambié `VITE_*` y la app no lo nota | Son de *build*: reintenta el despliegue en Cloudflare |
| Cloudflare: «Verifying» eterno | Falta el CNAME `dev`, o el nombre quedó duplicado; revisa con `nslookup -type=CNAME dev.pedi-track.com 8.8.8.8` |
| Railway: «Waiting for DNS update» | Falta el CNAME `api-dev` o el TXT `_railway-verify.api-dev` (valor completo) |

## Qué falta para producción

- Instancia de **producción** de Clerk (`pk_live_`/`sk_live_`) con credenciales propias de Google (BACKLOG, Despliegue).
- Herramienta de migraciones (hoy se aplican a mano).
- Respaldos de la base y claves VAPID de producción.
- Desplegar desde `master` (merge `develop → master`), como pide la constitución.
- Correo del dominio (`@pedi-track.com`): decidir proveedor antes de tocar los registros `MX` (ver `BACKLOG.md`).
