<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '../stores/app'
import { useDashboardStore } from '../stores/dashboard'
import { useAuth } from '../lib/auth'
import { formatSimpleDate, scoreToLetter } from '../lib/helpers'
import TheTopbar from '../components/TheTopbar.vue'
import ChangePinDialog from '../components/ChangePinDialog.vue'

const app = useAppStore()
const dashboard = useDashboardStore()
const { logout } = useAuth()

const flipped = ref(false)
const activeTab = ref<'hours' | 'grades'>('hours')
const changePinOpen = ref(false)

// Load whoever the UI reflects — the student, or the one a manager is viewing.
watch(
  () => app.activeEmployee?.homebase_id,
  id => {
    flipped.value = false
    if (id != null && dashboard.loadedFor !== id) void dashboard.load(id)
  },
  { immediate: true },
)

function showTable(tab: 'hours' | 'grades') {
  if (!dashboard.showMetrics) return
  activeTab.value = tab
  flipped.value = true
}

type HourType = 'In Person' | 'DE' | 'Time Clock'
const HOUR_TYPE_BADGE: Record<HourType, string> = {
  'In Person': 'bg-sage-light text-[#2D6A55]',
  'DE': 'bg-[#FEF3C7] text-[#92400E]',
  'Time Clock': 'bg-[#DBEAFE] text-[#1E40AF]',
}

