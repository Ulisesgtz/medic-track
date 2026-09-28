# Despliegue de pruebas

Dos formas de probar PediTrack desde el teléfono:

1. **Túnel HTTPS temporal hacia tu PC — lo que se usa ahora** (decidido 2026-09-28): para ir probando lo que se
   desarrolla, sin hosting. Ver la sección siguiente.
2. **Entorno de pruebas en Railway + Cloudflare Pages** — para cuando el ambiente esté listo para una instancia DEV
   desplegada de verdad. Ver "Entorno de pruebas (staging)" más abajo.

## Prueba con túnel (ahora)

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
  a activar los recordatorios. (Una dirección fija requiere cuenta — ngrok da una gratis — o el entorno de Railway.)
- **Los recordatorios salen de tu PC**: el backend debe estar corriendo (y la PC encendida, sin suspenderse) a la hora
  de la toma. El aviso llega al teléfono por el servicio de avisos del navegador aunque el túnel esté cerrado; lo que
  necesita el túnel es tocar el aviso o "Tomada".
- Clerk sigue en modo desarrollo y funciona con la dirección del túnel. Vite solo acepta los dominios de túnel
  `*.trycloudflare.com` y `*.ngrok-free.app` (`allowedHosts`).
- Todo lo que hagas en el teléfono va a tu base de datos local.

---

# Entorno de pruebas (staging)

Entorno para probar PediTrack desde el teléfono, con HTTPS y el backend siempre encendido (los recordatorios de la
spec 011 lo necesitan). **No es producción**: usa las llaves de *desarrollo* de Clerk y sale de una rama de trabajo, no
de `master` (la constitución reserva `master` para producción).

| Pieza | Dónde | Dirección |
|---|---|---|
| Backend Go (`backend/`) | Railway, con `backend/Dockerfile` y `backend/railway.json` | `https://api.pedi-track.com` |
| Base de datos | Railway, servicio PostgreSQL | red interna de Railway |
| Frontend PWA (`frontend/`) | Cloudflare Pages | `https://app.pedi-track.com` |
| DNS | HostGator (el dominio se queda ahí) | dos registros CNAME |

El orden importa: **primero la base y sus migraciones, después el backend** (su *healthcheck* es
`GET /catalog/countries`, que necesita el catálogo ya cargado).

---

## 1. Railway: base de datos

1. En Railway, **New Project → Deploy PostgreSQL**. Región: US East o US West (Railway no tiene región en México).
2. En el servicio **Postgres → Variables**, copia `DATABASE_PUBLIC_URL` (la dirección pública, para aplicar las
   migraciones desde tu PC).
3. Aplica las migraciones **una sola vez**, en orden, desde la raíz del repo (Git Bash):

   ```bash
   export RAILWAY_DB="<pega aquí DATABASE_PUBLIC_URL>"
   for f in backend/migrations/*.sql; do echo "== $f"; psql "$RAILWAY_DB" -v ON_ERROR_STOP=1 -f "$f" || break; done
   ```

   Deben salir las 11 sin error. Si una falla a la mitad, no vuelvas a correr las anteriores: el proyecto aún no tiene
   herramienta de migraciones (pendiente para producción) y repetir un `CREATE TABLE` falla.

## 2. Claves de los recordatorios

Genera claves **nuevas** para este entorno (no reutilices las de `backend/.env.local`). En tu PC:

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

Guárdalas solo en Railway (paso 3). No las pegues en el repo ni en el chat.

## 3. Railway: backend

1. En el mismo proyecto, **New → GitHub Repo → `Ulisesgtz/medic-track`**.
2. En el servicio, **Settings**:
   - **Root Directory**: `backend` (usa `backend/Dockerfile` y `backend/railway.json`).
   - **Branch**: `feature/011-recordatorios-push` mientras se prueban los recordatorios; después `develop`.
3. **Variables**:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (referencia a la base, por la red interna) |
   | `CLERK_SECRET_KEY` | la `sk_test_…` (misma que en `backend/.env.local`) |
   | `FRONTEND_ORIGIN` | `https://app.pedi-track.com` (exacta, sin `/` al final: es el único origen que acepta CORS) |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDER_ACTION_SECRET` | las del paso 2 |
   | `VAPID_SUBJECT` | tu correo de contacto, p. ej. `ulises.gtzr@gmail.com` |

   `PORT` no se pone: Railway la define y el API la lee.
4. **Networking → Custom Domain → `api.pedi-track.com`**. Railway te muestra un destino tipo
   `xxxx.up.railway.app`: ese va en el CNAME del paso 5.
5. Réplicas: **1**. (Varias no duplican avisos — cada toma se reclama una sola vez — pero no hacen falta.)

## 4. Cloudflare Pages: frontend

1. **Workers & Pages → Create → Pages → Connect to Git → `Ulisesgtz/medic-track`**.
2. Configuración de build:

   | Campo | Valor |
   |---|---|
   | Production branch | `feature/011-recordatorios-push` (después `develop`) |
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

3. **Environment variables** (Production):

   | Variable | Valor |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `VITE_API_BASE_URL` | `https://api.pedi-track.com` |
   | `VITE_CLERK_PUBLISHABLE_KEY` | la `pk_test_…` (misma que en `frontend/.env.local`) |

   Son variables de *build*: si las cambias, vuelve a desplegar.
4. **Custom domains → `app.pedi-track.com`**. Como el DNS está en HostGator, Cloudflare te pide un CNAME hacia
   `<tu-proyecto>.pages.dev`: va en el paso 5.

No hace falta configurar rutas: sin un `404.html`, Pages sirve `index.html` para cualquier ruta (como una SPA), y el
service worker queda en `/sw.js`, en la raíz, como debe.

## 5. HostGator: DNS

En HostGator → `pedi-track.com` → **Administrar → zona DNS**, agrega:

| Tipo | Nombre | Apunta a |
|---|---|---|
| CNAME | `app` | `<tu-proyecto>.pages.dev` (de Cloudflare, paso 4) |
| CNAME | `api` | `xxxx.up.railway.app` (de Railway, paso 3) |

No toques los *nameservers* ni otros registros. La propagación tarda de minutos a unas horas; Railway y Cloudflare
emiten el certificado HTTPS solos cuando ven el CNAME.

## 6. Comprobar

1. `curl https://api.pedi-track.com/catalog/countries` → lista de países (200).
2. Abre `https://app.pedi-track.com` en la PC: registro, login y home funcionan (Clerk mostrará que está en modo
   desarrollo; es normal).
3. En el teléfono:
   - **iPhone**: Safari → `https://app.pedi-track.com` → Compartir → **Agregar a inicio** → abre la app desde el ícono.
   - **Android**: Chrome → la misma dirección (instalarla es opcional).
4. En el home, **Activar recordatorios**, elige qué muestran los avisos y acepta el permiso.
5. Crea una consulta con un medicamento cuya primera toma ("Desde") sea en 3–5 minutos, cierra la app y espera el aviso
   (hasta 2 minutos después de la hora). Prueba también "Tomada" y tocar el aviso. Es el `quickstart.md` de la spec 011
   (tarea T065).

## Qué falta para producción

- Instancia de **producción** de Clerk (`pk_live_`/`sk_live_`) con credenciales propias de Google (BACKLOG, Despliegue).
- Herramienta de migraciones (hoy se aplican a mano).
- Respaldos de la base y claves VAPID de producción.
- Desplegar desde `master` (merge `develop → master`), como pide la constitución.
