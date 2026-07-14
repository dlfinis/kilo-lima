#!/usr/bin/env node
// scripts/db-reset.mjs
// ---------------------------------------------------------------------
// Reset + seed del entorno local de Supabase usando `psql` (cliente
// nativo de Postgres) contra la connection string de la base.
//
// Pipeline:
//   1. Lee .env.local (SUPABASE_PSQL_CONNECTION requerido).
//   2. Pide confirmación interactiva antes de truncar.
//   3. Trunca TODAS las tablas en orden correcto (respeta FKs).
//   4. Re-corre supabase/seed.sql usando psql (multi-statement nativo).
//   5. Lee los conteos por tabla via REST y los imprime.
//
// Uso:
//   node scripts/db-reset.mjs           # interactivo (pide confirmación)
//   node scripts/db-reset.mjs --yes     # salta la confirmación
//   node scripts/db-reset.mjs --print    # solo imprime resumen
//   node scripts/db-reset.mjs --sql <archivo.sql>  # corre cualquier SQL
//
// Requisitos:
//   * node >= 22
//   * .env.local con SUPABASE_PSQL_CONNECTION
//     (formato: postgres://USER:PASS@HOST:5432/postgres o
//      postgresql://USER:PASS@HOST:PORT/postgres)
//   * cliente `psql` en PATH (Postgres 14+)
// ---------------------------------------------------------------------
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const ARGS = process.argv.slice(2)
const YES = ARGS.includes('--yes')
const PRINT_ONLY = ARGS.includes('--print')
const DEBUG = ARGS.includes('--debug')
const HEALTH = ARGS.includes('--health')
const FLAG_SQL = ARGS.indexOf('--sql')
const SQL_PATH_OVERRIDE = FLAG_SQL >= 0 ? ARGS[FLAG_SQL + 1] : null
const WIPE = ARGS.includes('--wipe')

// ---------------------------------------------------------------------
// .env.local parser (sin dependencias externas)
// ---------------------------------------------------------------------
async function loadDotenv() {
  const envPath = path.join(REPO_ROOT, '.env.local')
  let raw = ''
  try {
    raw = await fs.readFile(envPath, 'utf8')
  } catch {
    throw new Error(
      `No se encontró ${envPath}. Crea el archivo copiando .env.example.`,
    )
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = value
  }
}

function getConfig() {
  const psql = process.env.SUPABASE_PSQL_CONNECTION
  // Las variables de REST son opcionales: solo se usan para el
  // resumen via PostgREST. Si no están, devolvemos el resumen desde
  // psql (un SELECT count(*) por tabla es ~3 ms en cualquier base).
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  const viewer =
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!psql) {
    throw new Error(
      'Falta SUPABASE_PSQL_CONNECTION en .env.local.\n' +
        'Formato: postgres://USER:PASSWORD@HOST:PORT/postgres\n' +
        'Lo sacás de Supabase Dashboard → Settings → Database → Connection string (Transaction).',
    )
  }
  return {
    psql,
    url: url ? url.replace(/\/$/, '') : '',
    viewer: viewer ?? '',
    host: (() => {
      try {
        return new URL(psql).host
      } catch {
        return ''
      }
    })(),
    port: (() => {
      try {
        return Number(new URL(psql).port || 5432)
      } catch {
        return null
      }
    })(),
  }
}

// Diagnóstico básico de DNS/red antes de tirar psql. Si no resuelve
// el host, abortamos con una guía específica.
async function diagnosticarHost(host) {
  return new Promise((resolve) => {
    const child = spawn('nslookup', [host], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => (err += d.toString()))
    child.on('error', () => resolve({ ok: false, motivo: 'nslookup no disponible en PATH' }))
    child.on('close', (code) => {
      if (code === 0 && /Address:/.test(out)) {
        resolve({ ok: true, out })
      } else {
        resolve({ ok: false, motivo: out || err || `nslookup salió con código ${code}` })
      }
    })
  })
}

