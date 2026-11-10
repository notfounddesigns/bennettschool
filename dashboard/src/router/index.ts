import { createRouter, createWebHistory } from 'vue-router'
import { useAppStore } from '../stores/app.ts'
import { validateCachedEmployee } from '../lib/api.ts'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/login' },
    { path: '/login', component: () => import('../views/LoginView.vue'), meta: { guest: true } },
    { path: '/setpass', component: () => import('../views/SetPassView.vue'), meta: { auth: true } },
    { path: '/dashboard', component: () => import('../views/DashboardView.vue'), meta: { auth: true } },
    { path: '/mgmt', component: () => import('../views/MgmtView.vue'), meta: { auth: true, manager: true } },
    { path: '/:pathMatch(.*)*', redirect: '/login' },
  ],
})

router.beforeEach(async (to) => {
  const app = useAppStore()

  // Restore the saved session once, on first navigation.
  if (!app.sessionRestored) {
    app.sessionRestored = true
    const emp = app.readStoredEmployee()
    if (emp) {
      try {
        if (await validateCachedEmployee(emp.homebase_id)) app.setEmployee(emp)
        else app.clearEmployee()
      } catch {
        app.clearEmployee()
      }
    }
  }

  const home = app.isManager ? '/mgmt' : '/dashboard'

  if (to.meta.auth && !app.currentEmployee) return '/login'
  if (to.meta.guest && app.currentEmployee) return home
  if (to.meta.manager && !app.isManager) return '/dashboard'
  // Managers only see the student dashboard while "viewing as" a student.
  if (to.path === '/dashboard' && app.isManager && !app.isImpersonating) return '/mgmt'
  // Leaving the student dashboard ends "view as student".
  if (to.path !== '/dashboard' && app.isImpersonating) app.exitImpersonation()
})

export default router
