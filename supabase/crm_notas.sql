-- ─────────────────────────────────────────────────────────────────────────
-- Notas e follow-up do CRM, por parceiro.
--
-- POR QUE ESTA TABELA EXISTE
-- Isto vivia em `localStorage` (`crm_promo_notes_v1`), ou seja: cada navegador
-- tinha a própria verdade. Com dois CS trabalhando a mesma fila de ativação
-- (Thiago e Laís), cada um enxergava só o próprio histórico — "já cobrei esse
-- parceiro?" ficava sem resposta, e a fila de ligação não funciona assim.
--
-- Também corrige um bug do modo localStorage: havia DUAS instâncias do hook na
-- mesma aba (App e ficha do parceiro) e a sincronização só escutava o evento
-- `storage`, que não dispara na aba que escreveu — registrar contato no kanban
-- não atualizava a ficha sem recarregar a página.
--
-- A chave é `partner_id` = estab_id, mesma do resto do app. A nota é POR
-- PARCEIRO (não por campanha) de propósito: "falei com o dono, vai montar no
-- fim de semana" é conversa de relacionamento, não de uma campanha só. O que é
-- por campanha (o motivo de não ativar) mora em `campanha_status_cs`.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.crm_notas (
    partner_id        text        not null primary key,  -- estab_id
    notas             text        not null default '',
    ultimo_contato    date,                              -- quando o CS falou com o parceiro
    proximo_follow_up date,                              -- quando voltar (alimenta o sino e o banner de alertas)
    atualizado_em     timestamptz not null default now()
);

comment on table public.crm_notas is
    'Notas e follow-up do CRM por parceiro. Substitui o localStorage crm_promo_notes_v1, que não era compartilhado entre os CS.';

create index if not exists crm_notas_follow_up_idx on public.crm_notas (proximo_follow_up);

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem anota é o CS, na tela. Mesma régua
-- de `campanha_status_cs` e `partner_status_overrides`.
alter table public.crm_notas enable row level security;

drop policy if exists "leitura app" on public.crm_notas;
create policy "leitura app" on public.crm_notas for select using (true);

drop policy if exists "escrita app" on public.crm_notas;
create policy "escrita app" on public.crm_notas for all using (true) with check (true);