// ---------------------------------------------------------------------
function ejecutarPsql(connectionString, archivoSql, variables = {}) {
  return new Promise((resolve, reject) => {
    const args = ['-v', 'ON_ERROR_STOP=1', '-X']
    for (const [k, v] of Object.entries(variables)) {
      args.push('-v', `${k}=${v}`)
    }
    args.push('-f', archivoSql, connectionString)

    const child = spawn('psql', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()))
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(
          new Error(
            'No se encontró el binario `psql` en PATH.\n' +
              'macOS:   brew install postgresql@16 && export PATH="$(brew --prefix postgresql@16)/bin:$PATH"\n' +
              'Linux:   sudo apt install postgresql-client\n' +
              'Windows: usa el instalador de Postgres o psql desde WSL.',
          ),
        )
        return
      }
      reject(err)
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        const err = new Error(
          `psql salió con código ${code}\n\nSTDERR:\n${stderr}\n\nSTDOUT (tail):\n${stdout.slice(-400)}`,
        )
        err.stdout = stdout
        err.stderr = stderr
        err.code = code
        reject(err)
      }
    })
  })
}

// ---------------------------------------------------------------------
// Conteo por tabla via REST (PostgREST Content-Range)
// ---------------------------------------------------------------------
const TABLAS_ORDEN = [
  'venta_correcciones',
  'cierres_caja',
  'venta_items',
  'ventas',
  'compras_insumos',
  'aportes',
  'evento_socios',
  'gastos_imprevistos',
  'gastos_fijos',
  'plan_produccion',
  'evento_productos',
  'socios',
  'productos',
  'eventos',
  'receta_ingredientes',
  'recetas',
  'materias_primas',
]

const TABLAS_RESUMEN = [
  'materias_primas',
  'recetas',
  'receta_ingredientes',
  'socios',
  'eventos',
  'productos',
  'evento_productos',
  'evento_socios',
  'plan_produccion',
  'gastos_fijos',
  'gastos_imprevistos',
  'aportes',
  'compras_insumos',
  'ventas',
  'venta_items',
  'venta_correcciones',
  'cierres_caja',
]

