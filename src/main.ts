import './style.css';
import Alpine from 'alpinejs';
import { createAppStore } from './lib/store';
import { createDashboardStore, dashboardDisplayData, changePinData } from './components/dashboard';
import { createMgmtStore, hoursModalData, gradesModalData, syncDialogData, resetPasswordData, inlineHoursData, addStudentData, addStudentDirectData, exportDialogData, setPinData, overviewPanelData, mgmtTableData, editStudentNameData, removeStudentData, historyRowData, addEntryModalData, gradeRowData, punchPhotosModalData } from './components/mgmt';
import { compareTableData } from './components/compare';
import { loginData } from './components/login';
import { setpassData } from './components/setpass';
import { handleLogout, restoreSession } from './lib/auth';

// ── Register stores ───────────────────────────────────────────────────────

Alpine.store('app', createAppStore());
Alpine.store('dashboard', createDashboardStore());
Alpine.store('mgmt', createMgmtStore());

// ── Register component data functions ─────────────────────────────────────

Alpine.data('loginData', loginData);
Alpine.data('setpassData', setpassData);
Alpine.data('dashboardDisplayData', dashboardDisplayData);
Alpine.data('changePinData', changePinData);
Alpine.data('hoursModalData', hoursModalData);
Alpine.data('gradesModalData', gradesModalData);
Alpine.data('syncDialogData', syncDialogData);
Alpine.data('resetPasswordData', resetPasswordData);
Alpine.data('inlineHoursData', inlineHoursData);
Alpine.data('addStudentData', addStudentData);
Alpine.data('addStudentDirectData', addStudentDirectData);
Alpine.data('exportDialogData', exportDialogData);
Alpine.data('setPinData', setPinData);
Alpine.data('overviewPanelData', overviewPanelData);
Alpine.data('mgmtTableData', mgmtTableData);
Alpine.data('compareTableData', compareTableData);
Alpine.data('editStudentNameData', editStudentNameData);
Alpine.data('removeStudentData', removeStudentData);
Alpine.data('historyRowData', historyRowData);
Alpine.data('gradeRowData', gradeRowData);
Alpine.data('punchPhotosModalData', punchPhotosModalData);
Alpine.data('addEntryModalData', addEntryModalData);

// ── Global magic helpers ──────────────────────────────────────────────────

Alpine.magic('logout', () => handleLogout);

// ── Expose Alpine for devtools ────────────────────────────────────────────

// @ts-expect-error -- devtools access
window.Alpine = Alpine;

// ── Start Alpine before DOMContentLoaded so x-data/x-store are ready ─────

Alpine.start();

// ── Session restore ───────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  restoreSession();
});
