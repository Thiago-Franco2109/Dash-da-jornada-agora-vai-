import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a mock client that prints warnings but doesn't crash the app if credentials are missing
const createMockSupabase = () => {
  console.warn('Supabase credentials missing. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file. Running in MOCK mode.');
  
  const mockPromise = Promise.resolve({ data: [], error: null });
  const mockSinglePromise = Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'Mock mode: row not found' } });
  
  // Todo encadeador que o app usa precisa existir aqui: o que faltar não vira
  // "sem dado", vira TypeError e derruba a tela inteira. Localmente as env vars
  // do Supabase não existem (elas moram nas variáveis da Netlify), então este
  // mock é o caminho normal em `npm run dev` — ao usar um filtro novo
  // (.limit, .range, .in…), acrescente-o aqui junto.
  const chain: any = {
    select: () => chain,
    insert: () => mockPromise,
    upsert: () => mockPromise,
    // `update`/`delete` devolvem o chain, não a promise: quase todo uso real
    // filtra depois (`.delete().eq('id', …)`), e devolver promise crua fazia
    // esses casos estourarem com "eq is not a function". O chain é thenable,
    // então `await supabase.from(x).delete()` sem filtro continua funcionando.
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    neq: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    single: () => mockSinglePromise,
    maybeSingle: () => mockPromise,
    then: (onfulfilled: any) => onfulfilled({ data: [], error: null })
  };
  
  const mockClient = {
    from: () => chain
  };
  
  return mockClient as any;
};

export const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createMockSupabase();
