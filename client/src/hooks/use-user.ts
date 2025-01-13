import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppDispatch } from '@/store';
import { loginStart, loginSuccess, loginFailure, logout } from '@/store/slices/auth-slice';

// Define the types based on OpenAPI spec
export interface User {
  id: number;
  username: string;
  email: string;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface LoginResponse {
  message: string;
  user: User;
}

async function fetchUser(): Promise<User | null> {
  const response = await fetch('/auth/users/me', {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }
    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function useUser() {
  const queryClient = useQueryClient();
  const dispatch = useAppDispatch();

  const { data: user, isLoading } = useQuery<User | null, Error>({
    queryKey: ['/auth/users/me'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false
  });

  const loginMutation = useMutation<LoginResponse, Error, LoginCredentials>({
    mutationFn: async (credentials) => {
      dispatch(loginStart());

      const response = await fetch("/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Login failed");
      }

      return data;
    },
    onSuccess: (data) => {
      dispatch(loginSuccess(data.user));
      queryClient.invalidateQueries({ queryKey: ['/auth/users/me'] });
    },
    onError: (error: Error) => {
      dispatch(loginFailure(error.message));
    }
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      return response.json();
    },
    onSuccess: () => {
      dispatch(logout());
      queryClient.invalidateQueries({ queryKey: ['/auth/users/me'] });
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}