-- ─────────────────────────────────────────────────────────────────────────
-- Snapshot mensal de ativação de ações na carteira.
--
-- POR QUE ESTA TABELA EXISTE
-- O banco Bigou é SELECT-only e não guarda histórico do que interessa:
--   • `item_catalogo.data_modificacao_status` guarda só a ÚLTIMA mudança de
--     status — uma aprovação de maio some quando o item muda em julho;
--   • `campanha_promocao.metadata.sucessoDoCliente` (a marca do CS) é estado
--     atual, sem data e sem versionamento.
-- Ou seja: o passado se reescreve sozinho. Congelar o mês fechado aqui é a
-- única forma de ter série histórica de verdade.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.ativacoes_mensal_snapshot (
    mes                text        not null,          -- 'YYYY-MM'
    -- '' = total do mês; senão o nome da campanha ou da cidade
    dimensao           text        not null,          -- 'total' | 'campanha' | 'cidade'
    chave              text        not null default '',
    promo_total        integer     not null default 0,
    promo_cs           integer     not null default 0,
    promo_parceiro     integer     not null default 0,
    promo_parceiros    integer     not null default 0, -- parceiros distintos
    cupons_total       integer     not null default 0,
    cupons_parceiros   integer     not null default 0,
    congelado_em       timestamptz not null default now(),
    primary key (mes, dimensao, chave)
);

comment on table public.ativacoes_mensal_snapshot is
    'Foto do mês fechado. O Bigou sobrescreve o passado; aqui ele fica parado.';
comment on column public.ativacoes_mensal_snapshot.promo_cs is
    'Ativações com marca "Sucesso do Cliente" no momento em que o mês foi congelado.';

create index if not exists ativacoes_mensal_snapshot_mes_idx
    on public.ativacoes_mensal_snapshot (mes);

-- ── Segurança ────────────────────────────────────────────────────────────
-- RLS ligado SEM policy de escrita: só a service_role (que ignora RLS) grava.
-- A anon key vai no bundle do navegador — se ela pudesse escrever aqui,
-- qualquer pessoa com o JS da página poderia forjar a série histórica.
alter table public.ativacoes_mensal_snapshot enable row level security;

-- Leitura liberada para a aplicação (mesma régua das outras tabelas do app).
drop policy if exists "leitura app" on public.ativacoes_mensal_snapshot;
create policy "leitura app"
    on public.ativacoes_mensal_snapshot
    for select
    using (true);
