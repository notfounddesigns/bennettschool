import './style.css';
import Alpine from 'alpinejs';
import { createAppStore } from './lib/store';
import { createDashboardStore, dashboardDisplayData } from './components/dashboard';
import { createMgmtStore, deModalData, gradesModalData, syncDialogData, resetPasswordData } from './components/mgmt';
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
Alpine.data('deModalData', deModalData);
Alpine.data('gradesModalData', gradesModalData);
Alpine.data('syncDialogData', syncDialogData);
Alpine.data('resetPasswordData', resetPasswordData);

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
