-- ─────────────────────────────────────────────────────────────────────────
-- Campanha que NÃO é ofertada numa cidade.
--
-- POR QUE ESTA TABELA EXISTE
-- A lista de campanhas de uma cidade vem do `config` da campanha no CMS
-- (chaveado por localidade_id — ver netlify/functions/promo-status.ts). Esse
-- config diz onde a campanha PODE rodar, não onde ela de fato é ofertada: há
-- cidade habilitada no CMS em que o CS não oferta aquela campanha (não cabe no
-- mix, não tem subsídio aprovado, a praça é nova demais).
--
-- O efeito disso na tela era pior do que parece: a campanha ficava pra sempre
-- como "sem item" em TODO parceiro da cidade, então o parceiro que já tinha
-- tudo que dava pra ter nunca chegava a 100%. Trabalho concluído aparecia como
-- trabalho pendente, e a coluna Promoções passava a cobrar o que não existe.
--
-- POR QUE A CHAVE É A CIDADE E NÃO O PARCEIRO
-- É afirmação sobre a praça, não sobre a loja. Por parceiro, limpar Muriaé
-- custaria 206 cliques — e aí a marcação não resolve nada. Marcada uma vez,
-- vale pra todo mundo da cidade.
--
-- O QUE ELA NÃO FAZ
-- Não mexe no KPI de Captação de Promoção. Aquele número tem meta (80%) e sai
-- do banco, contando parceiro com item aprovado; esconder campanha aqui muda o
-- DENOMINADOR da coluna, não o numerador do KPI. Ou seja: não dá pra bater
-- meta escondendo campanha.
--
-- E o banco continua ganhando: se um parceiro da cidade TEM item vivo numa
-- campanha marcada aqui, a campanha aparece normalmente na linha dele — o fato
-- vale mais que a marcação (ver `computePromoResumo`).
--
-- COMO RODAR
-- Cole no SQL Editor do Supabase (uma vez).
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists public.campanha_cidade_cs (
    localidade_id  text        not null,   -- localidade.id do banco (mesma chave do promo-status)
    campanha_id    text        not null,   -- id derivado do nome da campanha (ver campaignIdFromNome)
    -- Por que não é ofertada aqui. Texto livre e opcional: serve de memória pro
    -- próximo CS que abrir a cidade e estranhar a campanha faltando.
    motivo         text,
    -- Quem marcou. A marcação vale pra cidade inteira, então ter autor importa.
    marcado_por    text,
    atualizado_em  timestamptz not null default now(),
    primary key (localidade_id, campanha_id)
);

comment on table public.campanha_cidade_cs is
    'Campanha vigente no CMS que o CS NÃO oferta nesta cidade. A linha existir = não ofertada. Sai do denominador da coluna Promoções; não entra no KPI.';

create index if not exists campanha_cidade_cs_campanha_idx on public.campanha_cidade_cs (campanha_id);

-- ── Segurança ────────────────────────────────────────────────────────────
-- Escrita pelo navegador é necessária: quem marca é o CS, na própria tabela.
-- Mesma régua de `campanha_status_cs` e `partner_status_overrides`.
alter table public.campanha_cidade_cs enable row level security;

drop policy if exists "leitura app" on public.campanha_cidade_cs;
create policy "leitura app" on public.campanha_cidade_cs for select using (true);

drop policy if exists "escrita app" on public.campanha_cidade_cs;
create policy "escrita app" on public.campanha_cidade_cs for all using (true) with check (true);
