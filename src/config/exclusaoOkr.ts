/**
 * Lojas fora da conta da OKR.
 *
 * Os três KRs medem a base das cidades da OKR, e parte dela não é parceiro que
 * o CS consiga mover: loja vendida, operação encerrada, cadastro duplicado,
 * parceiro que nunca abriu. Enquanto ficam no denominador, o KR2 mede o
 * cadastro em vez da adoção.
 *
 * A exclusão vale para os TRÊS KRs — uma decisão por loja, não uma por métrica.
 * O motivo é obrigatório: o número vai para o CEO, e "por que 102 e não 108?"
 * precisa ter resposta na tela.
 *
 * Estado no Supabase (`okr_excluido`), não no localStorage: a OKR é uma só, e
 * dois CS olhando bases diferentes reportam semanas diferentes. Ver
 * supabase/okr_excluido.sql.
 */

export type MotivoExclusao =
    | 'vendeu_loja'
    | 'encerrou_atividades'
    | 'nunca_operou'
    | 'duplicado'
    | 'fora_do_perfil'
    | 'sazonal'
    | 'outro';

export interface MotivoExclusaoDef {
    motivo: MotivoExclusao;
    label: string;
    /** Rótulo curto pro chip da lista. */
    chip: string;
    icon: string;
    /** Pede texto livre ao escolher. */
    pedeDetalhe?: boolean;
}

export const MOTIVOS_EXCLUSAO: MotivoExclusaoDef[] = [
    {
        motivo: 'encerrou_atividades',
        label: 'Encerrou as atividades',
        chip: 'Encerrou',
        icon: 'storefront',
    },
    {
        motivo: 'vendeu_loja',
        label: 'Vendeu a loja / trocou de dono',
        chip: 'Vendeu a loja',
        icon: 'swap_horiz',
    },
    {
        motivo: 'nunca_operou',
        label: 'Nunca chegou a operar',
        chip: 'Nunca abriu',
        icon: 'block',
    },
    {
        motivo: 'duplicado',
        label: 'Cadastro duplicado ou de teste',
        chip: 'Duplicado',
        icon: 'content_copy',
    },
    {
        motivo: 'fora_do_perfil',
        label: 'Fora do perfil da OKR (não é delivery)',
        chip: 'Fora do perfil',
        icon: 'filter_alt_off',
    },
    {
        motivo: 'sazonal',
        label: 'Operação sazonal (só abre em parte do ano)',
        chip: 'Sazonal',
        icon: 'calendar_month',
    },
    {
        motivo: 'outro',
        label: 'Outro motivo',
        chip: 'Outro',
        icon: 'more_horiz',
        pedeDetalhe: true,
    },
];

export function motivoExclusaoDef(motivo: string): MotivoExclusaoDef {
    return MOTIVOS_EXCLUSAO.find(m => m.motivo === motivo) ?? MOTIVOS_EXCLUSAO[MOTIVOS_EXCLUSAO.length - 1];
}

export interface ExclusaoOkr {
    partnerId: string;
    motivo: MotivoExclusao;
    observacao: string | null;
    nome: string | null;
    cidade: string | null;
    excluidoEm: string;
    excluidoPor: string | null;
}

export type ExclusaoMap = Record<string, ExclusaoOkr>;
