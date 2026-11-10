<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMgmtStore } from '../../stores/mgmt'
import { formatSimpleDate, punchTime } from '../../lib/helpers'
import RefreshButton from './RefreshButton.vue'
import Icon from './Icon.vue'

// Timesheets the nightly auto-close job had to fix (no clock out, or a break
// never ended). Editing one, or marking it reviewed, drops it from this list.
const mgmt = useMgmtStore()
const search = ref('')

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return mgmt.needsReviewEntries.filter(e => !q || e.student_name.toLowerCase().includes(q))
})

const th = 'text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border whitespace-nowrap'
const td = 'px-4 py-2.5 border-b border-app-border tabular-nums whitespace-nowrap'
</script>

<template>
  <div class="flex flex-col gap-3 flex-1 min-h-0">
    <div class="flex items-center gap-2 pl-3 shrink-0">
      <RefreshButton />
      <div class="flex-1" />
      <span
        v-if="mgmt.needsReviewCount > 0"
        class="sm:inline-flex hidden items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blush/15 text-blush"
      >
        {{ mgmt.needsReviewCount }} {{ mgmt.needsReviewCount === 1 ? 'timesheet needs review' : 'timesheets need review' }}
      </span>
      <input
        v-model="search"
        type="search"
        placeholder="Search by name…"
        class="w-full max-w-xs px-3.5 py-1.5 border border-white/15 rounded-[8px] bg-white/8 text-cream text-[12px] placeholder:text-muted outline-none focus:border-blush"
      >
    </div>

    <div class="flex-1 min-h-0 max-h-100 md:max-h-none bg-white rounded-card shadow-card overflow-auto">
      <table class="w-full border-collapse text-[13px]">
        <thead class="sticky top-0 z-10 bg-cream">
          <tr>
            <th :class="th">
              Student
            </th>
            <th :class="th">
              Date
            </th>
            <th :class="th">
              Clock In
            </th>
            <th :class="th">
              Clock Out
            </th>
            <th :class="['hidden md:table-cell', th]">
              Break Start
            </th>
            <th :class="['hidden md:table-cell', th]">
              Break End
            </th>
            <th :class="th">
              Hrs Worked
            </th>
            <th :class="th">
              Auto-Fixed
            </th>
            <th :class="[th, 'text-right!']">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="mgmt.loading">
            <td
              colspan="9"
              class="text-center py-10 text-muted text-[13px]"
            >
              <span
                class="spinner mr-2"
                style="vertical-align: middle;"
              />Loading…
            </td>
          </tr>
          <tr v-else-if="rows.length === 0">
            <td
              colspan="9"
              class="text-center py-10 text-muted text-[13px]"
            >
              Nothing needs review.
            </td>
          </tr>
          <template v-else>
            <tr
              v-for="entry in rows"
              :key="entry.id"
              class="even:bg-[#fafafa] hover:bg-[#f5f3f0] transition-colors"
            >
              <td :class="[td, 'text-charcoal capitalize']">
                {{ entry.student_name }}
              </td>
              <td :class="[td, 'text-charcoal']">
                {{ formatSimpleDate(entry.date) }}
              </td>
              <td :class="[td, 'text-charcoal']">
                {{ punchTime(entry.clock_in) }}
              </td>
              <td :class="[td, entry.auto_closed ? 'text-blush font-medium' : 'text-charcoal']">
                {{ punchTime(entry.clock_out) }}
              </td>
              <td :class="['hidden md:table-cell', td, 'text-charcoal']">
                {{ punchTime(mgmt.reviewBreak(entry)?.break_start) }}
              </td>
              <td :class="['hidden md:table-cell', td, mgmt.reviewBreak(entry)?.auto_closed ? 'text-blush font-medium' : 'text-charcoal']">
                {{ punchTime(mgmt.reviewBreak(entry)?.break_end) }}
              </td>
              <td :class="[td, 'text-charcoal']">
                {{ Number(entry.hours_worked ?? 0).toFixed(1) }} hrs
              </td>
              <td class="px-4 py-2.5 border-b border-app-border">
                <div class="flex flex-wrap gap-1">
                  <span
                    v-for="issue in mgmt.reviewIssues(entry)"
                    :key="issue"
                    class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blush/15 text-blush whitespace-nowrap"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-blush inline-block" />{{ issue }}
                  </span>
                </div>
              </td>
              <td class="px-4 py-2.5 border-b border-app-border text-right whitespace-nowrap">
                <button
                  class="w-7 h-7 inline-flex items-center justify-center rounded text-muted hover:text-charcoal hover:bg-black/6 transition-colors cursor-pointer"
                  title="Edit timesheet"
                  @click="mgmt.openDialog({ kind: 'editTimepunch', id: entry.homebase_id, name: entry.student_name, date: entry.date, clockIn: entry.clock_in, deTotal: 0 })"
                >
                  <Icon
                    name="edit"
                    :size="14"
                  />
                </button>
                <button
                  class="w-7 h-7 inline-flex items-center justify-center rounded text-muted hover:text-sage hover:bg-black/6 transition-colors cursor-pointer"
                  title="Mark reviewed (times are correct)"
                  @click="mgmt.markReviewed(entry.id)"
                >
                  <Icon
                    name="check"
                    :size="14"
                    :stroke="2.5"
                  />
                </button>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
