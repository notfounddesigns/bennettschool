<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMgmtStore } from '../../stores/mgmt'
import RefreshButton from './RefreshButton.vue'

const mgmt = useMgmtStore()
const search = ref('')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? mgmt.groupedStudents.filter(g => g.name.toLowerCase().includes(q)) : mgmt.groupedStudents
})

const counts = computed(() => {
  const g = mgmt.groupedStudents
  return {
    clockedIn: g.filter(s => s.todayEntry?.is_clocked_in && !s.todayEntry.on_break).length,
    onBreak: g.filter(s => s.todayEntry?.on_break).length,
    clockedOut: g.filter(s => s.todayEntry && !s.todayEntry.is_clocked_in).length,
    notIn: g.filter(s => !s.todayEntry).length,
  }
})

const pill = 'sm:inline-flex hidden items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full'
const headCell = 'text-[11px] text-center font-semibold uppercase tracking-[0.07em] text-muted'
</script>

<template>
  <div class="flex flex-col gap-3 flex-1 min-h-0">
    <!-- Toolbar -->
    <div class="flex items-center gap-2 pl-3 shrink-0">
      <RefreshButton />
      <button
        class="inline-flex items-center justify-center h-8 text-blush text-xs font-semibold cursor-pointer transition-colors hover:text-blush-hover"
        title="Add Student"
        @click="mgmt.openDialog({ kind: 'addStudent' })"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle
          cx="9"
          cy="7"
          r="4"
        /><line
          x1="19"
          y1="8"
          x2="19"
          y2="14"
        /><line
          x1="22"
          y1="11"
          x2="16"
          y2="11"
        /></svg>
      </button>
      <button
        :disabled="mgmt.employees.length === 0"
        class="inline-flex items-center justify-center h-8 text-muted text-xs font-semibold cursor-pointer transition-colors hover:text-action-btn-hover disabled:opacity-45 disabled:cursor-not-allowed"
        title="Export"
        @click="mgmt.openDialog({ kind: 'export' })"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        ><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line
          x1="12"
          y1="15"
          x2="12"
          y2="3"
        /></svg>
      </button>
      <div class="flex-1" />
      <span :class="[pill, 'bg-sage/15 text-sage']">{{ counts.clockedIn }} clocked-in</span>
      <span :class="[pill, 'bg-blush/15 text-blush']">{{ counts.onBreak }} on break</span>
      <span :class="[pill, 'bg-muted/10 text-muted']">{{ counts.clockedOut }} clocked-out</span>
      <span :class="[pill, 'bg-muted/10 text-muted']">{{ counts.notIn }} not clocked-in</span>
      <div class="flex-1 hidden sm:flex" />
      <span class="hidden sm:block text-[12px] tracking-[0.07em] text-muted">
        {{ filtered.length }} {{ filtered.length === 1 ? 'student' : 'students' }}
      </span>
      <input
        v-model="search"
        type="search"
        placeholder="Search by name…"
        class="w-full max-w-xs px-3.5 py-1.5 border border-white/15 rounded-[8px] bg-white/8 text-cream text-[12px] placeholder:text-muted outline-none focus:border-blush"
      >
    </div>

    <!-- Student list -->
    <div class="flex-1 min-h-0 max-h-100 md:max-h-none bg-white rounded-card shadow-card overflow-auto scroll-smooth">
      <div
        v-if="mgmt.loading"
        class="flex items-center justify-center py-10 text-muted text-[13px]"
      >
        <span class="spinner mr-2" />Loading…
      </div>
      <div
        v-else-if="filtered.length === 0"
        class="text-center py-10 text-muted text-[13px]"
      >
        No students found.
      </div>
      <div v-else>
        <div class="students-grid sticky top-0 z-10 px-4 py-2.5 bg-cream border-b border-app-border">
          <span class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">Student</span>
          <span :class="['hidden md:block min-w-0', headCell]">Status</span>
          <span :class="['hidden md:block', headCell]">Prev Day Hrs</span>
          <span :class="['hidden md:block', headCell]">Current Month Hrs</span>
          <span :class="['hidden md:block', headCell]">Current Month DE Hrs</span>
          <span :class="headCell">Total Hrs</span>
          <span :class="['hidden lg:block', headCell]">Hrs Remaining</span>
        </div>

        <div
          v-for="group in filtered"
          :key="group.homebase_id"
          class="border-b border-app-border last:border-b-0"
        >
          <div
            class="students-grid px-4 py-3 hover:bg-[#f5f3f0] transition-colors cursor-pointer select-none"
            @click="mgmt.openStudent(group.homebase_id)"
          >
            <!-- Avatar, name, role, progress -->
            <div class="min-w-0 flex items-center gap-2.5">
              <div
                class="avatar w-9 h-9 rounded-full text-white flex items-center justify-center text-[11px] font-bold shrink-0 leading-none"
                :data-status="group.status"
              >
                {{ group.initials }}
              </div>
              <div class="min-w-0">
                <div class="font-medium text-charcoal text-[13px] truncate capitalize">
                  {{ group.name }}
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span
                    v-if="group.role_name"
                    class="text-[10px] text-muted/80 font-medium leading-none"
                  >{{ group.role_name }}</span>
                  <div class="hidden md:flex items-center gap-1">
                    <div class="h-0.75 w-12 bg-app-border rounded-full overflow-hidden shrink-0">
                      <div
                        class="h-full rounded-full bg-sage"
                        :style="{ width: Math.min(group.percentComplete, 100) + '%' }"
                      />
                    </div>
                    <span class="text-[10px] text-muted tabular-nums leading-none">{{ group.percentComplete }}%</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Status -->
            <div class="hidden md:flex justify-center min-w-0">
              <span
                v-if="group.status === 'Clocked In'"
                class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage/15 text-sage"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-sage inline-block" />Clocked In
              </span>
              <span
                v-else-if="group.status === 'On Break'"
                class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blush/15 text-blush"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-blush inline-block" />On Break
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted/10 text-muted"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-muted/60 inline-block" />Clocked Out
              </span>
            </div>

            <div class="hidden md:block text-center text-[13px] text-charcoal tabular-nums">
              {{ group.prevDayHrs.toFixed(1) }} hrs
            </div>
            <div class="hidden md:block text-center text-[13px] text-charcoal tabular-nums">
              {{ group.currentMonthHrs.toFixed(1) }} hrs
            </div>
            <div class="hidden md:block text-center text-[13px] text-charcoal tabular-nums">
              {{ group.currentMonthDeHrs.toFixed(1) }} hrs
            </div>
            <div class="text-center min-w-0 text-[13px] text-charcoal tabular-nums">
              {{ group.totalHrs.toFixed(1) }} hrs
            </div>
            <div class="hidden lg:block text-center">
              <span class="text-[13px] text-charcoal tabular-nums">{{ group.hrsToGraduate }}</span>
              <span class="text-[11px] text-muted"> hrs</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
