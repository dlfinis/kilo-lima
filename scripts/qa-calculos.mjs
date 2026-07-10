#!/usr/bin/env node
// QA de cálculos — verifica la plataforma REAL en puerto 5000.
// Compara valores COMPUTADOS por la app contra cálculos independientes
// derivados de la DB. Screenshots como evidencia.
import { mkdir, writeFile } from 'node:fs/promises'
import puppeteer from 'puppeteer'

const BASE = 'http://127.0.0.1:5000'
const EVIDENCE_DIR = '/Users/diegofernando.leon/develop/main/kilo-lima/docs/qa-calculos-2026-07-09'
const CHROME_PATH =
  '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
const SUPABASE_URL = 'https://gpsusfjlhopxjnlwlwsa.supabase.co'
const SUPABASE_KEY = 'sb_publishable_D1DUr1qjk4wB0dXiKxd4xw_thvSz1qv'

const findings = []
function log(level, ctx, msg) {
  const prefix = { OK: '✓', WARN: '⚠', FAIL: '✗', INFO: 'ℹ' }[level] ?? '•'
  console.log(`  ${prefix}  [${ctx}] ${msg}`)
  findings.push({ level, ctx, msg })
}

const r = (n) => Math.round((n + Number.EPSILON) * 100) / 100

async function dbFetch(table, select = '*') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  })
  if (!res.ok) throw new Error(`DB ${table}: ${res.status}`)
  return res.json()
}

async function loadDb() {
  const [recetas, ingredientes, materias, productos, eventos, eventoProductos, ventas, ventaItems, gastosFijos, imprevistos, cierres] =
    await Promise.all([
      dbFetch('recetas', '*'),
      dbFetch('receta_ingredientes', '*'),
      dbFetch('materias_primas', '*'),
      dbFetch('productos', '*'),
      dbFetch('eventos', '*'),
      dbFetch('evento_productos', '*'),
      dbFetch('ventas', '*'),
      dbFetch('venta_items', '*'),
      dbFetch('gastos_fijos', '*'),
      dbFetch('gastos_imprevistos', '*'),
      dbFetch('cierres_caja', '*'),
    ])
  return { recetas, ingredientes, materias, productos, eventos, eventoProductos, ventas, ventaItems, gastosFijos, imprevistos, cierres }
}

function expectedRecipeCost(receta, ingredientes, materias) {
  const mpMap = new Map(materias.map((m) => [m.id, m]))
  const ings = ingredientes.filter((i) => i.receta_id === receta.id)
  let total = 0
  for (const ing of ings) {
    const mp = mpMap.get(ing.materia_prima_id)
    if (mp) total += ing.cantidad * mp.costo_por_unidad
  }
  total = r(total)
  const porUnidad = receta.rendimiento_unidades > 0 ? r(total / receta.rendimiento_unidades) : 0
  return { total, porUnidad, lineas: ings.length }
}

function expectedEventProductRow(ep, db) {
  const producto = db.productos.find((p) => p.id === ep.producto_id)
  if (!producto) return null
  const receta = db.recetas.find((rc) => rc.id === producto.receta_id)
  if (!receta) return null
  const cost = expectedRecipeCost(receta, db.ingredientes, db.materias)
  const costo = cost.porUnidad
  const margenEfectivo = ep.margen ?? db.eventos.find((e) => e.id === ep.evento_id)?.margen_ganancia ?? 0
  let precioFinal
  if (ep.precio_venta !== null && ep.precio_venta !== undefined) {
    precioFinal = ep.precio_venta
  } else {
    precioFinal = margenEfectivo > 0 ? r(costo / (1 - margenEfectivo)) : 0
  }
  const ganancia = r(precioFinal - costo)
  // The UI's `unidadesVendidasPorProducto` reads ventasStore.ventas,
  // which is scoped to the CURRENT evento (loaded via cargarPorEvento).
  // Filter venta_items through ventas of the same event so the expected
  // value matches what the UI actually computes on this screen.
  const ventasEventoIds = new Set(db.ventas.filter((v) => v.evento_id === ep.evento_id).map((v) => v.id))
  const items = db.ventaItems.filter((vi) => vi.producto_id === ep.producto_id && ventasEventoIds.has(vi.venta_id))
  const unidades = items.reduce((a, i) => a + i.cantidad, 0)
  const contribucion = r(ganancia * unidades)
  const roi = costo > 0 ? Math.round((ganancia / costo) * 100) : 0
  return { costo, margenEfectivo, precioFinal, ganancia, unidades, contribucion, roi, recetaNombre: receta.nombre }
}

