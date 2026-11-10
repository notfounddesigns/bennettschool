import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.ts'
import { useDashboardStore } from '../stores/dashboard.ts'
import { useMgmtStore } from '../stores/mgmt.ts'

export function useAuth() {
  const router = useRouter()
  const app = useAppStore()
  const dashboard = useDashboardStore()
  const mgmt = useMgmtStore()

  // Route a freshly signed-in user to their home screen.
  async function goHome() {
    const emp = app.currentEmployee
    if (!emp) return router.push('/login')
    if (app.isManager) return router.push('/mgmt')
    dashboard.reset()
    return router.push('/dashboard')
  }

  function logout() {
    const emp = app.currentEmployee
    if (emp) {
      app.audit('logout', {
        targetId: emp.homebase_id,
        targetName: emp.name,
        description: `${emp.name} signed out`,
      })
    }
    app.clearEmployee()
    dashboard.reset()
    mgmt.reset()
    return router.push('/login')
  }

  return { goHome, logout }
}
