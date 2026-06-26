#!/usr/bin/env node
// Third pass — uses SPA navigation (clicks) to preserve Pinia stores between routes.
// Plus deep-link test to confirm BUG-001 (cold load breaks join).
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BASE = 'http://localhost:5173'
const EVIDENCE_DIR = '/Users/diegofernando.leon/develop/main/kilo-lima/docs/qa-2026-06-22'
const CHROME_PATH = '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const findings = []
let currentSection = 'unknown'

function log(level, msg, extra = {}) {
  const ts = new Date().toISOString().split('T')[1].slice(0, 8)
  console.log(`[${ts}] [${level.padEnd(5)}] [${currentSection.padEnd(4)}] ${msg}`)
  if (level === 'BUG' || level === 'OBS ' || level === 'OK  ') {
    findings.push({ ts, level, section: currentSection, msg, ...extra })
  }
}

function section(name) {
  currentSection = name
  console.log(`\n${'='.repeat(60)}\n  SECTION: ${name}\n${'='.repeat(60)}`)
}

async function shot(page, name) {
  const path = join(EVIDENCE_DIR, 'screenshots', `${currentSection}__${name}.png`)
  await page.screenshot({ path, fullPage: true })
}

async function snapStores(page, label) {
  const data = await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const pinia = app.config.globalProperties.$pinia
    if (!pinia) return { error: 'no pinia' }
    const out = {}
    pinia._s.forEach((store, id) => {
      const o = {}
      for (const k of ['eventos', 'productos', 'recetas', 'materiasPrimas', 'ventas', 'carrito']) {
        const v = store[k]
        if (Array.isArray(v)) o[k] = v.length
      }
      if (store.productosPorEvento instanceof Map) o.productosPorEvento = `Map(${store.productosPorEvento.size})`
      if (store.gastosPorEvento instanceof Map) o.gastosPorEvento = `Map(${store.gastosPorEvento.size})`
      if (store.planesPorEvento instanceof Map) o.planesPorEvento = `Map(${store.planesPorEvento.size})`
      out[id] = o
    })
    return { url: location.pathname, stores: out }
  })
  console.log(`  [${label}] ${JSON.stringify(data.stores)}`)
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME_PATH,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => log('BUG', `pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const t = msg.text()
    if (t.includes('Failed to load resource')) return
    if (t.includes('favicon')) return
    log('OBS ', `console.error: ${t.slice(0, 250)}`)
  }
})

// SPA helper — uses Vue Router push via the app, not page.goto
async function spaClick(selector, desc) {
  try {
    await page.waitForSelector(selector, { timeout: 5000 })
    await page.click(selector)
    await new Promise((r) => setTimeout(r, 500))
    log('CLICK', `${desc}`)
    return true
  } catch (e) {
    log('BUG', `click failed: ${desc}: ${e.message}`)
    return false
  }
}

try {
  // ===== Warmup =====
  section('warmup')
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2500))
  await snapStores(page, 'home')
  await shot(page, '00-home')

  // ===== A. App Shell (verify in pass 1, light retest) =====
  section('A')
  // SPA nav to /materias-primas via card link (but we already tested direct; do SPA nav)
  // Test SPA navigation flow now
  await spaClick('[data-testid="home-btn-materias-primas"]', 'home → /materias-primas')
  await new Promise((r) => setTimeout(r, 1000))
  log('OBS ', `A-SPA: url after click = ${page.url()}`)

  // ===== B. Catálogo (full happy path) =====
  section('B')
  // At /materias-primas from SPA click
  await new Promise((r) => setTimeout(r, 500))
  await snapStores(page, 'mp list')
  await shot(page, '01-mp-list')
  // Open dialog
  await page.evaluate(() => document.querySelector('[data-testid="materia-prima-fab-nuevo"]')?.click())
  await new Promise((r) => setTimeout(r, 500))
  await shot(page, '02-mp-dialog')
  // Submit empty
  await page.evaluate(() => {
    const form = document.querySelector('.v-overlay__content form, .v-dialog form')
    if (form) {
      const btn = Array.from(form.querySelectorAll('button, .v-btn')).find((b) => /guardar|crear|agregar/i.test(b.textContent || ''))
      btn?.click()
    }
  })
  await new Promise((r) => setTimeout(r, 400))
  await shot(page, '03-mp-empty-validation')
  const validations = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.v-messages__message, .v-input--error, .v-field--error, .v-messages'))
      .map((e) => e.textContent?.trim().slice(0, 100))
      .filter(Boolean)
  })
  log('OBS ', `B-validation after empty submit: ${JSON.stringify(validations)}`)
  if (validations.length === 0) {
    log('OBS', 'B-validation: NO error messages visible — could be inline or missing')
  }
  // Close dialog
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 300))
  // B5: try to create duplicate "azúcar" (lowercase)
  await page.evaluate(() => document.querySelector('[data-testid="materia-prima-fab-nuevo"]')?.click())
  await new Promise((r) => setTimeout(r, 500))
  await page.type('.v-dialog input[type="text"]', 'azúcar', { delay: 30 })
  await new Promise((r) => setTimeout(r, 200))
  await page.evaluate(() => {
    const form = document.querySelector('.v-overlay__content form')
    const btn = Array.from(form?.querySelectorAll('button, .v-btn') || []).find((b) => /guardar|crear|agregar/i.test(b.textContent || ''))
    btn?.click()
  })
  await new Promise((r) => setTimeout(r, 1500))
  await shot(page, '04-mp-duplicate-test')
  const dupAlert = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.v-alert, .v-snackbar__content'))
      .map((e) => ({ type: e.className.includes('error') ? 'error' : e.className.includes('warning') ? 'warning' : 'info', text: e.textContent?.trim().slice(0, 200) }))
  })
  log('OBS ', `B5-duplicate detection: ${JSON.stringify(dupAlert)}`)
  if (dupAlert.some((a) => /ya existe|duplicad/i.test(a.text))) log('OK  ', 'B5: duplicate detection works')
  else log('OBS', 'B5: duplicate alert not visible — may have been toast that disappeared')
  await page.keyboard.press('Escape')
  await new Promise((r) => setTimeout(r, 300))
  // Now navigate to recetas via link in nav or direct card from home? Use home link
  await spaClick('[data-testid="app-bar-home"]', 'home icon')
  await new Promise((r) => setTimeout(r, 800))
  await spaClick('[data-testid="home-btn-recetas"]', 'home → /recetas')
  await new Promise((r) => setTimeout(r, 1200))
  await snapStores(page, 'recetas')
  // Click first receta row
  const firstRec = await page.$('[data-testid^="receta-row-"]')
  if (firstRec) {
    await firstRec.click()
    await new Promise((r) => setTimeout(r, 1000))
    await shot(page, '05-receta-detalle')
    const costInfo = await page.evaluate(() => {
      const text = document.body.innerText
      const m = text.match(/Costo total\s*([^\n]+)/i)
      const m2 = text.match(/Costo por unidad producida\s*([^\n]+)/i)
      return { costoTotal: m?.[1], costoPorUnidad: m2?.[1] }
    })
    log('OBS ', `B17 receta cost: ${JSON.stringify(costInfo)}`)
    // Back via app-bar
    await spaClick('[data-testid="app-bar-back"]', 'back to recetas')
  }
  // B19: invalid receta
  await page.goto(`${BASE}/recetas/00000000-0000-0000-0000-000000000000`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 800))
  const noFound = await page.$('[data-testid="receta-detalle-no-encontrada"]')
  log(noFound ? 'OK  ' : 'BUG ', 'B19: receta-detalle-no-encontrada visible')
  await shot(page, '06-receta-invalid')

  // ===== C. Productos (SPA nav) =====
  section('C')
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 800))
  await spaClick('[data-testid="home-btn-productos"]', 'home → /productos')
  await new Promise((r) => setTimeout(r, 1500))
  await snapStores(page, 'productos')
  await shot(page, '10-productos-list')
  const productoCards = await page.$$('[data-testid="producto-card"]')
  log('OBS ', `C: productos cards = ${productoCards.length}`)
  // C7: agregar al carrito from /productos — verify it actually works
  if (productoCards.length > 0) {
    const agregar = await productoCards[0].$('[data-testid="producto-card-agregar"]')
    if (agregar) {
      await agregar.click()
      await new Promise((r) => setTimeout(r, 500))
      await snapStores(page, 'after agregar')
      log('OBS ', 'C7: clicked Agregar from /productos')
      // Verify cart state
      const ventasStore = await page.evaluate(() => {
        const app = document.querySelector('#app').__vue_app__
        const pinia = app.config.globalProperties.$pinia
        return pinia._s.get('ventas')?.carrito?.map((l) => ({ id: l.producto_id, cant: l.cantidad, precio: l.precio_unitario, costo: l.costo_unitario }))
      })
      log('OBS ', `C7: cart content = ${JSON.stringify(ventasStore)}`)
    }
  }

  // ===== D. Eventos =====
  section('D')
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 800))
  await spaClick('[data-testid="home-btn-eventos"]', 'home → /eventos')
  await new Promise((r) => setTimeout(r, 1500))
  await snapStores(page, 'eventos')
  await shot(page, '20-eventos-list')
  // Click into first evento
  const eventoCard = await page.$('[data-testid^="evento-row-"], .v-list-item')
  if (eventoCard) {
    await eventoCard.click()
    await new Promise((r) => setTimeout(r, 2000))
    log('OK  ', 'D7: clicked into evento')
    await snapStores(page, 'evento-detalle')
    await shot(page, '21-evento-detalle')

    // ===== E. Detalle + Proyección =====
    section('E')
    const titulo = await page.$eval('[data-testid="evento-detalle-titulo"]', (e) => e.textContent?.trim()).catch(() => null)
    log('OBS ', `E: titulo = "${titulo}"`)
    const proyeccionCard = await page.$('[data-testid="proyeccion-card"]')
    if (proyeccionCard) {
      const totalText = await page.$eval('[data-testid="proyeccion-total"]', (e) => e.textContent?.trim()).catch(() => null)
      const fijosTotal = await page.$eval('[data-testid="proyeccion-fijos-total"]', (e) => e.textContent?.trim()).catch(() => null)
      const variablesTotal = await page.$eval('[data-testid="proyeccion-variables-total"]', (e) => e.textContent?.trim()).catch(() => null)
      log('OBS ', `E1: total="${totalText}", fijos="${fijosTotal}", variables="${variablesTotal}"`)
      // Break-even section
      const beSec = await page.$('[data-testid="proyeccion-break-even"]')
      if (beSec) {
        const beTxt = await page.evaluate((el) => el.textContent?.trim(), beSec)
        log('OBS ', `E: break-even section = "${beTxt?.slice(0, 300)}"`)
      } else {
        log('OBS ', 'E: NO break-even section visible')
      }
    }
    // E3: edit inline fecha_fin and margen
    await page.type('[data-testid="evento-detalle-margen"] input', '50', { delay: 30 })
    await page.click('[data-testid="evento-detalle-guardar-fechas"]')
    await new Promise((r) => setTimeout(r, 1500))
    await shot(page, '22-evento-detalle-edited')
    // Read back
    const newMargen = await page.$eval('[data-testid="evento-detalle-margen"] input', (el) => el.value).catch(() => null)
    log('OBS ', `E3: margen after save = "${newMargen}"`)

    // ===== F. Productos del evento (SPA nav now, with stores loaded) =====
    section('F')
    // Navigate via "Configurar productos" button or direct... but our EventoDetalleView doesn't have that button.
    // Use router push via app-bar breadcrumb or use page.evaluate to push route
    await page.evaluate(() => {
      const app = document.querySelector('#app').__vue_app__
      const router = app.config.globalProperties.$router
      router.push(`/eventos/${location.pathname.split('/')[2]}/productos`)
    })
    await new Promise((r) => setTimeout(r, 2000))
    await snapStores(page, 'evento productos (SPA)')
    await shot(page, '30-evento-productos')
    // Read table
    const tablaF = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="evento-productos-tabla"]')
      if (!t) return null
      return {
        headers: Array.from(t.querySelectorAll('th')).map((h) => h.textContent?.trim()),
        rows: Array.from(t.querySelectorAll('tbody tr')).map((r) =>
          Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 80))
        ),
      }
    })
    log('OBS ', `F: tabla (SPA) = ${JSON.stringify(tablaF, null, 2)}`)
    if (tablaF?.rows?.[0]?.[1]?.includes('sin receta')) {
      log('BUG (CONFIRMED)', 'F: tabla muestra "(producto sin receta)" — bug BUG-001 también afecta navegación SPA cuando el flujo previo NO incluye /recetas o /productos')
    } else {
      log('OK  ', 'F: tabla muestra nombres de receta correctos')
    }
    // Pricing alerts
    const alertsF = await page.$$eval('.v-alert', (els) =>
      els.map((e) => ({ type: e.className.includes('error') ? 'error' : e.className.includes('warning') ? 'warning' : 'info', text: e.textContent?.trim().slice(0, 100) }))
    )
    log('OBS ', `F: alerts = ${JSON.stringify(alertsF)}`)
    // F4: edit precio to 0.01 to trigger alert
    const firstInput = await page.$('[data-testid="evento-productos-tabla"] input[type="number"]')
    if (firstInput) {
      await firstInput.click({ clickCount: 3 })
      await firstInput.type('0.01')
      await new Promise((r) => setTimeout(r, 800))
      await shot(page, '31-pricing-alert')
      const alertNow = await page.$$eval('.v-alert', (els) =>
        els.map((e) => ({ type: e.className.includes('error') ? 'error' : e.className.includes('warning') ? 'warning' : 'info', text: e.textContent?.trim().slice(0, 200) }))
      )
      log('OBS ', `F4 after edit: alerts = ${JSON.stringify(alertNow)}`)
    }
    // F10: cerrar evento and check readonly
    await spaClick('[data-testid="app-bar-home"]', 'home')
    await new Promise((r) => setTimeout(r, 800))
    await spaClick('[data-testid="home-btn-eventos"]', 'home → /eventos')
    await new Promise((r) => setTimeout(r, 1500))
    const evCard = await page.$('.v-list-item')
    if (evCard) {
      await evCard.click()
      await new Promise((r) => setTimeout(r, 1500))
      // Click cerrar evento
      const cerrarBtn = await page.$('[data-testid="evento-detalle-cerrar"]')
      if (cerrarBtn) {
        log('OBS ', 'F: evento-detalle-cerrar button visible (en_curso state)')
      }
    }
  }

  // ===== G. POS (SPA nav) =====
  section('G')
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 800))
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    router.push('/pos')
  })
  await new Promise((r) => setTimeout(r, 2000))
  await snapStores(page, 'pos')
  await shot(page, '40-pos')
  const posCards = await page.$$('[data-testid="producto-card"]')
  log('OBS ', `G: pos cards = ${posCards.length}`)
  if (posCards.length > 0) {
    const agregar = await posCards[0].$('[data-testid="producto-card-agregar"]')
    if (agregar) {
      for (let i = 0; i < 3; i++) {
        await agregar.click()
        await new Promise((r) => setTimeout(r, 200))
      }
      await shot(page, '41-pos-cart-3items')
      const cartTotal = await page.$eval('[data-testid="carrito-total"]', (e) => e.textContent?.trim())
      log('OBS ', `G: cart total after 3 clicks = ${cartTotal}`)
      // Verify line details
      const cartLines = await page.evaluate(() => {
        const app = document.querySelector('#app').__vue_app__
        const pinia = app.config.globalProperties.$pinia
        return pinia._s.get('ventas')?.carrito?.map((l) => ({
          id: l.producto_id,
          cant: l.cantidad,
          precio: l.precio_unitario,
          costo: l.costo_unitario,
          margen: l.margen_aplicado,
          subtotal: l.subtotal,
        }))
      })
      log('OBS ', `G: cart lines = ${JSON.stringify(cartLines)}`)
      // Open registrar dialog
      await spaClick('[data-testid="carrito-registrar"]', 'registrar venta')
      await new Promise((r) => setTimeout(r, 500))
      await shot(page, '42-pos-registrar-dialog')
      // Pick transferencia
      await page.click('[data-testid="registrar-venta-metodo"]')
      await new Promise((r) => setTimeout(r, 400))
      const opts = await page.$$('.v-overlay__content .v-list-item')
      log('OBS ', `G15: metodo_pago options = ${opts.length}`)
      if (opts.length >= 2) {
        await opts[1].click()
        await new Promise((r) => setTimeout(r, 400))
      }
      await spaClick('[data-testid="registrar-venta-confirmar"]', 'confirm venta')
      await new Promise((r) => setTimeout(r, 1500))
      await shot(page, '43-pos-after-venta')
      const toastTxt = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.v-snackbar__content, .v-snackbar, [role="alert"], [class*="toast"]'))
          .map((e) => e.textContent?.trim().slice(0, 200))
          .filter(Boolean)
      })
      log('OBS ', `G15 toast = ${JSON.stringify(toastTxt)}`)
      const cartAfter = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="carrito-panel"] .v-list-item')
        const vacio = document.querySelector('[data-testid="carrito-vacio"]')
        return { items: items.length, vacio: !!vacio }
      })
      log('OBS ', `G15 cart after = ${JSON.stringify(cartAfter)}`)
      if (cartAfter.items > 0 || !cartAfter.vacio) log('BUG', 'G15: cart no se vacía')
      else log('OK  ', 'G15: cart se vació tras venta')
    }
  }

  // ===== H. Cierre =====
  section('H')
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    router.push('/pos/cierre')
  })
  await new Promise((r) => setTimeout(r, 2000))
  await snapStores(page, 'cierre')
  await shot(page, '50-cierre')
  const cierreEventInfo = await page.evaluate(() => document.querySelector('[data-testid="cierre-evento-info"]')?.textContent?.trim())
  log('OBS ', `H: event info = "${cierreEventInfo}"`)
  const resumenT = await page.evaluate(() => document.querySelector('[data-testid="cierre-resumen"]')?.textContent?.trim()?.slice(0, 600))
  log('OBS ', `H: resumen = "${resumenT}"`)
  // Test register cierre
  const regBtn = await page.$('[data-testid="cierre-boton-registrar"]')
  if (regBtn) {
    await regBtn.click()
    await new Promise((r) => setTimeout(r, 500))
    await shot(page, '51-cierre-confirm-dialog')
    await page.click('[data-testid="cierre-confirmar-registrar"]')
    await new Promise((r) => setTimeout(r, 2000))
    await shot(page, '52-cierre-after-register')
    log('OBS ', `H: URL after cerrar = ${page.url()}`)
  }

  // ===== I. Reporte =====
  section('I')
  const eventoId = page.url().split('/eventos/')[1]?.split('/')[0]
  if (eventoId) {
    await page.evaluate((id) => {
      const app = document.querySelector('#app').__vue_app__
      const router = app.config.globalProperties.$router
      router.push(`/eventos/${id}/reporte`)
    }, eventoId)
    await new Promise((r) => setTimeout(r, 2000))
    await shot(page, '60-reporte')
    const reporteEstado = await page.evaluate(() => {
      const empty = document.querySelector('[data-testid="reporte-empty"]')
      const tabs = document.querySelectorAll('[data-testid^="reporte-tab-"]')
      return { empty: !!empty, tabs: tabs.length }
    })
    log('OBS ', `I: reporte = ${JSON.stringify(reporteEstado)}`)
    // Click tabs
    await spaClick('[data-testid="reporte-tab-por-dia"]', 'por dia')
    await new Promise((r) => setTimeout(r, 800))
    await shot(page, '61-reporte-por-dia')
    const porDiaRows = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="reporte-por-dia-tabla"]')
      if (!t) return null
      return Array.from(t.querySelectorAll('tbody tr')).map((r) =>
        Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 50))
      )
    })
    log('OBS ', `I por dia rows = ${JSON.stringify(porDiaRows)}`)
    await spaClick('[data-testid="reporte-tab-por-producto"]', 'por producto')
    await new Promise((r) => setTimeout(r, 800))
    await shot(page, '62-reporte-por-producto')
    const porProd = await page.evaluate(() => {
      const t = document.querySelector('[data-testid="reporte-por-producto-tabla"]')
      const pagaronOp = document.querySelector('[data-testid="reporte-pagaron-operacion"]')?.textContent?.trim()
      const gananciaPura = document.querySelector('[data-testid="reporte-ganancia-pura"]')?.textContent?.trim()
      const rows = t ? Array.from(t.querySelectorAll('tbody tr')).map((r) =>
        Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 50))
      ) : null
      return { pagaronOp, gananciaPura, rows }
    })
    log('OBS ', `I por producto = ${JSON.stringify(porProd, null, 2)}`)
  }

  // ===== J. Home =====
  section('J')
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 1500))
  await shot(page, '70-home-final')
  const counters = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="contador-"]'))
    return cards.map((c) => ({ testid: c.getAttribute('data-testid'), text: c.textContent?.trim().slice(0, 60) }))
  })
  log('OBS ', `J: counters = ${JSON.stringify(counters)}`)
  const bannerEvento = await page.evaluate(() => {
    const b = document.querySelector('[data-testid^="banner-evento-activo"], [class*="banner-evento"]')
    return b?.textContent?.trim().slice(0, 200)
  })
  log('OBS ', `J: banner evento activo = "${bannerEvento}"`)
  const estadoConn = await page.evaluate(() => document.querySelector('[data-testid="estado-conexion"]')?.textContent?.trim())
  log('OBS ', `J6: estado conexion = "${estadoConn}"`)

  // ===== K. Responsive =====
  section('K')
  await page.setViewport({ width: 375, height: 667 })
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 800))
  await shot(page, '80-mobile-home')
  await page.evaluate(() => {
    const app = document.querySelector('#app').__vue_app__
    const router = app.config.globalProperties.$router
    router.push('/pos')
  })
  await new Promise((r) => setTimeout(r, 1500))
  await shot(page, '81-mobile-pos')
  await page.setViewport({ width: 1920, height: 1080 })
  await spaClick('[data-testid="app-bar-home"]', 'home')
  await new Promise((r) => setTimeout(r, 800))
  await shot(page, '82-desktop-home')

  // ===== BUG-001 deep-link test (re-confirm with evidence) =====
  section('BUG-001')
  await page.setViewport({ width: 1280, height: 800 })
  console.log('--- Cold load /eventos/:id/productos (deep link / refresh) ---')
  await page.goto(`${BASE}/eventos/68d65441-c2de-4fe9-8672-67e2267d3b7f/productos`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2500))
  await snapStores(page, 'cold load evento productos')
  await shot(page, '90-bug-deep-link')
  const tablaCold = await page.evaluate(() => {
    const t = document.querySelector('[data-testid="evento-productos-tabla"]')
    if (!t) return null
    return Array.from(t.querySelectorAll('tbody tr')).map((r) =>
      Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 60))
    )
  })
  log('OBS ', `BUG-001 cold load tabla = ${JSON.stringify(tablaCold)}`)
  if (tablaCold?.[0]?.[1]?.includes('sin receta')) {
    log('BUG (CONFIRMED WITH EVIDENCE)', 'BUG-001: deep-link / refresh en /eventos/:id/productos rompe el join — muestra "(producto sin receta)" y costo=0. La vista NO carga recetasStore ni productosStore en onMounted.')
  }
  // Now test /pos cold load
  console.log('--- Cold load /pos ---')
  await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle2' })
  await new Promise((r) => setTimeout(r, 2500))
  await snapStores(page, 'cold load pos')
  await shot(page, '91-bug-pos-cold')
  const posCardsCold = await page.$$('[data-testid="producto-card"]')
  log('OBS ', `BUG-001 cold /pos cards = ${posCardsCold.length}`)

  // ===== Final =====
  await browser.close()
  await writeFile(
    join(EVIDENCE_DIR, 'findings-pass3.json'),
    JSON.stringify({ findings, totalObservations: findings.length }, null, 2)
  )
  console.log(`\n=== PASS 3 DONE — ${findings.length} findings ===`)
} catch (err) {
  log('BUG', `FATAL: ${err.message}\n${err.stack}`)
  await browser.close()
}