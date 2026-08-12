-- ─────────────────────────────────────────────────────────────────────────
-- Classificação comercial das cidades da carteira (DIVISÃO e GRUPO).
--
-- POR QUE ESTA TABELA EXISTE
-- A aba CIDADES_FORMATADO trazia duas colunas que não existem em lugar
-- nenhum do banco Bigou: DIVISÃO e GRUPO. Procurei em `localidade`,
-- `franquia` e `categoria_localidade` — não é nenhuma delas. É julgamento
-- comercial, mantido na mão. Os números da carteira (total, ativos,
-- suspensos, % com promo, % com cupom) vêm da Function `carteira`; só esses
-- dois rótulos moram aqui, editáveis pela própria tela.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.carteira_cidade (
    cidade        text        primary key,
    divisao       text        not null default '',
    grupo         text        not null default '',
    atualizado_em timestamptz not null default now()
);

comment on table public.carteira_cidade is
    'DIVISÃO e GRUPO por cidade — classificação comercial que não existe no banco Bigou.';
comment on column public.carteira_cidade.cidade is
    'Nome da localidade como vem do Bigou (localidade.nome). É a chave de cruzamento.';

-- ── Segurança ────────────────────────────────────────────────────────────
-- Aqui, ao contrário do snapshot de ativações, a escrita PRECISA sair do
-- navegador: quem classifica é o time, pela tela da Carteira. Mesma régua de
-- `partner_relevance` e dos overrides de status.
alter table public.carteira_cidade enable row level security;

drop policy if exists "leitura app" on public.carteira_cidade;
create policy "leitura app"
    on public.carteira_cidade
    for select
    using (true);

drop policy if exists "escrita app" on public.carteira_cidade;
create policy "escrita app"
    on public.carteira_cidade
    for all
    using (true)
    with check (true);
