import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { SignUp } from '@/pages/SignUp'
import { SignIn } from '@/pages/SignIn'
import { Dashboard } from '@/pages/Dashboard'
import { OAuthCallback } from './pages/OauthCallback'
import { ForgotPassword } from '@/pages/ForgotPassword'
import { ResetPassword } from '@/pages/ResetPassword'
import { VerifyEmail } from '@/pages/VerifyEmail'
import { AdminPanel } from './pages/AdminPanel'
import { AccountSettings } from '@/pages/AccountSettings'
import { MfaVerify } from './pages/MfaVerify'
import { MfaSetup } from './pages/MfaSetup'

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/register" element={<SignUp />} />
      <Route path="/login" element={<SignIn />} />
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="/mfa" element={<MfaVerify />} />

      {/* Protected routes — wrapped in ProtectedRoute */}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
      {/* Add account settings*/}
      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account" element={<AccountSettings />} />
      </Route>
      {/* Admin only example — ready for Phase 09 */}
      <Route element={<ProtectedRoute requiredRoles={['admin']} />}>
        <Route path="/admin" element={<AdminPanel />} />
      </Route>
      {/* MFA setup page */}
      <Route element={<ProtectedRoute />}>
        <Route path="/mfa/setup" element={<MfaSetup />} />
      </Route>

      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
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