const hourRows = computed(() => {
  const d = dashboard.data
  if (!d) return []
  return [
    ...d.inPersonHrsList.map(e => ({ date: e.date, type: 'In Person' as HourType, hours: e.hours })),
    ...d.deHrsList.map(e => ({ date: e.date, type: 'DE' as HourType, hours: e.hours })),
    ...d.timeclockHrsList.map(e => ({ date: e.date, type: 'Time Clock' as HourType, hours: e.hours })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
})

const grades = computed(() => dashboard.data?.grades ?? [])
const percent = computed(() => dashboard.data?.percentComplete ?? 0)
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-app-bg text-blush font-sans text-[15px]">
    <TheTopbar />

    <main class="flex-1 flex flex-col items-center overflow-y-auto md:px-4 pt-4 md:pt-2 md:pb-2 w-full">
      <section class="screen-enter-active flex justify-center w-full h-full overflow-y-auto px-[clamp(1rem,8vw,10rem)]">
        <div class="flip-card flex w-full max-w-2xl my-4 self-start">
          <div
            class="flip-card-inner w-full"
            :class="flipped && 'is-flipped'"
          >
            <!-- FRONT: profile, totals, monthly stats, table buttons -->
            <div
              class="flip-card-face flip-card-front bg-white border border-app-border rounded-card p-5 shadow-card flex flex-col gap-4"
              :aria-hidden="flipped"
            >
              <div class="flex items-center justify-center gap-3 flex-wrap pt-1">
                <div class="w-14 h-14 rounded-full bg-blush text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {{ app.avatarInitials }}
                </div>
                <span class="font-serif text-lg text-blush sm:w-fit w-full text-center sm:text-left">{{ app.displayName }}</span>
                <!-- Act on the logged-in account, so hidden while a manager is viewing. -->
                <div
                  v-if="!app.isImpersonating"
                  class="flex items-center gap-2 sm:ml-auto ml-auto sm:mr-0 mr-auto"
                >
                  <button
                    class="inline-flex gap-1 items-center justify-center text-blush border border-blush rounded-[8px] h-8 px-3.5 text-[13px] font-medium cursor-pointer bg-transparent transition-all hover:border-blush-hover hover:text-blush-hover"
                    @click="changePinOpen = true"
                  >
                    <svg
                      fill="currentColor"
                      height="15"
                      width="15"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 320 320"
                    ><path d="M248.746,155.938c-3.022,0-5.92,0.542-8.609,1.533c-4.358-7.749-12.574-12.989-21.979-12.989 c-3.021,0-5.919,0.542-8.607,1.532c-4.358-7.749-12.575-12.988-21.98-12.988c-1.815,0-3.585,0.199-5.293,0.57v-18.52 c0-14.151-11.347-25.665-25.294-25.665s-25.294,11.514-25.294,25.665v81.629c-4.527-1.18-10.083-1.963-16.893-2.078 c-19.022-0.331-28.55,11.052-29.413,21.758c-0.911,11.294,7.086,21.069,18.601,22.737c12.912,1.872,19.502,12.662,29.185,30.112 C145.721,291.852,161.339,320,204.298,320c28.519,0,49.409-12.568,60.413-36.347c8.361-18.068,9.328-39.014,9.328-53.197v-48.854 C274.039,167.451,262.692,155.938,248.746,155.938z M254.039,230.456c0,48.096-15.341,69.544-49.741,69.544 c-31.184,0-41.59-18.754-53.64-40.47c-9.574-17.255-20.426-36.813-43.805-40.201c-1.092-0.158-1.594-0.596-1.533-1.336 c0.117-1.463,3.029-3.449,9.137-3.37c11.884,0.203,17.006,2.97,18.201,4.204c1.874,3.949,6.16,6.274,10.576,5.586 c4.868-0.761,8.456-4.953,8.456-9.88v-99.457c0-3.124,2.375-5.665,5.294-5.665s5.294,2.541,5.294,5.665v43.614v47.136 c0,5.522,4.478,10,10,10s10-4.478,10-10V158.69c0-3.123,2.374-5.664,5.293-5.664s5.294,2.541,5.294,5.664v11.456v35.68 c0,5.522,4.478,10,10,10s10-4.478,10-10v-35.68c0-3.123,2.374-5.664,5.293-5.664s5.293,2.541,5.293,5.664v10.008 c0,0.162,0,1.123,0,1.448v24.224c0,5.522,4.478,10,10,10s10-4.478,10-10v-24.224c0-3.123,2.375-5.664,5.295-5.664 c2.919,0,5.293,2.541,5.293,5.664V230.456z" /><path d="M74.627,58.237c15.807,0,28.666-13.063,28.666-29.118C103.293,13.063,90.434,0,74.627,0S45.961,13.063,45.961,29.119 C45.961,45.175,58.82,58.237,74.627,58.237z M74.627,20c4.778,0,8.666,4.091,8.666,9.119c0,5.027-3.888,9.118-8.666,9.118 s-8.666-4.091-8.666-9.118C65.961,24.091,69.849,20,74.627,20z" /><path d="M156.691,58.237c15.807,0,28.666-13.063,28.666-29.118C185.357,13.063,172.498,0,156.691,0s-28.667,13.063-28.667,29.119 C128.024,45.175,140.885,58.237,156.691,58.237z M156.691,20c4.778,0,8.666,4.091,8.666,9.119c0,5.027-3.888,9.118-8.666,9.118 c-4.779,0-8.667-4.091-8.667-9.118C148.024,24.091,151.912,20,156.691,20z" /><path d="M238.755,58.237c15.807,0,28.666-13.063,28.666-29.118C267.421,13.063,254.562,0,238.755,0s-28.666,13.063-28.666,29.119 C210.089,45.175,222.948,58.237,238.755,58.237z M238.755,20c4.778,0,8.666,4.091,8.666,9.119c0,5.027-3.888,9.118-8.666,9.118 s-8.666-4.091-8.666-9.118C230.089,24.091,233.977,20,238.755,20z" /><path d="M103.293,113.17c0-16.056-12.859-29.118-28.666-29.118S45.961,97.114,45.961,113.17c0,16.057,12.859,29.119,28.666,29.119 S103.293,129.227,103.293,113.17z M74.627,122.289c-4.778,0-8.666-4.091-8.666-9.119c0-5.027,3.888-9.118,8.666-9.118 s8.666,4.091,8.666,9.118C83.293,118.198,79.405,122.289,74.627,122.289z" /><path d="M238.755,142.289c15.807,0,28.666-13.063,28.666-29.119c0-16.056-12.859-29.118-28.666-29.118 s-28.666,13.063-28.666,29.118C210.089,129.227,222.948,142.289,238.755,142.289z M238.755,104.052 c4.778,0,8.666,4.091,8.666,9.118c0,5.028-3.888,9.119-8.666,9.119s-8.666-4.091-8.666-9.119 C230.089,108.143,233.977,104.052,238.755,104.052z" /></svg>
                    Change PIN
                  </button>
                  <button
                    class="inline-flex gap-1 items-center justify-center text-blush border border-blush rounded-[8px] h-8 px-3.5 text-[13px] font-medium cursor-pointer bg-transparent transition-all hover:border-blush-hover hover:text-blush-hover"
                    @click="logout"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    ><path
                      d="M18 8L22 12M22 12L18 16M22 12H9M15 4.20404C13.7252 3.43827 12.2452 3 10.6667 3C5.8802 3 2 7.02944 2 12C2 16.9706 5.8802 21 10.6667 21C12.2452 21 13.7252 20.5617 15 19.796"
                      stroke="currentColor"
                      stroke-width="1"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    /></svg>
                    Sign Out
                  </button>
                </div>
              </div>

              <p
                v-if="dashboard.error"
                class="alert-error mb-0!"
              >
                {{ dashboard.error }}
              </p>

              <template v-if="dashboard.showMetrics">
                <!-- Graduation progress -->
                <div class="w-full md:w-3/4 mx-auto">
                  <span class="w-full flex flex-col justify-center items-center font-serif text-[28px] leading-none text-sage bg-sage-light rounded-t-xl px-3 pt-2.5 pb-3.5 gap-1 border border-b-0 border-app-border text-center">
                    <span class="items-center text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">Total Hrs</span>
                    <span>{{ dashboard.formattedTotalHrs }}</span>
                  </span>
                  <div class="h-1.5 bg-sage-light rounded-b-xl overflow-hidden border-x border-b border-app-border">
                    <div
                      class="progress-fill h-full bg-sage"
                      :style="{ width: percent + '%' }"
                    />
                  </div>
                  <div class="flex justify-between text-xs text-muted mt-1.5">
                    <span>Progress to 1,500 h</span>
                    <span>{{ dashboard.hrsRemaining }}</span>
                  </div>
                </div>

                <!-- This month -->
                <span class="w-full text-center items-center text-[11px] uppercase tracking-[0.08em] text-muted font-semibold">This Month</span>
                <div class="grid grid-cols-2 gap-2.5">
                  <div class="bg-cream rounded-[8px] px-4 py-3.5 border border-app-border text-center w-full">
                    <div class="text-[11px] text-muted mb-1.5 uppercase tracking-[0.06em] font-semibold">
                      In Person
                    </div>
                    <div class="font-serif text-[28px] text-blush leading-none">
                      {{ dashboard.formattedInPersonHrs }}<span class="text-sm text-muted font-sans font-normal"> h</span>
                    </div>
                  </div>
                  <div class="bg-cream rounded-[8px] px-4 py-3.5 border border-app-border text-center w-full">
                    <div class="text-[11px] text-muted mb-1.5 uppercase tracking-[0.06em] font-semibold">
                      DE Hours
                    </div>
                    <div class="font-serif text-[28px] text-blush leading-none">
                      {{ dashboard.formattedDeHrs }}<span class="text-sm text-muted font-sans font-normal"> h</span>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Flip-to-table buttons -->
              <div class="flex w-full">
                <button
                  :disabled="!dashboard.showMetrics"
                  class="px-5 h-8 flex-1 text-[13px] font-semibold border border-app-border text-muted transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  @click="showTable('hours')"
                >
                  Hours
                </button>
                <button
                  :disabled="!dashboard.showMetrics"
                  class="px-5 h-8 flex-1 text-[13px] font-semibold border-r border-t border-b border-app-border text-muted transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                  @click="showTable('grades')"
                >
                  Grades
                </button>
              </div>
            </div>

            <!-- BACK: hours / grades table -->
            <div
              class="flip-card-face flip-card-back h-full bg-white border border-app-border rounded-card p-5 shadow-card flex flex-col gap-4"
              :aria-hidden="!flipped"
            >
              <div class="flex items-center gap-3">
                <button
                  class="inline-flex items-center justify-center h-8 text-[13px] font-semibold rounded-full text-muted transition-colors cursor-pointer hover:text-sage-hover"
                  aria-label="Back"
                  @click="flipped = false"
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  ><path
                    d="M19 12H5M5 12L11 6M5 12L11 18"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  /></svg>
                </button>
                <span class="ml-auto text-[13px] uppercase tracking-[0.08em] text-muted font-semibold">
                  {{ activeTab === 'hours' ? 'Hours' : 'Grades' }}
                </span>
              </div>

              <!-- Hours -->
              <div
                v-show="activeTab === 'hours'"
                class="flex-1 min-h-0 overflow-auto"
              >
                <p
                  v-if="hourRows.length === 0"
                  class="text-center py-8 text-muted text-sm"
                >
                  No hours recorded.
                </p>
                <table
                  v-else
                  class="mgmt-table w-full border-collapse"
                >
                  <thead>
                    <tr>
                      <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">
                        Date
                      </th>
                      <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">
                        Type
                      </th>
                      <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">
                        Hours
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(e, i) in hourRows"
                      :key="i"
                    >
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        {{ formatSimpleDate(e.date) }}
                      </td>
                      <td class="px-4 py-2.5 text-[13px] border-b border-app-border">
                        <span
                          class="text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide"
                          :class="HOUR_TYPE_BADGE[e.type]"
                        >{{ e.type }}</span>
                      </td>
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        {{ e.hours }}h
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Grades -->
              <div
                v-show="activeTab === 'grades'"
                class="flex-1 min-h-0 overflow-auto"
              >
                <p
                  v-if="grades.length === 0"
                  class="text-center py-8 text-muted text-sm"
                >
                  No grades recorded yet.
                </p>
                <table
                  v-else
                  class="mgmt-table w-full border-collapse"
                >
                  <thead>
                    <tr>
                      <th
                        v-for="h in ['Date', 'Project', 'Category', 'Score', 'Notes']"
                        :key="h"
                        class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border"
                      >
                        {{ h }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="g in grades"
                      :key="g.id"
                    >
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        {{ formatSimpleDate(g.date) }}
                      </td>
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        {{ g.project }}
                      </td>
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        {{ g.category }}
                      </td>
                      <td class="px-4 py-2.5 text-[13px] text-charcoal border-b border-app-border">
                        <div class="flex items-center gap-2">
                          <span
                            class="flex items-center justify-center w-8 h-8 rounded-full text-[13px] font-bold"
                            :class="`grade-${scoreToLetter(g.score).toLowerCase()}`"
                          >{{ scoreToLetter(g.score) }}</span>
                          <span class="text-muted text-xs">{{ g.score }}</span>
                        </div>
                      </td>
                      <td class="px-4 py-2.5 text-[13px] text-muted border-b border-app-border">
                        {{ g.notes ?? '—' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <ChangePinDialog
      :open="changePinOpen"
      @close="changePinOpen = false"
    />
  </div>
</template>
