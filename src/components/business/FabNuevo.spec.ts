// REQ-UX-20, REQ-UX-25: FabNuevo is a thin wrapper around Vuetify's
// <v-fab>. Per design decision 6, each list view owns its own FAB so
// the dialog state stays in the view (matches the existing dialog-
// owner pattern). The FAB emits `click` and the view's `abrirCrear`
// function opens the create dialog.
//
// Props:
//   icon      — mdi icon name (default: mdi-plus)
//   color     — vuetify color (default: primary)
//   ariaLabel — accessible name (required; passed straight to
//               aria-label so screen readers announce the action)
//   testid    — e2e selector (required; mounted in views as
//               `<FabNuevo testid="materia-prima-fab-nuevo">`)
//
// The FAB uses Vuetify's `app` positioning (`location="bottom end"`)
// so it floats over the list content consistently across the three
// views. Tests must mount the FAB inside a <v-app> because <v-fab>
// depends on the layout provider — same pattern as AppBar.spec.ts.
import { defineComponent } from 'vue'
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import FabNuevo from './FabNuevo.vue'

const vuetify = createVuetify({ components, directives })

beforeEach(() => {
  setActivePinia(createPinia())
})

const mountFab = (props: { icon?: string; color?: string; ariaLabel: string; testid: string }) => {
  // Wrap FabNuevo inside a <v-app> so Vuetify's layout provider is
  // available. The wrapper re-emits the inner FAB's `click` so the
  // test can assert on a single, predictable event surface.
  const Wrapper = defineComponent({
    components: { FabNuevo },
    props: ['props'],
    emits: ['click'],
    template: '<v-app><FabNuevo v-bind="props" @click="onClick" /></v-app>',
    methods: {
      onClick() {
        this.$emit('click')
      },
    },
  })
  return mount(Wrapper, {
    props: { props },
    global: { plugins: [vuetify] },
  })
}

describe('FabNuevo', () => {
  it('renders with the supplied testid, aria-label and icon (REQ-UX-20, REQ-UX-21..23)', () => {
    const wrapper = mountFab({
      testid: 'materia-prima-fab-nuevo',
      ariaLabel: 'Nueva materia prima',
      icon: 'mdi-plus',
    })
    const fab = wrapper.find('[data-testid="materia-prima-fab-nuevo"]')
    expect(fab.exists()).toBe(true)
    expect(fab.attributes('aria-label')).toBe('Nueva materia prima')
    // The default v-fab uses an mdi-plus icon when none is provided,
    // and renders the icon as a child <i class="mdi mdi-plus">.
    expect(fab.html()).toContain('mdi-plus')
  })

  it('emits click when the FAB is activated (REQ-UX-20)', async () => {
    const wrapper = mountFab({
      testid: 'receta-fab-nuevo',
      ariaLabel: 'Nueva receta',
    })
    const fab = wrapper.find('[data-testid="receta-fab-nuevo"]')
    expect(fab.exists()).toBe(true)
    await fab.trigger('click')
    // The wrapper re-emits FabNuevo's click, so the test wrapper's
    // emitted('click') is proof the FAB fired. v-fab bubbles click
    // events internally (the FAB itself and the inner <button>),
    // so we accept >= 1 emission.
    expect(wrapper.emitted('click')).toBeDefined()
    expect((wrapper.emitted('click') ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it('uses app positioning so the FAB floats above the list (REQ-UX-20)', () => {
    const wrapper = mountFab({
      testid: 'evento-fab-nuevo',
      ariaLabel: 'Nuevo evento',
    })
    // v-fab is a Vuetify component; the rendered output must include
    // the `v-fab` class plus a positioning style that anchors it to
    // the viewport. The `app` prop is what makes the FAB move out of
    // the way of the global <v-app-bar>.
    const html = wrapper.html()
    expect(html).toMatch(/v-fab/)
    const fabEl = wrapper.find('[data-testid="evento-fab-nuevo"]')
    const style = fabEl.attributes('style') ?? ''
    expect(style).toMatch(/(position|inset|top|bottom|left|right)/)
  })
})
