<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMgmtStore } from '../../stores/mgmt'
import InlineHoursCell from './InlineHoursCell.vue'
import type { MgmtEmployee } from '../../lib/api'

const emit = defineEmits<{
  'reset-password': [{ id: number; name: string }]
  'set-pin': [{ id: number; name: string }]
}>()

const mgmt = useMgmtStore()
const sortCol = ref('name')
const sortDir = ref<'asc' | 'desc'>('asc')
const numericCols = ['total_hrs', 'hrs_to_graduate', 'percent_complete', 'in_person_hrs', 'de_hrs']

function toggleSort(col: string) {
  if (sortCol.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortCol.value = col
    sortDir.value = 'asc'
  }
}

function sortIcon(col: string): string {
  if (sortCol.value !== col) return '⇅'
  return sortDir.value === 'asc' ? '↑' : '↓'
}

const sortedEmployees = computed<MgmtEmployee[]>(() => {
  const col = sortCol.value
  return [...mgmt.employees].sort((a, b) => {
    const va = numericCols.includes(col) ? parseFloat(String((a as Record<string, unknown>)[col])) || 0 : (a as Record<string, unknown>)[col]
    const vb = numericCols.includes(col) ? parseFloat(String((b as Record<string, unknown>)[col])) || 0 : (b as Record<string, unknown>)[col]
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb))
    return sortDir.value === 'asc' ? cmp : -cmp
  })
})
</script>

