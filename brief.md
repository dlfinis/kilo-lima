# 📐 Lineamientos Técnicos y UX para el Agente de Código

## Documento de referencia

---

## 🎨 1. DECISIÓN DE UI FRAMEWORK: **Vuetify 3**

### ¿Por qué Vuetify 3 y no PrimeVue?

| Criterio | Vuetify 3 | PrimeVue |
|----------|-----------|----------|
| Estabilidad | ✅ Stable desde 2023 | ⚠️ Más cambios recientes |
| Curva de aprendizaje | ✅ Material Design conocido | ⚠️ Menos familiar |
| Componentes táctiles | ✅ Excelentes para ferias (botones grandes) | ✅ Buenos |
| Documentación | ✅ Extensa y clara | ✅ Buena |
| Comunidad | ✅ Muy activa | ✅ Activa |
| Soporte mobile-first | ✅ Nativo | ⚠️ Requiere más config |

**Decisión**: Vuetify 3 con tema oscuro/claro configurable. Material Design es intuitivo para usuarios no técnicos.

---

## 🧠 2. FILOSOFÍA UX — "El usuario comprende el flujo del negocio"

### 2.1 Principios UX Fundamentales

1. **Progresive Disclosure**: Mostrar solo lo necesario en cada momento
   - Pre-evento: No mostrar la caja registradora
   - Durante evento: No mostrar catálogos (solo botón "Editar")
   - Post-evento: No mostrar el POS

2. **Lenguaje del feriante, no del ingeniero**
   - ❌ "Production batch"
   - ✅ "Preparación del día"
   - ❌ "Ingredient"
   - ✅ "Materia prima"
   - ❌ "Fixed cost"
   - ✅ "Gasto fijo de la feria"

3. **Feedback inmediato y emocional**
   - ✅ Venta registrada: Toast verde "🎉 1 chocolate vendido - $3.50"
   - ⚠️ Stock bajo: Badge amarillo en el producto
   - 🔴 Pérdidas: Color rojo en dashboard

4. **Jerarquía visual clara**
   - Título de página siempre visible
   - Subtítulo con contexto ("Día 2 de 3 de la Feria Navideña")
   - Acciones principales a la derecha o abajo (FAB)

### 2.2 Patrones de Navegación

**Bottom Navigation Bar (móvil/tablet):**
```
[📦 Catálogo] [🎪 Evento] [💰 Caja] [📊 Análisis]
```

**Top Bar (desktop):**
```
Logo | [Catálogo] [Eventos] [Caja] [Análisis] | Avatar usuario
```

**Contexto siempre visible:**
- Nombre del evento activo
- Fecha actual del evento
- Estado (Planificación / En curso / Cerrado)

---

## 🎯 3. PRINCIPIOS KISS APLICADOS (Keep It Simple, Stupid)

### 3.1 Restricciones de Complejidad

| ❌ NO hacer | ✅ SÍ hacer |
|------------|-------------|
| Microservicios | Monolito Vue + Supabase |
| Estado global complejo | Pinia con stores separados |
| Routing anidado profundo | Máximo 2 niveles de rutas |
| Librerías de utilidades custom | Lodash/DayJS solo si es necesario |
| Testing unitario exhaustivo al inicio | Solo tests para lógica de negocio crítica |
| Abstracciones prematuras | Código directo y claro |
| TypeScript muy estricto | TypeScript con tipos prácticos |
| i18n complejo | Textos en español hardcodeados |
| Temas múltiples dinámicos | Un tema claro bien diseñado |

### 3.2 Reglas de Oro KISS

1. **Una función = Una responsabilidad visible**
   - Máximo 30 líneas por función
   - Si necesita explicación, refactorizar

2. **Un componente = Una vista**
   - Máximo 200 líneas por `.vue`
   - Separar lógica en composables

3. **Nombres que se explican solos**
   ```typescript
   ❌ calc()
   ✅ calcularCostoTotalDeProduccion()
   
   ❌ data
   ✅ materiasPrimasDisponibles
   ```

