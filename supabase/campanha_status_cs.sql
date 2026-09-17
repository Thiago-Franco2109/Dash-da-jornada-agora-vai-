-- ─────────────────────────────────────────────────────────────────────────
-- Status CRM do CS por campanha, pra QUALQUER campanha.
--
-- POR QUE ESTA TABELA EXISTE
-- O status manual do CS ("Não ofertado", "Aguardando retorno", "Negado"…)
-- vivia em `partner_status_overrides`, que tem DUAS colunas fixas:
-- `promo_status_override` (Super Promos) e `cupom_status_override` (Cupons de
-- destaque). Ofertas da Casa ficou no localStorage de cada navegador.
--
-- Resultado: toda campanha nova criada no CMS ("Promo do Dia!", "Semana do
-- Cliente", "Super Bigou!", "Tudo por R$9,99"…) aparecia na tela do parceiro
-- com a coluna "Status CRM" vazia — o CS via a campanha, via o estado real do
-- banco, mas não tinha onde registrar em que pé estava a conversa. Não era
-- decisão de produto, era falta de coluna.
--
-- Aqui a chave é (parceiro, campanha), então campanha nova já nasce com onde
-- guardar status, sem DDL nem deploy.
--
-- CONVIVÊNCIA COM O QUE JÁ EXISTE
-- As 3 campanhas conhecidas continuam gravando onde sempre gravaram (nada de
-- migração nem escrita dupla): Super Promos e Cupons em
-- `partner_status_overrides`, Ofertas da Casa no localStorage. Esta tabela
-- atende só as demais. Quando/se as antigas migrarem pra cá, o histórico
-- delas continua válido porque a chave é a mesma (partner_id = estab_id).
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.campanha_status_cs (
    partner_id     text        not null,   -- estab_id do parceiro (mesma chave do resto do app)
    campanha_id    text        not null,   -- id derivado do nome da campanha (ver campaignIdFromNome)
    status         text        not null,   -- aguardando | ofertei | negado | confirmado | ativo | inativo
    -- Por que o parceiro ainda não está participando. Preenchido ao registrar a
    -- ligação; é o que diz ao CS com que argumento voltar, e agregado responde se
    -- o gargalo é preço, informação ou recusa.
    motivo         text,                   -- desconto_alto | nao_entendeu_subsidio | esqueceu | nao_quer | sim | outro
    motivo_detalhe text,                   -- texto livre quando motivo = 'outro'
    atualizado_em  timestamptz not null default now(),
    primary key (partner_id, campanha_id)
);

-- Para quem já rodou a versão anterior deste arquivo (sem as colunas de motivo).
alter table public.campanha_status_cs
    add column if not exists motivo         text,
    add column if not exists motivo_detalhe text;

comment on table public.campanha_status_cs is
    'Status CRM do CS por (parceiro, campanha). Cobre as campanhas sem coluna própria em partner_status_overrides.';

create index if not exists campanha_status_cs_campanha_idx on public.campanha_status_cs (campanha_id);

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem marca o status é o CS, na tela do
-- parceiro. Mesma régua de `partner_status_overrides` e `cs_cidade`.
alter table public.campanha_status_cs enable row level security;

drop policy if exists "leitura app" on public.campanha_status_cs;
create policy "leitura app" on public.campanha_status_cs for select using (true);

drop policy if exists "escrita app" on public.campanha_status_cs;
create policy "escrita app" on public.campanha_status_cs for all using (true) with check (true);
