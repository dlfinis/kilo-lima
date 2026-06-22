# Margen de Contribución — Guía de Negocio

Esta guía explica cómo usar el margen de contribución y el break-even
en Kilo-Lima. Está orientada al usuario feriante (no técnico) y se
lee en orden: primero el concepto, después cómo aplicarlo antes,
durante y después del evento.

---

## 1. ¿Qué es el margen de contribución?

El **margen de contribución** de un producto es lo que queda del
precio de venta después de cubrir el **costo de producción** (materia
prima, empaque, etiquetas, etc.).

```
contribución = precio de venta − costo de producción
```

- Si la contribución es **positiva** (verde): cada unidad vendida
  aporta dinero para pagar los gastos fijos (alquiler del stand,
  transporte, viáticos).
- Si la contribución es **cero**: vendés a costo. No perdés plata,
  pero tampoco pagás los gastos fijos.
- Si la contribución es **negativa** (rojo): vendés a pérdida. Cada
  unidad vendida **resta** plata en lugar de sumar.

### Por qué importa

Los gastos fijos (alquiler, transporte, sueldos) hay que pagarlos
**una sola vez** por evento, no por unidad vendida. Si sabés la
contribución promedio de tus productos, podés calcular cuántas
unidades necesitás vender para cubrir esos gastos y empezar a ganar.

---

## 2. Break-even: cuántas unidades necesito vender

El **break-even** (o "punto de equilibrio") es el número de unidades
que necesitás vender para que tu **contribución total** iguale tus
**gastos fijos totales**.

```
break-even (unidades) = ceil(gastos fijos / contribución promedio)
```

Si tus gastos fijos son $1000 y tu contribución promedio por unidad
es $5, necesitás vender `ceil(1000 / 5) = 200` unidades para
quedar en cero. A partir de la unidad 201 empezás a ganar plata.

### El caso patológico

Si tu contribución promedio es **cero o negativa** (todos los
productos venden a pérdida), el break-even es **infinito** — no
hay forma de cubrir los gastos fijos vendiendo. En Kilo-Lima esto se
muestra como "Definí márgenes primero" en la sección de Proyección.

---

## 3. Precio mínimo break-even

El **precio mínimo break-even** es el precio al que un producto
debería venderse para que, vendiendo `unidadesEstimadas`, la
contribución cubra los gastos fijos.

```
precio mínimo = costo + (gastos fijos / unidades estimadas)
```

- Si pensás vender 50 unidades y tus gastos fijos son $100:
  `costo + (100/50) = costo + $2`. Para un producto de costo $5, el
  precio mínimo sería $7.
- Si pensás vender 100 unidades: `costo + $1` → $6 para el mismo
  producto.

### Cuándo usarlo

- **Pre-evento** (planificación): configurá el margen de cada
  producto para que el precio sugerido sea **mayor** al precio
  mínimo. Así cada producto, en su volumen estimado, aporta a
  pagar los gastos.
- **Durante el evento** (POS): si bajás el precio de un producto
  manualmente, Kilo-Lima te avisa si caés por debajo del costo
  (alerta roja) o por debajo del mínimo (alerta ámbar).
- **Post-evento** (reporte): el reporte muestra qué productos
  pagaron la operación (top 3 por contribución) y qué margen te
  quedó en limpio.

---

## 4. Cómo se usa en la app

### Pre-evento: configurar el margen

1. Abrí un evento en estado `planificacion` o `en_curso`.
2. Andá a **Productos del evento** (`/eventos/:id/productos`).
3. Ajustá el margen por producto (el slider) o el precio de venta
   manualmente.
4. La tabla muestra el **costo unitario**, el **precio sugerido** y
   el **precio final** lado a lado.

Si el precio final cae por debajo del costo, una **alerta roja**
aparece debajo del campo: "Estás vendiendo a pérdida". La alerta es
informativa — podés guardar igual, pero Kilo-Lima te está diciendo
que ese producto no aporta.

Hay un botón **Aplicar precio mínimo break-even** que setea todos
los precios al mínimo calculado en un solo click. Útil cuando bajás
los precios para una promo y querés asegurarte de no quedar bajo
costo.

### Durante el evento: alertas en el POS

En el grid del POS (`/pos`), cada producto muestra su chip de
contribución debajo del precio:

- 🟢 **Verde**: contribución >= 0 (cubre o supera el costo).
- 🔴 **Rojo**: contribución < 0 (vendés a pérdida).

Esto te permite identificar de un vistazo qué productos te
convienen vender más y cuáles te están dejando margen negativo.

### Post-evento: reporte de contribución

En **Reporte del evento** (`/eventos/:id/reporte`), la pestaña
**Por producto** muestra:

1. **🏆 Productos que pagaron la operación**: los 3 productos con
   mayor contribución total — los que más aportaron a pagar los
   gastos fijos.
2. **Ganancia pura**: aparece cuando la contribución total supera
   los gastos fijos. Es la confirmación visual de que el evento
   cerró con margen positivo.
3. **Tabla ordenada por contribución**: cada fila tiene una 🏆 si
   está en el top 3.

Adicionalmente, la tarjeta de **Resumen del cierre** (en la pestaña
**Resumen**) ahora incluye una sección **Margen de contribución**
que muestra cuánto contribuyó el evento contra los gastos fijos y
qué porcentaje quedó cubierto:

```
Contribución total: $250.00 · Gastos fijos: $200.00 · Cubiertos: 125%
```

> ⚠️ Esta sección es **informativa**. No afecta el cálculo de
> `utilidadNeta` — es una lectura adicional para entender el
> desglose de la operación.

---

## 5. Lecturas recomendadas

- [Flujo Financiero](./flujo-financiero.md) — modelo de datos y
  fórmulas del sistema completo.
- [Precios por margen](#) —cómo configurar márgenes por producto.

---

## Glosario rápido

- **Contribución unitaria**: `precio − costo` (por una unidad).
- **Contribución total**: suma de contribuciones de todas las
  unidades vendidas de un producto.
- **Gastos fijos**: alquiler, transporte, sueldos. Se pagan una vez
  por evento.
- **Gastos imprevistos**: compras de último momento (más vasos,
  cinta, etc.).
- **Break-even (punto de equilibrio)**: unidades necesarias para
  cubrir gastos fijos.
- **Precio mínimo break-even**: precio al que un producto cubre
  gastos fijos si vendés las unidades estimadas.
- **Margen de contribución**: porcentaje `(precio − costo) / precio`.
  Es la "fracción del precio que va a pagar los gastos fijos".