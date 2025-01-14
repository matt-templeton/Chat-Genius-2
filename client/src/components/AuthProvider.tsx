import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import { validateToken } from '@/store/slices/auth-slice';
import { useLocation } from 'wouter';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const initAuth = async () => {
      try {
        await dispatch(validateToken()).unwrap();
      } catch (error) {
        // If we're not on the login or signup page, redirect to login
        if (!['/login', '/signup'].includes(window.location.pathname)) {
          setLocation('/login');
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, [dispatch, setLocation]);

  if (isLoading) {
    return null; // or a loading spinner
  }

  return <>{children}</>;
} 