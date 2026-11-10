import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { captureRequests, http, HttpResponse, REST, server } from '../msw.ts'
import NeedsReviewTab from '../../src/components/mgmt/NeedsReviewTab.vue'
import { useMgmtStore } from '../../src/stores/mgmt.ts'
import type { NeedsReviewEntry } from '../../src/lib/api.ts'

let pinia: Pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
})

const entry = (id: string, student_name: string, extra: Partial<NeedsReviewEntry> = {}): NeedsReviewEntry => ({
  id, homebase_id: Number(id.slice(1)), student_name, date: '2026-11-08',
  clock_in: '2026-11-08T14:00:00Z', clock_out: '2026-11-09T05:59:00Z', hours_worked: 15.98,
  auto_closed: true, breaks: [], ...extra,
})

function mountTab(entries: NeedsReviewEntry[]) {
  const mgmt = useMgmtStore()
  mgmt.needsReviewEntries = entries
  const wrapper = mount(NeedsReviewTab, { global: { plugins: [pinia] } })
  return { wrapper, mgmt }
}

const bodyRows = (wrapper: ReturnType<typeof mount>) => wrapper.findAll('tbody tr')

describe('NeedsReviewTab', () => {
  it('shows an empty state', () => {
    const { wrapper } = mountTab([])
    expect(wrapper.text()).toContain('Nothing needs review.')
  })

  it('renders one row per entry with its badges and a count', () => {
    const { wrapper } = mountTab([
      entry('e1', 'jane smith'),
      entry('e2', 'bob brown', {
        auto_closed: false,
        breaks: [{ id: 'b', break_start: '2026-11-08T18:00:00Z', break_end: '2026-11-08T23:00:00Z', auto_closed: true }],
      }),
    ])

    const rows = bodyRows(wrapper)
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('jane smith')
    expect(rows[0].text()).toContain('Nov 8, 2026')
    expect(rows[0].text()).toContain('16.0 hrs')
    expect(rows[0].text()).toContain('Auto clock-out')
    expect(rows[1].text()).toContain('Auto break end')
    expect(wrapper.text()).toContain('2 timesheets need review')
  })

  it('filters by student name', async () => {
    const { wrapper } = mountTab([entry('e1', 'jane smith'), entry('e2', 'bob brown')])
    await wrapper.find('input[type="search"]').setValue('  BOB ')

    const rows = bodyRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0].text()).toContain('bob brown')
  })

  it('marking reviewed clears the flag on the server and removes the row', async () => {
    const requests = captureRequests()
    server.use(
      http.patch(`${REST}/timeclock_entries`, () => new HttpResponse(null, { status: 204 })),
      http.patch(`${REST}/timeclock_breaks`, () => new HttpResponse(null, { status: 204 })),
    )
    const { wrapper } = mountTab([entry('e1', 'jane smith'), entry('e2', 'bob brown')])

    await bodyRows(wrapper)[0].find('button[title^="Mark reviewed"]').trigger('click')
    await flushPromises()

    expect(bodyRows(wrapper)).toHaveLength(1)
    expect(wrapper.text()).not.toContain('jane smith')
    const patch = requests.find(r => r.method === 'PATCH' && r.url.includes('timeclock_entries'))!
    expect(new URL(patch.url).searchParams.get('id')).toBe('eq.e1')
  })

  it('the edit button opens the timepunch dialog for that entry', async () => {
    const { wrapper, mgmt } = mountTab([entry('e1', 'jane smith')])
    await wrapper.find('button[title="Edit timesheet"]').trigger('click')

    expect(mgmt.dialog).toEqual({
      kind: 'editTimepunch', id: 1, name: 'jane smith', date: '2026-11-08', clockIn: '2026-11-08T14:00:00Z', deTotal: 0,
    })
  })
})
