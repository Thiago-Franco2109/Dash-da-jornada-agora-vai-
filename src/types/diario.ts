import type { CategoriaDiarioId } from '../config/diarioCategorias';

/** Uma anotação do diário, já no formato que a tela consome. Ver supabase/diario_cs.sql. */
export interface AnotacaoDiario {
    id: string;
    perfil: string;
    /** Quando aconteceu (não quando foi digitado), ISO. */
    ocorridoEm: string;
    texto: string;
    categoria: CategoriaDiarioId | null;
    /** estab_id — nome nunca identifica loja, ver utils/partnerIdentity.ts. */
    partnerId: string | null;
    /** Nome no momento da anotação, pra o relatório antigo continuar legível. */
    partnerNome: string | null;
    /** Cadeado: nunca sai no relatório pro chefe. */
    privado: boolean;
    atualizadoEm: string;
}

/** Campos que a tela manda ao criar. Só `texto` é obrigatório. */
export interface NovaAnotacao {
    texto: string;
    categoria?: CategoriaDiarioId | null;
    partnerId?: string | null;
    partnerNome?: string | null;
    privado?: boolean;
    /** Default: agora. Dia passado usa meio-dia — ver instanteParaDia(). */
    ocorridoEm?: string;
}

/** Campos editáveis depois de salvo. */
export type PatchAnotacao = Partial<Omit<AnotacaoDiario, 'id' | 'perfil' | 'atualizadoEm'>>;
