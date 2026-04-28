<script setup lang="ts">
import { ref, watch } from 'vue'
import { loadStudents, submitHours, type HomebaseEmployee } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import { todayIso } from '../../lib/helpers'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; saved: [] }>()

const app = useAppStore()
const dialogEl = ref<HTMLDialogElement>()

const students = ref<HomebaseEmployee[]>([])
const studentsLoading = ref(false)
const error = ref('')
const loading = ref(false)

const studentId = ref('')
const typeId = ref('1')
const date = ref(todayIso())
const hours = ref('')
const module = ref('')
const platform = ref('')
const verified = ref('true')

const types = [{ id: 1, name: 'In Person' }, { id: 2, name: 'DE' }]

watch(() => props.open, async (val) => {
  if (val) {
    error.value = ''
    studentId.value = ''
    typeId.value = '1'
    date.value = todayIso()
    hours.value = ''
    module.value = ''
    platform.value = ''
    verified.value = 'true'
    studentsLoading.value = true
    app.showLoading()
    try {
      students.value = await loadStudents()
    } catch {
      students.value = []
    } finally {
      studentsLoading.value = false
      app.hideLoading()
    }
    dialogEl.value?.showModal()
  } else {
    dialogEl.value?.close()
  }
})

function close() { emit('update:open', false) }

async function submit() {
  if (typeId.value === '2') {
    if (!studentId.value || !date.value || !module.value || !platform.value || !hours.value || !verified.value) {
      error.value = 'All fields are required.'
      return
    }
  } else {
    if (!studentId.value || !date.value || !hours.value) {
      error.value = 'All fields are required.'
      return
    }
  }

  loading.value = true
  app.showLoading()
  try {
    await submitHours({
      homebase_id: Number(studentId.value),
      type_id: Number(typeId.value),
      date: date.value,
      hours: hours.value,
      module: module.value,
      platform: platform.value,
      verified: verified.value === 'true',
    })
    close()
    emit('saved')
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'An error occurred while submitting hours.'
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal border-none rounded-[14px] shadow-[var(--shadow-lg)] p-0 w-[clamp(300px,92vw,480px)] max-h-[90vh] overflow-y-auto bg-modal-bg m-auto"
    @cancel.prevent="close"
  >
    <div class="flex items-center justify-between px-[22px] py-[18px] border-b border-app-border">
      <span class="font-serif text-lg text-cream">Enter Hours</span>
      <button @click="close" class="bg-transparent border-none text-[22px] text-cream cursor-pointer leading-none px-1 hover:text-charcoal">&times;</button>
    </div>

    <div class="px-[22px] py-5 flex flex-col">
      <div v-if="error" class="px-[14px] py-[10px] rounded-[8px] text-[13px] mb-4 leading-relaxed bg-error-light text-app-error">{{ error }}</div>

      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Student</label>
        <select v-model="studentId" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none">
          <option value="">{{ studentsLoading ? 'Loading…' : 'Select a student…' }}</option>
          <option v-for="s in students" :key="s.id" :value="s.id">
            {{ (s.first_name + ' ' + s.last_name).replace(/\b\w/g, (c: string) => c.toUpperCase()) }}
          </option>
        </select>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Type</label>
        <select v-model="typeId" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none">
          <option v-for="t in types" :key="t.id" :value="String(t.id)">{{ t.name }}</option>
        </select>
      </div>

      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Date</label>
        <input v-model="date" type="date" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none" />
      </div>

      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Hours</label>
        <input v-model="hours" type="number" min="0" step="0.5" placeholder="0" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none" />
      </div>

      <div v-if="typeId === '2'" class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Module</label>
        <input v-model="module" type="text" placeholder="Module name" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush placeholder:text-muted" />
      </div>

      <div v-if="typeId === '2'" class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Platform</label>
        <input v-model="platform" type="text" placeholder="Platform" class="w-full px-[14px] py-[10px] border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush placeholder:text-muted" />
      </div>

      <fieldset v-if="typeId === '2'" class="mb-4 border-none p-0 m-0">
        <legend class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Verified</legend>
        <div class="flex gap-5">
          <label class="flex items-center gap-1.5 text-sm text-cream cursor-pointer">
            <input v-model="verified" type="radio" value="true" /> Yes
          </label>
          <label class="flex items-center gap-1.5 text-sm text-cream cursor-pointer">
            <input v-model="verified" type="radio" value="false" /> No
          </label>
        </div>
      </fieldset>
    </div>

    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="submit" :disabled="loading" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">
        <span v-if="loading" class="spinner" />
        {{ loading ? 'Saving…' : 'Save' }}
      </button>
    </div>
  </dialog>
</template>
