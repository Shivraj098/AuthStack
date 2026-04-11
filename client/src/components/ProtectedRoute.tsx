import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

interface ProtectedRouteProps {
  requiredRoles?: string[]
}

export function ProtectedRoute({ requiredRoles }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, user } = useAuth()
  const location = useLocation()

  // Show nothing while checking session — prevents flash of login page
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    // Save where they were trying to go so we can redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Check role-based access if roles are specified
  if (requiredRoles && user) {
    const hasRequiredRole = requiredRoles.some((role) => user.roles.includes(role))

    if (!hasRequiredRole) {
      return <Navigate to="/unauthorized" replace />
    }
  }

  // Render the child route
  return <Outlet />
}
