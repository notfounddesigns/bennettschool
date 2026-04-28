import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '../stores/app'
import { validateCachedEmployee } from '../lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
    { path: '/setpass', component: () => import('../views/SetPassView.vue'), meta: { auth: true } },
    { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { auth: true } },
    { path: '/mgmt', component: () => import('../views/MgmtView.vue'), meta: { auth: true } },
  ],
})

router.beforeEach(async (to) => {
  const app = useAppStore()

  // Restore session from localStorage once on first navigation
  if (!app.sessionRestored) {
    app.sessionRestored = true
    const raw = localStorage.getItem('employee')
    if (raw) {
      try {
        const emp = JSON.parse(raw)
        const valid = await validateCachedEmployee(emp.id)
        if (valid) {
          app.setEmployee(emp)
        } else {
          localStorage.removeItem('employee')
        }
      } catch {
        localStorage.removeItem('employee')
      }
    }
  }

  if (to.meta.auth && !app.currentEmployee) return '/login'
  if (to.meta.guest && app.currentEmployee) return app.isManager ? '/mgmt' : '/dashboard'
})

export default router
