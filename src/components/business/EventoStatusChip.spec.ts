// REQ-EVENTS-37: status chip renders a Vuetify v-chip with color and
// Spanish label per `estado`. Planificacion = blue/info, en_curso =
// orange/warning, cerrado = grey/default. Asserted by visible text +
// the chip's role so the test stays behavior-focused.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import EventoStatusChip from './EventoStatusChip.vue'
import type { EstadoEvento } from '@/types'

const vuetify = createVuetify({ components, directives })

const mountChip = (estado: EstadoEvento) =>
  mount(EventoStatusChip, {
    props: { estado },
    global: { plugins: [vuetify] },
  })

describe('EventoStatusChip', () => {
  it('renders blue "Planificación" chip for planificacion (REQ-EVENTS-37)', () => {
    const wrapper = mountChip('planificacion')

    expect(wrapper.text()).toContain('Planificación')
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.exists()).toBe(true)
    expect(chip.props('color')).toBe('info')
  })

  it('renders orange "En curso" chip for en_curso (REQ-EVENTS-37)', () => {
    const wrapper = mountChip('en_curso')

    expect(wrapper.text()).toContain('En curso')
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.props('color')).toBe('warning')
  })

  it('renders grey "Cerrado" chip for cerrado (REQ-EVENTS-37)', () => {
    const wrapper = mountChip('cerrado')

    expect(wrapper.text()).toContain('Cerrado')
    const chip = wrapper.findComponent({ name: 'VChip' })
    expect(chip.props('color')).toBe('grey')
  })
})
