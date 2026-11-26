import type { CampoDoQuadro } from '../hooks/useTrelloJornada';

/**
 * Ponte entre os CAMPOS PERSONALIZADOS do quadro "[SC] Onboarding e Jornada" e
 * as campanhas do CMS.
 *
 * O quadro é a fonte do status de campanha por parceiro: é lá que o CS já
 * marcava à mão antes do painel ter onde guardar (medido em 25/11/2026: 17 dos
 * 33 cards com ao menos um campo preenchido).
 *
 * Campo novo nasce com o nome EXATO da campanha no CMS (ver
 * scripts/trello-campos-campanha.mjs), então casa sozinho. O mapa abaixo existe
 * só pros campos antigos, criados à mão antes dessa convenção.
 */

/** Campo antigo do quadro → nome da campanha no CMS. */
export const ALIAS_CAMPO: Record<string, string> = {
    'Super promos': 'Super Promos!',
    'Tudo por 9,99': 'Tudo por R$9,99',
};

/**
 * Campo do quadro que NÃO é campanha de promoção. "Cupom" fica de fora porque
 * cupom não é item promocional: ele tem coluna própria no painel e sai de
 * `cupom_desconto`, não de `item_catalogo`.
 */
export const CAMPOS_FORA = new Set([
    'Cupom', 'Experiência do parceiro', 'Aumento %', 'Responsável pela loja', 'Faturamento Mínimo',
]);

/**
 * Os três valores que um campo de campanha aceita.
 *
 * A diferença entre os dois últimos é a parte que importa, e é fácil de errar:
 *
 *  - `NAO_OFERTADO` = "ainda não mandei a promo no WhatsApp do parceiro pra
 *    mostrar como funciona". É TRABALHO PENDENTE do CS e CONTINUA na conta.
 *  - `NAO_RODA` = "esta campanha não vai ser ofertada nesta praça". É a única
 *    que SAI da conta — é ela que deixa quem já fez tudo que dava fechar em
 *    "3/3 no ar".
 *
 * Ler `NAO_OFERTADO` como "não vai acontecer" esconde justamente o trabalho que
 * a coluna existe pra achar. Já aconteceu uma vez; por isso o aviso fica aqui.
 */
export const VALOR_ATIVOU = 'Ativou';
export const VALOR_NAO_OFERTADO = 'Não ofertado';
export const VALOR_NAO_RODA = 'Não roda na cidade';

function normalizar(nome: string): string {
    return nome
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[!?.]+$/g, '')
        .replace(/[^a-z0-9]+/g, '')
        .trim();
}

/** Nome da campanha no CMS que este campo representa. null = não é campanha. */
export function campanhaDoCampo(nomeCampo: string): string | null {
    if (CAMPOS_FORA.has(nomeCampo)) return null;
    return ALIAS_CAMPO[nomeCampo] ?? nomeCampo;
}

/** O campo do quadro que guarda o status desta campanha. */
export function campoDaCampanha(campos: CampoDoQuadro[], campanha: string): CampoDoQuadro | undefined {
    const alvo = normalizar(campanha);
    return campos.find(c => {
        const dele = campanhaDoCampo(c.nome);
        return dele != null && normalizar(dele) === alvo;
    });
}

/** Valores do card indexados por nome de CAMPANHA (não de campo). */
export function statusPorCampanha(campos: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [nomeCampo, valor] of Object.entries(campos)) {
        const campanha = campanhaDoCampo(nomeCampo);
        if (campanha) out[campanha] = valor;
    }
    return out;
}

/** A opção do campo cujo texto é `valor` — o Trello grava por id da opção. */
export function opcaoDoValor(campo: CampoDoQuadro, valor: string): { id: string; texto: string } | undefined {
    const alvo = normalizar(valor);
    return campo.opcoes.find(o => normalizar(o.texto) === alvo);
}