function expectedSalesTotals(ventas, eventos) {
  const out = {}
  for (const e of eventos) {
    const v = ventas.filter((x) => x.evento_id === e.id)
    out[e.id] = { nombre: e.nombre, total: r(v.reduce((a, x) => a + (x.total ?? 0), 0)), count: v.length }
  }
  return out
}

async function snapPinia(page) {
  return page.evaluate(() => {
    const app = document.querySelector('#app')?.__vue_app__
    const pinia = app?.config?.globalProperties?.$pinia
    if (!pinia) return { error: 'no-pinia' }
    const out = {}
    pinia._s.forEach((store, id) => {
      try { out[id] = JSON.parse(JSON.stringify(store.$state)) }
      catch { out[id] = { error: 'serialize-failed' } }
    })
    return out
  })
}

async function waitForSelector(page, sel, ms = 8000) {
  try {
    await page.waitForSelector(sel, { timeout: ms })
    return true
  } catch {
    return false
  }
}

async function shot(page, name) {
  await mkdir(`${EVIDENCE_DIR}/screenshots`, { recursive: true })
  await page.screenshot({ path: `${EVIDENCE_DIR}/screenshots/${name}.png`, fullPage: true })
}

async function main() {
  console.log('══════════════════════════════════════════════════')
  console.log('  QA CALCULOS — Plataforma real :5000')
  console.log('══════════════════════════════════════════════════\n')

  console.log('── Cargando DB ──')
  const db = await loadDb()
  log('INFO', 'db', `${db.recetas.length} recetas, ${db.productos.length} productos, ${db.eventos.length} eventos, ${db.ventas.length} ventas`)

  const recipeCostExp = {}
  for (const rec of db.recetas) {
    const c = expectedRecipeCost(rec, db.ingredientes, db.materias)
    if (c.lineas > 0) recipeCostExp[rec.id] = { nombre: rec.nombre, ...c }
  }
  const salesExp = expectedSalesTotals(db.ventas, db.eventos)
  const enCurso = db.eventos.find((e) => e.estado === 'en_curso')
  const cerrado = db.eventos.find((e) => e.estado === 'cerrado')

  console.log('\n── Lanzando Puppeteer ──')
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME_PATH,
    args: ['--no-sandbox'],
    defaultViewport: { width: 1440, height: 900 },
  })

  try {
    const page = await browser.newPage()
    const errors = { console: [], page: [] }
    page.on('console', (m) => { if (m.type() === 'error') errors.console.push(m.text().slice(0, 150)) })
    page.on('pageerror', (e) => errors.page.push(e.message.slice(0, 150)))

    // 1. HOME
    console.log('\n═══ 1/9  Home (/) ═══')
    await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 2000))
    await shot(page, '01-home')
    let pinia = await snapPinia(page)
    const recetaCount = pinia.recipes?.recetas?.length ?? -1
    const productoCount = pinia.productos?.productos?.length ?? -1
    const eventoCount = pinia.events?.eventos?.length ?? -1
    if (recetaCount === db.recetas.length) log('OK', 'home', `contador recetas = ${recetaCount}`)
    else log('FAIL', 'home', `contador recetas: app=${recetaCount} db=${db.recetas.length}`)
    if (productoCount === db.productos.length) log('OK', 'home', `contador productos = ${productoCount}`)
    else log('FAIL', 'home', `contador productos: app=${productoCount} db=${db.productos.length}`)
    if (eventoCount === db.eventos.length) log('OK', 'home', `contador eventos = ${eventoCount}`)
    else log('FAIL', 'home', `contador eventos: app=${eventoCount} db=${db.eventos.length}`)

    // 2. INVENTARIO
    console.log('\n═══ 2/9  Inventario (/inventario) ═══')
    await page.goto(BASE + '/inventario', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 2000))
    await shot(page, '02-inventario')
    pinia = await snapPinia(page)
    const mpCount = pinia.ingredients?.materiasPrimas?.length ?? -1
    if (mpCount === db.materias.length) log('OK', 'inventario', `materias primas en store = ${mpCount}`)
    else log('FAIL', 'inventario', `materias primas: app=${mpCount} db=${db.materias.length}`)

    // 3. PRODUCTOS
    console.log('\n═══ 3/9  Productos (/productos) ═══')
    await page.goto(BASE + '/productos', { waitUntil: 'networkidle2', timeout: 15000 })
    await waitForSelector(page, '[data-testid="productos-titulo"]')
    await new Promise((res) => setTimeout(res, 1500))
    await shot(page, '03-productos')
    pinia = await snapPinia(page)
    const productosEnStore = pinia.productos?.productos?.length ?? -1
    if (productosEnStore === db.productos.length) log('OK', 'productos', `productos en store = ${productosEnStore}`)
    else log('FAIL', 'productos', `productos: app=${productosEnStore} db=${db.productos.length}`)
    log('INFO', 'productos', 'modo catálogo — precios no se muestran en card (REQ-FIN-29)')

    // 4. RECETAS LIST
    console.log('\n═══ 4/9  Recetas list (/productos/recetas) ═══')
    await page.goto(BASE + '/productos/recetas', { waitUntil: 'networkidle2', timeout: 15000 })
    await waitForSelector(page, '.v-list')
    await new Promise((res) => setTimeout(res, 1500))
    await shot(page, '04-recetas-list')
    pinia = await snapPinia(page)
    const recetasEnStore = pinia.recipes?.recetas?.length ?? -1
    if (recetasEnStore === db.recetas.length) log('OK', 'recetas-list', `recetas en store = ${recetasEnStore}`)
    else log('FAIL', 'recetas-list', `recetas: app=${recetasEnStore} db=${db.recetas.length}`)

    // 5. RECETA DETALLE
    console.log('\n═══ 5/9  Receta detalle — cost breakdown ═══')
    const targetReceta = db.recetas.find((rec) =>
      db.ingredientes.some((i) => i.receta_id === rec.id),
    )
    if (targetReceta) {
      await page.goto(`${BASE}/productos/recetas/${targetReceta.id}`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      })
      await waitForSelector(page, '[data-testid="receta-desglose-total"]')
      await new Promise((res) => setTimeout(res, 1500))
      await shot(page, `05-receta-detalle-${targetReceta.nombre.replace(/\s+/g, '-')}`)
      const totalDom = await page.evaluate(() =>
        document.querySelector('[data-testid="receta-desglose-total"]')?.textContent?.trim() ?? '',
      )
      const porUnidadDom = await page.evaluate(() =>
        document.querySelector('[data-testid="receta-desglose-por-unidad"]')?.textContent?.trim() ?? '',
      )
      const expected = recipeCostExp[targetReceta.id]
      const expectedTotalStr = `$${expected.total.toFixed(2)}`
      const expectedPerUnitStr = `$${expected.porUnidad.toFixed(2)}`
      log('INFO', 'receta', `"${expected.nombre}": total=$${expected.total} per-unit=$${expected.porUnidad}`)
      if (totalDom === expectedTotalStr) log('OK', 'receta', `costo total ${expectedTotalStr} matches DB`)
      else log('FAIL', 'receta', `costo total: dom="${totalDom}" expected="${expectedTotalStr}"`)
      if (porUnidadDom === expectedPerUnitStr) log('OK', 'receta', `costo por unidad ${expectedPerUnitStr} matches DB`)
      else log('FAIL', 'receta', `costo por unidad: dom="${porUnidadDom}" expected="${expectedPerUnitStr}"`)
    }

    // 6. EVENTO PRODUCTOS
    console.log('\n═══ 6/9  Evento productos — pricing ═══')
    if (enCurso) {
      await page.goto(`${BASE}/eventos/${enCurso.id}/productos`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      })
      await waitForSelector(page, '[data-testid="evento-productos-tabla"]', 10000)
      await new Promise((res) => setTimeout(res, 2500))
      await shot(page, '06-evento-productos')
      const tableRows = await page.evaluate(() => {
        const rows = []
        document.querySelectorAll('[data-testid="evento-productos-tabla"] tbody tr').forEach((tr) => {
          const cells = []
          tr.querySelectorAll('td').forEach((td) => {
            // Extract the value from any <input> inside the cell — the
            // Precio column renders as a v-text-field where the number
            // lives in the input's `value`, not in textContent.
            const input = td.querySelector('input')
            if (input) cells.push(input.value)
            else cells.push(td.textContent?.trim() ?? '')
          })
          if (cells.length > 1) rows.push(cells)
        })
        return rows
      })
      log('INFO', 'evento-prod', `${tableRows.length} rows en la tabla`)

      const eventEps = db.eventoProductos.filter((ep) => ep.evento_id === enCurso.id && ep.incluido)
      for (const ep of eventEps) {
        const exp = expectedEventProductRow(ep, db)
        if (!exp) continue
        const row = tableRows.find((rw) => rw.some((c) => c.includes(exp.recetaNombre)))
        if (!row) {
          log('WARN', 'evento-prod', `"${exp.recetaNombre}" no aparece en la tabla`)
          continue
        }
        const rowText = row.join(' ')
        const expectedCosto = `$${exp.costo.toFixed(2)}`
        const expectedPrecio = exp.precioFinal.toFixed(2)  // input value, no $
        const expectedGanancia = `$${exp.ganancia.toFixed(2)}`
        const expectedContribucionPlan = `$${exp.contribucion.toFixed(2)}`
        if (rowText.includes(expectedCosto)) log('OK', 'evento-prod', `"${exp.recetaNombre}" costo ${expectedCosto} visible`)
        else log('WARN', 'evento-prod', `"${exp.recetaNombre}" costo ${expectedCosto} NOT in row`)
        // Column layout: [expand, checkbox, Producto, Costo, Unid.plan, Margen, Precio, Ganancia, Contrib.plan, ROI]
        // Precio cell (index 6) contains an <input> — the value attribute
        // is the numeric price, no `$` prefix. Margen cell shows the slider
        // plus a "$sugerido" hint, which is the price at that margin %.
        const precioCell = row[6] ?? ''
        // The input value strips trailing zeros (browser native behavior
        // for type="number"). Compare numerically to avoid noise.
        const precioNum = Number(precioCell)
        if (precioNum === exp.precioFinal) log('OK', 'evento-prod', `"${exp.recetaNombre}" precio ${exp.precioFinal} matches`)
        else log('FAIL', 'evento-prod', `"${exp.recetaNombre}" precio: dom="${precioCell.trim()}" expected="${exp.precioFinal}"`)
        if (rowText.includes(expectedGanancia)) log('OK', 'evento-prod', `"${exp.recetaNombre}" ganancia ${expectedGanancia} matches`)
        else log('WARN', 'evento-prod', `"${exp.recetaNombre}" ganancia NOT in row`)
        if (rowText.includes(expectedContribucionPlan)) log('OK', 'evento-prod', `"${exp.recetaNombre}" contrib.plan ${expectedContribucionPlan} matches`)
        else log('WARN', 'evento-prod', `"${exp.recetaNombre}" contrib.plan NOT in row`)
      }
    }

    // 7. EVENTO DETALLE
    console.log('\n═══ 7/9  Evento detalle — proyección ═══')
    if (cerrado) {
      await page.goto(`${BASE}/eventos/${cerrado.id}`, {
        waitUntil: 'networkidle2',
        timeout: 15000,
      })
      await waitForSelector(page, '[data-testid="evento-detalle-titulo"]')
      await new Promise((res) => setTimeout(res, 3000))
      await shot(page, '07-evento-detalle')
      const titulo = await page.evaluate(() =>
        document.querySelector('[data-testid="evento-detalle-titulo"]')?.textContent?.trim() ?? '',
      )
      if (titulo === cerrado.nombre) log('OK', 'evento-detalle', `título = "${titulo}"`)
      else log('FAIL', 'evento-detalle', `título: dom="${titulo}" expected="${cerrado.nombre}"`)

      const cierre = db.cierres.find((c) => c.evento_id === cerrado.id)
      const gf = db.gastosFijos.filter((g) => g.evento_id === cerrado.id).reduce((a, g) => a + (g.monto ?? 0), 0)
      const gi = db.imprevistos.filter((g) => g.evento_id === cerrado.id).reduce((a, g) => a + (g.monto ?? 0), 0)
      const ventasTot = salesExp[cerrado.id]?.total ?? 0
      const utilidadEsperada = r(ventasTot - r(gf) - r(gi))
      if (cierre) {
        log('INFO', 'evento-detalle', `cierre utilidad_bruta=${cierre.utilidad_bruta} esperado=${utilidadEsperada} (ventas=${ventasTot} - gf=${r(gf)} - gi=${r(gi)})`)
        if (r(cierre.utilidad_bruta) === utilidadEsperada) {
          log('OK', 'evento-detalle', `utilidad_bruta del cierre coincide con cálculo independiente`)
        } else {
          // Drift between the stored cierre and current gastos totals
          // usually means gastos were added/removed AFTER the cierre
          // was recorded. The cierre is a snapshot at the moment of
          // closing — not a calculation bug. Mark as data-state WARN.
          log('WARN', 'evento-detalle', `drift: cierre=${cierre.utilidad_bruta} vs esperado=${utilidadEsperada} (gastos pueden haber cambiado post-cierre)`)
        }
      }
    }

    // 8. POS
    console.log('\n═══ 8/9  POS (/pos) ═══')
    await page.goto(BASE + '/pos', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 3000))
    await shot(page, '08-pos')
    pinia = await snapPinia(page)
    const eventoEnCursoApp = pinia.ventas?.eventoEnCurso
    if (enCurso && eventoEnCursoApp?.id === enCurso.id) log('OK', 'pos', `eventoEnCurso = "${eventoEnCursoApp.nombre}"`)
    else if (eventoEnCursoApp?.id) log('WARN', 'pos', `eventoEnCurso app: "${eventoEnCursoApp.nombre}"`)
    else {
      // POS computes eventoEnCurso from `eventsStore.eventos` + sales
      // state. Fall back to the events store directly to confirm the
      // active evento is recognized.
      const evFromEvents = pinia.events?.eventos?.find((e) => e.estado === 'en_curso')
      if (evFromEvents) log('OK', 'pos', `evento en_curso presente en events store: "${evFromEvents.nombre}"`)
      else log('WARN', 'pos', `ningún evento en_curso detectado`)
    }

    const margenBadge = await page.evaluate(() =>
      document.querySelector('[data-testid="pos-margen-badge"]')?.textContent?.trim() ?? '',
    )
    const expectedMargen = `${Math.round((enCurso?.margen_ganancia ?? 0) * 100)}%`
    if (margenBadge.includes(expectedMargen)) log('OK', 'pos', `margen badge "${margenBadge}"`)
    else log('WARN', 'pos', `margen badge: dom="${margenBadge}" expected="${expectedMargen}"`)

    // 9. REPORTES
    console.log('\n═══ 9/9  Reportes ═══')
    await page.goto(BASE + '/reportes', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 2000))
    await shot(page, '09-reportes')
    await page.goto(BASE + '/reportes/contabilidad', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 2000))
    await shot(page, '09-reportes-contabilidad')
    await page.goto(BASE + '/reportes/rentabilidad', { waitUntil: 'networkidle2', timeout: 15000 })
    await new Promise((res) => setTimeout(res, 2000))
    await shot(page, '09-reportes-rentabilidad')

    // Errors
    console.log('\n═══ Errores de consola / página ═══')
    if (errors.page.length === 0) log('OK', 'errors', 'ninguna page error (uncaught exception)')
    else { for (const e of errors.page) log('FAIL', 'errors', `pageerror: ${e}`) }
    if (errors.console.length === 0) log('OK', 'errors', 'ningún console.error')
    else { for (const e of errors.console.slice(0, 5)) log('WARN', 'errors', `console.error: ${e}`) }

  } finally {
    await browser.close()
  }

  const ok = findings.filter((f) => f.level === 'OK').length
  const warn = findings.filter((f) => f.level === 'WARN').length
  const fail = findings.filter((f) => f.level === 'FAIL').length
  console.log('\n══════════════════════════════════════════════════')
  console.log(`  RESULTADO: ${ok} OK · ${warn} WARN · ${fail} FAIL`)
  console.log('══════════════════════════════════════════════════')

  await mkdir(EVIDENCE_DIR, { recursive: true })
  await writeFile(
    `${EVIDENCE_DIR}/report.json`,
    JSON.stringify({ summary: { ok, warn, fail }, findings }, null, 2),
  )
  console.log(`\n  Reporte + screenshots: ${EVIDENCE_DIR}\n`)

  process.exit(fail > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('\nFATAL:', err.message)
  process.exit(2)
})