// Health check: corre 4 pruebas en orden y reporta ✓/✗ en cada una.
//   1) URL parsea OK y apunta a puerto 5432 o 6543.
//   2) psql responde "SELECT 1" (única conexión al pooler → barato).
//   3) Usuario y password autentican (la prueba "real" más útil).
//   4) Puede leer del schema `public` (permisos + existencia de schema).
// Si las 4 andan, `pnpm db:reset:yes` va a funcionar.
async function healthCheck(config) {
  console.log('\nHealth check:')

  // 1. URL parsing
  const urlPsql = (() => {
    try { return new URL(config.psql) } catch { return null }
  })()
  const portOk = urlPsql && (urlPsql.port === '5432' || urlPsql.port === '6543')
  const userSpecCorrect = urlPsql && /postgres\.[a-z0-9]+/.test(urlPsql.username)
  if (portOk && userSpecCorrect) {
    console.log('  ✓ URL válida (host=' + urlPsql.hostname + ', puerto=' + urlPsql.port + ', usuario=' + urlPsql.username + ')')
  } else {
    console.log('  ✗ URL con formato inusual:')
    if (urlPsql) {
      console.log('      host=' + urlPsql.hostname + ', puerto=' + urlPsql.port + ', usuario=' + urlPsql.username)
    } else {
      console.log('      no se pudo parsear como URL')
    }
    if (!portOk) console.log('        → el puerto debe ser 5432 (directo) o 6543 (pooler)')
    if (userSpecCorrect === false) console.log('        → el usuario debe ser postgres.PROJECT_REF (no solo "postgres")')
  }

  // 2 + 3 + 4. Un solo psql -c que autentica y prueba SELECT dual.
  // Si falla por "authentication failed" → problema de password.
  // Si falla por "permission denied" → problema de RLS / role.
  // Si falla por "relation does not exist" → schema no es `public`.
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = spawn(
        'psql',
        [
          '-X', '-tA', '-v', 'ON_ERROR_STOP=1',
          '-c', "SELECT current_database() || '|' || current_user || '|' || (SELECT count(*)::text FROM information_schema.tables WHERE table_schema='public');",
          config.psql,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
      let out = ''
      let err = ''
      child.stdout.on('data', (c) => (out += c.toString()))
      child.stderr.on('data', (c) => (err += c.toString()))
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve(out.trim())
        else reject(new Error('código ' + code + '\n' + err))
      })
    })

    const [db, user, nTables] = stdout.split('|')
    console.log('  ✓ Autenticación OK: db=' + db + ', user=' + user + ', tablas en public=' + nTables)

    if (Number(nTables) === 0) {
      console.log('  ⚠ El schema `public` existe pero está vacío — ¿se aplicaron las migraciones?')
    } else {
      const esperado = TABLAS_RESUMEN.length
      if (Number(nTables) < esperado) {
        console.log('  ⚠ Hay ' + nTables + ' tablas en `public`, esperábamos >= ' + esperado + '. Probablemente faltan migraciones.')
      } else {
        console.log('  ✓ Schema `public` tiene ' + nTables + ' tablas (>= esperadas ' + esperado + ')')
      }
    }
  } catch (err) {
    console.log('  ✗ Conexión / auth / permisos fallaron:')
    // Siempre mostrar el stderr crudo de psql para saber qué falló REALMENTE.
    const lineas = err.message.split('\n').filter(Boolean)
    const relevante = lineas.find((l) => /FATAL|ERROR|fatal/i.test(l)) || lineas[0]
    console.log('      psql dice: ' + relevante)
    const m = err.message
    if (/authentication failed/i.test(m)) {
      console.log('      → Password incorrecta. Resetear desde Dashboard → Settings → Database → Database password.')
    } else if (/password authentication failed/i.test(m)) {
      console.log('      → Usuario o password incorrectos. Esperado: postgres.PROJECT_REF')
    } else if (/nodename|nor servname|getaddrinfo/i.test(m)) {
      console.log('      → DNS no resuelve. ¿Estás online? ¿tienes IPv6 accesible?')
    } else if (/ECONNREFUSED|Connection refused|timeout/i.test(m)) {
      console.log('      → TCP rechaza la conexión. Puerto o host incorrecto, o firewall.')
    } else if (/too many authentication failures|ECIRCUITBREAKER/i.test(m)) {
      console.log('      → El pooler bloqueó nuevas conexiones por demasiados auth failures. Esperá 5–15 min.')
    } else if (/permission denied/i.test(m)) {
      console.log('      → Permisos insuficientes sobre el schema `public`. Revisar rol del usuario.')
    } else if (/relation .* does not exist/i.test(m)) {
      console.log('      → El schema `public` no tiene las tablas esperadas. ¿Se aplicaron las migraciones?')
    } else {
      console.log('      → ' + m.split('\n')[0])
    }
  }
}

// Resumen: UNA sola sentencia, UNA sola conexión psql. Hace un UNION ALL
async function resumen(config) {
  const selects = TABLAS_RESUMEN.map(
    (t) => `SELECT '${t}' AS tabla, count(*)::bigint AS n FROM public.${t}`,
  ).join('\nUNION ALL\n')
  const sql = `SELECT tabla || '=' || n AS fila FROM (${selects}) s ORDER BY tabla;`

  const stdout = await new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      ['-X', '-tA', '-v', 'ON_ERROR_STOP=1', '-c', sql, config.psql],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c.toString()))
    child.stderr.on('data', (c) => (err += c.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(`psql -c (resumen) salió con código ${code}\nSTDERR:\n${err}`))
    })
  })

  const out = {}
  // Inicializo con "?" para tablas que no vinieron en la respuesta.
  for (const t of TABLAS_RESUMEN) out[t] = '?'
  for (const linea of stdout.split('\n')) {
    const [tabla, valor] = linea.split('=')
    if (tabla && valor !== undefined && TABLAS_RESUMEN.includes(tabla)) {
      out[tabla] = valor || '0'
    }
  }
  return out
}

function formatearResumen(rows) {
  const ancho = Math.max(...Object.keys(rows).map((k) => k.length))
  return Object.entries(rows)
    .map(([k, v]) => `  ${k.padEnd(ancho)}  ${v}`)
    .join('\n')
}

