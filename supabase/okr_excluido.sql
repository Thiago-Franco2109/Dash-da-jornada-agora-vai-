-- ─────────────────────────────────────────────────────────────────────────
-- Lojas fora da conta da OKR.
--
-- POR QUE ESTA TABELA EXISTE
-- Os três KRs medem a base inteira das cidades da OKR, e parte dessa base não
-- é um parceiro que o CS possa mover: loja vendida para outro dono, operação
-- encerrada, cadastro duplicado, parceiro que nunca chegou a abrir. Enquanto
-- esses ficam no denominador, o KR2 mede o cadastro em vez de medir adoção —
-- e o trabalho de quem está ligando some dentro de um número que não se mexe.
--
-- Tirar da conta é o oposto de esconder: a loja continua na tela, numa lista
-- própria, com motivo e autor. O número que sai daqui vai para o CEO, então
-- precisa ser possível perguntar "por que só 102 e não 108?" e ter resposta.
--
-- É Supabase e não localStorage porque a OKR é uma só: se a Laís tira uma loja
-- da conta e o Thiago não vê, os dois reportam porcentagens diferentes da
-- mesma semana. Mesma régua de `onboarding_pausa` e `crm_notas`.
--
-- A exclusão vale para os TRÊS KRs — uma decisão por loja, e não uma por
-- métrica: poder tirar do KR2 e manter no KR3 seria escolher onde a loja
-- atrapalha menos.
--
-- `nome` e `cidade` são cópia do momento da exclusão, só para a lista continuar
-- legível quando o parceiro sai do recorte consultado (trimestre antigo, loja
-- apagada do cadastro). A verdade do parceiro continua sendo o id.
--
-- A chave é `partner_id` = estab_id, mesma do resto do app.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.okr_excluido (
    partner_id    text        not null primary key,  -- estab_id
    motivo        text        not null,              -- ver MOTIVOS_EXCLUSAO em src/config/exclusaoOkr.ts
    observacao    text,
    nome          text,                              -- nome do parceiro na hora da exclusão
    cidade        text,
    excluido_em   timestamptz not null default now(),
    excluido_por  text,                              -- nome/e-mail de quem tirou da conta
    atualizado_em timestamptz not null default now()
);

comment on table public.okr_excluido is
    'Lojas fora da conta da OKR do trimestre. Valem para os três KRs ao mesmo tempo; a aba OKR mostra a lista e permite devolver à conta.';

comment on column public.okr_excluido.nome is
    'Cópia do nome no momento da exclusão — só para a lista ficar legível quando o parceiro não vem no recorte consultado.';

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem tira da conta é o CS, na aba da
-- OKR. Mesma régua de `crm_notas`, `partner_status_overrides` e
-- `onboarding_pausa`.
alter table public.okr_excluido enable row level security;

drop policy if exists "leitura app" on public.okr_excluido;
create policy "leitura app" on public.okr_excluido for select using (true);

drop policy if exists "escrita app" on public.okr_excluido;
create policy "escrita app" on public.okr_excluido for all using (true) with check (true);
