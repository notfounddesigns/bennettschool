<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  addTimeclockEntry,
  clearAutoClosedFlags,
  fetchTimeclockEntryDetail,
  submitDeHours,
  submitGradeEntry,
  updateDeHoursEntry,
  updateGradeEntry,
  updateTimeclockEntryById,
  upsertTimeclockBreak,
} from '../../lib/api'
import { isoToTimeInput, todayIso, toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

type EntryType = 'timepunch' | 'de_hours' | 'grades'
type EditKind = null | 'timepunch' | 'grade' | 'de'

const app = useAppStore()

const mode = ref<'add' | 'edit'>('add')
const editKind = ref<EditKind>(null)
const homebaseId = ref(0)
const studentName = ref('')
const type = ref<EntryType>('timepunch')
const loading = ref(false)
const error = ref('')
const date = ref(todayIso())
const clockIn = ref('')
const clockOut = ref('')
const breakStart = ref('')
const breakEnd = ref('')
const hours = ref<string | number>('')
const module = ref('')
const platform = ref('')
const verified = ref(true)
const score = ref<string | number>('')
const project = ref('')
const category = ref('')
const notes = ref('')
// Edit-mode targets.
const entryId = ref('')
const breakId = ref<string | null>(null)
const originalDeTotal = ref(0)
const editGradeId = ref<number | null>(null)
const editDeId = ref<number | null>(null)

let loadSeq = 0

function reset() {
  mode.value = 'add'
  editKind.value = null
  type.value = 'timepunch'
  error.value = ''
  date.value = todayIso()
  clockIn.value = ''
  clockOut.value = ''
  breakStart.value = ''
  breakEnd.value = ''
  hours.value = ''
  module.value = ''
  platform.value = ''
  verified.value = true
  score.value = ''
  project.value = ''
  category.value = ''
  notes.value = ''
  entryId.value = ''
  breakId.value = null
  originalDeTotal.value = 0
  editGradeId.value = null
  editDeId.value = null
  loading.value = false
}

const { open, close, mgmt } = useDialog(['addEntry', 'editTimepunch', 'editGrade', 'editDe'], async r => {
  reset()
  homebaseId.value = r.id
  studentName.value = r.name

  if (r.kind === 'editTimepunch') {
    mode.value = 'edit'
    editKind.value = 'timepunch'
    date.value = r.date
    originalDeTotal.value = r.deTotal ?? 0
    hours.value = originalDeTotal.value > 0 ? String(originalDeTotal.value) : ''
    const seq = ++loadSeq
    loading.value = true
    try {
      const detail = await fetchTimeclockEntryDetail(r.id, r.clockIn)
      if (seq !== loadSeq) return
      if (detail) {
        entryId.value = detail.id
        breakId.value = detail.break_id
        clockIn.value = isoToTimeInput(detail.clock_in)
        clockOut.value = detail.clock_out ? isoToTimeInput(detail.clock_out) : ''
        breakStart.value = detail.break_start ? isoToTimeInput(detail.break_start) : ''
        breakEnd.value = detail.break_end ? isoToTimeInput(detail.break_end) : ''
      } else {
        error.value = 'Could not load this entry.'
      }
    } catch {
      if (seq === loadSeq) error.value = 'Could not load this entry.'
    } finally {
      if (seq === loadSeq) loading.value = false
    }
  } else if (r.kind === 'editGrade') {
    mode.value = 'edit'
    editKind.value = 'grade'
    type.value = 'grades'
    date.value = r.grade.date
    project.value = r.grade.project ?? ''
    category.value = r.grade.category ?? ''
    score.value = r.grade.score != null ? String(r.grade.score) : ''
    notes.value = r.grade.notes ?? ''
    editGradeId.value = r.grade.id
  } else if (r.kind === 'editDe') {
    mode.value = 'edit'
    editKind.value = 'de'
    type.value = 'de_hours'
    date.value = r.de.date
    hours.value = String(r.de.hours)
    module.value = r.de.module ?? ''
    platform.value = r.de.platform ?? ''
    verified.value = r.de.verified
    editDeId.value = r.de.id ?? null
  }
})

const displayName = computed(() => toTitleCase(studentName.value))

const dialogTitle = computed(() => {
  if (mode.value === 'edit') {
    if (editKind.value === 'grade') return 'Edit Grade'
    if (editKind.value === 'de') return 'Edit DE Hours'
    return 'Edit Timepunch'
  }
  return 'Add Entry'
})

// (clock out − clock in) − break, in hours.
const workedHours = computed(() => {
  const toMin = (t: string): number | null => {
    if (!t) return null
    const [h, m] = t.split(':').map(Number)
    return Number.isNaN(h) || Number.isNaN(m) ? null : h * 60 + m
  }
  const ci = toMin(clockIn.value)
  const co = toMin(clockOut.value)
  if (ci == null || co == null || co <= ci) return ''
  let worked = co - ci
  const bs = toMin(breakStart.value)
  const be = toMin(breakEnd.value)
  if (bs != null && be != null && be > bs) worked -= be - bs
  if (worked <= 0) return ''
  return (worked / 60).toFixed(2)
})

// Selected date + "HH:MM" → ISO timestamp (local time).
function toIso(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const [y, mo, d] = date.value.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

function validatePunch() {
  if (!date.value || !clockIn.value || !clockOut.value) {
    error.value = 'Date, Clock In, and Clock Out are required.'
    return null
  }
  const clockInIso = toIso(clockIn.value)
  const clockOutIso = toIso(clockOut.value)
  if (clockOutIso <= clockInIso) {
    error.value = 'Clock Out must be after Clock In.'
    return null
  }
  if (!!breakStart.value !== !!breakEnd.value) {
    error.value = 'Both Break Start and Break End are required to record a break.'
    return null
  }
  let breakStartIso: string | null = null
  let breakEndIso: string | null = null
  if (breakStart.value && breakEnd.value) {
    breakStartIso = toIso(breakStart.value)
    breakEndIso = toIso(breakEnd.value)
    if (breakEndIso <= breakStartIso) {
      error.value = 'Break End must be after Break Start.'
      return null
    }
    if (breakStartIso < clockInIso || breakEndIso > clockOutIso) {
      error.value = 'Break must fall within Clock In and Clock Out.'
      return null
    }
  }
  return { clockInIso, clockOutIso, breakStartIso, breakEndIso }
}

// Runs a save with the shared loading/snackbar/reload handling.
async function save(action: () => Promise<void>, successMsg: string, fallbackError = 'Could not save. Please try again.', showServerError = true) {
  loading.value = true
  app.showLoading()
  try {
    await action()
    close()
    app.showSnackbar(successMsg, 'success')
    await mgmt.load()
  } catch (err) {
    error.value = showServerError && err instanceof Error ? err.message : fallbackError
  } finally {
    loading.value = false
    app.hideLoading()
  }
}

async function submitAddTimepunch() {
  const punch = validatePunch()
  if (!punch) return
  const worked = workedHours.value
  await save(async () => {
    await addTimeclockEntry({
      homebase_id: homebaseId.value,
      date: date.value,
      clock_in: punch.clockInIso,
      clock_out: punch.clockOutIso,
      break_start: punch.breakStartIso,
      break_end: punch.breakEndIso,
    })
    app.audit('timeclock_add', {
      targetId: homebaseId.value,
      targetName: studentName.value,
      description: `Added a timeclock entry for ${date.value} (${worked} hrs)`,
      metadata: {
        id: homebaseId.value,
        name: studentName.value,
        date: date.value,
        clock_in: punch.clockInIso,
        clock_out: punch.clockOutIso,
        break_start: punch.breakStartIso,
        break_end: punch.breakEndIso,
        worked_hours: worked,
      },
    })
  }, 'Timepunch added.')
}

async function submitEditTimepunch() {
  if (!entryId.value) {
    error.value = 'This entry is still loading. Please try again.'
    return
  }
  const punch = validatePunch()
  if (!punch) return
  const newDe = hours.value !== '' ? Number.parseFloat(String(hours.value)) : 0
  if (Number.isNaN(newDe) || newDe < 0) {
    error.value = 'DE Hours must be a positive number.'
    return
  }
  const worked = workedHours.value
  await save(async () => {
    await updateTimeclockEntryById(entryId.value, { clock_in: punch.clockInIso, clock_out: punch.clockOutIso })
    await upsertTimeclockBreak(entryId.value, breakId.value, punch.breakStartIso, punch.breakEndIso)
    // Editing the punch *is* the review — clear any auto-fixed flags. Never
    // block the save on it.
    await clearAutoClosedFlags(entryId.value).catch(() => {})
    // DE hours are stored as adjustment rows; write only the delta.
    const deDelta = newDe - originalDeTotal.value
    if (deDelta !== 0) {
      await submitDeHours({
        homebase_id: homebaseId.value,
        date: date.value,
        hours: String(deDelta),
        module: '',
        platform: '',
        verified: true,
      })
    }
    app.audit('timeclock_edit', {
      targetId: homebaseId.value,
      targetName: studentName.value,
      description: `Edited timeclock entry for ${date.value} (${worked} hrs)`,
      metadata: {
        id: homebaseId.value,
        name: studentName.value,
        date: date.value,
        clock_in: punch.clockInIso,
        clock_out: punch.clockOutIso,
        break_start: punch.breakStartIso,
        break_end: punch.breakEndIso,
        worked_hours: worked,
        de_hours: newDe,
      },
    })
  }, 'Timepunch updated.')
}

async function submitAddDeHours() {
  if (!date.value || hours.value === '') {
    error.value = 'Date and Hours are required.'
    return
  }
  await save(() => submitDeHours({
    homebase_id: homebaseId.value,
    date: date.value,
    hours: String(hours.value),
    module: module.value,
    platform: platform.value,
    verified: true,
  }), 'DE hours added.')
}

async function submitAddGrade() {
  if (!date.value || score.value === '') {
    error.value = 'Date and Score are required.'
    return
  }
  await save(() => submitGradeEntry({
    homebase_id: homebaseId.value,
    date: date.value,
    project: project.value,
    category: category.value,
    score: Number(score.value),
    notes: notes.value || null,
  }), 'Grade saved.', undefined, false)
}

async function submitEditGrade() {
  const id = editGradeId.value
  if (id == null) {
    error.value = 'This entry has no database id and cannot be edited.'
    return
  }
  if (score.value === '') {
    error.value = 'Score is required.'
    return
  }
  const s = Number(score.value)
  if (Number.isNaN(s) || s < 0) {
    error.value = 'Score must be a positive number.'
    return
  }
  await save(async () => {
    await updateGradeEntry(id, { project: project.value, category: category.value, score: s })
    app.audit('grade_update', {
      targetId: homebaseId.value,
      targetName: studentName.value,
      description: `Edited a grade entry (${project.value} / ${category.value}, ${date.value})`,
      metadata: { id, date: date.value, project: project.value, category: category.value, score: s },
    })
  }, 'Grade updated.', undefined, false)
}

async function submitEditDeHours() {
  const id = editDeId.value
  if (id == null) {
    error.value = 'This entry has no database id and cannot be edited.'
    return
  }
  const h = hours.value !== '' ? Number.parseFloat(String(hours.value)) : Number.NaN
  if (Number.isNaN(h) || h < 0) {
    error.value = 'Hours must be a positive number.'
    return
  }
  await save(async () => {
    await updateDeHoursEntry(id, { hours: h, module: module.value, platform: platform.value, verified: verified.value })
    app.audit('de_hours_edit', {
      targetId: homebaseId.value,
      targetName: studentName.value,
      description: `Edited a DE hours entry (${h} hrs, ${date.value})`,
      metadata: { id, date: date.value, hours: h, module: module.value, platform: platform.value, verified: verified.value },
    })
  }, 'DE hours updated.')
}

async function submit() {
  error.value = ''
  if (mode.value === 'edit' && editKind.value === 'timepunch') await submitEditTimepunch()
  else if (mode.value === 'edit' && editKind.value === 'grade') await submitEditGrade()
  else if (mode.value === 'edit' && editKind.value === 'de') await submitEditDeHours()
  else if (type.value === 'timepunch') await submitAddTimepunch()
  else if (type.value === 'de_hours') await submitAddDeHours()
  else await submitAddGrade()
}

const optional = '(optional)'
</script>

<template>
  <AppDialog
    :open="open"
    :title="dialogTitle"
    width="460px"
    scroll
    @close="close"
  >
    <div class="px-5.5 py-5 flex flex-col gap-4">
      <div>
        <span class="field-label">Student</span>
        <div class="px-3.5 py-2.5 border border-app-border rounded-[8px] bg-cream/30 text-charcoal text-[13px] capitalize">
          {{ displayName }}
        </div>
      </div>

      <div v-if="mode === 'add'">
        <label
          class="field-label"
          for="add-entry-type"
        >Type</label>
        <select
          id="add-entry-type"
          v-model="type"
          class="field-input"
        >
          <option value="timepunch">
            Timepunch Hours
          </option>
          <option value="de_hours">
            DE Hours
          </option>
          <option value="grades">
            Grade
          </option>
        </select>
      </div>

      <div>
        <label
          class="field-label"
          for="add-entry-date"
        >Date</label>
        <input
          id="add-entry-date"
          v-model="date"
          type="date"
          :disabled="mode === 'edit'"
          class="field-input disabled:bg-cream/30 disabled:cursor-default"
        >
      </div>

      <!-- Timepunch -->
      <div
        v-if="type === 'timepunch'"
        class="flex flex-col gap-4"
      >
        <div class="flex gap-4">
          <div class="flex-1">
            <label
              class="field-label"
              for="add-entry-clock-in"
            >Clock In</label>
            <input
              id="add-entry-clock-in"
              v-model="clockIn"
              type="time"
              class="field-input"
            >
          </div>
          <div class="flex-1">
            <label
              class="field-label"
              for="add-entry-clock-out"
            >Clock Out</label>
            <input
              id="add-entry-clock-out"
              v-model="clockOut"
              type="time"
              class="field-input"
            >
          </div>
        </div>
        <div class="flex gap-4">
          <div class="flex-1">
            <label
              class="field-label"
              for="add-entry-break-start"
            >Break Start <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
            <input
              id="add-entry-break-start"
              v-model="breakStart"
              type="time"
              class="field-input"
            >
          </div>
          <div class="flex-1">
            <label
              class="field-label"
              for="add-entry-break-end"
            >Break End <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
            <input
              id="add-entry-break-end"
              v-model="breakEnd"
              type="time"
              class="field-input"
            >
          </div>
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-worked"
          >Hours Worked</label>
          <input
            id="add-entry-worked"
            type="text"
            readonly
            :value="workedHours || '—'"
            class="w-full px-3.5 py-2.5 border border-app-border rounded-[8px] bg-cream/30 text-charcoal outline-none cursor-default"
          >
        </div>
        <div v-if="mode === 'edit'">
          <label
            class="field-label"
            for="add-entry-tp-de"
          >DE Hours</label>
          <input
            id="add-entry-tp-de"
            v-model="hours"
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            class="field-input"
          >
        </div>
      </div>

      <!-- DE hours -->
      <div
        v-if="type === 'de_hours'"
        class="flex flex-col gap-4"
      >
        <div>
          <label
            class="field-label"
            for="add-entry-hours"
          >Hours</label>
          <input
            id="add-entry-hours"
            v-model="hours"
            type="number"
            min="0"
            step="0.5"
            placeholder="0"
            class="field-input"
          >
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-module"
          >Module <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
          <input
            id="add-entry-module"
            v-model="module"
            type="text"
            placeholder="Module name"
            class="field-input"
          >
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-platform"
          >Platform <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
          <input
            id="add-entry-platform"
            v-model="platform"
            type="text"
            placeholder="Platform"
            class="field-input"
          >
        </div>
        <fieldset
          v-if="mode === 'edit'"
          class="border-none p-0 m-0"
        >
          <legend class="field-label">
            Verified
          </legend>
          <div class="flex gap-5">
            <label class="flex items-center gap-1.5 text-sm text-cream cursor-pointer">
              <input
                v-model="verified"
                type="radio"
                :value="true"
              > Yes
            </label>
            <label class="flex items-center gap-1.5 text-sm text-cream cursor-pointer">
              <input
                v-model="verified"
                type="radio"
                :value="false"
              > No
            </label>
          </div>
        </fieldset>
      </div>

      <!-- Grade -->
      <div
        v-if="type === 'grades'"
        class="flex flex-col gap-4"
      >
        <div>
          <label
            class="field-label"
            for="add-entry-score"
          >Score</label>
          <input
            id="add-entry-score"
            v-model="score"
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="100"
            class="field-input"
          >
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-project"
          >Project <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
          <input
            id="add-entry-project"
            v-model="project"
            type="text"
            placeholder="Project"
            class="field-input"
          >
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-category"
          >Category <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
          <input
            id="add-entry-category"
            v-model="category"
            type="text"
            placeholder="Category"
            class="field-input"
          >
        </div>
        <div>
          <label
            class="field-label"
            for="add-entry-notes"
          >Notes <span class="font-normal normal-case tracking-normal">{{ optional }}</span></label>
          <input
            id="add-entry-notes"
            v-model="notes"
            type="text"
            placeholder="Notes"
            class="field-input"
          >
        </div>
      </div>

      <p
        v-if="error"
        class="text-[12px] text-app-error"
      >
        {{ error }}
      </p>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <button
          class="btn-outline"
          @click="close"
        >
          Cancel
        </button>
        <button
          :disabled="loading"
          class="btn-primary"
          @click="submit"
        >
          <span
            v-if="loading"
            class="spinner"
          />
          <span>{{ loading ? 'Saving…' : 'Save' }}</span>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
