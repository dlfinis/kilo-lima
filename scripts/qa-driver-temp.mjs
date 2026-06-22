#!/usr/bin/env node
// QA driver — Manual exploration with real browser.
// Logs every action, captures screenshots, and records observations.
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.QA_URL ?? 'http://localhost:5173'
const EVIDENCE_DIR = process.env.QA_EVIDENCE ?? '/Users/diegofernando.leon/develop/main/kilo-lima/docs/qa-2026-06-22'
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
  log('SHOT', `${name} -> ${path.split('/').pop()}`)
}

async function snap(page, label) {
  const data = await page.evaluate(() => {
    const root = document.querySelector('#app')
    const text = document.body.innerText
    return {
      url: location.href,
      pathname: location.pathname,
      title: document.title,
      bodyText: text,
      childCount: root ? root.children.length : 0,
      errorEls: Array.from(document.querySelectorAll('.v-alert, [data-testid$="error"]')).map((e) => ({
        type: e.className.includes('error') ? 'error' : e.className.includes('warning') ? 'warning' : 'info',
        text: (e.textContent || '').trim().slice(0, 200),
        testid: e.getAttribute('data-testid'),
      })),
      testIds: Array.from(document.querySelectorAll('[data-testid]')).map((e) => e.getAttribute('data-testid')),
    }
  })
  log('SNAP', label, data)
  return data
}

async function click(page, selector, desc) {
  try {
    await page.waitForSelector(selector, { timeout: 3000 })
    await page.click(selector)
    log('CLICK', `${desc} [${selector}]`)
    await new Promise((r) => setTimeout(r, 400))
  } catch (e) {
    log('BUG', `click failed: ${desc} [${selector}]: ${e.message}`)
  }
}

async function typeText(page, selector, text, desc) {
  try {
    await page.waitForSelector(selector, { timeout: 3000 })
    await page.click(selector, { clickCount: 3 })
    await page.keyboard.press('Backspace')
    await page.type(selector, text, { delay: 20 })
    log('TYPE', `${desc} [${selector}] = "${text}"`)
    await new Promise((r) => setTimeout(r, 200))
  } catch (e) {
    log('BUG', `type failed: ${desc} [${selector}]: ${e.message}`)
  }
}

async function goto(page, path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle2', timeout: 30000 })
  await page.waitForSelector('#app > *', { timeout: 10000 })
  await new Promise((r) => setTimeout(r, 500))
  log('GOTO', `${label}: ${path}`)
}

async function wait(page, ms = 500) {
  await new Promise((r) => setTimeout(r, ms))
}

