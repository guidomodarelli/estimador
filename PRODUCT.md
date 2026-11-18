# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Dev que estima**: arma la estimación de una iniciativa antes de comprometer fechas y la actualiza a medida que avanza.
- **Equipo de desarrollo**: estima sus propias iniciativas y mira la carga compartida del trimestre.
- **Líder técnico**: revisa las estimaciones del equipo y si el trimestre entra en la capacidad real.
- **Producto**: consulta las estimaciones para conocer la fecha de rollout y cuándo habrá evidencia para compartir.

## Product Purpose

Estimar iniciativas de desarrollo con el flujo típico del equipo (RFC → Desarrollo → Pruebas → Rollout → Demo o evidencia compartible) a partir de la complejidad. Una buena estimación logra dos cosas:

1. **Una fecha de rollout defendible**: un rango honesto (probable y P80) con los supuestos a la vista, que se puede compartir con el líder y con producto.
2. **Un trimestre planificable**: ver si las iniciativas abiertas entran en la capacidad del equipo semana a semana.

## Positioning

Separa esfuerzo, capacidad, duración e incertidumbre en vez de convertir horas en días. La fecha sale de la capacidad real de cada persona, el calendario, las esperas (revisión del RFC, seguimiento del rollout) y una simulación de escenarios, y cada valor aplicado queda escrito como supuesto. El historial de iniciativas terminadas reemplaza los valores por defecto cuando hay datos.

## Operating Context

- Se estima al empezar una iniciativa y se revisa al cambiar el alcance.
- Lo que se comparte es la fecha de rollout, la fecha de fin con su P80 y el resumen en Markdown.
- Al terminar una iniciativa se cargan las horas reales para calibrar las siguientes.
- La vista de trimestre se usa para planificar la capacidad del equipo.

## Capabilities and Constraints

- **Todo local, sin backend**: los datos viven en el navegador; el respaldo y la importación son por JSON. Sin servidor ni cuentas.
- **Peso total menor a 10 MB.**
- **Dependencias**: sin frameworks (React, Angular, Vue ni similares). Se permite una dependencia solo si funciona en el navegador vía CDN y resuelve un problema que simplifica mucho la implementación propia.
- **Solo en español**, sin i18n.
- **Uso en escritorio**; en pantallas chicas alcanza con que se pueda leer.
- Además de la web, hay una CLI que usa el mismo núcleo de cálculo.
- Terminología del equipo: RFC, etapas, casos de uso, métricas (tracks), métricas por RO, rollout, evidencia compartible, P50/P80/P90.

## Evidence on Hand

- No hay historial real cargado todavía. `data/backtest-inventado.json` es inventado y sirve solo para probar el backtest; no debe presentarse como datos del equipo.
- Los valores por complejidad de `src/core/constants/quick.js` son un punto de partida sin validar con datos reales.

## Product Principles

1. **Toda fecha muestra su rango y sus supuestos.** Una fecha sin P80 ni supuestos no se comparte.
2. **Lo mínimo para estimar es la complejidad.** Todo lo demás es opcional y se puede ajustar después.
3. **La fecha de rollout es la protagonista**, por delante del total de horas.
4. **El historial manda sobre los valores por defecto** en cuanto hay datos suficientes.
5. **Se tiene que poder leer sin explicación**, también para producto, que no conoce el modelo.
