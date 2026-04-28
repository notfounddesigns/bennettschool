<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMgmtStore } from '../stores/mgmt'
import TheTopbar from '../components/TheTopbar.vue'
import OverviewPanel from '../components/mgmt/OverviewPanel.vue'
import MgmtTable from '../components/mgmt/MgmtTable.vue'
import TimeclockTab from '../components/mgmt/TimeclockTab.vue'
import HoursModal from '../components/mgmt/HoursModal.vue'
import GradesModal from '../components/mgmt/GradesModal.vue'
import SyncDialog from '../components/mgmt/SyncDialog.vue'
import ExportDialog from '../components/mgmt/ExportDialog.vue'
import ResetPasswordDialog from '../components/mgmt/ResetPasswordDialog.vue'
import AddStudentDialog from '../components/mgmt/AddStudentDialog.vue'
import SetPinDialog from '../components/mgmt/SetPinDialog.vue'

const mgmt = useMgmtStore()
const activeTab = ref<'dashboard' | 'timeclock'>('dashboard')

// Dialog open state
const hoursOpen = ref(false)
const gradesOpen = ref(false)
const syncOpen = ref(false)
const exportOpen = ref(false)
const resetPassOpen = ref(false)
const resetPassTarget = ref<{ id: number; name: string } | null>(null)
const addStudentOpen = ref(false)
const setPinOpen = ref(false)
const setPinTarget = ref<{ id: number; name: string } | null>(null)

onMounted(() => mgmt.load())

function openResetPassword(target: { id: number; name: string }) {
  resetPassTarget.value = target
  resetPassOpen.value = true
}

function openSetPin(target: { id: number; name: string }) {
  setPinTarget.value = target
  setPinOpen.value = true
}
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-app-bg text-blush font-sans text-[15px]">
    <TheTopbar />

    <main class="flex-1 flex flex-col w-full max-w-[1600px] mx-auto px-2 md:px-4 pb-3 md:pb-1 overflow-hidden pt-4 md:pt-0 md:h-[calc(100dvh-56px-3rem)]">
      <div class="flex flex-col gap-3 h-full min-h-0 pt-4">

        <!-- Tab bar -->
        <div class="flex gap-1 shrink-0">
          <button
            @click="activeTab = 'dashboard'"
            :class="activeTab === 'dashboard' ? 'bg-white/12 text-cream' : 'text-muted hover:text-cream'"
            class="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer"
          >Dashboard</button>
          <button
            @click="activeTab = 'timeclock'"
            :class="activeTab === 'timeclock' ? 'bg-white/12 text-cream' : 'text-muted hover:text-cream'"
            class="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer"
          >Timeclock</button>
        </div>

        <!-- Dashboard tab -->
        <div v-show="activeTab === 'dashboard'" class="flex flex-col gap-3 flex-1 min-h-0">

          <!-- Bento row 1: Overview + Needs Attention -->
          <div class="grid gap-3 shrink-0 grid-cols-1 md:grid-cols-[2fr_1fr] md:max-h-[200px]">
            <OverviewPanel />

            <!-- Needs Attention -->
            <div class="max-h-[175px] md:max-h-none bg-white/8 border border-white/8 rounded-[14px] p-5 overflow-y-auto">
              <p class="text-[11px] uppercase tracking-[0.08em] text-muted font-semibold mb-3">Needs Attention</p>
              <p v-if="mgmt.loading" class="text-[12px] text-muted">Loading…</p>
              <template v-else>
                <div
                  v-if="mgmt.employees.filter(e => e.total_hrs === 0).length === 0"
                  class="flex flex-col items-center justify-center py-3 text-center"
                >
                  <div class="w-8 h-8 rounded-full bg-sage/20 flex items-center justify-center mb-2">
                    <svg class="text-sage" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <p class="text-[12px] text-sage font-medium">All students active</p>
                </div>
                <ul v-else class="space-y-2.5">
                  <li
                    v-for="emp in mgmt.employees.filter(e => e.total_hrs === 0)"
                    :key="emp.homebase_id"
                    class="flex items-center gap-2.5"
                  >
                    <div class="w-7 h-7 rounded-full bg-blush/20 text-blush flex items-center justify-center text-[10px] font-bold shrink-0">
                      {{ emp.name.split(' ').map((p: string) => p[0] ?? '').slice(0, 2).join('').toUpperCase() }}
                    </div>
                    <div class="min-w-0">
                      <div class="text-[12px] font-medium text-cream truncate">{{ emp.name }}</div>
                      <div class="text-[10px] text-blush/60">No hours logged yet</div>
                    </div>
                  </li>
                </ul>
              </template>
            </div>
          </div>

          <!-- Bento row 2: Sync info + Actions -->
          <div class="flex flex-col sm:flex-row items-center justify-center gap-2.5 shrink-0">
            <div class="flex items-center gap-2 flex-1">
              <p class="text-[12px] text-muted tracking-[0.02em]">{{ mgmt.formatLastSync() }}</p>
              <button
                @click="syncOpen = true"
                disabled
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] text-sage bg-transparent border border-sage hover:text-sage-light hover:border-sage-light transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>
                Sync
              </button>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <button
                @click="addStudentOpen = true"
                class="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-full bg-action-btn text-cream border border-white/8 text-[12px] font-semibold cursor-pointer transition-colors hover:bg-action-btn-hover"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                Add Student
              </button>
              <button
                @click="gradesOpen = true"
                class="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-full bg-action-btn text-cream border border-white/8 text-[12px] font-semibold cursor-pointer transition-colors hover:bg-action-btn-hover"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Grades
              </button>
              <button
                @click="exportOpen = true"
                :disabled="mgmt.employees.length === 0"
                class="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-full bg-action-btn text-cream border border-white/8 text-[12px] font-semibold cursor-pointer transition-colors hover:bg-action-btn-hover disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
            </div>
          </div>

          <!-- Row 3: Students table -->
          <MgmtTable
            class="flex-1 min-h-0"
            @reset-password="openResetPassword"
            @set-pin="openSetPin"
          />

        </div>

        <!-- Timeclock tab -->
        <TimeclockTab v-show="activeTab === 'timeclock'" class="flex flex-col gap-3 flex-1 min-h-0" />

      </div>
    </main>

    <!-- Dialogs -->
    <HoursModal v-model:open="hoursOpen" @saved="mgmt.load()" />
    <GradesModal v-model:open="gradesOpen" @saved="mgmt.load()" />
    <SyncDialog v-model:open="syncOpen" @synced="mgmt.load()" />
    <ExportDialog v-model:open="exportOpen" />
    <AddStudentDialog v-model:open="addStudentOpen" @saved="mgmt.load()" />
    <ResetPasswordDialog
      v-model:open="resetPassOpen"
      :target="resetPassTarget"
    />
    <SetPinDialog
      v-model:open="setPinOpen"
      :target="setPinTarget"
    />
  </div>
</template>