// ---------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------
async function main() {
  await loadDotenv()
  const config = getConfig()

  const host = (() => {
    try {
      return new URL(config.psql).host
    } catch {
      return '(oculto)'
    }
  })()
  console.log(`\nConectado a ${host}`)

  // Diagnóstico DNS si --debug. Sirve para identificar problemas
  // de firewall o de URL incorrecta sin esperar a que psql se caiga.
  if (DEBUG && config.host) {
    console.log(`\nDiagnosticando DNS de ${config.host}...`)
    const diag = await diagnosticarHost(config.host)
    if (diag.ok) {
      console.log('  ✓ DNS resuelve correctamente.')
    } else {
      console.log(`  ✗ DNS no resuelve: ${diag.motivo}`)
    }
  }

  if (PRINT_ONLY) {
    console.log('\nResumen actual:')
    console.log(formatearResumen(await resumen(config)))
    return
  }

  if (HEALTH) {
    await healthCheck(config)
    return
  }

  // Verificar psql
  const psqlCheck = spawn('psql', ['--version'])
  psqlCheck.on('error', () => {
    console.error(
      '\nNo se encontró `psql` en PATH. Instalalo antes de correr este script:\n' +
        '  macOS:   brew install postgresql@16\n' +
        '  Linux:   sudo apt install postgresql-client\n',
    )
    process.exit(1)
  })
  psqlCheck.stdout.on('data', (d) => process.stdout.write(`$ ${d.toString().trim()}\n`))
  await new Promise((res) => psqlCheck.on('close', res))

  if (!YES) {
    const rl = readline.createInterface({ input, output })
    const accion = WIPE ? 'BORRARÁ todos los datos sin sembrar de nuevo' : 'BORRARÁ todos los datos de las tablas de la app y volverá a aplicar el seed'
    const answer = await rl.question(
      `\nEsto ${accion}.\n¿Continuar? [y/N] `,
    )
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Cancelado.')
      return
    }
  }

  console.log('\n→ Truncando tablas…')
  const truncateSql = `truncate table ${TABLAS_ORDEN.map((t) => `public.${t}`).join(', ')} restart identity cascade;`
  const truncateFile = path.join(REPO_ROOT, 'supabase', '.tmp-truncate.sql')
  await fs.writeFile(truncateFile, truncateSql, 'utf8')
  try {
    await ejecutarPsql(config.psql, truncateFile)
  } finally {
    await fs.unlink(truncateFile).catch(() => null)
  }

  if (WIPE) {
    console.log('→ Modo --wipe: sin seed, solo truncado.')
  } else {
    console.log('→ Aplicando seed.sql…')
    const archivoSql = SQL_PATH_OVERRIDE
      ? path.resolve(SQL_PATH_OVERRIDE)
      : path.join(REPO_ROOT, 'supabase', 'seed.sql')
    await ejecutarPsql(config.psql, archivoSql)
  }

  console.log('\nResumen post-truncado:')
  console.log(formatearResumen(await resumen(config)))
  console.log('\nListo. Vuelve a abrir la app para refrescar.')
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`)
  // Si es un fallo de red / DNS, agregar guía específica para Supabase.
  if (/nodename|nor servname|network|timeout|ECONNREFUSED|getaddrinfo/i.test(err.message)) {
    console.error(
      [
        '',
        'Parece un fallo de DNS o red. Posibles causas:',
        '  • Estás detrás de un proxy/cortafuegos corporativo que filtra *.supabase.co.',
        '  • Tu URL directa NO resuelve desde tu red. Probá con el pooler:',
        '        postgres://postgres:PASS@aws-0-us-east-1.pooler.supabase.com:6543/postgres',
        '    (reemplazá aws-0-us-east-1 por la región de tu proyecto).',
        '  • Plan gratuito: el host directo db.*.supabase.co solo responde desde',
        '    redes con IPv6. El pooler siempre funciona.',
        '',
        'Solución rápida: usar el Session Pooler de Supabase desde',
        'Settings → Database → Connection pooling → Transaction.',
      ].join('\n'),
    )
  }
  process.exit(1)
})