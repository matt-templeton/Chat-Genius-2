import { QueryClient } from "@tanstack/react-query";
interface MutationParams {
  url: string;
  method: string;
  body?: any;
}
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: async ({ queryKey }) => {
        // Get token from localStorage
        const token = localStorage.getItem("accessToken");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch(queryKey[0] as string, {
          credentials: "include",
          headers,
        });
        if (!res.ok) {
          if (res.status >= 500) {
            throw new Error(`${res.status}: ${res.statusText}`);
          }
          throw new Error(`${res.status}: ${await res.text()}`);
        }
        return res.json();
      },
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      mutationFn: async (variables: unknown) => {
        const token = localStorage.getItem("accessToken");
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        console.log("TOKEN:");
        console.log(token);
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
        const res = await fetch((variables as MutationParams).url, {
          method: (variables as MutationParams).method,
          headers,
          body: (variables as MutationParams).body
            ? JSON.stringify((variables as MutationParams).body)
            : undefined,
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        return res.json();
      },
      retry: false,
    },
  },
});
