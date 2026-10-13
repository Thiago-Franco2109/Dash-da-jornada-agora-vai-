-- ─────────────────────────────────────────────────────────────────────────
-- Plano de recuperação do KR 2.3 — as lojas selecionadas para trabalhar.
--
-- POR QUE ESTA TABELA EXISTE
-- O KR é "reverter 30 lojas em risco", e quem escolhe quais é o CS: o banco
-- diz quem está ELEGÍVEL (parada há 7+ dias, ou na lista de risco de
-- cancelamento), a seleção diz quem está no PLANO.
--
-- A seleção também é o que dá memória ao KR. Se o universo fosse "quem está
-- parada agora", ele e o critério de reversão ("4 semanas seguidas com
-- pedido") nunca se cruzariam: a loja sairia do universo no instante em que
-- melhorasse, e o número ficaria travado em zero. Selecionada, ela fica no
-- plano enquanto o trimestre durar — inclusive depois de reverter, que é
-- quando ela finalmente conta.
--
-- É Supabase e não localStorage pelo mesmo motivo de `okr_excluido` e
-- `okr_critica`: o plano é um só. Se a Laís seleciona e o Thiago não vê, os
-- dois reportam "revertemos quantas de quantas?" com listas diferentes.
--
-- Mesma forma das outras duas marcações de propósito — as três são lidas pelo
-- mesmo hook genérico (src/hooks/marcacoesOkr.ts).
--
-- A chave é `partner_id` = estab_id, mesma do resto do app.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.okr_recuperacao (
    partner_id    text        not null primary key,  -- estab_id
    motivo        text,                              -- por que entrou no plano (livre)
    observacao    text,
    nome          text,                              -- nome do parceiro na hora da seleção
    cidade        text,
    incluido_em   timestamptz not null default now(),
    incluido_por  text,                              -- nome/e-mail de quem selecionou
    atualizado_em timestamptz not null default now()
);

comment on table public.okr_recuperacao is
    'Lojas selecionadas para o plano de recuperação do KR 2.3. A loja permanece no plano depois de reverter — é assim que o KR acumula.';

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem seleciona é o CS, na aba da OKR.
-- Mesma régua de `crm_notas`, `onboarding_pausa`, `okr_excluido` e `okr_critica`.
alter table public.okr_recuperacao enable row level security;

drop policy if exists "leitura app" on public.okr_recuperacao;
create policy "leitura app" on public.okr_recuperacao for select using (true);

drop policy if exists "escrita app" on public.okr_recuperacao;
create policy "escrita app" on public.okr_recuperacao for all using (true) with check (true);
