# Flujo Financiero — Kilo-Lima

Guía de negocio para entender el modelo de costos, precios y ganancias del
sistema. Orientada al usuario feriante.

---

## 1. Visión general

El flujo financiero tiene tres momentos:

| Momento | Acción | Herramienta |
|---------|--------|-------------|
| **Pre-evento** | Planificar producción, configurar precios, proyectar costos | EventoDetalleView, EventoProductosView |
| **Durante evento** | Vender en el POS con precios del evento | PosView |
| **Post-evento** | Cerrar caja y ver el reporte financiero | CierresCajaView, ReporteEventoView |

---

## 2. Modelo de datos

### Tablas nuevas

- **evento_productos**: un registro por cada producto que participa en un evento.
  - `precio_venta` (opcional): si lo dejás vacío, se calcula automáticamente con el margen.
  - `margen` (opcional): si lo dejás vacío, hereda el margen del evento.
  - `incluido`: si está en `false`, el producto no aparece en el POS de ese evento.

- **venta_items.costo_unitario**: se congela al momento de la venta.
  No cambia aunque después edites el costo de la materia prima.
- **venta_items.margen_aplicado**: margen que se usó en esa venta.
- **venta_items.evento_producto_id**: vincula la venta al pricing que estaba activo.

---

## 3. Fórmulas

### Precio por margen

```
precio = costo / (1 − margen)
```

**Ejemplo**: costo $10, margen 40% (0.40) → precio = $10 / 0.60 = $16.67

El redondeo se hace UNA sola vez al final del cálculo (`redondearCentavos`).
No se redondean pasos intermedios para evitar deriva de ±$0.01.

### COGS (Costo de Mercadería Vendida)

```
COGS = Σ (cantidad × costo_unitario)
```

Si un `venta_item` no tiene `costo_unitario` (ventas legacy), contribuye $0.

### Utilidad bruta (CORREGIDA)

```
utilidadBruta = totalVentas − COGS
```

⚠️ La fórmula ANTERIOR era `ventas − gastosFijos − gastosImprevistos` — estaba MAL
porque ignoraba el costo de los ingredientes.

### Utilidad neta

```
utilidadNeta = utilidadBruta − gastosFijos − gastosImprevistos
```

---

## 4. Ejemplo con datos del seed

### Escenario

Tenés un evento "Feria del Sol" con:
- Margen del evento: 40%
- 2 productos: Brownie Clásico y Galleta Chip

### Configuración pre-evento

1. Vas a **Eventos → Feria del Sol → Productos del evento**
2. Inicializás desde catálogo (trae todos los productos)
3. El sistema calcula automáticamente:
   - Brownie: costo $5.00 → precio sugerido $8.33
   - Galleta: costo $2.00 → precio sugerido $3.33
4. Podés ajustar precios manualmente si querés.

### Durante el evento

1. Activás el evento (botón "Iniciar").
2. El POS solo muestra Brownie y Galleta (los productos incluidos).
3. Cada venta congela el `costo_unitario` y `margen_aplicado` del momento.

### Cierre post-evento

1. Vas a **POS → Cierre** y registrás el cierre.
2. El sistema calcula:
   - Ventas totales: $150.00
   - COGS: $60.00
   - Utilidad bruta: $90.00
   - Gastos fijos: $20.00
   - Utilidad neta: $70.00
3. El reporte en **Eventos → Feria del Sol → Ver reporte** muestra:
   - Resumen con todos los KPIs
   - Por día: ventas y utilidad de cada jornada
   - Por producto: qué producto dejó más ganancia

---

## 5. Guía paso a paso (evento nuevo)

1. **Crear evento**: `/eventos` → botón "+" → completar nombre, fecha inicio, fecha fin
   (opcional, si es multi-día), ubicación, margen de ganancia (default 40%).
2. **Configurar productos**: entrar al detalle del evento → "Configurar productos".
   Inicializar desde catálogo o agregar de a uno. Ajustar precios y márgenes si querés.
3. **Planificar producción**: desde el detalle del evento → "Planificar producción".
   Elegir recetas y cuántas unidades producir de cada una.
4. **Activar evento**: botón "Iniciar" en el detalle del evento. A partir de acá,
   el POS solo muestra los productos de este evento con sus precios.
5. **Vender**: desde `/pos`, los productos aparecen en la grilla. Agregar al carrito,
   elegir método de pago, registrar venta.
6. **Cerrar evento**: cuando terminó, botón "Cerrar evento" en el detalle.
   Registrar el cierre de caja en `/pos/cierre`.
7. **Ver resultados**: entrar al detalle del evento → "Ver reporte".
   Revisar los 3 tabs: Resumen, Por día, Por producto.

---

## 6. Preguntas frecuentes

**¿Qué pasa si cambio el costo de una materia prima después de vender?**
No afecta ventas pasadas. El `costo_unitario` queda congelado en cada `venta_item`.
El reporte lee ese snapshot, no recalcula.

**¿Qué pasa si cambio el precio de un producto a mitad del evento?**
Las ventas ya hechas mantienen su precio. Las nuevas ventas usan el precio actualizado.
El desglose por día muestra la realidad de cada jornada.

**¿Puedo excluir un producto de un evento específico?**
Sí. En la tabla de productos del evento, desmarcá el checkbox "Incluido".
Ese producto no va a aparecer en el POS de ESE evento (sigue en el catálogo).

**¿Cómo sé qué margen estoy usando?**
El badge en el detalle del evento muestra el margen global. En la tabla de productos
del evento, cada fila muestra su margen efectivo (el del producto si tiene override,
si no el del evento).

**¿Los eventos de un solo día necesitan fecha_fin?**
No. Si `fecha_fin` está vacía, el sistema asume que el evento dura un solo día
(`fecha = fecha_fin`). El reporte por día muestra una sola fila.
