-- ─────────────────────────────────────────────────────────────────────────
-- Pausa do onboarding, por parceiro.
--
-- POR QUE ESTA TABELA EXISTE
-- A jornada de 28 dias conta dia corrido desde o lançamento e cobra 30 pedidos
-- no fim. Quando o parceiro PARA de operar por problema operacional (cozinha
-- parada, sem entregador, reforma, dono viajou), o relógio continua correndo:
-- no dia 10 a ficha mostra "0 de 11 esperados, índice 0.00, prioridade 5" e o
-- CS aparece todo dia na fila de ligação pra cobrar quem já avisou que não
-- está trabalhando. A conta fica errada e a cobrança, inútil.
--
-- Pausar congela o relógio: os dias em pausa são descontados de
-- `dias_desde_lancamento`, e com eles caem pedidos esperados, índice e
-- estrelas. Ao retomar, a jornada continua de onde parou.
--
-- É Supabase e não localStorage (diferente de `isFinished`, que ainda mora lá)
-- porque a pausa é informação de operação: se a Laís pausou o parceiro, o
-- Thiago precisa ver o mesmo número de dias ativos na tela dele — senão os dois
-- discutem métrica em cima de bases diferentes. Mesma régua de `crm_notas`.
--
-- `dias_acumulados` guarda o que já foi descontado por pausas ENCERRADAS. A
-- pausa em curso é calculada na hora (hoje − pausado_em), pra não depender de
-- um job diário somando dias.
--
-- A chave é `partner_id` = estab_id, mesma do resto do app.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.onboarding_pausa (
    partner_id       text        not null primary key,  -- estab_id
    pausado          boolean     not null default true,
    motivo           text        not null,              -- ver MOTIVOS_PAUSA em src/config/pausaOnboarding.ts
    observacao       text,
    previsao_retorno date,                              -- quando o parceiro disse que volta (vira follow-up)
    pausado_em       timestamptz not null default now(),
    pausado_por      text,                              -- nome/e-mail de quem pausou
    retomado_em      timestamptz,
    dias_acumulados  integer     not null default 0,    -- dias já descontados por pausas encerradas
    atualizado_em    timestamptz not null default now()
);

comment on table public.onboarding_pausa is
    'Pausa do onboarding por parceiro. Os dias em pausa são descontados da jornada de 28 dias (dias ativos, pedidos esperados, índice e estrelas).';

comment on column public.onboarding_pausa.dias_acumulados is
    'Dias descontados por pausas JÁ ENCERRADAS. A pausa em curso é calculada no app (hoje − pausado_em) e somada a este valor.';

create index if not exists onboarding_pausa_pausado_idx on public.onboarding_pausa (pausado);

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem pausa é o CS, na ficha do parceiro.
-- Mesma régua de `crm_notas` e `partner_status_overrides`.
alter table public.onboarding_pausa enable row level security;

drop policy if exists "leitura app" on public.onboarding_pausa;
create policy "leitura app" on public.onboarding_pausa for select using (true);

drop policy if exists "escrita app" on public.onboarding_pausa;
create policy "escrita app" on public.onboarding_pausa for all using (true) with check (true);
