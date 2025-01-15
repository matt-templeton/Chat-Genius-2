import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAppDispatch, useAppSelector } from '@/store';
import { checkAuth } from '@/store/slices/auth-slice';

const PUBLIC_ROUTES = ["/login", "/signup"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const dispatch = useAppDispatch();
  const { isAuthenticated, loading } = useAppSelector((state) => state.auth);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // First check if the token is valid
        await dispatch(checkAuth()).unwrap();

        // If we're authenticated, fetch the full user profile
        const token = localStorage.getItem("accessToken");
        if (token) {
          const response = await fetch("/api/v1/users/me", {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });

          if (!response.ok) {
            throw new Error("Failed to fetch user profile");
          }

          const userData = await response.json();
          // Update the user data in the store
          dispatch({ type: "auth/updateUser", payload: userData });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        if (!PUBLIC_ROUTES.includes(location)) {
          window.location.href = "/login";
        }
      }
    };

    fetchUserData();
  }, [dispatch, location]);

  // Show nothing while checking auth status for protected routes
  if (loading && !PUBLIC_ROUTES.includes(location)) {
    return null;
  }

  // Redirect to login for protected routes when not authenticated
  if (!loading && !isAuthenticated && !PUBLIC_ROUTES.includes(location)) {
    window.location.href = "/login";
    return null;
  }

  return <>{children}</>;
} 