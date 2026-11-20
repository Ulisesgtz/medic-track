# Modelo de datos — Spec 076

Sin migración ni tablas nuevas. Lo que se agrega es derivado:

- **Edad máxima por indicador**: constantes del paquete `growth` (`WeightMaxMonths = 120`, `HeightMaxMonths = 228`), iguales a la
  última fila de las tablas de la OMS de los dos sexos (una prueba lo verifica).
- **Medida dibujable** de un indicador: `measured_on <= birth_date + maxMonths meses` (calendario). Las demás cuentan en
  `limits.<indicador>.later`.
