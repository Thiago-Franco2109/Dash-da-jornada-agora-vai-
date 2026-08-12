import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase para uso EM FUNCTION (servidor).
 *
 * A escrita exige uma chave de SERVIDOR. Não é preciosismo: a chave do front
 * (publishable/anon) é embutida no bundle do navegador — é pública por
 * construção. Se o snapshot pudesse ser gravado com ela, qualquer pessoa com o
 * JS da página poderia forjar a série histórica, que é justamente o dado que a
 * tabela existe para tornar confiável.
 *
 * Aceita os dois sistemas de chave do Supabase, porque o painel mudou:
 *   • novo    → `SUPABASE_SECRET_KEY`        (`sb_secret_…`)
 *   • legado  → `SUPABASE_SERVICE_ROLE_KEY`  (JWT `service_role`)
 * Os dois ignoram RLS; para o supabase-js são só a string da chave.
 *
 * Leitura pode usar a chave pública (a policy de select é aberta).
 */

const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_PUBLISHABLE_KEY
    ?? process.env.SUPABASE_ANON_KEY
    ?? process.env.VITE_SUPABASE_ANON_KEY;

export class SupabaseIndisponivel extends Error {}

function cliente(chave: string | undefined, qual: string): SupabaseClient {
    if (!URL) throw new SupabaseIndisponivel('SUPABASE_URL (ou VITE_SUPABASE_URL) não configurada');
    if (!chave) throw new SupabaseIndisponivel(`${qual} não configurada`);
    return createClient(URL, chave, { auth: { persistSession: false } });
}

/** Escrita — chave de servidor apenas. */
export function supabaseAdmin(): SupabaseClient {
    return cliente(SERVICE_KEY, 'SUPABASE_SECRET_KEY (ou SUPABASE_SERVICE_ROLE_KEY)');
}

/** Leitura — chave de servidor se houver, senão a pública. */
export function supabaseLeitura(): SupabaseClient {
    return cliente(SERVICE_KEY ?? ANON_KEY, 'nenhuma chave do Supabase');
}

export const temSupabase = Boolean(URL && (SERVICE_KEY ?? ANON_KEY));
export const podeGravar = Boolean(URL && SERVICE_KEY);
