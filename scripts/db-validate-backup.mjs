#!/usr/bin/env node
// scripts/db-validate-backup.mjs
// ---------------------------------------------------------------------
// Validate a plain SQL backup before attempting a restore.
//
// Usage:
//   node scripts/db-validate-backup.mjs backups/db-backup-2026-07-16T10-00-00.sql
//   node scripts/db-validate-backup.mjs --file backups/manual.sql
// ---------------------------------------------------------------------
import fs from 'node:fs/promises'
import path from 'node:path'

const ARGS = process.argv.slice(2)
const FLAG_FILE = ARGS.indexOf('--file')
const FILE_OVERRIDE = FLAG_FILE >= 0 ? ARGS[FLAG_FILE + 1] : null
const POSITIONAL_FILE = ARGS.find((arg, index) => {
  if (arg.startsWith('--')) return false
  return index === 0 || ARGS[index - 1] !== '--file'
})

const DUMP_MARKERS = [
  /^-- PostgreSQL database dump/m,
  /^-- Dumped from database version/m,
  /^-- Dumped by pg_dump version/m,
  /^SET statement_timeout = 0;/m,
  /^SET row_security = off;/m,
]

const SQL_STRUCTURE_MARKERS = [
  /\bCREATE\s+TABLE\s+public\./i,
  /\bCOPY\s+public\./i,
  /\bINSERT\s+INTO\s+public\./i,
  /\bALTER\s+TABLE\s+ONLY\s+public\./i,
  /\bCREATE\s+SCHEMA\s+public\b/i,
]

const PROJECT_TABLES = [
  'eventos',
  'productos',
  'materias_primas',
  'evento_productos',
  'ventas',
  'socios',
]

function resolveInputPath() {
  if (FLAG_FILE >= 0 && !FILE_OVERRIDE) {
    throw new Error('The --file flag requires a file path.')
  }

  const target = FILE_OVERRIDE ?? POSITIONAL_FILE
  if (!target) {
    throw new Error('Provide a backup file path as the first argument or with --file.')
  }

  return path.resolve(target)
}

function formatBytes(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 ** 2).toFixed(1)} MB`
}

async function readBackupFile(backupPath) {
  let stat

  try {
    stat = await fs.stat(backupPath)
  } catch {
    throw new Error(`Backup file does not exist: ${backupPath}`)
  }

  if (!stat.isFile()) {
    throw new Error(`Backup path is not a file: ${backupPath}`)
  }

  if (path.extname(backupPath).toLowerCase() !== '.sql') {
    throw new Error('Backup file must use the .sql extension.')
  }

  if (stat.size === 0) {
    throw new Error('Backup file is empty.')
  }

  const content = await fs.readFile(backupPath, 'utf8')
  if (!content.trim()) {
    throw new Error('Backup file only contains whitespace.')
  }

  return { content, stat }
}

function validateStructure(content) {
  const dumpMarkers = DUMP_MARKERS.filter((pattern) => pattern.test(content)).length
  const structureMarkers = SQL_STRUCTURE_MARKERS.filter((pattern) => pattern.test(content)).length

  if (dumpMarkers < 2 && structureMarkers < 2) {
    throw new Error(
      'Backup does not look like a plain PostgreSQL dump. Expected pg_dump markers or public SQL statements.',
    )
  }

  return { dumpMarkers, structureMarkers }
}

function validateProjectTables(content) {
  const matchedTables = PROJECT_TABLES.filter((table) => {
    const tablePattern = new RegExp(`\\b(?:CREATE\\s+TABLE|COPY|INSERT\\s+INTO|ALTER\\s+TABLE\\s+ONLY)\\s+public\\.${table}\\b`, 'i')
    return tablePattern.test(content)
  })

  if (matchedTables.length < 2) {
    throw new Error(
      'Backup does not include enough public schema statements for expected project tables.',
    )
  }

  return matchedTables
}

async function main() {
  const backupPath = resolveInputPath()
  const { content, stat } = await readBackupFile(backupPath)
  const { dumpMarkers, structureMarkers } = validateStructure(content)
  const matchedTables = validateProjectTables(content)

  console.log(
    `Backup validation passed: ${backupPath} (${formatBytes(stat.size)}). Found ${dumpMarkers} dump markers, ${structureMarkers} SQL structure markers, and ${matchedTables.length} project tables (${matchedTables.join(', ')}).`,
  )
}

main().catch((err) => {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
})
