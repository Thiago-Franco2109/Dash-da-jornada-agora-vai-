import { useState, useEffect, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Status dos itens promocionais por parceiro/campanha (Function promo-status).
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/promo-status';

export type StatusCounts = {
    /** Contagens de item VIVO (ativo=1, arquivado=0) — o que o cliente vê no app. */
    rascunho: number;
    pendente: number;
    aprovado: number;
    /** Itens que existem mas saíram do ar (arquivado ou inativo), em qualquer status. */
    morto?: number;
    /** Há quantos dias o item pendente mais antigo desta campanha espera. null = sem data no banco. */
    pendenteDias?: number | null;
    pendenteDesde?: string | null;
};

/**
 * Estado de UMA campanha para UM parceiro, na ordem em que a tela decide:
 *   aprovado → tem item no ar agora (é a pergunta nº 1 da coluna);
 *   pendente → oferta pronta no painel, esperando o parceiro aceitar;
 *   rascunho → item começado e nunca publicado (trabalho do CS pela metade);
 *   caiu     → só sobrou item arquivado/inativo: já esteve no ar e saiu;
 *   sem item → a campanha roda na cidade e o parceiro não tem nenhum item nela.
 *
 * "aprovado" ganha de "pendente" de propósito: um parceiro com promo no ar E
 * um segundo item esperando aparecia como pendente e escondia que ele já tem
 * campanha rodando. O que cada estado tem em item continua visível no modal.
 */
export type PromoCampanhaStatus = 'pendente' | 'aprovado' | 'rascunho' | 'caiu' | 'sem item';

export interface PromoCampanhaDetalhe {
    campanha: string;
    /** `campanha_promocao.id` — monta o link do CMS. undefined = campanha fora da lista vigente. */
    campanhaId?: number;
    status: PromoCampanhaStatus;
    /** Dias esperando o parceiro, quando status = pendente. */
    dias?: number | null;
    /** Contagem crua de itens desta campanha, pro modal mostrar sem recalcular. */
    itens: { rascunho: number; pendente: number; aprovado: number; morto: number };
}

/** Resumo por parceiro (calculado no front) para a coluna Promoções. */
export interface PromoResumo {
    pendente: number;     // total de ITENS pendentes (oferta pronta, esperando o ok do parceiro)
    aprovado: number;     // total de ITENS aprovados e no ar
    rascunho: number;     // total de ITENS em rascunho
    semItem: number;      // nº de CAMPANHAS da cidade sem nenhum item pro parceiro
    caiu: number;         // nº de CAMPANHAS em que só restou item arquivado/inativo
    noAr: number;         // nº de CAMPANHAS com ao menos um item aprovado no ar
    campanhasCidade: number; // nº de campanhas vigentes rodando na cidade do parceiro
    /** false = não sabemos a localidade do parceiro (card do Trello, loja fora da
     *  réplica). "0 campanhas" aí significa "não sei", não "não tem". */
    cidadeConhecida: boolean;
    /** A espera mais longa entre as campanhas pendentes do parceiro. null = nenhuma com data. */
    pendenteDiasMax: number | null;
    detalhe: PromoCampanhaDetalhe[];
}

/** Campanha vigente no CMS (`campanha_promocao`). `id` monta o link do CMS. */
export interface CampanhaVigente {
    id: number;
    nome: string;
    /**
     * Nome do arquivo da imagem de capa (1200x400 no CMS), sem caminho —
     * ex: "96fce3ed-….png". null quando a campanha não tem capa cadastrada.
     * Vira URL com `resolveCapaCampanha` (usePromoItemArte.ts).
     */
    imagem: string | null;
}

export interface PromoStatusData {
    /**
     * TODA campanha vigente, tenha item ou não — é a mesma lista que o CS vê no
     * CMS.
     */
    campanhas: CampanhaVigente[];
    /** porParceiro[estabId][nomeCampanha] = { rascunho, pendente, aprovado, morto } */
    porParceiro: Record<string, Record<string, StatusCounts>>;
    /**
     * campanhasPorLocalidade[localidade_id] = nomes de campanha na cidade.
     * Vem do `config` da campanha no CMS, não dos itens já criados — então
     * inclui campanha que ninguém da cidade começou ainda.
     */
    campanhasPorLocalidade: Record<string, string[]>;
}

/** Ordem global das campanhas, pra coluna alinhar o mesmo slot em toda linha. */
export function ordemCampanhas(data: PromoStatusData): string[] {
    return data.campanhas.map(c => c.nome);
}

/**
 * Resumo de promoções de um parceiro: cruza os itens dele (porParceiro) com as
 * campanhas da cidade dele (campanhasPorLocalidade). Campanha na cidade sem
 * item pro parceiro = "sem item"; campanha em que só restou item arquivado =
 * "caiu".
 */
export function computePromoResumo(
    estabId: string,
    localidadeId: string | number | null | undefined,
    data: PromoStatusData,
): PromoResumo {
    const porCampanha = data.porParceiro[estabId] ?? {};
    const cityCampaigns = (localidadeId != null ? data.campanhasPorLocalidade[String(localidadeId)] : undefined) ?? [];
    const idPorNome = new Map(data.campanhas.map(c => [c.nome, c.id]));
    const todas = new Set<string>([...Object.keys(porCampanha), ...cityCampaigns]);

    let pendente = 0, aprovado = 0, rascunho = 0, semItem = 0, caiu = 0, noAr = 0;
    let pendenteDiasMax: number | null = null;
    const detalhe: PromoCampanhaDetalhe[] = [];
    for (const camp of todas) {
        const cc = porCampanha[camp];
        const itens = {
            rascunho: cc?.rascunho ?? 0,
            pendente: cc?.pendente ?? 0,
            aprovado: cc?.aprovado ?? 0,
            morto: cc?.morto ?? 0,
        };
        const campanhaId = idPorNome.get(camp);
        const vivos = itens.rascunho + itens.pendente + itens.aprovado;

        if (vivos === 0) {
            // Nenhum item no ar. Ter item morto conta uma história diferente de
            // nunca ter tido nada — e pede ação diferente do CS.
            if (itens.morto > 0) { caiu++; detalhe.push({ campanha: camp, campanhaId, status: 'caiu', itens }); }
            else { semItem++; detalhe.push({ campanha: camp, campanhaId, status: 'sem item', itens }); }
            continue;
        }

        pendente += itens.pendente; aprovado += itens.aprovado; rascunho += itens.rascunho;
        const status: PromoCampanhaStatus = itens.aprovado > 0 ? 'aprovado' : itens.pendente > 0 ? 'pendente' : 'rascunho';
        if (status === 'aprovado') noAr++;
        const dias = itens.pendente > 0 ? (cc?.pendenteDias ?? null) : null;
        // Sem data no banco fica null e nunca vira 0: "parado hoje" esconderia o caso mais antigo.
        if (dias != null && status === 'pendente') {
            pendenteDiasMax = pendenteDiasMax == null ? dias : Math.max(pendenteDiasMax, dias);
        }
        detalhe.push({ campanha: camp, campanhaId, status, dias, itens });
    }
    return {
        pendente, aprovado, rascunho, semItem, caiu, noAr,
        campanhasCidade: cityCampaigns.length,
        cidadeConhecida: localidadeId != null && String(localidadeId) !== '',
        pendenteDiasMax,
        detalhe,
    };
}

let _cache: PromoStatusData | null = null;
/** Request em voo, compartilhada: a tabela também chama o hook (pra ordem das
 *  campanhas) e sem isso dois componentes montando juntos fariam duas queries. */
let _inflight: Promise<PromoStatusData> | null = null;

async function fetchPromoStatus(): Promise<PromoStatusData> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar status de promoções.`);
    }
    return {
        campanhas: (json.campanhas ?? []) as CampanhaVigente[],
        porParceiro: json.porParceiro ?? {},
        campanhasPorLocalidade: json.campanhasPorLocalidade ?? {},
    };
}

export function usePromoStatus() {
    const [promoData, setPromoData] = useState<PromoStatusData>(_cache ?? { campanhas: [], porParceiro: {}, campanhasPorLocalidade: {} });
    const [loading, setLoading] = useState(!_cache);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        const req = (_inflight ??= fetchPromoStatus().finally(() => { _inflight = null; }));
        req
            .then(d => { _cache = d; setPromoData(d); setLoading(false); })
            .catch(err => { console.warn('[usePromoStatus] falha:', err); setError(err.message); setLoading(false); });
    }, []);

    useEffect(() => {
        if (_cache) return;
        load();
    }, [load]);

    return { promoData, loading, error, refetch: load };
}
