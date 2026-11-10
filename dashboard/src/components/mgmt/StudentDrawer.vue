<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../../stores/app'
import { useMgmtStore, type StudentGroup } from '../../stores/mgmt'
import type { TimeclockStatusEntry } from '../../lib/api'
import { punchTime } from '../../lib/helpers'
import Icon from './Icon.vue'

const app = useAppStore()
const mgmt = useMgmtStore()
const router = useRouter()

const g = computed(() => mgmt.selectedGroup)
const panelTab = ref<'timeclock' | 'de' | 'grades'>('timeclock')
watch(() => mgmt.selectedStudentId, () => { panelTab.value = 'timeclock' })

function onKey(e: KeyboardEvent) {
  // Esc inside an open dialog closes just the dialog.
  if (e.key === 'Escape' && !mgmt.dialog) mgmt.closeStudent()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

function viewAsStudent(g: StudentGroup) {
  const manager = app.currentEmployee
  app.viewAsStudent({ homebase_id: g.homebase_id, name: g.name, role_id: g.role_id })
  app.audit('view_as_student', {
    targetId: g.homebase_id,
    targetName: g.name,
    description: `${manager?.name ?? 'A manager'} viewed ${g.name}'s dashboard`,
  })
  void router.push('/dashboard')
}

function entries(g: StudentGroup): Array<{ e: TimeclockStatusEntry; today: boolean }> {
  return [
    ...(g.todayEntry ? [{ e: g.todayEntry, today: true }] : []),
    ...g.historyEntries.map(e => ({ e, today: false })),
  ]
}

// deTotal is 0 to match production, whose per-day DE lookup is never populated:
// the DE field opens empty and any value entered is added as a new DE row.
function editTimepunch(g: StudentGroup, e: TimeclockStatusEntry) {
  mgmt.openDialog({ kind: 'editTimepunch', id: g.homebase_id, name: g.name, date: e.date, clockIn: e.clock_in, deTotal: 0 })
}

const th = 'text-left text-[10px] font-semibold uppercase tracking-[0.07em] text-muted px-3 py-2 border-b border-app-border whitespace-nowrap'
const actionBtn = 'inline-flex items-center gap-2 p-1 rounded-[8px] text-[13px] font-medium cursor-pointer transition-colors text-muted hover:text-cream hover:bg-cream/20'
const rowBtn = 'w-6 h-6 inline-flex items-center justify-center rounded text-muted hover:text-charcoal hover:bg-black/6 transition-colors'
const delBtn = 'w-6 h-6 inline-flex items-center justify-center rounded text-app-error hover:text-app-error/50 hover:bg-red-600/10 transition-colors'
const confirmBtn = 'w-6 h-6 inline-flex items-center justify-center rounded text-red-600 hover:bg-red-600/10 transition-colors'
const tabBtn = (active: boolean) => [
  'px-4 py-2 text-xs md:text-[13px] font-semibold border-b-2 -mb-px transition-colors cursor-pointer',
  active ? 'border-sage text-sage' : 'border-transparent text-muted hover:text-cream',
]
</script>

<template>
  <Transition name="fade">
    <div
      v-if="g"
      class="fixed inset-0 z-100 bg-black/45"
      @click="mgmt.closeStudent()"
    />
  </Transition>
  <Transition name="drawer">
    <aside
      v-if="g"
      class="fixed top-0 right-0 bottom-0 my-8 z-110 w-full md:w-[min(44rem,92vw)] bg-modal-bg border-l border-white/10 shadow-lg"
    >
      <div class="flex flex-col h-full min-h-0 gap-3 p-4 md:p-5">
        <!-- Header -->
        <div class="flex items-center gap-3 shrink-0">
          <div class="w-12 h-12 rounded-full bg-blush text-white flex items-center justify-center text-lg font-bold shrink-0 leading-none">
            {{ g.initials }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-serif text-base md:text-lg text-cream capitalize leading-tight truncate">
              {{ g.name }}
            </div>
            <div
              v-if="g.role_name"
              class="text-[11px] text-muted font-medium mt-0.5"
            >
              {{ g.role_name }}
            </div>
          </div>
          <button
            class="w-8 h-8 inline-flex items-center justify-center rounded-[8px] text-muted hover:text-cream hover:bg-cream/20 transition-colors cursor-pointer shrink-0"
            title="Close"
            @click="mgmt.closeStudent()"
          >
            <Icon
              name="x"
              :size="18"
            />
          </button>
        </div>

        <!-- Progress to graduation -->
        <div class="w-full">
          <div class="flex justify-between text-[10px] uppercase tracking-[0.07em] text-muted font-semibold mb-1">
            <span>Progress</span>
            <span class="tabular-nums text-sage">{{ g.percentComplete }}%</span>
          </div>
          <div class="h-1.5 bg-app-border rounded-full overflow-hidden">
            <div
              class="h-full rounded-full bg-sage"
              :style="{ width: Math.min(g.percentComplete, 100) + '%' }"
            />
          </div>
          <div class="flex items-center text-[11px] text-muted text-center mt-1 tabular-nums">
            <span>{{ g.hrsToGraduate }}</span>&nbsp;hrs to graduate
            <div class="ml-auto">
              <span>{{ g.totalHrs }}</span>&nbsp;total hrs
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="w-full flex gap-1.5 mt-1 justify-center">
          <button
            :class="actionBtn"
            title="View as student"
            @click="viewAsStudent(g)"
          >
            <Icon
              name="eye"
              :size="20"
            />
          </button>
          <button
            :class="actionBtn"
            title="Edit student"
            @click="mgmt.openDialog({ kind: 'editStudent', id: g.homebase_id, name: g.name, roleId: g.role_id })"
          >
            <Icon
              name="edit"
              :size="20"
            />
          </button>
          <button
            :class="actionBtn"
            title="Reset password"
            @click="mgmt.openDialog({ kind: 'resetPassword', id: g.homebase_id, name: g.name })"
          >
            <Icon
              name="lock"
              :size="20"
            />
          </button>
          <button
            :class="actionBtn"
            title="Set timeclock PIN"
            @click="mgmt.openDialog({ kind: 'setPin', id: g.homebase_id, name: g.name })"
          >
            <Icon
              name="keypad"
              :size="20"
            />
          </button>
          <button
            :class="actionBtn"
            title="Remove student"
            @click="mgmt.openDialog({ kind: 'removeStudent', id: g.homebase_id, name: g.name })"
          >
            <Icon
              name="trash-bin"
              :size="20"
            />
          </button>
        </div>

        <!-- Tabs + tables -->
        <div class="flex-1 min-w-0 flex flex-col gap-3 min-h-0">
          <div class="flex items-end justify-between gap-2">
            <div class="flex gap-1 flex-1">
              <button
                :class="tabBtn(panelTab === 'timeclock')"
                @click="panelTab = 'timeclock'"
              >
                Timeclock - ({{ entries(g).length }})
              </button>
              <button
                :class="tabBtn(panelTab === 'de')"
                @click="panelTab = 'de'"
              >
                DE Hrs - ({{ mgmt.deHoursList.length }})
              </button>
              <button
                :class="tabBtn(panelTab === 'grades')"
                @click="panelTab = 'grades'"
              >
                Grades - ({{ g.grades.length }})
              </button>
            </div>
            <button
              class="inline-flex items-center gap-1 shrink-0 h-8 px-3 rounded-[8px] text-[12px] font-semibold cursor-pointer transition-colors bg-blush text-white hover:bg-blush-hover"
              @click="mgmt.openDialog({ kind: 'addEntry', id: g.homebase_id, name: g.name })"
            >
              <Icon
                name="plus"
                :size="13"
                :stroke="2.5"
              />
              New
            </button>
          </div>

          <!-- Timeclock -->
          <div
            v-if="panelTab === 'timeclock'"
            style="scrollbar-width: thin;"
            class="flex-1 min-h-0 overflow-auto rounded-[8px] bg-white"
          >
            <div
              v-if="entries(g).length === 0"
              class="flex items-center justify-center py-8 text-[12px] tracking-[0.07em] text-muted"
            >
              No time punch entries...
            </div>
            <table
              v-else
              class="w-full border-collapse text-[12px]"
            >
              <thead class="sticky top-0 z-10 bg-cream">
                <tr>
                  <th :class="th">
                    Date
                  </th>
                  <th :class="th">
                    Clock In
                  </th>
                  <th :class="['hidden md:table-cell', th]">
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
                  <th class="w-8 border-b border-app-border" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="{ e, today } in entries(g)"
                  :key="e.clock_in"
                  :class="today
                    ? 'bg-[#fafcfb] border-b border-app-border/50'
                    : 'border-b border-app-border/50 last:border-b-0 hover:bg-[#f5f3f0] transition-colors'"
                >
                  <td
                    class="px-3 py-2 tabular-nums whitespace-nowrap"
                    :class="today ? 'text-charcoal font-medium' : 'text-muted'"
                  >
                    <span class="inline-flex items-center gap-1">
                      <span>{{ e.date }}</span>
                      <button
                        class="w-5 h-5 flex items-center justify-center rounded text-muted hover:text-charcoal hover:bg-black/6 transition-colors shrink-0"
                        title="View punch photos"
                        @click="mgmt.openDialog({ kind: 'punchPhotos', homebaseId: g.homebase_id, clockIn: e.clock_in })"
                      >
                        <Icon
                          name="camera"
                          :size="11"
                        />
                      </button>
                    </span>
                  </td>
                  <td
                    v-for="(t, i) in [e.clock_in, e.clock_out, e.break_start, e.break_end]"
                    :key="i"
                    class="px-3 py-2 tabular-nums whitespace-nowrap"
                    :class="[today ? 'text-charcoal' : 'text-muted', i > 0 && 'hidden md:table-cell']"
                  >
                    {{ punchTime(t) }}
                  </td>
                  <td
                    class="px-3 py-2 tabular-nums whitespace-nowrap"
                    :class="today ? 'text-charcoal' : 'text-muted'"
                  >
                    {{ Number(e.worked_hours ?? 0).toFixed(1) }} hrs
                  </td>
                  <td class="px-2 py-2 text-right">
                    <button
                      :class="rowBtn"
                      title="Edit timepunch"
                      @click="editTimepunch(g, e)"
                    >
                      <Icon
                        name="edit"
                        :size="12"
                      />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- DE hours -->
          <div
            v-if="panelTab === 'de'"
            style="scrollbar-width: thin;"
            class="flex-1 min-h-0 overflow-auto rounded-[8px] bg-white"
          >
            <div
              v-if="mgmt.deHoursList.length === 0"
              class="flex items-center justify-center py-8 text-[12px] tracking-[0.07em] text-muted"
            >
              No DE hours entries...
            </div>
            <table
              v-else
              class="w-full border-collapse text-[12px]"
            >
              <thead class="sticky top-0 z-10 bg-cream">
                <tr>
                  <th :class="th">
                    Date
                  </th>
                  <th :class="th">
                    Module
                  </th>
                  <th :class="['hidden md:table-cell', th]">
                    Platform
                  </th>
                  <th :class="['hidden md:table-cell', th]">
                    Verified
                  </th>
                  <th :class="[th, 'text-right!']">
                    DE Hrs
                  </th>
                  <th class="w-8 border-b border-app-border" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="de in mgmt.deHoursList"
                  :key="de.id"
                  class="border-b border-app-border/50 last:border-b-0 hover:bg-[#f5f3f0] transition-colors"
                >
                  <td class="px-3 py-2 tabular-nums text-muted whitespace-nowrap">
                    {{ de.date.substring(0, 10) }}
                  </td>
                  <td class="px-3 py-2 text-charcoal max-w-40 truncate">
                    {{ de.module || '—' }}
                  </td>
                  <td class="hidden md:table-cell px-3 py-2 text-muted max-w-40 truncate">
                    {{ de.platform || '—' }}
                  </td>
                  <td class="hidden md:table-cell px-3 py-2 text-muted whitespace-nowrap">
                    {{ de.verified ? 'Yes' : 'No' }}
                  </td>
                  <td class="px-3 py-2 tabular-nums text-charcoal text-right whitespace-nowrap">
                    {{ Number(de.hours ?? 0).toFixed(1) }} hrs
                  </td>
                  <td class="px-2 py-2 whitespace-nowrap">
                    <div
                      v-if="mgmt.pendingDeHoursDelete !== de.id"
                      class="inline-flex items-center gap-0.5"
                    >
                      <button
                        :class="rowBtn"
                        title="Edit DE hours"
                        @click="mgmt.openDialog({ kind: 'editDe', id: g.homebase_id, name: g.name, de })"
                      >
                        <Icon
                          name="edit"
                          :size="12"
                        />
                      </button>
                      <button
                        :class="delBtn"
                        title="Delete DE hours"
                        @click="mgmt.pendingDeHoursDelete = de.id"
                      >
                        <Icon
                          name="trash"
                          :size="12"
                        />
                      </button>
                    </div>
                    <div
                      v-else
                      class="inline-flex items-center gap-0.5"
                    >
                      <button
                        :class="confirmBtn"
                        title="Confirm delete"
                        @click="mgmt.deleteDeHours(g.homebase_id, g.name, de)"
                      >
                        <Icon
                          name="check"
                          :size="12"
                        />
                      </button>
                      <button
                        :class="rowBtn"
                        title="Cancel"
                        @click="mgmt.pendingDeHoursDelete = null"
                      >
                        <Icon
                          name="x"
                          :size="12"
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Grades -->
          <div
            v-if="panelTab === 'grades'"
            style="scrollbar-width: thin;"
            class="flex-1 min-h-0 overflow-auto rounded-[8px] bg-white"
          >
            <div
              v-if="g.grades.length === 0"
              class="flex items-center justify-center py-8 text-[12px] tracking-[0.07em] text-muted"
            >
              No grade entries...
            </div>
            <table
              v-else
              class="w-full border-collapse text-[12px]"
            >
              <thead class="sticky top-0 z-10 bg-cream">
                <tr>
                  <th :class="th">
                    Date
                  </th>
                  <th :class="th">
                    Project
                  </th>
                  <th :class="['hidden md:table-cell', th]">
                    Category
                  </th>
                  <th :class="[th, 'text-right!']">
                    Score
                  </th>
                  <th class="w-16 border-b border-app-border" />
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="grade in g.grades"
                  :key="grade.id"
                  class="border-b border-app-border/50 last:border-b-0 hover:bg-[#f5f3f0] transition-colors"
                >
                  <td class="px-3 py-2 tabular-nums text-muted whitespace-nowrap">
                    {{ grade.date }}
                  </td>
                  <td class="px-3 py-2 text-charcoal max-w-40 truncate">
                    {{ grade.project || '—' }}
                  </td>
                  <td class="hidden md:table-cell px-3 py-2 text-muted max-w-40 truncate">
                    {{ grade.category || '—' }}
                  </td>
                  <td
                    class="px-3 py-2 tabular-nums font-medium text-right whitespace-nowrap"
                    :class="grade.score >= 90 ? 'text-sage' : grade.score >= 60 ? 'text-charcoal' : 'text-app-error'"
                  >
                    {{ grade.score }}%
                  </td>
                  <td class="px-2 py-2 text-right whitespace-nowrap">
                    <div
                      v-if="mgmt.pendingGradeDelete !== grade.id"
                      class="inline-flex items-center"
                    >
                      <button
                        :class="rowBtn"
                        title="Edit grade"
                        @click="mgmt.openDialog({ kind: 'editGrade', id: g.homebase_id, name: g.name, grade })"
                      >
                        <Icon
                          name="edit"
                          :size="12"
                        />
                      </button>
                      <button
                        :class="delBtn"
                        title="Delete grade"
                        @click="mgmt.pendingGradeDelete = grade.id"
                      >
                        <Icon
                          name="trash"
                          :size="12"
                        />
                      </button>
                    </div>
                    <div
                      v-else
                      class="inline-flex items-center gap-0.5"
                    >
                      <button
                        :class="confirmBtn"
                        title="Confirm delete"
                        @click="mgmt.deleteGrade(g.homebase_id, g.name, grade)"
                      >
                        <Icon
                          name="check"
                          :size="12"
                        />
                      </button>
                      <button
                        :class="rowBtn"
                        title="Cancel"
                        @click="mgmt.pendingGradeDelete = null"
                      >
                        <Icon
                          name="x"
                          :size="12"
                        />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </aside>
  </Transition>
</template>
