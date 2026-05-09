export type Bindings = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  LICHESS_TOKEN: string;
};

export type User = {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: 'user' | 'admin';
  created_at: number;
};

export type Variables = {
  user: User;
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: Variables;
};
