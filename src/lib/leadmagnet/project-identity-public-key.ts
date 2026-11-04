// Public anon JWT (not a secret): required by the Edge Function JWT gateway.
// This grants no privileges beyond the project's existing anonymous permissions.
// Rotate with the project's public API key; Anthropic and service keys stay in Supabase.
export const PROJECT_IDENTITY_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5b2JvZGFsd3RzcWR5cnF3a2prIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzY0NDEsImV4cCI6MjEwMzkxMjQ0MX0.VXixdVKGED6uWFC7xVNstztXkU4nxC8hJeH2253hS34";
