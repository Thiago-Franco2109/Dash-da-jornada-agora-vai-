import { useEffect, useCallback, useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────
// Cards do quadro "[SC] Onboarding e Jornada" por estabelecimento
// (Function trello-jornada).
//
// Serve pra duas coisas:
//   - link do card, pra abrir direto do painel (o parceiro JÁ lançado não
//     tinha link nenhum; só o pré-lançamento tinha, e de outro quadro);
//   - campos personalizados do card, que já são onde o CS marca o status das
//     campanhas à mão.
// ─────────────────────────────────────────────────────────────────────────

const FN_URL = '/.netlify/functions/trello-jornada';
const FN_GRAVAR = '/.netlify/functions/trello-campo-gravar';
const FN_CRIAR = '/.netlify/functions/trello-card-criar';

export interface CardJornada {
    cardId: string;
    nome: string;
    url: string;
    lista: string;
    /** Campos personalizados do card: nome do campo → valor legível. */
    campos: Record<string, string>;
}

export interface CampoDoQuadro {
    id: string;
    nome: string;
    tipo: string;
    opcoes: { id: string; texto: string }[];
}

export interface TrelloJornadaData {
    /** porEstab[estabId] = card. Casado por ID, nunca por nome. */
    porEstab: Record<string, CardJornada>;
    camposDoQuadro: CampoDoQuadro[];
    /** Lista onde o card nasce quando o painel cria um. */
    listaEntrada: { id: string; nome: string } | null;
    /** Card template do quadro — traz checklist e campos pro card novo. */
    modeloId: string | null;
}

const VAZIO: TrelloJornadaData = { porEstab: {}, camposDoQuadro: [], listaEntrada: null, modeloId: null };

/** Store de módulo com assinantes — o mesmo dado serve tabela, CRM e tela do
 *  parceiro, e é um fetch só pro quadro inteiro (33 cards). */
interface Estado {
    data: TrelloJornadaData;
    carregado: boolean;
    erro: string | null;
}

let _estado: Estado = { data: VAZIO, carregado: false, erro: null };
const _assinantes = new Set<() => void>();
let _carregando: Promise<void> | null = null;

function publicar(parcial: Partial<Estado>) {
    _estado = { ..._estado, ...parcial };
    for (const fn of _assinantes) fn();
}

async function buscar(): Promise<TrelloJornadaData> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar os cards do Trello.`);
    }
    return {
        porEstab: json.porEstab ?? {},
        camposDoQuadro: json.camposDoQuadro ?? [],
        listaEntrada: json.listaEntrada ?? null,
        modeloId: json.modeloId ?? null,
    };
}

function carregar(): void {
    if (_carregando) return;
    _carregando = buscar()
        .then(d => { publicar({ data: d, carregado: true, erro: null }); })
        .catch(err => {
            // Trello fora do ar não pode derrubar a tabela: sem o card, o botão
            // some e o resto da linha segue igual.
            console.warn('[useTrelloJornada] falha:', err);
            publicar({ erro: err instanceof Error ? err.message : 'falha ao carregar' });
        })
        .finally(() => { _carregando = null; });
}

export function useTrelloJornada() {
    const estado = useSyncExternalStore(
        cb => { _assinantes.add(cb); return () => { _assinantes.delete(cb); }; },
        () => _estado,
    );

    useEffect(() => {
        if (!_estado.carregado) carregar();
    }, []);

    const getCard = useCallback(
        (estabId: string | number | null | undefined): CardJornada | undefined => {
            if (estabId == null || String(estabId) === '') return undefined;
            return estado.data.porEstab[String(estabId)];
        },
        [estado.data.porEstab],
    );

    /**
     * Grava o valor de um campo de campanha no card. `valorTexto = null` limpa.
     *
     * Otimista: a célula muda na hora e volta atrás se o Trello recusar — a
     * reversão silenciosa seria indistinguível de "o clique não funcionou", por
     * isso o erro também é publicado.
     */
    const marcarCampo = useCallback(async (
        estabId: string,
        nomeCampo: string,
        valorTexto: string | null,
    ): Promise<boolean> => {
        const card = _estado.data.porEstab[String(estabId)];
        const campo = _estado.data.camposDoQuadro.find(c => c.nome === nomeCampo);
        // Card e campo são problemas DIFERENTES, com conserto diferente: um se
        // resolve criando o card, o outro rodando o script que sincroniza os
        // campos do quadro. Juntar os dois numa frase só obriga a adivinhar.
        if (!card) {
            publicar({ erro: `Este parceiro não tem card no quadro da jornada — crie o card pra ter onde salvar.` });
            return false;
        }
        if (!campo) {
            publicar({ erro: `O quadro não tem o campo "${nomeCampo}". Rode: node scripts/trello-campos-campanha.mjs --aplicar` });
            return false;
        }
        const opcao = valorTexto == null ? null : campo.opcoes.find(o => o.texto === valorTexto);
        if (valorTexto != null && !opcao) {
            publicar({ erro: `O campo "${nomeCampo}" não tem a opção "${valorTexto}".` });
            return false;
        }

        const anterior = card.campos[nomeCampo];
        const aplicar = (valor: string | undefined) => {
            const campos = { ...card.campos };
            if (valor == null) delete campos[nomeCampo];
            else campos[nomeCampo] = valor;
            publicar({
                data: {
                    ..._estado.data,
                    porEstab: { ..._estado.data.porEstab, [String(estabId)]: { ...card, campos } },
                },
                erro: null,
            });
        };

        aplicar(valorTexto ?? undefined); // otimista

        try {
            const res = await fetch(FN_GRAVAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include' as RequestCredentials,
                body: JSON.stringify({ cardId: card.cardId, campoId: campo.id, idValue: opcao?.id ?? '' }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || `Erro ${res.status}`);
            return true;
        } catch (err) {
            console.error('[useTrelloJornada] falha ao gravar:', err);
            aplicar(anterior);
            publicar({ erro: err instanceof Error ? err.message : 'falha ao gravar no Trello' });
            return false;
        }
    }, []);

    /**
     * Cria o card deste parceiro no quadro, no padrão "{id} - {nome}" que o
     * casamento por ID espera. Sem card não há onde gravar campo nenhum — e o
     * painel não pode oferecer uma marcação que vai falhar.
     */
    const criarCard = useCallback(async (estabId: string, nomeParceiro: string): Promise<boolean> => {
        const { listaEntrada, modeloId } = _estado.data;
        if (!listaEntrada) {
            publicar({ erro: 'Não achei a lista de entrada do quadro pra criar o card.' });
            return false;
        }
        try {
            const res = await fetch(FN_CRIAR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include' as RequestCredentials,
                body: JSON.stringify({
                    listaId: listaEntrada.id,
                    // O título É a chave: `trello-jornada` casa card e parceiro
                    // por este "{id} - {nome}".
                    nome: `${estabId} - ${nomeParceiro}`,
                    ...(modeloId ? { modeloId } : {}),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) throw new Error(json?.error || `Erro ${res.status}`);
            // Recarrega o quadro: é o que traz o card novo (e o id dele) pro
            // resto da tela, incluindo o botão "Abrir card".
            _estado = { ..._estado, carregado: false };
            carregar();
            return true;
        } catch (err) {
            console.error('[useTrelloJornada] falha ao criar card:', err);
            publicar({ erro: err instanceof Error ? err.message : 'falha ao criar o card' });
            return false;
        }
    }, []);

    return {
        cards: estado.data.porEstab,
        camposDoQuadro: estado.data.camposDoQuadro,
        getCard,
        marcarCampo,
        criarCard,
        carregado: estado.carregado,
        erro: estado.erro,
        refetch: carregar,
    };
}
