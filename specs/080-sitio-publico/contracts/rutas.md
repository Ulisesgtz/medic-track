# Contrato: direcciones del sitio y de la app

## Páginas del sitio (`pedi-track.com`)

| Ruta | Estado | Indexa | Mock |
|---|---|---|---|
| `/` | 200 | sí | Inicio (390 · 768 · 1440) |
| `/funciones` | 200 | sí | Páginas · Fu |
| `/planes` | 200 | sí | Páginas · Pl |
| `/preguntas-frecuentes` | 200 | sí | Páginas · Fq |
| `/instalar` | 200 | sí | Páginas · In |
| `/blog` | 200 (solo con artículos listos) | sí | Páginas · Bl |
| `/blog/<slug>` | 200 | sí | Páginas · Ar |
| `/privacidad` | 200 | sí | Legal · Ps |
| `/aviso-de-privacidad` | 200 | sí | Legal · Av |
| `/terminos` | 200 | sí | Legal · Te |
| cualquier otra | **404** con la página del mock | no | Páginas · E4 |
| `/robots.txt`, `/sitemap.xml` | 200 | — | Decisiones y SEO |

Reglas:
- `www.pedi-track.com/*` → 301 a `https://pedi-track.com/*`: **regla de redirección de la zona de Cloudflare** (`_redirects` no admite otro dominio como origen).
- Barra final (`/planes/`) y `.html` (`/planes.html`) → 308 a la canónica (`/planes`): lo hace Pages solo, porque cada página se escribe como `planes.html`.
- Mayúsculas: `/Planes` (primera letra) → 301 a `/planes` con una regla de `_redirects` por página; otras combinaciones, regla opcional de la zona (desviación 34).
- Anclas de `/funciones`: `#consultas`, `#recordatorios`, `#vacunacion`, `#crecimiento`, `#familia` (las del mock); de las páginas legales: una por sección.

## Rutas de la app que el sitio redirige (`_redirects`, 301)

Todas a `https://app.pedi-track.com/<misma ruta>` (mismo camino y consulta; el navegador conserva el `#`). Lista tomada de `frontend/src/App.tsx` el 2026-11-24 (cada una con su `/*` cuando tiene subrutas):

`/home`, `/login`, `/signup`, `/registro/*`, `/recuperar-contrasena`, `/sso-callback`, `/children/*`, `/consultations/*`, `/citas/*`, `/suplementos/*`, `/actividades/*`, `/mis-suplementos*`, `/mis-actividades*`, `/mi-dia`, `/yo`, `/yo/*`, `/personas/*`, `/familia`, `/familia/*`, `/hijo`, `/hijo/*`, `/botiquin`, `/botiquin/*`, `/cuenta`, `/cuenta/*`, `/planes/regreso`, `/planes/pago-de-prueba`.

La raíz `/` de la app (que hoy lleva al inicio o al login) **no se redirige**: en `pedi-track.com/` vive la portada del sitio, cuyo «Iniciar sesión» lleva a la app.

**`/planes` NO se redirige** (es la página del sitio); la pantalla de planes de la app sigue en `app.pedi-track.com/planes`.

Una prueba compara esta lista con las rutas declaradas en `frontend/src/App.tsx` y falla si una ruta de la app (que no sea `/planes`) no se redirige o choca con una página del sitio.

## Botones hacia la app

| Botón | Destino |
|---|---|
| «Crear cuenta gratis» | `<appOrigin>/signup` |
| «Iniciar sesión» | `<appOrigin>/login` |
| Planes · «Elegir Plan completo» | `<appOrigin>/planes` |
