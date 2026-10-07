/**
 * Entrada isolada para conferir a aba Diário sem login e sem banco.
 *
 * Rode `npm run dev` e abra http://localhost:5173/preview-diario.html
 * Não entra no build de produção (o vite só constrói index.html).
 *
 * Dois dublês aqui, porque a tela depende de duas coisas que não existem em
 * `vite dev`:
 *   - Supabase: as credenciais moram nas env vars da Netlify, então o cliente
 *     real roda em modo mock e devolve lista vazia. Aqui trocamos o `from` por
 *     um fake com estado em memória, pra dar pra criar/editar/apagar de verdade.
 *   - Netlify Function do Trello: não sobe no `vite dev`, então o `fetch` dela é
 *     interceptado e devolve um dia de atividade de amostra.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DiarioView from './components/DiarioView';
import AnotacaoRapida from './components/diario/AnotacaoRapida';
import { supabase } from './lib/supabase';
import type { EnrichedPerformanceRow } from './utils/calculations';
import './index.css';

// ── Dublê do Supabase ────────────────────────────────────────────────────
interface LinhaFake {
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

// ── Parceiros pro seletor e pra resolução de cidade ──────────────────────
const parceirosAmostra = [
    { estab_id: '28575', estabelecimento: 'Rango Bom', cidade: 'Além Paraíba' },
    { estab_id: '27606', estabelecimento: 'Cantinho da Sonia', cidade: 'Muriaé' },
    { estab_id: '28531', estabelecimento: 'Brasa Burguer', cidade: 'Santos Dumont' },
    { estab_id: '28509', estabelecimento: 'Sublime Açaí Express', cidade: 'Ubá' },
];
const parceiros = parceirosAmostra as unknown as EnrichedPerformanceRow[];

const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
/** Instante ISO (UTC) a partir de uma hora de Brasília — comparável por string. */
const em = (hora: string, dia = hoje) => new Date(`${dia}T${hora}:00.000-03:00`).toISOString();
const ontem = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })
    .format(new Date(Date.now() - 86_400_000));

let linhas: LinhaFake[] = [
    {
        id: '1', perfil: 'THIAGO', ocorrido_em: em('14:32'),
        texto: 'Liguei pro dono do Rango Bom. Pediu pra voltar depois das 18h, disse que monta a promo hoje à noite.',
        categoria: 'ligacao', partner_id: '28575', partner_nome: 'Rango Bom',
        privado: false, atualizado_em: em('14:32'),
    },
    {
        id: '2', perfil: 'THIAGO', ocorrido_em: em('11:05'),
        texto: 'Levantei as lojas de Muriaé sem pedido há mais de 14 dias — 9 casos, 3 já estão em recesso diário.',
        categoria: 'analise', partner_id: null, partner_nome: null,
        privado: false, atualizado_em: em('11:05'),
    },
    {
        id: '3', perfil: 'THIAGO', ocorrido_em: em('09:40'),
        texto: 'Reunião de alinhamento com a Laís sobre a divisão das cidades do ciclo.',
        categoria: 'reuniao', partner_id: null, partner_nome: null,
        privado: false, atualizado_em: em('09:40'),
    },
    {
        id: '4', perfil: 'THIAGO', ocorrido_em: em('08:15'),
        texto: 'Preciso cobrar o retorno do time de produto sobre o bug do cupom duplicado.',
        categoria: 'problema', partner_id: null, partner_nome: null,
        privado: true, atualizado_em: em('08:15'),
    },
    {
        id: '5', perfil: 'THIAGO', ocorrido_em: em('16:20', ontem),
        texto: 'Fechei a promo subsidiada com a Marmitaria Alho Poró — começa na sexta.',
        categoria: 'captacao', partner_id: '28402', partner_nome: 'Marmitaria Alho Poró',
        privado: false, atualizado_em: em('16:20', ontem),
    },
];

/**
 * `?muitas=40` semeia anotações extras, pra conferir o relatório no estado em
 * que ele passa dos 2000 caracteres do Discord e sai fatiado em várias partes —
 * que é o caso real do relatório semanal e não acontece com 4 linhas de amostra.
 */
const extras = Number(new URLSearchParams(window.location.search).get('muitas') ?? 0);
if (extras > 0) {
    // Usa os mesmos parceiros do seletor, ciclicamente: assim o relatório
    // resolve a cidade de verdade pelo id, em vez de testar um caminho vazio.
    linhas = [...linhas, ...Array.from({ length: extras }, (_, i) => {
        const p = parceirosAmostra[i % parceirosAmostra.length];
        return {
            id: `extra-${i}`,
            perfil: 'THIAGO',
            ocorrido_em: em(`${String(8 + (i % 10)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}`),
            texto: `Fechei a promoção subsidiada e alinhei a arte da campanha, começa na sexta. (amostra ${i})`,
            categoria: 'captacao',
            partner_id: p.estab_id,
            partner_nome: p.estabelecimento,
            privado: false,
            atualizado_em: em('12:00'),
        };
    })];
}

