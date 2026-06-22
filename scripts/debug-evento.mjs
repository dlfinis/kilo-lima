#!/usr/bin/env node
import puppeteer from 'puppeteer'

const URL = 'http://127.0.0.1:5000'
const CHROME = '/Users/diegofernando.leon/.cache/puppeteer/chrome/mac_arm-149.0.7827.22/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox'],
  })

  const page = await browser.newPage()
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('  [JS]', msg.text().substring(0,150))
  })
  page.on('pageerror', err => console.log('  [ERR]', err.message.substring(0,150)))

  // Get the evento ID from Supabase
  const resp = await fetch('https://gpsusfjlhopxjnlwlwsa.supabase.co/rest/v1/eventos?select=id,nombre,estado,fecha,fecha_fin,margen_ganancia&limit=1', {
    headers: { 
      'apikey': 'sb_publishable_D1DUr1qjk4wB0dXiKxd4xw_thvSz1qv',
      'Authorization': 'Bearer sb_publishable_D1DUr1qjk4wB0dXiKxd4xw_thvSz1qv'
    }
  })
  const eventos = await resp.json()
  if (!eventos.length) { console.log('No hay eventos'); await browser.close(); return }
  
  const ev = eventos[0]
  console.log(`Evento: ${ev.nombre} (${ev.id}), estado=${ev.estado}`)

  // 1. Go to evento detail
  await page.goto(`${URL}/eventos/${ev.id}`, { waitUntil: 'networkidle2', timeout: 20000 })
  await new Promise(r => setTimeout(r, 2000))

  const body = await page.$eval('body', el => el.textContent?.substring(0, 600))
  console.log('\n--- EVENTO DETALLE ---')
  console.log(body)

  // 2. Check ProyeccionCostosCard  
  const proyCard = await page.$('[data-testid="proyeccion-card"]')
  console.log(`\nProyeccionCostosCard visible: ${!!proyCard}`)
  
  const breakEven = await page.$('[data-testid="proyeccion-break-even"]')
  console.log(`Break-even section visible: ${!!breakEven}`)
  if (breakEven) {
    const text = await breakEven.evaluate(el => el.textContent)
    console.log(`Break-even text: ${text?.substring(0, 200)}`)
  }

  // Show empty state if present
  const empty = await page.$('[data-testid="proyeccion-empty"]')
  if (empty) {
    const text = await empty.evaluate(el => el.textContent)
    console.log(`Empty state: ${text}`)
  }

  // 3. Check if "Configurar productos" link exists
  const link = await page.$('[data-testid="evento-detalle-productos"]')
  console.log(`\n"Configurar productos" link: ${!!link}`)

  await page.screenshot({ path: '/tmp/evento-detalle.png' })
  await browser.close()
}

main().catch(e => console.error(e.message))