<template>
  <div class="max-h-100 md:max-h-none bg-white rounded-[14px] shadow-card overflow-auto">
    <table class="w-full border-collapse text-[13px]">
      <thead class="sticky top-0 z-10 bg-cream">
        <tr>
          <th @click="toggleSort('name')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap">
            <span class="inline-flex items-center gap-1">Name <span class="text-[10px]" :class="sortCol === 'name' ? 'text-blush' : 'opacity-30'">{{ sortIcon('name') }}</span></span>
          </th>
          <th @click="toggleSort('in_person_hrs')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap">
            <span class="inline-flex items-center gap-1">In Person <span class="text-[10px]" :class="sortCol === 'in_person_hrs' ? 'text-blush' : 'opacity-30'">{{ sortIcon('in_person_hrs') }}</span></span>
          </th>
          <th @click="toggleSort('de_hrs')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap hidden md:table-cell">
            <span class="inline-flex items-center gap-1">DE <span class="text-[10px]" :class="sortCol === 'de_hrs' ? 'text-blush' : 'opacity-30'">{{ sortIcon('de_hrs') }}</span></span>
          </th>
          <th @click="toggleSort('total_hrs')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap hidden sm:table-cell">
            <span class="inline-flex items-center gap-1">Total <span class="text-[10px]" :class="sortCol === 'total_hrs' ? 'text-blush' : 'opacity-30'">{{ sortIcon('total_hrs') }}</span></span>
          </th>
          <th @click="toggleSort('percent_complete')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap hidden lg:table-cell">
            <span class="inline-flex items-center gap-1">Progress <span class="text-[10px]" :class="sortCol === 'percent_complete' ? 'text-blush' : 'opacity-30'">{{ sortIcon('percent_complete') }}</span></span>
          </th>
          <th @click="toggleSort('hrs_to_graduate')" class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border cursor-pointer select-none hover:text-charcoal transition-colors whitespace-nowrap hidden xl:table-cell">
            <span class="inline-flex items-center gap-1">To Graduate <span class="text-[10px]" :class="sortCol === 'hrs_to_graduate' ? 'text-blush' : 'opacity-30'">{{ sortIcon('hrs_to_graduate') }}</span></span>
          </th>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border whitespace-nowrap">Actions</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="mgmt.loading">
          <td colspan="7" class="text-center py-10 text-muted text-[13px]">
            <span class="spinner mr-2" style="vertical-align:middle;" />Loading…
          </td>
        </tr>
        <tr v-else-if="sortedEmployees.length === 0">
          <td colspan="7" class="text-center py-10 text-muted text-[13px]">No students found.</td>
        </tr>
        <tr
          v-else
          v-for="emp in sortedEmployees"
          :key="emp.homebase_id"
          class="even:bg-[#fafafa] hover:bg-[#f5f3f0] transition-colors"
        >
          <!-- Name + avatar + mini progress -->
          <td class="px-4 py-2 border-b border-app-border">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-blush text-white flex items-center justify-center text-[11px] font-bold shrink-0 leading-none">
                {{ emp.name.split(' ').map((p: string) => p[0] ?? '').slice(0, 2).join('').toUpperCase() }}
              </div>
              <div class="min-w-0">
                <div class="font-medium text-charcoal truncate">{{ emp.name }}</div>
                <div class="flex items-center gap-1.5 mt-[3px]">
                  <div class="h-[3px] w-14 bg-app-border rounded-full overflow-hidden shrink-0">
                    <div class="h-full rounded-full bg-sage" :style="{ width: Math.min(emp.percent_complete ?? 0, 100) + '%' }" />
                  </div>
                  <span class="text-[10px] text-muted tabular-nums">{{ (emp.percent_complete ?? 0) }}%</span>
                </div>
              </div>
            </div>
          </td>

          <!-- In Person Hrs -->
          <td class="px-4 py-2 border-b border-app-border">
            <InlineHoursCell
              :employee-id="emp.homebase_id"
              :type-id="1"
              :current-value="emp.in_person_hrs"
              @saved="mgmt.load()"
            />
          </td>

          <!-- DE Hrs -->
          <td class="px-4 py-2 border-b border-app-border hidden md:table-cell">
            <InlineHoursCell
              :employee-id="emp.homebase_id"
              :type-id="2"
              :current-value="emp.de_hrs"
              @saved="mgmt.load()"
            />
          </td>

          <!-- Total -->
          <td class="px-4 py-2 border-b border-app-border hidden sm:table-cell">
            <span class="tabular-nums text-charcoal">{{ emp.total_hrs ?? 0 }}</span>
            <span class="text-muted text-[11px]"> hrs</span>
          </td>

          <!-- Progress bar -->
          <td class="px-4 py-2 border-b border-app-border hidden lg:table-cell">
            <div class="flex items-center gap-2">
              <div class="flex-1 h-[4px] bg-app-border rounded-full overflow-hidden min-w-[60px]">
                <div class="h-full rounded-full bg-sage" :style="{ width: Math.min(emp.percent_complete ?? 0, 100) + '%' }" />
              </div>
              <span class="tabular-nums text-[12px] text-charcoal w-8 text-right">{{ (emp.percent_complete ?? 0) }}%</span>
            </div>
          </td>

          <!-- Hrs to graduate -->
          <td class="px-4 py-2 border-b border-app-border hidden xl:table-cell">
            <span class="tabular-nums text-charcoal">{{ emp.hrs_to_graduate ?? 0 }}</span>
            <span class="text-muted text-[11px]"> hrs</span>
          </td>

          <!-- Actions -->
          <td class="px-4 py-2 border-b border-app-border">
            <div class="flex items-center gap-1.5 flex-nowrap">
              <button
                @click="emit('reset-password', { id: emp.homebase_id, name: emp.name })"
                class="inline-flex items-center justify-center gap-1 text-[11px] font-medium h-6 px-2 rounded-md text-muted border border-app-border cursor-pointer bg-transparent whitespace-nowrap hover:border-blush hover:text-blush transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span class="hidden sm:inline">Reset PW</span>
              </button>
              <button
                @click="emit('set-pin', { id: emp.homebase_id, name: emp.name })"
                class="inline-flex items-center justify-center gap-1 text-[11px] font-medium h-6 px-2 rounded-md text-muted border border-app-border cursor-pointer bg-transparent whitespace-nowrap hover:border-sage hover:text-sage transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v.01M6 17v.01M18 17v.01M12 12v.01M6 12v.01M18 12v.01M12 7v.01M6 7v.01M18 7v.01"/></svg>
                PIN
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
