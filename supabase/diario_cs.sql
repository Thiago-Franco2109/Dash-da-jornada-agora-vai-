-- ─────────────────────────────────────────────────────────────────────────
-- Diário do CS: o que a pessoa fez, em ordem cronológica.
--
-- POR QUE ESTA TABELA EXISTE
-- O relatório que vai pro chefe (Discord) precisa juntar duas fontes: o que o
-- Trello já registra sozinho — na semana de 28/09 a 02/10/2026 foram 940 ações
-- num quadro só — e o que só a pessoa sabe: a ligação que não virou card, a
-- análise feita no painel, a reunião, o problema que apareceu. Esta tabela
-- guarda a segunda metade. Sem ela o relatório fica sendo só movimentação de
-- card, que não conta o trabalho de verdade.
--
-- NÃO CONFUNDIR COM `crm_notas`
-- São eixos diferentes, e misturar já deu bug neste projeto (duas fontes pra
-- mesma pergunta divergindo sozinhas):
--   - `crm_notas`  — o que sabemos DO PARCEIRO. Uma linha por parceiro, é
--                    sobrescrita, e alimenta follow-up/alarme.
--   - `diario_cs`  — o que EU FIZ. Uma linha por acontecimento, append-only,
--                    nunca sobrescreve nada, e alimenta o relatório.
-- `partner_id` aqui é uma etiqueta opcional pra cruzar com a base — escrever no
-- diário NÃO atualiza `crm_notas`, de propósito.
--
-- TAMANHO
-- ~1 KB por anotação. Três por dia, dois CS, 250 dias úteis = ~1,5 MB/ano,
-- contra 500 MB de cota do plano free. Não precisa de retenção nem limpeza.
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.diario_cs (
    id            uuid        primary key default gen_random_uuid(),

    -- Quem escreveu: 'THIAGO' | 'LAÍS' | 'ULYSSES' (ver src/config/managerSession.ts).
    -- A tela filtra sempre por este campo e não oferece seletor pra ver o
    -- diário do outro — anotação de diário é pessoal. Note que isso é regra de
    -- TELA, não de segurança: o perfil é escolhido sem senha e a RLS abaixo é
    -- aberta, igual ao resto das tabelas do app.
    perfil        text        not null,

    -- Quando a coisa ACONTECEU (não quando foi digitada). Editável: dá pra
    -- anotar hoje algo de ontem, que é o caso normal de quem esquece.
    ocorrido_em   timestamptz not null default now(),

    texto         text        not null,

    -- Vira seção do relatório. Null = "Outro". Valores em
    -- src/config/diarioCategorias.ts — guardado como texto solto (não enum)
    -- porque a lista vai mudar com o uso e migração de enum no Postgres é cara.
    categoria     text,

    -- estab_id, opcional. Nome NUNCA identifica loja (há homônimos em cidades
    -- diferentes) — ver src/utils/partnerIdentity.ts.
    partner_id    text,
    -- Foto do nome no momento da anotação: a loja pode ser renomeada ou sair da
    -- base, e o relatório de uma semana antiga tem que continuar legível.
    partner_nome  text,

    -- `true` = nunca sai no relatório, por mais que a pessoa esqueça de
    -- desmarcar. É o cadeado pro que é pessoal; o padrão é entrar.
    privado       boolean     not null default false,

    criado_em     timestamptz not null default now(),
    atualizado_em timestamptz not null default now()
);

comment on table public.diario_cs is
    'Diário do CS: o que a pessoa fez, cronológico e append-only. Alimenta o relatório diário/semanal junto com a atividade do Trello. Não confundir com crm_notas, que é por parceiro.';

-- A tela sempre pede "as anotações DESTE perfil NESTE dia", nessa ordem.
create index if not exists diario_cs_perfil_data_idx
    on public.diario_cs (perfil, ocorrido_em desc);

-- Pra um dia mostrar o histórico de ações na ficha do parceiro.
create index if not exists diario_cs_partner_idx
    on public.diario_cs (partner_id)
    where partner_id is not null;

-- ── Segurança ────────────────────────────────────────────────────────────
-- Mesma régua de `crm_notas` e `campanha_status_cs`: quem escreve é o CS, na
-- tela, com a chave anon. Não é isolamento real entre perfis — ver comentário
-- da coluna `perfil`.
alter table public.diario_cs enable row level security;

drop policy if exists "leitura app" on public.diario_cs;
create policy "leitura app" on public.diario_cs for select using (true);

drop policy if exists "escrita app" on public.diario_cs;
create policy "escrita app" on public.diario_cs for all using (true) with check (true);
