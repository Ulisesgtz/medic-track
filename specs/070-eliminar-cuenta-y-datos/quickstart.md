# Quickstart: validar la eliminación de la cuenta y la descarga de datos (spec 070)

## 1. Pruebas automáticas

```bash
cd backend && go test ./internal/accountdeletion/... ./internal/dataexport/... ./internal/server/... -cover
```

Lo esperado:

- pasan;
- más del 90 % de cobertura en los paquetes nuevos;
- la prueba de «todas las tablas conocidas» (research R1) pasa;
- la búsqueda de la cuenta borrada en todo el esquema no encuentra nada (SC-004).

```bash
cd frontend && npx vitest run --coverage
```

```bash
scripts/e2e-local.sh e2e/eliminar-cuenta.spec.ts
```

## 2. A mano en local (backend y frontend corriendo)

1. Con una cuenta de prueba de **plan gratuito**, con un hijo y una consulta con foto: «Lo demás» → «Mi cuenta» → «Descargar mis datos».
   - Abre el ZIP: `LEEME.txt`, `datos.json`, los CSV (en Excel, con los acentos bien) y la foto de la receta.
   - No hay nada de otra cuenta.
2. «Eliminar mi cuenta…»: escribe `ELIMINAR`; Clerk pide la contraseña si la sesión es vieja.
   - La app pasa a «Tu cuenta se borrará el …».
   - Cualquier otra pantalla muestra lo mismo.
   - En la base, `account_deletions` tiene una fila `pending`.
3. «Cancelar la eliminación»: todo sigue igual y la consulta y la foto están.
4. Vuelve a pedirla y adelanta el plazo en la base de prueba:

   ```sql
   UPDATE account_deletions SET scheduled_for = now() - interval '1 minute' WHERE canceled_at IS NULL AND completed_at IS NULL;
   ```

   - En menos de 10 minutos (o reiniciando el API) la cuenta desaparece y su usuario de Clerk de desarrollo ya no existe.
   - Entrar con ese correo crea una cuenta vacía.
5. **Familia**: con la dueña de una familia de pago y un Tutor, la dueña pide eliminarse.
   - El Tutor ve el aviso y puede marcar una toma y «Descargar sus datos».
   - No puede crear una consulta.
   - Al vencer el plazo, el Tutor ya no ve a esos hijos y conserva lo suyo.
6. **Persona invitada**: un Tutor que marcó tomas pide su eliminación y vence el plazo.
   - La familia sigue.
   - Sus marcas siguen marcadas, sin nombre.

## 3. En DEV (pasos del dueño)

1. Aplicar la migración `0037` **antes** de desplegar el backend.
2. Probar el punto 2 con una cuenta de prueba (con `MERCADOPAGO_*` de prueba, también con una suscripción de prueba vigente).
3. **Actualizar el aviso de privacidad**:
   - cómo eliminar la cuenta;
   - el plazo de 30 días;
   - la descarga de datos;
   - que las copias de respaldo cifradas caducan en un máximo de 6 meses.
4. Confirmar con el contador qué registros de pago hay que conservar (research R5).

## 4. Lo que no debe pasar

- Que una cuenta con la eliminación programada pueda registrar o marcar algo, o reciba avisos.
- Que se borre algo antes de la fecha, o que cancelar pierda algo.
- Que un correo, un registro de errores o una dirección web lleven datos de salud, nombres de hijos o el contenido del archivo.
- Que se cobre a una cuenta después de pedir su eliminación.
- Que después de restaurar un respaldo y correr `reconcile-deleted` reaparezca una cuenta eliminada.
