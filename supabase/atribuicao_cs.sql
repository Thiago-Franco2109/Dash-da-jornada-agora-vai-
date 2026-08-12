-- ─────────────────────────────────────────────────────────────────────────
-- Quem cuida de quem: atribuição de CS por cidade e por loja.
--
-- POR QUE ESTAS TABELAS EXISTEM
-- O banco Bigou não sabe de quem é cada parceiro. `venda.vendedor_id` é o
-- comercial que fechou o contrato (Alyce, Vitor, Ariela…), não o CS que
-- acompanha; `admin.localidades` está vazio; `pos_venda_id` não é usado.
-- Até aqui isso vivia em duas planilhas separadas (uma por analista) e num
-- mapa fixo no código, com overrides no localStorage de cada navegador —
-- ou seja, cada máquina tinha uma verdade diferente.
--
-- SÃO DUAS TABELAS PORQUE SÃO DUAS PERGUNTAS DIFERENTES
--   cs_cidade   → marketplace: a carteira é organizada por cidade
--   cs_parceiro → Cardápio Digital: vendido para o Brasil inteiro, quase
--                 sempre em cidade sem carteira, então a atribuição é loja
--                 a loja e não dá para deduzir de nada
-- Na hora de resolver, a loja ganha da cidade (é o caso mais específico).
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.cs_cidade (
    cidade        text        not null,
    produto       text        not null default 'marketplace',  -- 'marketplace' | 'cardapio_digital'
    analista      text        not null,                        -- 'THIAGO' | 'LAÍS'
    atualizado_em timestamptz not null default now(),
    primary key (cidade, produto)
);

comment on table public.cs_cidade is
    'CS responsável por cidade. Substitui o INITIAL_CITY_MANAGER_MAP e os overrides em localStorage.';

create table if not exists public.cs_parceiro (
    estab_id      text        not null,
    produto       text        not null default 'cardapio_digital',
    analista      text        not null,
    -- Guardados junto para a tela conseguir listar quem já foi atribuído sem
    -- depender de cruzar com o banco Bigou a cada carregamento.
    estabelecimento text      not null default '',
    cidade        text        not null default '',
    atualizado_em timestamptz not null default now(),
    primary key (estab_id, produto)
);

comment on table public.cs_parceiro is
    'CS responsável por loja específica. Usado no Cardápio Digital, onde a cidade não diz nada.';

create index if not exists cs_parceiro_analista_idx on public.cs_parceiro (produto, analista);

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem atribui é o time, pela tela de
-- Gestores. Mesma régua de `carteira_cidade` e `partner_relevance`.
alter table public.cs_cidade   enable row level security;
alter table public.cs_parceiro enable row level security;

drop policy if exists "leitura app" on public.cs_cidade;
create policy "leitura app" on public.cs_cidade for select using (true);
drop policy if exists "escrita app" on public.cs_cidade;
create policy "escrita app" on public.cs_cidade for all using (true) with check (true);

drop policy if exists "leitura app" on public.cs_parceiro;
create policy "leitura app" on public.cs_parceiro for select using (true);
drop policy if exists "escrita app" on public.cs_parceiro;
create policy "escrita app" on public.cs_parceiro for all using (true) with check (true);

-- ── Semente ──────────────────────────────────────────────────────────────
-- O mapa que estava fixo no código (INITIAL_CITY_MANAGER_MAP), para a tabela
-- já nascer com a carteira atual. Rodar de novo não duplica nem sobrescreve
-- o que o time tiver mudado depois.
insert into public.cs_cidade (cidade, produto, analista) values
    ('Barão de Cocais', 'marketplace', 'LAÍS'),
    ('Jacutinga', 'marketplace', 'LAÍS'),
    ('Monte Santo de Minas', 'marketplace', 'LAÍS'),
    ('Santa Bárbara', 'marketplace', 'LAÍS'),
    ('São José do Vale do Rio Preto', 'marketplace', 'LAÍS'),
    ('São João Nepomuceno', 'marketplace', 'LAÍS'),
    ('Pitangui', 'marketplace', 'LAÍS'),
    ('Abaeté', 'marketplace', 'LAÍS'),
    ('Conceição de Macabu', 'marketplace', 'LAÍS'),
    ('Monte Azul Paulista', 'marketplace', 'LAÍS'),
    ('Ouro Fino', 'marketplace', 'LAÍS'),
    ('Piraúba', 'marketplace', 'LAÍS'),
    ('Porciúncula', 'marketplace', 'LAÍS'),
    ('Tocantins', 'marketplace', 'LAÍS'),
    ('Bom Jardim', 'marketplace', 'LAÍS'),
    ('Raul Soares', 'marketplace', 'LAÍS'),
    ('Carangola', 'marketplace', 'LAÍS'),
    ('Carmo', 'marketplace', 'LAÍS'),
    ('Divino', 'marketplace', 'LAÍS'),
    ('Ponte Nova', 'marketplace', 'LAÍS'),
    ('Rio Pomba', 'marketplace', 'LAÍS'),
    ('Cordeiro', 'marketplace', 'THIAGO'),
    ('Cantagalo', 'marketplace', 'THIAGO'),
    ('Barroso', 'marketplace', 'THIAGO'),
    ('Bom Jesus do Itabapoana', 'marketplace', 'THIAGO'),
    ('Cláudio', 'marketplace', 'THIAGO'),
    ('Silva Jardim', 'marketplace', 'THIAGO'),
    ('Santos Dumont', 'marketplace', 'THIAGO'),
    ('Guaçuí', 'marketplace', 'THIAGO'),
    ('Ubá', 'marketplace', 'THIAGO'),
    ('Bicas', 'marketplace', 'THIAGO'),
    ('Ervália', 'marketplace', 'THIAGO'),
    ('Paraopeba', 'marketplace', 'THIAGO'),
    ('Caetanópolis', 'marketplace', 'THIAGO'),
    ('Carandaí', 'marketplace', 'THIAGO'),
    ('Espera Feliz', 'marketplace', 'THIAGO'),
    ('Além Paraíba', 'marketplace', 'THIAGO'),
    ('Muriaé', 'marketplace', 'THIAGO'),
    ('Natividade', 'marketplace', 'THIAGO')
on conflict (cidade, produto) do nothing;
