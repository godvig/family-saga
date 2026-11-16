// Supabase Edge Function (Deno). All the logic is in logic.mjs, where Vitest can run it.
// Deploy it with JWT verification off (see ../README.md): the app's publishable key is not a JWT.
import { createHandler } from './logic.mjs';

Deno.serve(createHandler({ fetch }));