function chainFake(tabela: string) {
    let alvoId: string | null = null;
    let modo: 'select' | 'update' | 'delete' = 'select';
    let patch: Partial<LinhaFake> = {};
    // O fake respeita o intervalo de datas de propósito: sem isso a navegação
    // por dia pareceria quebrada no preview (mostraria sempre as mesmas linhas),
    // e o defeito seria do dublê, não da tela.
    let de: string | null = null;
    let ate: string | null = null;

    const resultado = () => ({
        data: tabela === 'diario_cs'
            ? linhas
                .filter(l => (!de || l.ocorrido_em >= de) && (!ate || l.ocorrido_em <= ate))
                .sort((a, b) => b.ocorrido_em.localeCompare(a.ocorrido_em))
            : [],
        error: null,
    });

    const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        gte: (_coluna: string, valor: string) => { de = new Date(valor).toISOString(); return chain; },
        lte: (_coluna: string, valor: string) => { ate = new Date(valor).toISOString(); return chain; },
        neq: () => chain,
        eq: (coluna: string, valor: string) => {
            if (coluna === 'id') alvoId = valor;
            return chain;
        },
        insert: (nova: Partial<LinhaFake>) => {
            linhas = [...linhas, {
                id: String(Date.now()),
                perfil: nova.perfil ?? 'THIAGO',
                ocorrido_em: nova.ocorrido_em ?? new Date().toISOString(),
                texto: nova.texto ?? '',
                categoria: nova.categoria ?? null,
                partner_id: nova.partner_id ?? null,
                partner_nome: nova.partner_nome ?? null,
                privado: nova.privado ?? false,
                atualizado_em: new Date().toISOString(),
            }];
            return Promise.resolve({ data: null, error: null });
        },
        update: (campos: Partial<LinhaFake>) => { modo = 'update'; patch = campos; return chain; },
        delete: () => { modo = 'delete'; return chain; },
        then: (ok: (r: unknown) => unknown) => {
            if (modo === 'delete' && alvoId) linhas = linhas.filter(l => l.id !== alvoId);
            if (modo === 'update' && alvoId) {
                linhas = linhas.map(l => (l.id === alvoId ? { ...l, ...patch } : l));
            }
            return ok(modo === 'select' ? resultado() : { data: null, error: null });
        },
    };
    return chain;
}

(supabase as unknown as { from: (t: string) => unknown }).from = chainFake;

// ── Dublê da Netlify Function do Trello ──────────────────────────────────
const atividadeAmostra = {
    ok: true,
    data: hoje,
    totalMovimentacoes: 20,
    comentarios: 6,
    cardsMovidos: 14,
    anexos: 11,
    porLista: [
        { nome: 'Cupons captados', cards: 9 },
        { nome: 'Promo sub', cards: 3 },
        { nome: '🤖 Mês do Bigou - 12 anos (confirmado via manychat)', cards: 2 },
        { nome: '➡️ Inicio', cards: 2 },
    ],
    porBoard: [{ nome: '[SC] Captação de ações [Thiago]', cards: 14 }],
    truncado: false,
    movimentacoes: [
        {
            id: 'a1', tipo: 'movido', quando: em('15:10'),
            cardNome: '28575 - Rango Bom', cardUrl: 'https://trello.com/c/abc',
            boardNome: '[SC] Captação de ações [Thiago]',
            listaAntes: 'Negociando', listaDepois: 'Cupons captados',
        },
        {
            id: 'a2', tipo: 'anexo', quando: em('15:08'),
            cardNome: '28575 - Rango Bom', cardUrl: 'https://trello.com/c/abc',
            boardNome: '[SC] Captação de ações [Thiago]', anexoNome: 'print-confirmacao.png',
        },
        {
            id: 'a3', tipo: 'comentario', quando: em('13:22'),
            cardNome: '27606 - Cantinho da Sonia', cardUrl: 'https://trello.com/c/def',
            boardNome: '[SC] Captação de ações [Thiago]', texto: 'Aceitou o cupom de 20%',
        },
    ],
};

const fetchOriginal = window.fetch.bind(window);
window.fetch = ((entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.includes('trello-atividade-hoje')) {
        // Ecoa a data pedida, como a function real faz — senão a tela, que só
        // aceita resumo do dia que pediu, ficaria em esqueleto ao navegar.
        const pedida = new URL(url, window.location.origin).searchParams.get('data') ?? hoje;
        return Promise.resolve(new Response(JSON.stringify({ ...atividadeAmostra, data: pedida }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
    }
    return fetchOriginal(entrada as RequestInfo, init);
}) as typeof window.fetch;

/** Espelha o que o App faz: Ctrl/Cmd+J abre a anotação rápida de qualquer tela. */
export function PreviewDiario() {
    const [rapidaAberta, setRapidaAberta] = useState(false);

    useEffect(() => {
        const aoTeclar = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
                e.preventDefault();
                setRapidaAberta(a => !a);
            }
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, []);

    return (
        <div className="flex h-screen">
            <DiarioView perfil="THIAGO" partners={parceiros} />
            {rapidaAberta && (
                <AnotacaoRapida
                    onFechar={() => setRapidaAberta(false)}
                    perfil="THIAGO"
                    partners={parceiros}
                />
            )}
        </div>
    );
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <PreviewDiario />
    </StrictMode>,
);
