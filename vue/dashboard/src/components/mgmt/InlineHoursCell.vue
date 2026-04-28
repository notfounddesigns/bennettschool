<script setup lang="ts">
import { ref } from 'vue'
import { submitHours } from '../../lib/api'
import { useAppStore } from '../../stores/app'
import { todayIso } from '../../lib/helpers'

const props = defineProps<{
  employeeId: number
  typeId: 1 | 2
  currentValue: string
}>()

const emit = defineEmits<{ saved: [] }>()

const app = useAppStore()
const mode = ref<'idle' | 'add' | 'edit'>('idle')
const value = ref('')
const originalValue = ref(0)
const saving = ref(false)

function startAdd() {
  value.value = ''
  originalValue.value = 0
  mode.value = 'add'
}

function startEdit() {
  originalValue.value = parseFloat(props.currentValue) || 0
  value.value = props.currentValue
  mode.value = 'edit'
}

function cancel() {
  mode.value = 'idle'
  value.value = ''
  originalValue.value = 0
}

async function save() {
  const target = parseFloat(value.value)
  if (isNaN(target) || target < 0) { cancel(); return }

  const hrs = mode.value === 'edit' ? target - originalValue.value : target
  if (hrs === 0) { cancel(); return }
  if (mode.value === 'add' && hrs < 0) { cancel(); return }

  saving.value = true
  app.showLoading()
  try {
    await submitHours({
      homebase_id: props.employeeId,
      type_id: props.typeId,
      date: todayIso(),
      hours: String(hrs),
      module: '',
      platform: '',
      verified: true,
    })
    cancel()
    emit('saved')
  } catch (err) {
    app.showSnackbar(err instanceof Error ? err.message : 'Save failed', 'error')
  } finally {
    saving.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <!-- Idle display -->
  <div v-if="mode === 'idle'" class="flex items-center gap-1.5">
    <span class="tabular-nums text-charcoal">{{ currentValue }}</span>
    <span class="text-muted text-[11px]">hrs</span>
    <button
      @click="startAdd"
      title="Add"
      class="w-5 h-5 rounded-full bg-blush/15 text-blush text-[12px] font-bold cursor-pointer hover:bg-blush/30 transition-colors shrink-0 inline-flex items-center justify-center leading-none"
    >+</button>
    <button
      @click="startEdit"
      title="Edit"
      class="w-5 h-5 rounded-full bg-muted/15 text-muted cursor-pointer hover:bg-muted/25 transition-colors shrink-0 inline-flex items-center justify-center"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
  </div>

  <!-- Edit input -->
  <div v-else class="flex items-center gap-1">
    <input
      v-model="value"
      type="number"
      min="0"
      step="0.5"
      @keydown.enter="save"
      @keydown.escape="cancel"
      class="w-14 px-1.5 py-[3px] text-[12px] border border-blush rounded-[4px] bg-cream text-charcoal outline-none"
    />
    <button
      @click="save"
      :disabled="saving"
      class="w-6 h-6 rounded-full bg-sage/20 text-sage cursor-pointer hover:bg-sage/35 transition-colors disabled:opacity-40 shrink-0 inline-flex items-center justify-center"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <button
      @click="cancel"
      class="w-6 h-6 rounded-full bg-app-error/15 text-app-error cursor-pointer hover:bg-app-error/25 transition-colors shrink-0 inline-flex items-center justify-center"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  </div>
</template>
