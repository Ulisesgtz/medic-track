# Contrato: `/version.json`

Archivo estático que escribe `vite build` en la raíz de `dist/`; sin endpoint del backend.

```json
{ "version": "3f2a9c1" }
```

- `version`: cadena no vacía; `CF_PAGES_COMMIT_SHA` o `GITHUB_SHA` (7 primeros caracteres) o la marca de tiempo del
  build. El mismo valor se compila en la app como `__APP_VERSION__`.
- El cliente lo pide con `cache: 'no-store'` y `?t=<ms>`. Se considera «sin información» (sin aviso, sin error) cuando:
  la petición falla, el estado no es 2xx, el cuerpo no es JSON o no trae `version` de tipo cadena (p. ej. el servidor de
  desarrollo devuelve el `index.html`).
- Hay versión nueva cuando la respuesta es válida y `version !== __APP_VERSION__`. No hay excepción para `dev`: en
  desarrollo no existe un `version.json` real (respuesta inválida, sin aviso) y las E2E lo simulan con `page.route`.
- Cabecera de despliegue: `Cache-Control: no-store` (`public/_headers`).

## Textos de la interfaz

| Dónde | Texto |
|---|---|
| Aviso | «Hay una versión nueva» + botón «Actualizar» |
| Confirmación al actualizar con datos sin guardar | «¿Actualizar ahora? Se perderá lo que capturaste.» |
| Indicador del gesto | «Suelta para actualizar» / «Actualizando…» (con `role="status"`) |
| Falla del gesto | «No pudimos actualizar. Revisa tu conexión.» |
