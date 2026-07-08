/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  // pos-redesign (REQ-POS-57, REQ-POS-58): build-time feature flag for
  // the POS redesign — cambio, comprobante, ventas hoy. Read via
  // `import.meta.env.VITE_FLAG_POS_REDESIGN === 'true'`. Defaults to
  // off in code; opt-in per environment.
  readonly VITE_FLAG_POS_REDESIGN: string
  // mobile-ux-redesign (REQ-NAV-1): build-time feature flag for the
  // responsive navigation shell. When 'true', App.vue renders AppLayout
  // with BottomNav/SideNavCompact/SideNavFull instead of the legacy
  // AppBar-only layout. Defaults to off; opt-in per environment.
  readonly VITE_FLAG_MOBILE_UX?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
