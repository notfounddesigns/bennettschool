<script setup lang="ts">
import { onMounted } from 'vue'
import { useAppStore } from '../stores/app'
import { useDashboardStore } from '../stores/dashboard'
import TheTopbar from '../components/TheTopbar.vue'
import { formatSimpleDate, scoreToLetter } from '../lib/helpers'
import type { HourEntry, DeEntry, GradeEntry } from '../lib/api'

const app = useAppStore()
const dashboard = useDashboardStore()

onMounted(() => {
  if (app.currentEmployee && !dashboard.data) {
    dashboard.load(app.currentEmployee.id)
  }
})

function letterClass(score: number) {
  const l = scoreToLetter(score).toLowerCase()
  return `grade-${l}`
}
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-app-bg text-blush font-sans text-[15px]">
    <TheTopbar />

    <main class="flex-1 grid gap-4 overflow-y-auto px-[clamp(1rem,8vw,10rem)] pt-4 md:pt-8 pb-4 lg:grid-cols-2">

      <!-- Left column -->
      <div class="flex flex-col gap-4">

        <!-- Graduation progress -->
        <div class="bg-white border border-app-border rounded-[14px] p-5 shadow-card">
          <p class="inline-flex items-center text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-4">
            Graduation Progress
            &nbsp;--&nbsp;
            <span class="font-serif text-[28px] leading-none ml-1 text-sage">
              {{ (dashboard.data?.percentComplete ?? 0) }}%
            </span>
          </p>

          <div class="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
            <div class="bg-cream rounded-[8px] px-4 py-3.5 border border-app-border">
              <div class="text-[11px] text-muted mb-1.5 uppercase tracking-[0.06em] font-semibold">In Person</div>
              <div class="font-serif text-[28px] text-blush leading-none">
                {{ dashboard.formattedInPersonHrs }}<span class="text-sm text-muted font-sans font-normal"> h</span>
              </div>
            </div>
            <div class="bg-cream rounded-[8px] px-4 py-3.5 border border-app-border">
              <div class="text-[11px] text-muted mb-1.5 uppercase tracking-[0.06em] font-semibold">DE Hours</div>
              <div class="font-serif text-[28px] text-blush leading-none">
                {{ dashboard.formattedDeHrs }}<span class="text-sm text-muted font-sans font-normal"> h</span>
              </div>
            </div>
            <div class="bg-cream rounded-[8px] px-4 py-3.5 border border-app-border">
              <div class="text-[11px] text-muted mb-1.5 uppercase tracking-[0.06em] font-semibold">Total</div>
              <div class="font-serif text-[28px] text-blush leading-none">
                {{ dashboard.formattedTotalHrs }}<span class="text-sm text-muted font-sans font-normal"> h</span>
              </div>
            </div>
          </div>

          <div class="mt-3.5">
            <div class="flex justify-between text-xs text-muted mb-1.5">
              <span>Progress to 1,500 h</span>
              <span>{{ dashboard.hrsRemaining }}</span>
            </div>
            <div class="h-1.5 bg-app-border rounded-full overflow-hidden">
              <div
                class="progress-fill h-full rounded-full bg-blush"
                :style="{ width: (dashboard.data?.percentComplete ?? 0) + '%' }"
              />
            </div>
          </div>
        </div>

        <!-- Grades -->
        <div class="bg-white border border-app-border rounded-[14px] p-5 shadow-card overflow-y-auto">
          <p class="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-4">Grades</p>
          <p v-if="!dashboard.data?.grades?.length" class="text-center py-8 text-muted text-sm">
            No grades recorded yet.
          </p>
          <table v-else class="w-full border-collapse">
            <thead>
              <tr>
                <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Date</th>
                <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Project</th>
                <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Category</th>
                <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Score</th>
                <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="g in (dashboard.data?.grades as GradeEntry[])" :key="g.date + g.project">
                <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">{{ formatSimpleDate(g.date) }}</td>
                <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">{{ g.project }}</td>
                <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">{{ g.category }}</td>
                <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                  <div class="flex items-center gap-2">
                    <span
                      class="grade-chip flex items-center justify-center w-8 h-8 rounded-full text-[13px] font-bold"
                      :class="letterClass(g.score)"
                    >{{ scoreToLetter(g.score) }}</span>
                    <span class="text-muted text-xs">{{ g.score }}</span>
                  </div>
                </td>
                <td class="px-4 py-2.5 text-[13px] text-muted border-b border-app-border">{{ g.notes ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Right column -->
      <div class="flex flex-col gap-4 min-h-0">

        <!-- In-person hours -->
        <div class="bg-white border border-app-border rounded-[14px] p-5 shadow-card overflow-y-auto min-h-[158px]">
          <p class="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-4">
            In Person Hours — Last 7 Days
          </p>
          <ul>
            <li v-if="!dashboard.data?.inPersonHrsList?.length" class="text-center py-8 text-muted text-sm">
              No in person hours recorded yet.
            </li>
            <li
              v-for="e in (dashboard.data?.inPersonHrsList as HourEntry[])"
              :key="e.date"
              class="flex justify-between items-center py-[11px] border-b border-app-border text-[13px] gap-2 last:border-b-0"
            >
              <div class="flex flex-col gap-0.5">
                <span class="font-medium text-charcoal">{{ formatSimpleDate(e.date) }}</span>
              </div>
              <span class="text-xs font-semibold text-muted bg-cream px-2.5 py-0.5 rounded-full border border-app-border">
                {{ e.hours }}h
              </span>
            </li>
          </ul>
        </div>

        <!-- DE hours -->
        <div class="bg-white border border-app-border rounded-[14px] p-5 shadow-card overflow-y-auto min-h-[158px]">
          <p class="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-4">
            DE Hours History — Last 7 Days
          </p>
          <ul>
            <li v-if="!dashboard.data?.deHrsList?.length" class="text-center py-8 text-muted text-sm">
              No DE hours recorded yet.
            </li>
            <li
              v-for="e in (dashboard.data?.deHrsList as DeEntry[])"
              :key="e.date + e.module"
              class="flex justify-between items-center py-[11px] border-b border-app-border text-[13px] gap-2 last:border-b-0"
            >
              <div class="flex flex-col gap-0.5">
                <span class="font-medium text-charcoal">{{ formatSimpleDate(e.date) }}</span>
                <span class="text-muted text-xs">{{ e.module }} · {{ e.platform }}</span>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs font-semibold text-muted bg-cream px-2.5 py-0.5 rounded-full border border-app-border">
                  {{ e.hours }}h
                </span>
                <span
                  class="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                  :class="e.verified ? 'bg-sage-light text-[#2D6A55]' : 'bg-[#FEF3C7] text-[#92400E]'"
                >
                  {{ e.verified ? 'Verified' : 'Unverified' }}
                </span>
              </div>
            </li>
          </ul>
        </div>
      </div>

    </main>
  </div>
</template>
