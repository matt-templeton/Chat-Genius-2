import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// Define the types based on OpenAPI spec
export interface User {
  id: number;
  username: string;
  email: string;
}

interface LoginCredentials {
  email: string;
  password: string;
  displayName?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type RequestResult = {
  ok: true;
  data?: AuthTokens;
} | {
  ok: false;
  message: string;
};

async function handleRequest(
  url: string,
  method: string,
  body?: LoginCredentials
): Promise<RequestResult> {
  try {
    const response = await fetch(`/auth${url}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });

    const contentType = response.headers.get("content-type");
    const isJson = contentType && contentType.includes("application/json");

    if (!response.ok) {
      const errorMessage = isJson 
        ? (await response.json()).message 
        : await response.text();

      if (response.status === 401) {
        return { ok: false, message: "Invalid email or password" };
      }

      return { ok: false, message: errorMessage };
    }

    if (isJson) {
      const data = await response.json();
      return { ok: true, data };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, message: e.toString() };
  }
}

async function fetchUser(): Promise<User | null> {
  const response = await fetch('/auth/users/me', {
    credentials: 'include'
  });

  if (!response.ok) {
    if (response.status === 401) {
      return null;
    }

    if (response.status >= 500) {
      throw new Error(`${response.status}: ${response.statusText}`);
    }

    throw new Error(`${response.status}: ${await response.text()}`);
  }

  return response.json();
}

export function useUser() {
  const queryClient = useQueryClient();

  const { data: user, error, isLoading } = useQuery<User | null, Error>({
    queryKey: ['/auth/users/me'],
    queryFn: fetchUser,
    staleTime: Infinity,
    retry: false
  });

  const loginMutation = useMutation<RequestResult, Error, LoginCredentials>({
    mutationFn: (userData) => handleRequest('/login', 'POST', userData),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['/auth/users/me'] });
      }
    },
  });

  const logoutMutation = useMutation<RequestResult, Error>({
    mutationFn: () => handleRequest('/logout', 'POST'),
    onSuccess: (result) => {
      if (result.ok) {
        queryClient.invalidateQueries({ queryKey: ['/auth/users/me'] });
      }
    },
  });

  return {
    user,
    isLoading,
    error,
    login: loginMutation.mutateAsync,
    logout: logoutMutation.mutateAsync,
  };
}