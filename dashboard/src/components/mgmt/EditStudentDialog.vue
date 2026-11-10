<script setup lang="ts">
import { ref } from 'vue'
import { fetchRoles, updateStudentName, updateStudentRole, type Role } from '../../lib/api'
import { toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const app = useAppStore()
const homebaseId = ref(0)
const name = ref('')
const roleId = ref(1)
const roles = ref<Role[]>([])
const loading = ref(false)
const error = ref('')

fetchRoles().then(r => { roles.value = r }).catch(() => {})

const { open, close, mgmt } = useDialog('editStudent', r => {
  homebaseId.value = r.id
  name.value = r.name
  roleId.value = r.roleId ?? 1
  error.value = ''
})

async function submit() {
  const trimmed = name.value.trim().toLowerCase()
  if (!trimmed) {
    error.value = 'Name is required.'
    return
  }
  loading.value = true
  error.value = ''
  app.showLoading()
  try {
    await Promise.all([
      updateStudentName(homebaseId.value, trimmed),
      updateStudentRole(homebaseId.value, roleId.value),
    ])
    const roleName = roles.value.find(r => r.id === roleId.value)?.role_name ?? roleId.value
    app.audit('role_change', {
      targetId: homebaseId.value,
      targetName: trimmed,
      description: `Updated profile for ${toTitleCase(trimmed)} (role: ${roleName})`,
    })
    close()
    app.showSnackbar('Student updated.', 'success')
    await mgmt.load()
  } catch {
    error.value = 'Could not update student. Please try again.'
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Edit Student"
    @close="close"
  >
    <div class="px-5.5 py-5 flex flex-col gap-4">
      <div>
        <label
          class="field-label"
          for="edit-student-name-input"
        >Full Name</label>
        <input
          id="edit-student-name-input"
          v-model="name"
          type="text"
          placeholder="e.g. jane smith"
          class="field-input"
          @keydown.enter.prevent="submit"
        >
      </div>
      <div>
        <label
          class="field-label"
          for="edit-student-role"
        >Role</label>
        <select
          id="edit-student-role"
          v-model.number="roleId"
          class="field-input"
        >
          <option
            v-for="r in roles"
            :key="r.id"
            :value="r.id"
          >
            {{ r.role_name }}
          </option>
        </select>
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
