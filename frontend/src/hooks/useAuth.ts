import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, API_ORIGIN } from '../lib/api';

type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
};

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        return await api.get<{ user: User }>('/auth/me');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          return null;
        }
        throw err;
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  const user = data?.user ?? null;

  const login = () => {
    window.location.href = `${API_ORIGIN}/api/v1/auth/google`;
  };

  const devLogin = async () => {
    await api.post('/auth/dev-login');
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
  };

  const logout = async () => {
    await api.post('/auth/logout');
    queryClient.setQueryData(['auth', 'me'], null);
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isUnauthenticated: !isLoading && !user,
    login,
    devLogin,
    logout,
  };
}
