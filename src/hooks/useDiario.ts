import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AnotacaoDiario, NovaAnotacao, PatchAnotacao } from '../types/diario';
import { isCategoriaDiario } from '../config/diarioCategorias';
import { inicioDoDiaSP, fimDoDiaSP } from '../utils/diarioDatas';

// ─────────────────────────────────────────────────────────────────────────
// Diário do CS — Supabase `diario_cs`.
//
// Diferente de useCrmNotes, aqui NÃO dá pra cachear a tabela inteira em
// memória: o diário cresce pra sempre (uma linha por acontecimento, append-only)
// enquanto crm_notas tem no máximo uma linha por parceiro. Então a busca é por
// intervalo de datas, e o que se compartilha entre instâncias é só o aviso de
// "mudou, recarrega" — a anotação rápida (Ctrl+J, montada no App) e a aba
// Diário são duas instâncias vivas ao mesmo tempo, e anotar num lugar precisa
// aparecer no outro sem recarregar a página.
// ─────────────────────────────────────────────────────────────────────────

const COLUNAS = 'id, perfil, ocorrido_em, texto, categoria, partner_id, partner_nome, privado, atualizado_em';

/** Instâncias vivas do hook, pra uma escrita num lugar refletir nas outras. */
const inscritos = new Set<() => void>();

function avisarMudanca() {
    for (const fn of inscritos) fn();
}

interface LinhaDiario {
    id: string;
    perfil: string;
    ocorrido_em: string;
    texto: string;
    categoria: string | null;
    partner_id: string | null;
    partner_nome: string | null;
    privado: boolean;
    atualizado_em: string;
}

function daLinha(row: LinhaDiario): AnotacaoDiario {
    return {
        id: String(row.id),
        perfil: row.perfil,
        ocorridoEm: row.ocorrido_em,
        texto: row.texto ?? '',
        // Categoria que saiu da lista (renomeada, removida) vira null em vez de
        // quebrar a tipagem — getCategoriaDiario() resolve pra "Outro".
        categoria: isCategoriaDiario(row.categoria) ? row.categoria : null,
        partnerId: row.partner_id,
        partnerNome: row.partner_nome,
        privado: Boolean(row.privado),
        atualizadoEm: row.atualizado_em,
    };
}

/**
 * Anotações de um perfil num intervalo de dias (YYYY-MM-DD, inclusive nas duas
 * pontas), da mais recente pra mais antiga.
 *
 * `perfil` vazio devolve lista vazia sem ir ao banco — é o estado de quem ainda
 * não escolheu quem é na tela de entrada.
 */
