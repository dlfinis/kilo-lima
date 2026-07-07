#!/usr/bin/env node
// scripts/db-reset.mjs
// ---------------------------------------------------------------------
// Reset + seed del entorno local de Supabase.
//
//   1. Lee VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del .env.local.
//      (Si no hay sesión, usa la service_role de SUPABASE_SERVICE_ROLE_KEY.)
//   2. Pide confirmación interactiva antes de truncar.
//   3. Trunca TODAS las tablas en orden correcto (respeta FKs).
//   4. Re-corre supabase/seed.sql contra la base.
//   5. Imprime un resumen con conteos por tabla para que el dev vea
//      de un vistazo qué quedó cargado.
//
// Uso:
//   node scripts/db-reset.mjs            # interactivo (pide confirmación)
//   node scripts/db-reset.mjs --yes      # salta la confirmación
//   node scripts/db-reset.mjs --print     # solo imprime resumen, no toca
//
// Requisitos:
//   * node >= 22
//   * .env.local con VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (o service key)
// ---------------------------------------------------------------------
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

// ---------------------------------------------------------------------
// 1. Cargar .env.local sin librerías externas (reglas tipo dotenv, sin
//    expansión de variables — solo `KEY=value` simple).
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

function getSupabaseConfig() {
  const url = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL
  // Preferimos la service role key si está — bypassa RLS y puede truncar.
  // Si no, caemos a la anon (útil para entornos que solo exponen anon).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Faltan VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY en .env.local.',
    )
  }
  return { url: url.replace(/\/$/, ''), key }
}

// ---------------------------------------------------------------------
// 2. Truncar todas las tablas. Se hace via RPC `exec_sql` cuando está
//    disponible (típicamente `pg_execute_server` / función definida por
//    el dev). Si no existe, lo pedimos como fallback via REST no es
//    posible — emitimos instrucciones al usuario.
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

async function rpcExec({ url, key }, sql, params = {}) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_text: sql, params }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`RPC exec_sql ${res.status}: ${body}`)
  }
  return res.json().catch(() => null)
}

async function rpcExiste({ url, key }) {
  const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql_text: 'select 1' }),
  })
  return res.status !== 404
}

async function truncateAll(config) {
  const truncates = TABLAS_ORDEN.map((t) => `truncate table public.${t} restart identity cascade`).join(';')
  await rpcExec(config, truncates)
}

async function ejecutarSeed(config) {
  const sqlPath = path.join(REPO_ROOT, 'supabase', 'seed.sql')
  const sql = await fs.readFile(sqlPath, 'utf8')
  // Enviamos el archivo entero. exec_sql acepta multi-statement.
  await rpcExec(config, sql)
}

async function resumen(config) {
  const out = {}
  for (const tabla of TABLAS_RESUMEN) {
    const url = `${config.url}/rest/v1/${tabla}?select=id&limit=1000`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: 'count=exact',
      },
    })
    if (!res.ok) {
      out[tabla] = '?'
      continue
    }
    const range = res.headers.get('content-range')
    if (range && range.includes('/')) {
      const total = range.split('/')[1]
      out[tabla] = total === '*' ? '?' : total
    } else {
      out[tabla] = '?'
    }
  }
  return out
}

// ---------------------------------------------------------------------
// 3. Loop principal
// ---------------------------------------------------------------------
function formatearResumen(rows) {
  const ancho = Math.max(...Object.keys(rows).map((k) => k.length))
  return Object.entries(rows)
    .map(([k, v]) => `  ${k.padEnd(ancho)}  ${v}`)
    .join('\n')
}

async function main() {
  await loadDotenv()
  const config = getSupabaseConfig()

  console.log(`\nConectado a ${config.url}`)

  if (PRINT_ONLY) {
    console.log('\nResumen actual:')
    console.log(formatearResumen(await resumen(config)))
    return
  }

  const rpcOk = await rpcExiste(config)
  if (!rpcOk) {
    console.error(
      [
        'La base no expone la función RPC `exec_sql(sql_text)`.',
        'Crea esta función en Supabase (SQL editor) para que el script',
        'pueda truncar y aplicar el seed:',
        '',
        '  create or replace function public.exec_sql(sql_text text)',
        '  returns void language plpgsql security definer as $$',
        '  begin execute sql_text; end; $$;',
        '',
        'Si prefieres, ejecuta manualmente supabase/clean_db.sql y',
        'supabase/seed.sql desde el Dashboard.',
      ].join('\n'),
    )
    process.exit(1)
  }

  if (!YES) {
    const rl = readline.createInterface({ input, output })
    const answer = await rl.question(
      '\nEsto BORRARÁ todos los datos de las tablas de la app y volverá a aplicar el seed.\n¿Continuar? [y/N] ',
    )
    rl.close()
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('Cancelado.')
      return
    }
  }

  console.log('\n→ Truncando tablas…')
  await truncateAll(config)

  console.log('→ Aplicando seed.sql…')
  await ejecutarSeed(config)

  console.log('\nResumen post-seed:')
  console.log(formatearResumen(await resumen(config)))
  console.log('\nListo. Vuelve a abrir la app para refrescar.')
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})