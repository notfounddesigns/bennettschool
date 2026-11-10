<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMgmtStore } from '../../stores/mgmt'
import { toTitleCase } from '../../lib/helpers'
import type { AuditAction } from '../../lib/api'

const mgmt = useMgmtStore()
const actionFilter = ref<'all' | AuditAction>('all')

const ACTION_LABELS: Record<AuditAction, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  grade_update: 'Edited a grade entry',
  grade_remove: 'Deleted a grade entry',
  de_hours_edit: 'Edited a DE hours entry',
  de_hours_remove: 'Removed a DE hours entry',
  timeclock_edit: 'Edited a timeclock entry',
  timeclock_add: 'Added a timeclock entry',
  timeclock_reviewed: 'Reviewed an auto-fixed timesheet',
  role_change: 'Updated a student profile',
  pin_reset: 'Reset a PIN',
  password_reset: 'Set a password',
  password_clear: 'Reset a password',
  student_removed: 'Removed a student',
  student_reactivated: 'Reactivated a student',
  needs_attention_resolved: 'Resolved a Needs Attention item',
  needs_attention_resolve_all: 'Resolved all Needs Attention items',
  view_as_student: 'Viewed a student dashboard',
}

const label = (a: AuditAction) => ACTION_LABELS[a] ?? a
const actions = computed(() => [...new Set(mgmt.auditLog.map(e => e.action))])
const rows = computed(() =>
  actionFilter.value === 'all' ? mgmt.auditLog : mgmt.auditLog.filter(e => e.action === actionFilter.value))

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

function metadata(m: Record<string, unknown> | null) {
  return m ? Object.entries(m).map(([k, v]) => `${k} : ${v}`).join(', ') : '—'
}

const th = 'text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border'
const td = 'px-4 py-2.5 border-b border-app-border'
</script>

<template>
  <div class="flex flex-col gap-3 flex-1 min-h-0">
    <div class="flex items-center gap-2 shrink-0">
      <select
        v-model="actionFilter"
        class="px-3 py-1.5 border border-white/15 rounded-[8px] bg-white/8 text-cream text-[12px] outline-none focus:border-blush"
      >
        <option
          class="text-charcoal"
          value="all"
        >
          All actions
        </option>
        <option
          v-for="a in actions"
          :key="a"
          :value="a"
          class="text-charcoal"
        >
          {{ label(a) }}
        </option>
      </select>
      <span
        v-if="mgmt.auditLog.length > 0"
        class="text-[11px] text-muted"
      >{{ rows.length }} entries</span>
    </div>

    <div class="flex-1 min-h-0 max-h-100 md:max-h-none bg-white rounded-card shadow-card overflow-auto">
      <table class="w-full border-collapse text-[13px]">
        <thead class="sticky top-0 z-10 bg-cream">
          <tr>
            <th :class="[th, 'whitespace-nowrap']">
              When
            </th>
            <th :class="[th, 'whitespace-nowrap']">
              Who
            </th>
            <th :class="[th, 'whitespace-nowrap']">
              Action
            </th>
            <th :class="th">
              Details
            </th>
            <th :class="th">
              Metadata
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="mgmt.loading">
            <td
              colspan="5"
              class="text-center py-10 text-muted text-[13px]"
            >
              <span
                class="spinner mr-2"
                style="vertical-align: middle;"
              />Loading…
            </td>
          </tr>
          <tr v-else-if="mgmt.auditLog.length === 0">
            <td
              colspan="5"
              class="text-center py-10 text-muted text-[13px]"
            >
              No activity recorded yet.
            </td>
          </tr>
          <template v-else>
            <tr
              v-for="entry in rows"
              :key="entry.id"
              class="even:bg-[#fafafa] hover:bg-[#f5f3f0] transition-colors"
            >
              <td :class="[td, 'tabular-nums text-charcoal whitespace-nowrap']">
                {{ when(entry.created_at) }}
              </td>
              <td :class="[td, 'text-charcoal whitespace-nowrap']">
                {{ entry.actor_name ? toTitleCase(entry.actor_name) : 'System' }}
              </td>
              <td :class="[td, 'text-charcoal whitespace-nowrap']">
                {{ label(entry.action) }}
              </td>
              <td :class="[td, 'text-muted']">
                {{ entry.description ?? '—' }}
              </td>
              <td :class="[td, 'text-muted']">
                {{ metadata(entry.metadata) }}
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>