4. **Comentarios: solo el POR QUÉ, nunca el QUÉ**
   ```typescript
   // ✅ Bien: explicación de decisión de negocio
   // Redondeamos hacia arriba para cubrir mermas de producción
   return Math.ceil(costoCalculado * 1.05);
   
   // ❌ Mal: comentario obvio
   // Sumamos los costos
   return a + b;
   ```

5. **Convención de archivos**
   ```
   src/
   ├── components/          # Componentes reutilizables
   │   ├── ui/              # Botones, cards, inputs custom
   │   └── business/        # Componentes de negocio
   ├── composables/         # Lógica reutilizable
   ├── stores/              # Pinia stores
   ├── services/            # Llamadas a Supabase
   ├── views/               # Páginas completas
   ├── types/               # TypeScript interfaces
   └── utils/               # Helpers puros
   ```

---

## 🏗️ 4. PRINCIPIOS SOLID APLICADOS A VUE 3

### 4.1 S — Single Responsibility Principle

**Cada store de Pinia gestiona UN dominio:**
```
stores/
├── ingredients.store.ts    # Solo materias primas
├── recipes.store.ts        # Solo recetas
├── events.store.ts         # Solo eventos
├── pos.store.ts            # Solo caja registradora
└── reports.store.ts        # Solo reportes
```

**Cada composable hace UNA cosa:**
```typescript
// ✅ Bien
const { ingredientes, cargarIngredientes } = useIngredientes();
const { calcularCosto } = useCalculoReceta(ingredientes);

// ❌ Mal (viola SRP)
const { todo } = useTodoElSistema();
```

### 4.2 O — Open/Closed Principle

**Composables extensibles sin modificar:**
```typescript
// composable/useValidacionPrecio.ts
export function useValidacionPrecio(config = {}) {
  const reglasBase = {
    min: 0.01,
    max: 10000,
    ...config.reglasExtra  // ← Extensible
  };
  
  return { reglasBase };
}
```

### 4.3 L — Liskov Substitution Principle

**Interfaces intercambiables en servicios:**
```typescript
// services/storage.interface.ts
export interface IStorageService {
  guardar<T>(key: string, data: T): Promise<void>;
  obtener<T>(key: string): Promise<T | null>;
}

// Implementaciones intercambiables
// - SupabaseStorageService
// - IndexedDBStorageService (offline)
// - LocalStorageService (fallback)
```

### 4.4 I — Interface Segregation Principle

**Props mínimas en componentes:**
```vue
<!-- ✅ Bien: props específicas -->
<ProductCard
  :nombre="producto.nombre"
  :precio="producto.precio"
  :imagen="producto.imagen"
  @click="seleccionar"
/>

<!-- ❌ Mal: objeto completo -->
<ProductCard :producto="producto" :opciones="opciones" />
```

### 4.5 D — Dependency Inversion Principle

**Inyección de dependencias con `provide/inject`:**
```typescript
// plugins/services.ts
app.provide('supabaseClient', createSupabaseClient());
app.provide('storageService', new IndexedDBStorageService());

// components/MiComponente.vue
const supabase = inject('supabaseClient');
const storage = inject('storageService');
```

---

## 🔒 5. RESTRICCIONES TÉCNICAS OBLIGATORIAS

### 5.1 Stack Bloqueado (NO USAR)

| ❌ Prohibido | ✅ Alternativa |
|-------------|----------------|
| Vuex (obsoleto) | Pinia |
| Options API | Composition API + `<script setup>` |
| Axios directo | `supabase-js` o `fetch` nativo |
| Bootstrap CSS | Vuetify 3 |
| jQuery | Nunca |
| Librerías de pagos externas | Registro manual de métodos |
| Firebase | Supabase (ya elegido) |
| Tailwind custom (sin Vuetify) | Sistema de diseño de Vuetify |
| Moment.js | Day.js (más liviano) |
| Webpack | Vite |

### 5.2 Stack Obligatorio

- **Vue 3.4+** con Composition API
- **Vite 5+** como build tool
- **TypeScript 5+** (modo estricto moderado)
- **Vuetify 3** como UI framework
- **Pinia** como state management
- **Vue Router 4** con rutas lazy-loaded
- **Supabase JS v2** como cliente
- **localforage** para IndexedDB
- **Day.js** para fechas
- **Chart.js 4 + vue-chartjs** para gráficos
- **jsPDF** para exportar reportes
- **ESLint + Prettier** para calidad

