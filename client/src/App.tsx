import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { SignUp } from '@/pages/SignUp'
import { SignIn } from '@/pages/SignIn'
import { Dashboard } from '@/pages/Dashboard'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/register" element={<SignUp />} />
      <Route path="/login" element={<SignIn />} />

      {/* Protected routes — wrapped in ProtectedRoute */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>

      {/* Admin only example — ready for Phase 09 */}
      <Route element={<ProtectedRoute requiredRoles={['admin']} />}>
        <Route path="/admin" element={<div>Admin panel coming in Phase 09</div>} />
      </Route>

      {/* Default redirects */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/unauthorized"
        element={
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-gray-900">Access denied</h1>
              <p className="text-gray-500 mt-2">
                You don&apos;t have permission to view this page.
              </p>
            </div>
          </div>
        }
      />
    </Routes>
  )
}
