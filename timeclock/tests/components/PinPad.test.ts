import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import PinPad from '../../src/components/PinPad.vue'
import { useTimeclockStore } from '../../src/stores/timeclock.ts'

let pinia: Pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

function mountPad() {
  return mount(PinPad, { global: { plugins: [pinia] } })
}

const filledDots = (wrapper: ReturnType<typeof mountPad>) =>
  wrapper.findAll('.rounded-full.border-2').filter(d => d.classes('bg-blush')).length

const pressKey = (wrapper: ReturnType<typeof mountPad>, label: string) =>
  wrapper.findAll('button').find(b => b.text() === label)!.trigger('click')

describe('PinPad', () => {
  it('fills one dot per digit and the delete key removes one', async () => {
    const wrapper = mountPad()
    await pressKey(wrapper, '1')
    await pressKey(wrapper, '0')
    await pressKey(wrapper, '7')
    expect(filledDots(wrapper)).toBe(3)
    expect(useTimeclockStore().pin).toBe('107')

    await pressKey(wrapper, '⌫')
    expect(filledDots(wrapper)).toBe(2)
  })

  it('swaps the keypad for a loading bar while a PIN is looked up', async () => {
    const wrapper = mountPad()
    useTimeclockStore().state = 'loading'
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button')).toHaveLength(0)
    expect(wrapper.text()).toContain('Looking up PIN')
  })
})