### 5.3 Convenciones de Nombres

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Componentes | PascalCase | `IngredientCard.vue` |
| Archivos `.vue` | PascalCase | `RecipeList.vue` |
| Composables | `use` + PascalCase | `useIngredientes.ts` |
| Stores | PascalCase + `Store` | `ingredients.store.ts` |
| Types/Interfaces | PascalCase | `Ingredient`, `Recipe` |
| Variables/Funciones | camelCase | `calcularCosto` |
| Constantes | UPPER_SNAKE | `MAX_UNIDADES_POR_DIA` |
| Rutas | kebab-case | `/mis-eventos` |
| Props | camelCase | `:precioVenta` |
| Emits | kebab-case | `@producto-seleccionado` |

---

## 📱 6. GUÍA DE DISEÑO RESPONSIVE

### 6.1 Breakpoints de Vuetify

| Nombre | Ancho | Uso |
|--------|-------|-----|
| `xs` | < 600px | Móvil vertical |
| `sm` | 600-960px | Móvil horizontal / Tablet pequeño |
| `md` | 960-1264px | Tablet |
| `lg` | 1264-1904px | Laptop |
| `xl` | > 1904px | Desktop grande |

### 6.2 Comportamiento por Dispositivo

**Móvil (xs/sm):**
- Bottom navigation
- Grid de productos: 2 columnas
- Drawer para detalles
- Botones grandes (min 48px altura)
- Formularios en scroll vertical

**Tablet (md):**
- Sidebar colapsable
- Grid de productos: 3-4 columnas
- Split view: lista + detalle
- Touch-optimized

**Desktop (lg/xl):**
- Sidebar fija
- Grid de productos: 4-6 columnas
- Layout horizontal
- Hover states activos

### 6.3 Tipografía

```css
/* Escala tipográfica (Vuetify defaults) */
--text-h1: 3rem;      /* Títulos de página */
--text-h2: 2.25rem;   /* Secciones */
--text-h3: 1.75rem;   /* Subsecciones */
--text-body-1: 1rem;  /* Texto principal */
--text-body-2: 0.875rem; /* Texto secundario */
--text-caption: 0.75rem; /* Etiquetas */
```

### 6.4 Paleta de Colores

```javascript
// vuetify.config.ts
theme: {
  themes: {
    light: {
      colors: {
        primary: '#1976D2',        // Azul Material
        secondary: '#424242',      // Gris oscuro
        accent: '#FF6B35',         // Naranja para ventas
        success: '#4CAF50',        // Verde (ganancias)
        warning: '#FFC107',        // Amarillo (alertas)
        error: '#F44336',          // Rojo (pérdidas)
        background: '#FAFAFA',     // Fondo claro
      }
    }
  }
}
```

---

## 🔄 7. ORDEN DE IMPLEMENTACIÓN RECOMENDADO

### Fase 1: Fundación (Semana 1)
1. Setup inicial del proyecto (Vite + Vue 3 + TypeScript)
2. Configuración de Vuetify 3 con tema
3. Docker Compose con Supabase auto-hospedado
4. Estructura de carpetas base
5. Autenticación simple (email/password local)

### Fase 2: Catálogo Base (Semana 2)
6. CRUD de Materias Primas
7. CRUD de Recetas
8. Calculadora de costos por receta
9. Vista de recetas con desglose de costos

### Fase 3: Gestión de Eventos (Semana 3)
10. CRUD de Eventos
11. Gastos fijos por evento
12. Planificación de producción
13. Proyección de costos totales

### Fase 4: Caja Registradora (Semana 4)
14. Grid de productos para venta
15. Carrito y registro de ventas
16. Cierre de caja diario
17. Gastos imprevistos

### Fase 5: Análisis y PWA (Semana 5)
18. Dashboard de resultados
19. Reportes por evento
20. Estrategia offline con IndexedDB
21. Configuración de Service Worker
22. Instalable en móvil/tablet

---

## 🎯 8. PROMPT BASE PARA EL AGENTE DE CÓDIGO

Cuando generes código con el agente, **usa siempre este contexto**:

