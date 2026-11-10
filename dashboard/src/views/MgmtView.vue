<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useMgmtStore } from '../stores/mgmt'
import TheTopbar from '../components/TheTopbar.vue'
import StudentsTab from '../components/mgmt/StudentsTab.vue'
import StudentDrawer from '../components/mgmt/StudentDrawer.vue'
import NeedsReviewTab from '../components/mgmt/NeedsReviewTab.vue'
import ActivityLogTab from '../components/mgmt/ActivityLogTab.vue'
import ExportDialog from '../components/mgmt/ExportDialog.vue'
import AddStudentDialog from '../components/mgmt/AddStudentDialog.vue'
import ResetPasswordDialog from '../components/mgmt/ResetPasswordDialog.vue'
import EditStudentDialog from '../components/mgmt/EditStudentDialog.vue'
import RemoveStudentDialog from '../components/mgmt/RemoveStudentDialog.vue'
import SetPinDialog from '../components/mgmt/SetPinDialog.vue'
import PunchPhotosDialog from '../components/mgmt/PunchPhotosDialog.vue'
import EntryDialog from '../components/mgmt/EntryDialog.vue'

const mgmt = useMgmtStore()
const activeTab = ref<'timeclock' | 'review' | 'activity'>('timeclock')

// Keep state (incl. an open drawer) when returning from "view as student".
onMounted(() => {
  if (!mgmt.loadedOnce) void mgmt.load()
})

function tabClass(tab: typeof activeTab.value) {
  return activeTab.value === tab ? 'bg-white/12 text-cream' : 'text-muted hover:text-cream'
}
</script>

<template>
  <div class="flex flex-col h-dvh overflow-hidden bg-app-bg text-blush font-sans text-[15px]">
    <TheTopbar show-sign-out />

    <main class="flex-1 flex flex-col items-center overflow-y-auto md:px-4 pt-4 md:pt-2 md:pb-2 w-full">
      <section class="screen-enter-active flex flex-col w-full max-w-11/12 mx-auto px-2 md:px-4 pb-3 md:pb-1 md:h-[calc(100dvh-56px-3rem)]">
        <div class="flex flex-col gap-3 h-full min-h-0">
          <!-- Tab bar -->
          <div class="flex gap-1 shrink-0">
            <button
              class="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer"
              :class="tabClass('timeclock')"
              @click="activeTab = 'timeclock'"
            >
              Student Mgmt
            </button>
            <button
              class="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer"
              :class="tabClass('review')"
              @click="activeTab = 'review'"
            >
              Needs Review - ({{ mgmt.needsReviewCount }})
            </button>
            <button
              class="px-4 py-1.5 rounded-full text-[12px] font-semibold transition-colors cursor-pointer"
              :class="tabClass('activity')"
              @click="activeTab = 'activity'"
            >
              Activity Log
            </button>
          </div>

          <StudentsTab v-show="activeTab === 'timeclock'" />
          <NeedsReviewTab v-show="activeTab === 'review'" />
          <ActivityLogTab v-show="activeTab === 'activity'" />
        </div>
      </section>
    </main>

    <StudentDrawer />

    <ExportDialog />
    <AddStudentDialog />
    <ResetPasswordDialog />
    <EditStudentDialog />
    <RemoveStudentDialog />
    <SetPinDialog />
    <PunchPhotosDialog />
    <EntryDialog />
  </div>
</template>
