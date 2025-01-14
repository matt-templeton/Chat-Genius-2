import { useEffect } from 'react';
import { useAppDispatch } from '@/store';
import { logout } from '@/store/slices/auth-slice';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  // Handle token validation and auto-logout
  useEffect(() => {
    const validateToken = async () => {
      try {
        const response = await fetch('/api/v1/auth/validate', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          }
        });
        
        if (!response.ok) {
          // If token validation fails, logout
          dispatch(logout());
        }
      } catch (error) {
        dispatch(logout());
      }
    };

    validateToken();
  }, [dispatch]);

  return <>{children}</>;
} 