```
CONTEXTO DEL PROYECTO:
Estoy construyendo una PWA personal con Vue 3 + Vite + 
TypeScript + Vuetify 3 + Supabase.Desplegado en cloudflare pages
La app gestiona costos y ventas de postres en ferias. Solo yo la uso, 
moneda USD, responsive pero no multi-dispositivo simultáneo.

FILOSOFÍA UX:
"El usuario comprende el flujo del negocio" - 3 fases: Pre-evento 
(planificación), Durante evento (ventas), Post-evento (análisis). 
Lenguaje del feriante, no técnico.

PRINCIPIOS OBLIGATORIOS:
- KISS: Keep It Simple, Stupid - código directo, nombres claros, 
  abstracciones mínimas
- SOLID: SRP (un store por dominio, un composable por responsabilidad), 
  OCP (extensible sin modificar), LSP (interfaces intercambiables), 
  ISP (props mínimas), DIP (inyección con provide/inject)

STACK OBLIGATORIO:
- Vue 3.4+ con <script setup> y Composition API
- TypeScript 5+
- Vuetify 3 como UI framework
- Pinia para estado (un store por dominio)
- Supabase JS v2
- localforage para IndexedDB (offline)
- Vite 5+

RESTRICCIONES:
- Sin Vuex, sin Options API, sin Axios directo, sin Bootstrap
- Archivos .vue máximo 200 líneas
- Funciones máximo 30 líneas
- Nombres en español para lógica de negocio
- Comentario solo el "por qué", nunca el "qué"
- Props mínimas en componentes (Interface Segregation)

ESTRUCTURA ESPERADA:
src/components/ui/ - Componentes reutilizables
src/components/business/ - Componentes de negocio
src/composables/ - Lógica reutilizable (useNombre.ts)
src/stores/ - Pinia stores (nombre.store.ts)
src/services/ - Llamadas a Supabase
src/views/ - Páginas completas
src/types/ - TypeScript interfaces
src/utils/ - Helpers puros

[INSTRUCCIÓN ESPECÍFICA AQUÍ]
```

---

## 📋 9. CHECKLIST DE VALIDACIÓN (Para el agente)

Antes de entregar entrega de fase, el agente debe verificar:

- [ ] ¿Respeta SOLID? (¿Cada pieza tiene una sola responsabilidad?)
- [ ] ¿Las props son mínimas y tipadas?
- [ ] ¿Los emits están en kebab-case?
- [ ] ¿El componente tiene menos de 200 líneas?
- [ ] ¿Las funciones tienen menos de 30 líneas?
- [ ] ¿Los nombres están en español para lógica de negocio?
- [ ] ¿Usa Vuetify 3 components, no HTML custom?
- [ ] ¿Incluye manejo de errores básico?
- [ ] ¿Tiene loading states?
- [ ] ¿Es responsive (usa grid system de Vuetify)?
- [ ] ¿Respeta el flujo de las 3 fases del negocio?

---

DEPLOYMENT Y ARQUITECTURA:
- Frontend: Vue 3 PWA desplegada en Cloudflare Pages (CDN global)
- Backend: Supabase Cloud (free tier, gestionado)
- Acceso: Vía subdominio propio (app.tudominio.com)
- Variables de entorno: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
- Autenticación: Supabase Auth (email/password)
- Seguridad: Row Level Security en todas las tablas
- CORS configurado para aceptar requests desde Cloudflare Pages

ESTRATEGIA OFFLINE:
- Todas las operaciones se guardan primero en IndexedDB (localforage)
- Service Worker detecta conexión y sincroniza con Supabase
- Indicador visual de estado: "Sincronizado" / "Pendiente" / "Offline"
- Conflict resolution: last-write-wins con timestamp

VARIABLES DE ENTORNO (no hardcodear):
- import.meta.env.VITE_SUPABASE_URL
- import.meta.env.VITE_SUPABASE_ANON_KEY
- Nunca usar process.env (es Vite, no Node)

SERVICIOS EN LA NUBE:
- Supabase Cloud para DB, Auth y Storage
- Cloudflare Pages para hosting del frontend
- Cloudflare DNS para gestión de dominio
- Sin servidores propios, sin homelab para esta app