const browser = await puppeteer.launch({
  headless: true,
  executablePath: CHROME_PATH,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  defaultViewport: { width: 1280, height: 800 },
})
const page = await browser.newPage()
page.on('pageerror', (err) => log('BUG', `pageerror: ${err.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') {
    const t = msg.text()
    if (t.includes('Failed to load resource')) return
    log('OBS ', `console.error: ${t.slice(0, 200)}`)
  }
})
page.on('requestfailed', (req) => {
  const url = req.url()
  if (url.includes('supabase')) {
    log('OBS ', `requestfailed: ${req.method()} ${url.split('?')[0]} — ${req.failure()?.errorText}`)
  }
})

try {
  // ===== A. App Shell & Navegación =====
  section('A')
  await goto(page, '/', 'home root')
  await shot(page, '01-home')
  await snap(page, 'home initial')
  // A1: Back button hidden on /
  const backAtRoot = await page.$('[data-testid="app-bar-back"]')
  if (backAtRoot) log('BUG', 'A1: back button visible at root /')
  else log('OK  ', 'A1: back button hidden on /')
  // A2: home icon present
  const homeIcon = await page.$('[data-testid="app-bar-home"]')
  log(homeIcon ? 'OK  ' : 'BUG ', 'A2: home icon present')
  // A4: catch-all
  await goto(page, '/foo-does-not-exist', 'catch-all')
  await snap(page, 'catch-all /foo-does-not-exist')
  if (page.url().endsWith('/') || page.url().endsWith('/?')) log('OK  ', 'A4: catch-all redirects to /')
  else log('OBS ', `A4: catch-all path = ${page.url()}`)
  // A5: breadcrumb
  await goto(page, '/eventos', 'eventos list')
  await snap(page, 'eventos list - breadcrumb')
  // A6: reload
  await page.reload({ waitUntil: 'networkidle2' })
  await wait(page, 500)
  log('OK  ', 'A6: reload on /eventos OK')

  // ===== B. Catálogo =====
  section('B')
  // B.1 Materias Primas
  await goto(page, '/materias-primas', 'mp list')
  await shot(page, '01-mp-list')
  await snap(page, 'mp-list initial')
  const mpItems = await page.$$eval('[data-testid="mp-list"] .v-list-item, [data-testid^="mp-"] .v-list-item, [data-testid="mp-list"] > *', (els) => els.length)
  log('OBS ', `mp-list rows visible: ${mpItems}`)
  // Count actual ingredients
  const mpCount = await page.evaluate(() => document.querySelectorAll('.v-list-item').length)
  log('OBS ', `mp v-list-item elements: ${mpCount}`)
  // Try the empty state testid too
  const mpEmpty = await page.$('[data-testid="mp-empty"]')
  const mpLoading = await page.$('[data-testid="mp-loading"]')
  log('OBS ', `mp-empty present: ${!!mpEmpty}, mp-loading present: ${!!mpLoading}`)

  // B2: open new MP dialog
  const fabNuevoMp = await page.$('[data-testid="materia-prima-fab-nuevo"]')
  if (fabNuevoMp) {
    await fabNuevoMp.click()
    await wait(page, 400)
    log('OK  ', 'B2: clicked FAB nueva materia prima')
    await shot(page, '02-mp-new-dialog')
    // B3: try empty submit
    const submitMp = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('.v-dialog .v-btn'))
      const submit = buttons.find((b) => /guardar|crear/i.test(b.textContent || ''))
      if (submit) submit.click()
      return !!submit
    })
    log('OBS ', `B3: submit button found in dialog: ${submitMp}`)
    await wait(page, 400)
    await shot(page, '03-mp-validation-empty')
    // Try to find validation error
    const validationVisible = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('.v-dialog .v-input'))
      return inputs.some((i) => i.className.includes('error'))
    })
    log(validationVisible ? 'OK  ' : 'OBS ', `B3: validation visible on empty submit: ${validationVisible}`)
    // Close dialog
    await page.evaluate(() => {
      const cancelBtn = Array.from(document.querySelectorAll('.v-dialog .v-btn')).find((b) => /cancelar/i.test(b.textContent || ''))
      if (cancelBtn) cancelBtn.click()
    })
    await wait(page, 300)
  } else {
    log('BUG', 'B2: FAB nueva materia prima no encontrada')
  }

  // B.2 Recetas
  await goto(page, '/recetas', 'recetas list')
  await shot(page, '10-recetas-list')
  await snap(page, 'recetas list')
  const recetaRows = await page.$$eval('.v-list-item', (els) => els.length)
  log('OBS ', `recetas v-list-item count: ${recetaRows}`)
  // B11: click first receta row → detail
  const firstRow = await page.$('[data-testid^="receta-row-"]')
  if (firstRow) {
    await firstRow.click()
    await wait(page, 600)
    log('OK  ', 'B11: clicked first receta row')
    await shot(page, '11-receta-detalle')
    await snap(page, 'receta-detalle initial')
    const detalleTitulo = await page.$('[data-testid="receta-detalle-titulo"]')
    log(detalleTitulo ? 'OK  ' : 'BUG ', 'B11: receta-detalle titulo visible')
    // B20: Vender esta receta
    const venderBtn = await page.$('[data-testid="receta-detalle-vender"]')
    if (venderBtn) {
      const label = await page.evaluate((el) => el.textContent?.trim(), venderBtn)
      log('OK  ', `B20: vender button present, label="${label}"`)
      await venderBtn.click()
      await wait(page, 400)
      await shot(page, '12-receta-detalle-venta-dialog')
      // Close dialog
      await page.keyboard.press('Escape')
      await wait(page, 300)
    } else {
      log('BUG', 'B20: vender button not found on receta detalle')
    }
  } else {
    log('BUG', 'B11: no receta rows found')
  }
  // B19: invalid receta id
  await goto(page, '/recetas/00000000-0000-0000-0000-000000000000', 'receta invalid')
  await shot(page, '13-receta-invalid')
  await snap(page, 'receta invalid')
  const noEncontrada = await page.$('[data-testid="receta-detalle-no-encontrada"]')
  log(noEncontrada ? 'OK  ' : 'OBS ', 'B19: receta no encontrada alert visible')

  // ===== C. Productos =====
  section('C')
  await goto(page, '/productos', 'productos list')
  await shot(page, '20-productos-list')
  await snap(page, 'productos list initial')
  const productoCards = await page.$$('[data-testid="producto-card"]')
  log('OBS ', `C: producto cards count: ${productoCards.length}`)
  // C7: agregar al carrito from productos page (potential bug)
  if (productoCards.length > 0) {
    const agregarBtn = await productoCards[0].$('[data-testid="producto-card-agregar"]')
    if (agregarBtn) {
      await agregarBtn.click()
      await wait(page, 400)
      log('OBS ', `C7: clicked "Agregar al carrito" on /productos — checking if cart populates`)
      // Now navigate to /pos and check cart
      await goto(page, '/pos', 'pos after agregar')
      await wait(page, 600)
      await shot(page, '21-productos-agregar-cart')
      await snap(page, 'pos after agregar from productos')
      const cartLines = await page.$$('[data-testid="carrito-panel"] .v-list-item, [data-testid="carrito-panel"] [data-testid^="venta-item-"]')
      log('OBS ', `C7: cart lines visible after agregar from /productos: ${cartLines.length}`)
      if (cartLines.length > 0) {
        log('BUG', 'C7 (CONFIRMED): "Agregar al carrito" en /productos puebla el carrito del POS. UX confuso — el feriante agrega desde catálogo sin querer.')
      }
      // Empty cart for clean state
      await goto(page, '/pos', 'pos reset')
    }
  }

  // ===== D. Eventos =====
  section('D')
  await goto(page, '/eventos', 'eventos')
  await shot(page, '30-eventos-list')
  await snap(page, 'eventos list')
  // Count event cards
  const eventoItems = await page.$$('.v-list-item')
  log('OBS ', `D: eventos list items: ${eventoItems.length}`)
  // D4 FAB
  const fabEvento = await page.$('[data-testid="evento-fab-nuevo"]')
  const btnEvento = await page.$('[data-testid="evento-nuevo"]')
  log('OBS ', `D2: FAB visible: ${!!fabEvento}, button visible: ${!!btnEvento}`)
  // Click into existing event detail
  const firstEventoCard = await page.$('.v-list-item')
  if (firstEventoCard) {
    await firstEventoCard.click()
    await wait(page, 600)
    log('OK  ', 'D7: clicked first evento → /eventos/:id')
    await shot(page, '31-evento-detalle')
    await snap(page, 'evento-detalle initial')
  }
  // Current section ends up on detalle

  // ===== E. Detalle evento + Proyección =====
  section('E')
  // E1: Already on detalle from D7. Read content.
  const tituloEvento = await page.$eval('[data-testid="evento-detalle-titulo"]', (e) => e.textContent?.trim()).catch(() => null)
  log('OBS ', `E: titulo evento = "${tituloEvento}"`)
  const fechas = await page.$eval('[data-testid="evento-detalle-fechas"]', (e) => e.textContent?.trim()).catch(() => null)
  log('OBS ', `E: fechas = "${fechas}"`)
  const proyeccion = await page.$('[data-testid="proyeccion-card"], [data-testid="proyeccion-empty"]')
  log(proyeccion ? 'OK  ' : 'BUG ', `E1: proyeccion card visible`)
  if (proyeccion) {
    const testid = await page.evaluate((el) => el.getAttribute('data-testid'), proyeccion)
    log('OBS ', `E: proyeccion testid = ${testid}`)
    if (testid === 'proyeccion-card') {
      const totalText = await page.$eval('[data-testid="proyeccion-total"]', (e) => e.textContent?.trim()).catch(() => null)
      log('OBS ', `E1: proyeccion total = "${totalText}"`)
      const fijosTotal = await page.$eval('[data-testid="proyeccion-fijos-total"]', (e) => e.textContent?.trim()).catch(() => null)
      const variablesTotal = await page.$eval('[data-testid="proyeccion-variables-total"]', (e) => e.textContent?.trim()).catch(() => null)
      log('OBS ', `E1: fijos=${fijosTotal} variables=${variablesTotal}`)
      // Break-even
      const beUnidades = await page.$('[data-testid="proyeccion-break-even-unidades"]')
      if (beUnidades) {
        const beText = await beUnidades.evaluate((e) => e.textContent?.trim())
        log('OBS ', `E: break-even unidades = "${beText}"`)
        // Find the section text
        const beSection = await page.$eval('[data-testid="proyeccion-break-even"]', (e) => e.textContent?.trim()).catch(() => null)
        log('OBS ', `E: break-even section full text = "${beSection}"`)
      } else {
        log('OBS ', 'E: no break-even section visible')
      }
    }
  }
  // E3: edit fecha_fin and margen
  await shot(page, '32-evento-detalle-loaded')

  // ===== F. Configuración de productos del evento =====
  section('F')
  // Navigate to productos del evento
  // Click "Configurar productos" or direct nav. Let's get the eventoId from URL
  const urlF = page.url()
  const eventoId = urlF.split('/eventos/')[1]?.split('/')[0]
  log('OBS ', `F: eventoId = ${eventoId}`)
  await goto(page, `/eventos/${eventoId}/productos`, 'evento productos')
  await shot(page, '40-evento-productos')
  await snap(page, 'evento-productos initial')
  const tabla = await page.$('[data-testid="evento-productos-tabla"]')
  log(tabla ? 'OK  ' : 'BUG ', `F1: tabla de productos del evento visible`)
  const margenChip = await page.$('[data-testid="evento-productos-margen"]')
  if (margenChip) {
    const mtext = await page.evaluate((el) => el.textContent?.trim(), margenChip)
    log('OBS ', `F: margen chip = "${mtext}"`)
  }
  // F3: change margen via slider
  const sliders = await page.$$('input[type="range"]')
  log('OBS ', `F: sliders count in tabla = ${sliders.length}`)
  // F4-F6: Check pricing alerts
  const alerts = await page.$$('.v-alert')
  log('OBS ', `F: pricing alerts visible = ${alerts.length}`)
  // F9: aplicar minimo button
  const aplicarMinimo = await page.$('[data-testid="evento-productos-aplicar-minimo"]')
  log(aplicarMinimo ? 'OK  ' : 'OBS ', `F9: aplicar-minimo button visible`)
  // Read table contents
  const tableInfo = await page.evaluate(() => {
    const table = document.querySelector('[data-testid="evento-productos-tabla"]')
    if (!table) return null
    const headers = Array.from(table.querySelectorAll('th')).map((t) => t.textContent?.trim())
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((r) =>
      Array.from(r.querySelectorAll('td')).map((c) => c.textContent?.trim().slice(0, 50))
    )
    return { headers, rows, rowCount: rows.length }
  })
  log('OBS ', `F: table headers = ${JSON.stringify(tableInfo?.headers)}`)
  log('OBS ', `F: table rows = ${JSON.stringify(tableInfo?.rows)}`)

  // ===== G. POS =====
  section('G')
  await goto(page, '/pos', 'POS initial')
  await wait(page, 800)
  await shot(page, '50-pos-initial')
  await snap(page, 'pos initial')
  const sinEvento = await page.$('[data-testid="pos-sin-evento"]')
  log(sinEvento ? 'OBS ' : 'OK  ', `G1: sin evento alert: ${!!sinEvento}`)
  // G4: product grid
  const posGrid = await page.$('[data-testid="pos-grid-col"]')
  log(posGrid ? 'OK  ' : 'BUG ', 'G4: pos grid col visible')
  const posCards = await page.$$('[data-testid="producto-card"]')
  log('OBS ', `G: producto cards in POS grid = ${posCards.length}`)
  if (posCards.length > 0) {
    // G6: agregar al carrito
    const agregar = await posCards[0].$('[data-testid="producto-card-agregar"]')
    if (agregar) {
      await agregar.click()
      await wait(page, 400)
      log('OK  ', 'G6: clicked Agregar on first product')
      await shot(page, '51-pos-after-add-1')
      // G7: add same product again
      await agregar.click()
      await wait(page, 300)
      log('OK  ', 'G7: clicked Agregar again (should merge)')
      await shot(page, '52-pos-after-add-2')
      await snap(page, 'pos after add x2')
      // Inspect cart
      const cartInfo = await page.evaluate(() => {
        const items = document.querySelectorAll('[data-testid="carrito-panel"] .v-list-item')
        const total = document.querySelector('[data-testid="carrito-total"]')?.textContent?.trim()
        return { itemCount: items.length, total, lines: Array.from(items).map((i) => i.textContent?.trim().slice(0, 100)) }
      })
      log('OBS ', `G: cart items=${cartInfo.itemCount}, total="${cartInfo.total}"`)
      log('OBS ', `G: cart lines = ${JSON.stringify(cartInfo.lines)}`)
      // G13: try registrar venta (now we have items so should work)
      // G14: open registrar dialog
      const registrarBtn = await page.$('[data-testid="carrito-registrar"]')
      if (registrarBtn) {
        const disabled = await page.evaluate((el) => el.hasAttribute('disabled'), registrarBtn)
        log(disabled ? 'BUG ' : 'OK  ', `G13: registrar button disabled: ${disabled}`)
        await registrarBtn.click()
        await wait(page, 400)
        await shot(page, '53-pos-registrar-dialog')
        const dialogo = await page.$('[data-testid="registrar-venta-dialogo"]')
        log(dialogo ? 'OK  ' : 'BUG ', 'G14: registrar dialog opened')
        await snap(page, 'pos registrar dialog')
        // Select mixto (different from default efectivo)
        const metodoSelect = await page.$('[data-testid="registrar-venta-metodo"]')
        if (metodoSelect) {
          log('OK  ', 'G15: metodo_pago select visible')
        }
        // Confirm
        const confirmar = await page.$('[data-testid="registrar-venta-confirmar"]')
        if (confirmar) {
          await confirmar.click()
          await wait(page, 800)
          log('OK  ', 'G15: confirmed venta')
          await shot(page, '54-pos-after-venta')
          await snap(page, 'pos after venta')
        }
        // Check cart after
        const cartAfter = await page.evaluate(() => {
          const items = document.querySelectorAll('[data-testid="carrito-panel"] .v-list-item')
          const vacio = document.querySelector('[data-testid="carrito-vacio"]')
          const total = document.querySelector('[data-testid="carrito-total"]')?.textContent?.trim()
          return { itemCount: items.length, vacioVisible: !!vacio, total }
        })
        log('OBS ', `G: cart after venta: items=${cartAfter.itemCount}, vacio=${cartAfter.vacioVisible}, total=${cartAfter.total}`)
        if (cartAfter.itemCount > 0) {
          log('BUG', 'G15 (POSIBLE): cart no se vacía después de registrar venta')
        }
      }
    }
  }
  // G22: online indicator
  const onlineChip = await page.evaluate(() => {
    const c = document.querySelector('[data-testid="pos-online"]')
    return c ? { text: c.textContent?.trim(), classes: c.className } : null
  })
  log('OBS ', `G22: online chip = ${JSON.stringify(onlineChip)}`)
  // G19-G21: imprevistos section
  const imprevistosCard = await page.$('[data-testid="pos-imprevistos"]')
  if (imprevistosCard) {
    const title = await page.$('[data-testid="pos-imprevistos-titulo"]')
    if (title) await title.click()
    await wait(page, 400)
    log('OK  ', 'G19: expanded imprevistos section')
    await shot(page, '55-pos-imprevistos')
    await snap(page, 'pos imprevistos')
    const totalImprevistos = await page.$eval('[data-testid="pos-imprevistos-total"]', (e) => e.textContent?.trim()).catch(() => null)
    log('OBS ', `G19: total imprevistos = "${totalImprevistos}"`)
  }

  // ===== H. Cierre de caja =====
  section('H')
  await goto(page, '/pos/cierre', 'cierre')
  await wait(page, 800)
  await shot(page, '60-cierre')
  await snap(page, 'cierre initial')
  const sinEventoCierre = await page.$('[data-testid="cierre-sin-evento"]')
  log(sinEventoCierre ? 'BUG ' : 'OK  ', `H1: cierre sin-evento: ${!!sinEventoCierre}`)
  const eventoInfo = await page.$('[data-testid="cierre-evento-info"]')
  if (eventoInfo) {
    const info = await page.evaluate((el) => el.textContent?.trim(), eventoInfo)
    log('OBS ', `H: evento info = "${info}"`)
  }
  const resumenCard = await page.$('[data-testid="cierre-resumen"], [data-testid="cierre-resumen-empty"]')
  log(resumenCard ? 'OK  ' : 'BUG ', 'H3: cierre resumen card visible')
  // Read resumen card content
  if (resumenCard) {
    const testid = await page.evaluate((el) => el.getAttribute('data-testid'), resumenCard)
    log('OBS ', `H: resumen testid = ${testid}`)
    if (testid === 'cierre-resumen') {
      const ventas = await page.$eval('[data-testid="cierre-ventas"]', (e) => e.textContent?.trim()).catch(() => null)
      const utilidad = await page.$eval('[data-testid="cierre-utilidad"]', (e) => e.textContent?.trim()).catch(() => null)
      const utilidadNeta = await page.$eval('[data-testid="cierre-utilidad-neta"]', (e) => e.textContent?.trim()).catch(() => null)
      const margen = await page.$eval('[data-testid="cierre-margen"]', (e) => e.textContent?.trim()).catch(() => null)
      log('OBS ', `H: ventas = "${ventas?.slice(0, 200)}"`)
      log('OBS ', `H: utilidad = "${utilidad?.slice(0, 200)}"`)
      log('OBS ', `H: utilidad neta = "${utilidadNeta?.slice(0, 200)}"`)
      log('OBS ', `H: margen contribucion = "${margen?.slice(0, 200)}"`)
    }
  }
  const desglose = await page.$('[data-testid="cierre-desglose"]')
  if (desglose) {
    const desgloseText = await page.evaluate((el) => el.textContent?.trim(), desglose)
    log('OBS ', `H: desglose = "${desgloseText?.slice(0, 400)}"`)
  }
  const acciones = await page.$('[data-testid="cierre-acciones"]')
  if (acciones) {
    const accionesText = await page.evaluate((el) => el.textContent?.trim(), acciones)
    log('OBS ', `H: acciones = "${accionesText?.slice(0, 300)}"`)
  }

  // ===== I. Reporte =====
  section('I')
  await goto(page, `/eventos/${eventoId}/reporte`, 'reporte')
  await wait(page, 800)
  await shot(page, '70-reporte')
  await snap(page, 'reporte initial')
  const reporteEmpty = await page.$('[data-testid="reporte-empty"]')
  log(reporteEmpty ? 'OBS ' : 'OK  ', `I1: reporte empty (no cerrado) = ${!!reporteEmpty}`)
  // Click through tabs if visible
  const tabPorDia = await page.$('[data-testid="reporte-tab-por-dia"]')
  if (tabPorDia) {
    await tabPorDia.click()
    await wait(page, 500)
    log('OK  ', 'I2: clicked Por día tab')
    await shot(page, '71-reporte-por-dia')
    await snap(page, 'reporte por dia')
  }
  const tabPorProducto = await page.$('[data-testid="reporte-tab-por-producto"]')
  if (tabPorProducto) {
    await tabPorProducto.click()
    await wait(page, 500)
    log('OK  ', 'I2: clicked Por producto tab')
    await shot(page, '72-reporte-por-producto')
    await snap(page, 'reporte por producto')
  }

  // ===== J. Home =====
  section('J')
  await goto(page, '/', 'home')
  await wait(page, 1500) // wait for contadores to load
  await shot(page, '80-home-loaded')
  await snap(page, 'home loaded')
  // Counters
  const counters = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('[data-testid^="contador-"], .contador, [data-testid*="contador"]'))
    return cards.map((c) => ({ testid: c.getAttribute('data-testid'), text: c.textContent?.trim().slice(0, 60) }))
  })
  log('OBS ', `J1: counters = ${JSON.stringify(counters)}`)
  const bannerEvento = await page.$('[data-testid*="banner-evento-activo"], [class*="banner"]')
  log('OBS ', `J2: banner evento activo = ${!!bannerEvento}`)
  const estadoConexion = await page.$('[data-testid="estado-conexion"]')
  if (estadoConexion) {
    const txt = await page.evaluate((el) => el.textContent?.trim(), estadoConexion)
    log('OBS ', `J6: estado conexion = "${txt?.slice(0, 100)}"`)
  }

  // ===== K. Responsive + Edge =====
  section('K')
  // K1: mobile
  await page.setViewport({ width: 375, height: 667 })
  await goto(page, '/', 'mobile home')
  await shot(page, '90-mobile-home')
  await snap(page, 'mobile home')
  await goto(page, '/pos', 'mobile pos')
  await shot(page, '91-mobile-pos')
  await snap(page, 'mobile pos')
  await goto(page, '/recetas', 'mobile recetas')
  await shot(page, '92-mobile-recetas')
  // K2: desktop wide
  await page.setViewport({ width: 1920, height: 1080 })
  await goto(page, '/', 'desktop wide home')
  await shot(page, '93-desktop-wide')
  await snap(page, 'desktop wide')
  // K8: invalid event id
  await goto(page, '/eventos/00000000-0000-0000-0000-000000000000', 'invalid event id')
  await shot(page, '94-invalid-evento')
  await snap(page, 'invalid evento')

  // ===== FINAL =====
  console.log('\n')
  log('OK  ', `QA PASS — collected ${findings.length} observations`)
} catch (err) {
  log('BUG', `FATAL: ${err.message}\n${err.stack}`)
} finally {
  // Persist findings
  await writeFile(
    join(EVIDENCE_DIR, 'findings.json'),
    JSON.stringify({ findings, totalObservations: findings.length }, null, 2)
  )
  await browser.close()
  console.log('\n=== FIN ===')
  console.log(`Findings persisted: ${join(EVIDENCE_DIR, 'findings.json')}`)
  process.exit(0)
}