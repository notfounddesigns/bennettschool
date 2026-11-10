<script setup lang="ts">
import { ref, computed } from 'vue'
import { removeStudent } from '../../lib/api'
import { toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const app = useAppStore()
const loading = ref(false)
const { req, open, close, mgmt } = useDialog('removeStudent')
const displayName = computed(() => toTitleCase(req.value?.name ?? ''))

async function confirm() {
  const r = req.value
  if (!r) return
  const shownName = displayName.value
  loading.value = true
  app.showLoading()
  try {
    await removeStudent(r.id)
    app.audit('student_removed', { targetId: r.id, targetName: r.name, description: `Removed ${shownName} from the roster` })
    close()
    app.showSnackbar(`${shownName} has been removed.`, 'success')
    await mgmt.load()
  } catch {
    app.showSnackbar('Could not remove student. Please try again.', 'error')
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Remove Student"
    @close="close"
  >
    <div class="px-5.5 py-5">
      <p class="text-[13px] text-cream">
        Remove <span class="font-semibold">{{ displayName }}</span> from the student list?
      </p>
      <p class="text-[12px] text-muted mt-1.5">
        Their hours history will be preserved. This action cannot be undone from the UI.
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
          class="btn-danger"
          @click="confirm"
        >
          <span
            v-if="loading"
            class="spinner"
          />
          <span>{{ loading ? 'Removing…' : 'Remove' }}</span>
        </button>
      </div>
    </template>
  </AppDialog>
</template>
