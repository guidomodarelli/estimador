# Estimador de desarrollo

Calculadora de estimaciones que separa **esfuerzo**, **capacidad**, **duración** e **incertidumbre**:

1. **PERT** por etapa → esfuerzo esperado `(O + 4M + P) / 6` y σ ≈ `(P − O) / 6`.
2. **Capacidad efectiva** por persona → `jornada − actividades externas − reserva` (las reuniones que ya son etapa no se descuentan).
3. **Planificación por dependencias** día a día → fecha probable con feriados, ausencias, esperas, paralelismo y cadena crítica.
4. **Monte Carlo** sobre el mismo planificador → P50 / P80 / P90 de esfuerzo, días laborales y fecha.
5. **Historial** → error porcentual y calibración (mediana real/estimado) por tipo de tarea y etapa.

## Estimación rápida

Para no completar decenas de campos por tarea, alcanza con cinco respuestas: tipo de tarea, horas de programación más probables, claridad de requerimientos, complejidad, experiencia previa y dependencias externas. Con eso se generan todas las etapas:

- Las proporciones entre etapas salen de la plantilla del tipo de tarea.
- Las respuestas solo ensanchan la estimación pesimista (P) de las etapas afectadas, y las dependencias externas agregan días de espera, no esfuerzo. Los valores están en `src/core/constants/quick.js` y cada ajuste queda escrito en los supuestos del resumen.
- Con 3 o más registros reales del mismo tipo de tarea, se puede ajustar con el historial.
- Si editás una etapa a mano, las respuestas dejan de pisarla hasta que pidas regenerar.

```bash
node cli/estimate.js quick 6 --type bug --clarity parcial --deps pocas
```

## ¿Los rangos aciertan? (backtest)

Un P80 solo sirve si 8 de cada 10 tareas reales terminan dentro. Para medirlo, cargá tareas ya terminadas en `data/backtest-plantilla.json` (las respuestas que habrías dado el día de inicio y las horas reales) y corré:

```bash
node cli/estimate.js backtest data/backtest-plantilla.json
```

Compara tres modelos de incertidumbre (cobertura real de P50/P80/P90 y pinball loss) y da un veredicto. **Pasa** si el P80 cubre entre 70 % y 90 % y el P50 entre 40 % y 60 %; **falla** si el P80 cubre menos de 65 % o más de 95 %. Con menos de 10 tareas no emite veredicto.

- **Etapas independientes**: el modelo original. Subestima el rango cuando los errores de las etapas se mueven juntos.
- **Factor de error común** (default sin historial): todas las etapas comparten un multiplicador. Su σ = 0,25 es un punto de partida sin validar con datos reales.
- **Reference class** (con 5 o más tareas del mismo tipo): el rango sale de cuánto se desviaron tus tareas reales. Se evalúa sin usar la propia tarea (leave-one-out).

Validación del método contra una verdad sintética conocida (150 tareas, error común con sesgo optimista de +15 %): el modelo independiente cubre 55 % en P80 (falla), el factor común fijo 61 % (falla) y reference class 79 % (pasa). Con 5–6 tareas de historial, reference class cubre ~74 % en promedio: aceptable, algo optimista en los extremos.

## Arquitectura

```
src/core/      Núcleo puro (ES modules, sin dependencias): lo usan la web y la CLI
web/           App web estática (HTML + CSS + JS) — interfaz principal
cli/           CLI fina sobre el mismo núcleo (texto, Markdown o JSON)
test/          Tests con node:test (núcleo + CLI real en subproceso)
```

## Uso

```bash
npm test
```

```bash
npm run serve        # http://localhost:5173
```

```bash
node cli/estimate.js init --template feature --start 2026-11-16 --output estimacion.json
```

```bash
node cli/estimate.js estimacion.json --format md > resumen.md
```

## La app web

- **Sidebar**: todas las estimaciones (abiertas y terminadas, con su fecha P80) y las vistas del equipo.
- **Cada estimación tiene 4 pestañas**: *Estimar* (preguntas, tabla de etapas, de dónde sale la fecha), *Plan* (Gantt con dependencias, esperas y cadena crítica), *Incertidumbre* (curva de probabilidad y riesgos) y *Compartir* (resumen en Markdown).
- **Trimestre**: horas P80 comprometidas por semana contra la capacidad del equipo; marca las semanas que no entran.
- **Equipo**: personas, jornada, descuentos, ausencias y feriados. Vale para todas las estimaciones.
- **Historial**: estimado contra real por tarea, desvío por tipo de tarea y, con 10 o más tareas terminadas, el chequeo de calibración del P80.

Todo se guarda en el `localStorage` del navegador (los datos del formato anterior se migran solos). **Exportar respaldo** descarga un JSON con todo; **Importar** lo restaura.

```
web/
  app.js            Estado, eventos y acciones
  state/            Persistencia, estimaciones y cálculo del trimestre (sin DOM, testeado)
  views/            Sidebar, estimación (pestañas), equipo, historial y trimestre
  charts/           Gráficos SVG sin dependencias: escalones, curva, Gantt, carga y dispersión
  utils/dom.js      Binding de formularios y utilidades de DOM
```
