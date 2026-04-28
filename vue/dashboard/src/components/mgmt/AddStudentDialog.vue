<script setup lang="ts">
import { ref, watch } from 'vue'
import { loadStudents, setEmployeePassword, type HomebaseEmployee } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import { useMgmtStore } from '../../stores/mgmt'
import { toTitleCase } from '../../lib/helpers'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [boolean]; saved: [] }>()

const app = useAppStore()
const mgmt = useMgmtStore()
const dialogEl = ref<HTMLDialogElement>()

const students = ref<HomebaseEmployee[]>([])
const studentsLoading = ref(false)
const error = ref('')
const studentId = ref('')

watch(() => props.open, async (val) => {
  if (val) {
    error.value = ''
    studentId.value = ''
    studentsLoading.value = true
    app.showLoading()
    try {
      const all = await loadStudents()
      const existingIds = new Set(mgmt.employees.map(e => e.homebase_id))
      students.value = all.filter(s => !existingIds.has(s.id))
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
  error.value = ''
  if (!studentId.value) { error.value = 'Please select a student.'; return }

  const student = students.value.find(s => s.id === Number(studentId.value))
  if (!student) { error.value = 'Student not found.'; return }

  app.showLoading()
  try {
    const name = `${student.first_name} ${student.last_name}`.toLowerCase()
    await setEmployeePassword(student.id, name, 'Welcome123')
    close()
    app.showSnackbar(`${toTitleCase(name)} added. Default password: Welcome123`, 'success')
    emit('saved')
  } catch {
    error.value = 'Could not add student. Please try again.'
  } finally {
    app.hideLoading()
  }
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="modal border-none rounded-[14px] shadow-[var(--shadow-lg)] p-0 w-[clamp(300px,92vw,460px)] bg-modal-bg m-auto"
    @cancel.prevent="close"
  >
    <div class="flex items-center justify-between px-[22px] py-[18px] border-b border-app-border">
      <span class="font-serif text-lg text-cream">Add Student</span>
    </div>
    <div class="px-[22px] py-5">
      <div class="mb-4">
        <label class="block text-xs font-semibold uppercase tracking-[0.07em] text-muted mb-1.5">Student</label>
        <p v-if="studentsLoading" class="text-[13px] text-muted">Loading…</p>
        <p v-else-if="students.length === 0" class="text-[13px] text-muted">All HomeBase employees are already enrolled.</p>
        <select v-else v-model="studentId" class="w-full px-3.5 py-2.5 border border-app-border rounded-[8px] bg-cream text-charcoal outline-none focus:border-blush appearance-none">
          <option value="">Select a student…</option>
          <option v-for="s in students" :key="s.id" :value="s.id">{{ s.first_name }} {{ s.last_name }}</option>
        </select>
      </div>
      <p class="text-[11px] text-muted">The student will log in with the default password <span class="font-semibold text-cream">Welcome123</span> and be prompted to set their own.</p>
      <p v-if="error" class="mt-3 text-[12px] text-app-error">{{ error }}</p>
    </div>
    <div class="flex gap-2.5 justify-end px-[22px] pb-[18px] pt-3.5 border-t border-app-border">
      <button @click="close" class="inline-flex items-center justify-center text-blush border border-blush rounded-[8px] h-[38px] px-[18px] text-[15px] font-medium cursor-pointer bg-transparent hover:border-blush-hover hover:text-blush-hover transition-all">Cancel</button>
      <button @click="submit" :disabled="studentsLoading || students.length === 0" class="inline-flex items-center justify-center gap-2 h-[38px] px-[18px] font-medium cursor-pointer rounded-[8px] bg-blush text-white hover:bg-blush-hover active:scale-[0.985] disabled:opacity-45 disabled:cursor-not-allowed transition-all">Add Student</button>
    </div>
  </dialog>
</template>
