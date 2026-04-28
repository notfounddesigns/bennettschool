<script setup lang="ts">
import { useMgmtStore } from '../../stores/mgmt'

const mgmt = useMgmtStore()
</script>

<template>
  <!-- Summary stats -->
  <div class="grid grid-cols-3 gap-3 shrink-0">
    <div class="bg-white/8 border border-white/8 rounded-[14px] p-5">
      <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-2">Clocked In</div>
      <div class="font-serif text-[32px] text-sage leading-none tabular-nums">
        {{ mgmt.currentStudents.filter(s => s.is_clocked_in && !s.on_break).length }}
      </div>
    </div>
    <div class="bg-white/8 border border-white/8 rounded-[14px] p-5">
      <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-2">On Break</div>
      <div class="font-serif text-[32px] text-blush leading-none tabular-nums">
        {{ mgmt.currentStudents.filter(s => s.on_break).length }}
      </div>
    </div>
    <div class="bg-white/8 border border-white/8 rounded-[14px] p-5">
      <div class="text-[10px] text-muted uppercase tracking-[0.07em] mb-2">Total Today</div>
      <div class="font-serif text-[32px] text-cream leading-none tabular-nums">
        {{ mgmt.currentStudents.length }}
      </div>
    </div>
  </div>

  <!-- Timeclock student list -->
  <div class="flex-1 min-h-0 max-h-100 md:max-h-none bg-white rounded-[14px] shadow-card overflow-auto">
    <table class="w-full border-collapse text-[13px]">
      <thead class="sticky top-0 z-10 bg-cream">
        <tr>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Student</th>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Clock In</th>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border hidden sm:table-cell">Clock Out</th>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border hidden sm:table-cell">Hours</th>
          <th class="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted px-4 py-2.5 text-left border-b border-app-border">Status</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="mgmt.loading">
          <td colspan="5" class="text-center py-10 text-muted text-[13px]">
            <span class="spinner mr-2" style="vertical-align:middle;" />Loading…
          </td>
        </tr>
        <tr v-else-if="mgmt.currentStudents.length === 0">
          <td colspan="5" class="text-center py-10 text-muted text-[13px]">No students clocked in today.</td>
        </tr>
        <tr
          v-else
          v-for="entry in mgmt.currentStudents"
          :key="entry.name + entry.clock_in"
          class="even:bg-[#fafafa] hover:bg-[#f5f3f0] transition-colors"
        >
          <td class="px-4 py-2.5 border-b border-app-border">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-full bg-blush text-white flex items-center justify-center text-[11px] font-bold shrink-0 leading-none">
                {{ entry.name.split(' ').map((p: string) => p[0] ?? '').slice(0, 2).join('').toUpperCase() }}
              </div>
              <span class="font-medium text-charcoal">{{ entry.name }}</span>
            </div>
          </td>
          <td class="px-4 py-2.5 border-b border-app-border">
            <span class="tabular-nums text-charcoal">
              {{ new Date(entry.clock_in).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }}
            </span>
          </td>
          <td class="px-4 py-2.5 border-b border-app-border hidden sm:table-cell">
            <span class="tabular-nums text-charcoal">
              {{ entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—' }}
            </span>
          </td>
          <td class="px-4 py-2.5 border-b border-app-border hidden sm:table-cell">
            <span class="tabular-nums text-charcoal">{{ parseFloat(String(entry.worked_hours ?? 0)).toFixed(1) }}</span>
            <span class="text-muted text-[11px]"> hrs</span>
          </td>
          <td class="px-4 py-2.5 border-b border-app-border">
            <span v-if="entry.is_clocked_in && !entry.on_break" class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sage/15 text-sage">
              <span class="w-1.5 h-1.5 rounded-full bg-sage inline-block" />Clocked In
            </span>
            <span v-else-if="entry.on_break" class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blush/15 text-blush">
              <span class="w-1.5 h-1.5 rounded-full bg-blush inline-block" />On Break
            </span>
            <span v-else class="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted/10 text-muted">
              <span class="w-1.5 h-1.5 rounded-full bg-muted/60 inline-block" />Clocked Out
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
