-- ─────────────────────────────────────────────────────────────────────────
-- Lojas marcadas como CRÍTICAS de cancelamento (KR 2.3).
--
-- POR QUE ESTA TABELA EXISTE
-- O KR 2.3 define o universo de risco como "paradas há 7+ dias OU entre as 18
-- críticas de cancelamento". A primeira metade o banco responde sozinho; a
-- segunda é uma escolha humana — a lista das 18 saiu da apresentação, e nenhum
-- corte de taxa de cancelamento reproduz exatamente esse número (na data em
-- que isto foi escrito, 26 lojas das 5 cidades passavam de 20% e 33 passavam
-- de 10%). A aba sugere as candidatas pela taxa; quem decide marca aqui.
--
-- É Supabase e não localStorage pelo mesmo motivo de `okr_excluido`: o
-- universo do KR precisa ser o mesmo para quem abrir o painel, senão dois CS
-- reportam "30 revertidas de quantas?" com denominadores diferentes.
--
-- Mesma forma de `okr_excluido` de propósito — as duas marcações são lidas
-- pelo mesmo hook genérico (src/hooks/marcacoesOkr.ts). Só mudam os nomes das
-- colunas de autoria, para a tabela se explicar sozinha no SQL Editor.
--
-- A chave é `partner_id` = estab_id, mesma do resto do app.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.okr_critica (
    partner_id    text        not null primary key,  -- estab_id
    motivo        text,                              -- livre; a aba hoje não exige
    observacao    text,
    nome          text,                              -- nome do parceiro na hora da marcação
    cidade        text,
    marcado_em    timestamptz not null default now(),
    marcado_por   text,                              -- nome/e-mail de quem marcou
    atualizado_em timestamptz not null default now()
);

comment on table public.okr_critica is
    'Lojas marcadas como críticas de cancelamento. Entram no universo do KR 2.3 mesmo quando não estão paradas há 7+ dias.';

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem marca é o CS, na aba da OKR.
-- Mesma régua de `crm_notas`, `onboarding_pausa` e `okr_excluido`.
alter table public.okr_critica enable row level security;

drop policy if exists "leitura app" on public.okr_critica;
create policy "leitura app" on public.okr_critica for select using (true);

drop policy if exists "escrita app" on public.okr_critica;
create policy "escrita app" on public.okr_critica for all using (true) with check (true);
