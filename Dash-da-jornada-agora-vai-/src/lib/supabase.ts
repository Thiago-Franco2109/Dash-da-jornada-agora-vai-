import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a mock client that prints warnings but doesn't crash the app if credentials are missing
const createMockSupabase = () => {
  console.warn('Supabase credentials missing. Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file. Running in MOCK mode.');
  
  const mockPromise = Promise.resolve({ data: [], error: null });
  const mockSinglePromise = Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'Mock mode: row not found' } });
  
  const chain: any = {
    select: () => chain,
    insert: () => mockPromise,
    upsert: () => mockPromise,
    update: () => mockPromise,
    delete: () => mockPromise,
    eq: () => chain,
    neq: () => chain,
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
