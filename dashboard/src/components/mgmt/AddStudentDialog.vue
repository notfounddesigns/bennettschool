<script setup lang="ts">
import { ref } from 'vue'
import { fetchRoles, setEmployeePassword, updateStudentRole, type Role } from '../../lib/api'
import { toTitleCase } from '../../lib/helpers'
import { useAppStore } from '../../stores/app'
import AppDialog from '../AppDialog.vue'
import { useDialog } from './useDialog'

const DEFAULT_PASSWORD = 'Welcome123'

const app = useAppStore()
const firstName = ref('')
const lastName = ref('')
const roles = ref<Role[]>([])
const roleId = ref(1)
const loading = ref(false)
const error = ref('')

const { open, close, mgmt } = useDialog('addStudent', async () => {
  firstName.value = ''
  lastName.value = ''
  roleId.value = 1
  error.value = ''
  try {
    roles.value = await fetchRoles()
  } catch {
    roles.value = []
  }
})

async function submit() {
  error.value = ''
  const first = firstName.value.trim()
  const last = lastName.value.trim()
  if (!first || !last) {
    error.value = !first && !last
      ? 'First and last name are required.'
      : !first ? 'First name is required.' : 'Last name is required.'
    return
  }
  const name = `${first} ${last}`.toLowerCase()
  // Students added here aren't in HomeBase, so they get a synthetic id.
  const homebaseId = Date.now()
  loading.value = true
  app.showLoading()
  try {
    await setEmployeePassword(homebaseId, name, DEFAULT_PASSWORD)
    await updateStudentRole(homebaseId, roleId.value)
    close()
    app.showSnackbar(`${toTitleCase(name)} added. Default password: ${DEFAULT_PASSWORD}`, 'success')
    await mgmt.load()
  } catch {
    error.value = 'Could not add student. Please try again.'
  } finally {
    loading.value = false
    app.hideLoading()
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Add New Student"
    width="440px"
    @close="close"
  >
    <div
      class="px-5.5 py-5 flex flex-col gap-4"
      @keydown.enter="submit"
    >
      <div>
        <label
          class="field-label"
          for="new-student-first"
        >First Name</label>
        <input
          id="new-student-first"
          v-model="firstName"
          type="text"
          placeholder="Jane"
          class="field-input"
        >
      </div>
      <div>
        <label
          class="field-label"
          for="new-student-last"
        >Last Name</label>
        <input
          id="new-student-last"
          v-model="lastName"
          type="text"
          placeholder="Smith"
          class="field-input"
        >
      </div>
      <div>
        <label
          class="field-label"
          for="new-student-role"
        >Role</label>
        <select
          id="new-student-role"
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
      <p class="text-[11px] text-muted">
        The student will log in with the default password <span class="font-semibold text-cream">{{ DEFAULT_PASSWORD }}</span> and be prompted to set their own.
      </p>
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
          :disabled="loading"
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
          Add Student
        </button>
      </div>
    </template>
  </AppDialog>
</template>
