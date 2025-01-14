export const api = {
  fetch: async (url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem('accessToken');
    const headers = {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      throw new Error('API request failed');
    }
    return response.json();
  },
}; 