export function useDiario(perfil: string, de: string, ate: string) {
    const [anotacoes, setAnotacoes] = useState<AnotacaoDiario[]>([]);
    const [erro, setErro] = useState<string | null>(null);

    /**
     * "Carregando" é derivado, não um estado próprio: vale enquanto o que está
     * na tela não for do intervalo pedido. Além de dispensar um `setState`
     * síncrono dentro do efeito, isso acerta o caso de trocar de dia — o estado
     * booleano deixava a lista do dia anterior aparecer como se fosse do novo.
     *
     * Recarga disparada por outra instância (anotou pelo Ctrl+J) não acende o
     * carregando, porque a chave não muda: a lista só se atualiza, sem piscar.
     */
    const chave = `${perfil}|${de}|${ate}`;
    const [chaveCarregada, setChaveCarregada] = useState<string | null>(null);
    const carregando = chaveCarregada !== chave;

    // `recarregar` é recriado quando perfil/de/ate mudam, e o efeito abaixo
    // re-inscreve a versão nova no Set — então o aviso de "mudou, recarrega"
    // disparado por outra instância sempre busca com o intervalo atual.
    const recarregar = useCallback(async () => {
        // Sem perfil não há o que buscar, e também não há estado a mexer: o
        // retorno do hook já devolve lista vazia nesse caso.
        if (!perfil) return;

        const { data, error } = await supabase
            .from('diario_cs')
            .select(COLUNAS)
            .eq('perfil', perfil)
            .gte('ocorrido_em', inicioDoDiaSP(de))
            .lte('ocorrido_em', fimDoDiaSP(ate))
            .order('ocorrido_em', { ascending: false });

        if (error) {
            console.error('[useDiario] falha ao carregar:', error);
            setErro(error.message);
            // Marca como carregado mesmo no erro: senão a tela fica em
            // esqueleto pra sempre, escondendo a mensagem de falha.
            setChaveCarregada(`${perfil}|${de}|${ate}`);
            return;
        }
        setAnotacoes((data ?? []).map((r: unknown) => daLinha(r as LinhaDiario)));
        setErro(null);
        setChaveCarregada(`${perfil}|${de}|${ate}`);
    }, [perfil, de, ate]);

    useEffect(() => {
        recarregar();
    }, [recarregar]);

    useEffect(() => {
        inscritos.add(recarregar);
        return () => { inscritos.delete(recarregar); };
    }, [recarregar]);

    // Sem perfil escolhido a tela mostra vazio e pronto — não "carregando",
    // que daria a impressão de que algo está vindo.
    return {
        anotacoes: perfil ? anotacoes : [],
        carregando: perfil ? carregando : false,
        erro,
        recarregar,
    };
}

/**
 * Escrita no diário, separada da leitura de propósito: a anotação rápida
 * (Ctrl+J) grava de qualquer tela e não quer carregar lista nenhuma pra isso.
 *
 * Toda escrita avisa as instâncias de `useDiario` abertas, que recarregam.
 */
export function useDiarioEscrita(perfil: string) {
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const criar = useCallback(async (nova: NovaAnotacao): Promise<boolean> => {
        const texto = nova.texto.trim();
        if (!perfil || !texto) return false;

        setSalvando(true);
        setErro(null);
        const { error } = await supabase.from('diario_cs').insert({
            perfil,
            texto,
            ocorrido_em: nova.ocorridoEm ?? new Date().toISOString(),
            categoria: nova.categoria ?? null,
            partner_id: nova.partnerId ?? null,
            partner_nome: nova.partnerNome ?? null,
            privado: nova.privado ?? false,
        });
        setSalvando(false);

        if (error) {
            console.error('[useDiario] falha ao criar:', error);
            setErro(error.message);
            return false;
        }
        avisarMudanca();
        return true;
    }, [perfil]);

    const atualizar = useCallback(async (id: string, patch: PatchAnotacao): Promise<boolean> => {
        setSalvando(true);
        setErro(null);

        const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
        if (patch.texto !== undefined) campos.texto = patch.texto.trim();
        if (patch.categoria !== undefined) campos.categoria = patch.categoria;
        if (patch.partnerId !== undefined) campos.partner_id = patch.partnerId;
        if (patch.partnerNome !== undefined) campos.partner_nome = patch.partnerNome;
        if (patch.privado !== undefined) campos.privado = patch.privado;
        if (patch.ocorridoEm !== undefined) campos.ocorrido_em = patch.ocorridoEm;

        const { error } = await supabase.from('diario_cs').update(campos).eq('id', id);
        setSalvando(false);

        if (error) {
            console.error('[useDiario] falha ao atualizar:', error);
            setErro(error.message);
            return false;
        }
        avisarMudanca();
        return true;
    }, []);

    const remover = useCallback(async (id: string): Promise<boolean> => {
        setSalvando(true);
        setErro(null);
        const { error } = await supabase.from('diario_cs').delete().eq('id', id);
        setSalvando(false);

        if (error) {
            console.error('[useDiario] falha ao remover:', error);
            setErro(error.message);
            return false;
        }
        avisarMudanca();
        return true;
    }, []);

    return { criar, atualizar, remover, salvando, erro };
}
