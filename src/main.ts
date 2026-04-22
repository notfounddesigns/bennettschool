import './style.css';
import Alpine from 'alpinejs';
import { createAppStore } from './lib/store';
import { createDashboardStore, dashboardDisplayData } from './components/dashboard';
import { createMgmtStore, hoursModalData, gradesModalData, syncDialogData, resetPasswordData, inlineHoursData, addStudentData, exportDialogData, setPinData, overviewPanelData, mgmtTableData } from './components/mgmt';
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
Alpine.data('hoursModalData', hoursModalData);
Alpine.data('gradesModalData', gradesModalData);
Alpine.data('syncDialogData', syncDialogData);
Alpine.data('resetPasswordData', resetPasswordData);
Alpine.data('inlineHoursData', inlineHoursData);
Alpine.data('addStudentData', addStudentData);
Alpine.data('exportDialogData', exportDialogData);
Alpine.data('setPinData', setPinData);
Alpine.data('overviewPanelData', overviewPanelData);
Alpine.data('mgmtTableData', mgmtTableData);

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
