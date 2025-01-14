import { useEffect } from 'react';
import { useAppDispatch } from '@/store';
import { checkAuth } from '@/store/slices/auth-slice';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(checkAuth());
  }, [dispatch]);

  return <>{children}</>;
} 