import type { OkrTrimestre } from './hooks/useOkrTrimestre';

/**
 * Recorte REAL do KR 2.3 (6 lojas, trimestre 2026-Q4), só para o preview da
 * aba Diário — ver src/preview-diario.tsx.
 *
 * É dado de verdade, baixado da function `okr-trimestre`, justamente para o
 * bloco de recuperação do relatório ser conferido com os estados que
 * acontecem na prática: loja que emendou as 4 semanas, loja parada há semanas
 * e loja com cancelamento acima do teto. Dado inventado não cobriria isso.
 *
 * Não entra no build de produção: só o preview importa, e o vite constrói
 * apenas index.html.
 */
export const OKR_AMOSTRA = {
    "ok": true,
    "trimestre": {
        "id": "2026-Q4",
        "inicio": "2026-10-01",
        "fim": "2026-12-31",
        "corte": "2026-10-15",
        "hoje": "2026-10-15",
        "dadosAte": "2026-10-14",
        "meses": [
            "2026-10",
            "2026-11",
            "2026-12"
        ]
    },
    "cidades": [
        "Barroso",
        "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
        "Carandaí",
        "Carangola",
        "Espera Feliz"
    ],
    "parametros": {
        "janelaNovos": 14,
        "pedidosNovos": 5,
        "metaKr22": 20,
        "diasParado": 7,
        "semanasReversao": 4,
        "tetoCancelamentoPct": 10,
        "metaKr23": 30,
        "metaKr41": 15400,
        "desafioKr41": 16000,
        "checkpointsKr41": [
            4350,
            9350,
            15400
        ],
        "janelaLojaAtiva": 30,
        "pedidosLojaAtiva": 30,
        "metaKr42": 40,
        "baseKr42": 23,
        "checkpointsKr42": [
            28,
            34,
            40
        ],
        "semanas": [
            {
                "de": "2026-10-09",
                "ate": "2026-10-15"
            },
            {
                "de": "2026-10-02",
                "ate": "2026-10-08"
            },
            {
                "de": "2026-09-25",
                "ate": "2026-10-01"
            },
            {
                "de": "2026-09-18",
                "ate": "2026-09-24"
            }
        ],
        "desde30d": "2026-09-16"
    },
    "kr22": {
        "meta": 20,
        "parceiros": []
    },
    "kr23": {
        "meta": 30,
        "parceiros": [
            {
                "id": 27275,
                "nome": "Baruch Restaurante e Pizzaria",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2025-02-07",
                "ultimoPedido": "2026-10-13",
                "diasSemPedido": 2,
                "maiorLacunaDias": 2,
                "semanasComPedido": [
                    true,
                    true,
                    true,
                    true
                ],
                "aceitos4sem": 20,
                "cancelados4sem": 2,
                "taxaCancelamentoPct": 9.1
            },
            {
                "id": 28110,
                "nome": "Fresco Sapore",
                "cidade": "Carangola",
                "lancamento": "2026-02-05",
                "ultimoPedido": "2026-10-12",
                "diasSemPedido": 3,
                "maiorLacunaDias": 6,
                "semanasComPedido": [
                    true,
                    true,
                    true,
                    true
                ],
                "aceitos4sem": 10,
                "cancelados4sem": 1,
                "taxaCancelamentoPct": 9.1
            },
            {
                "id": 28028,
                "nome": "Dog House",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2026-08-21",
                "ultimoPedido": "2026-09-14",
                "diasSemPedido": 31,
                "maiorLacunaDias": 15,
                "semanasComPedido": [
                    false,
                    false,
                    false,
                    false
                ],
                "aceitos4sem": 0,
                "cancelados4sem": 1,
                "taxaCancelamentoPct": 100
            },
            {
                "id": 28404,
                "nome": "Restaurante da Lola",
                "cidade": "Carangola",
                "lancamento": "2026-07-01",
                "ultimoPedido": "2026-09-19",
                "diasSemPedido": 26,
                "maiorLacunaDias": 15,
                "semanasComPedido": [
                    false,
                    false,
                    false,
                    true
                ],
                "aceitos4sem": 1,
                "cancelados4sem": 11,
                "taxaCancelamentoPct": 91.7
            },
            {
                "id": 26865,
                "nome": "Real Hamburgueria",
                "cidade": "Barroso",
                "lancamento": "2024-05-22",
                "ultimoPedido": null,
                "diasSemPedido": null,
                "maiorLacunaDias": 15,
                "semanasComPedido": [
                    false,
                    false,
                    false,
                    false
                ],
                "aceitos4sem": 0,
                "cancelados4sem": 4,
                "taxaCancelamentoPct": 100
            },
            {
                "id": 27016,
                "nome": "Aki Sorveteria",
                "cidade": "Carangola",
                "lancamento": "2024-08-22",
                "ultimoPedido": null,
                "diasSemPedido": null,
                "maiorLacunaDias": 15,
                "semanasComPedido": [
                    false,
                    false,
                    false,
                    false
                ],
                "aceitos4sem": 0,
                "cancelados4sem": 1,
                "taxaCancelamentoPct": 100
            }
        ]
    },
    "cardapioDigital": {
        "lojas": []
    },
    "kr41": {
        "meta": 15400,
        "desafio": 16000,
        "checkpoints": [
            4350,
            9350,
            15400
        ]
    },
    "kr42": {
        "meta": 40,
        "base": 23,
        "checkpoints": [
            28,
            34,
            40
        ]
    }
} as unknown as OkrTrimestre;
