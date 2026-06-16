import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import App from './App.vue'

// Trivial smoke test added during PR1 verify (sdd-verify foundation PR1,
// SUGGESTION #1) so `pnpm test` exits 0 before the richer HomeView smoke
// test lands in PR4 Task 4.5.
describe('App', () => {
  it('renders the Kilo-Lima heading', () => {
    const wrapper = mount(App)
    expect(wrapper.find('h1').text()).toContain('Kilo-Lima')
  })
})
