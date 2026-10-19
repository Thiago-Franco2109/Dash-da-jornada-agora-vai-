import type { OkrTrimestre } from './hooks/useOkrTrimestre';

/**
 * Recorte REAL da resposta da OKR (trimestre 2026-Q4), só para o preview da
 * aba Diário — ver src/preview-diario.tsx.
 *
 * É dado de verdade, baixado da function `okr-trimestre`, justamente para o
 * bloco de engajamento do relatório ser conferido com os estados que acontecem
 * na prática: loja que cruzou a régua dos 14 pedidos, loja na faixa de quase lá
 * e loja que caiu. Dado inventado não cobriria isso.
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
        "corte": "2026-10-19",
        "hoje": "2026-10-19",
        "dadosAte": "2026-10-19",
        "meses": [
            "2026-10",
            "2026-11",
            "2026-12"
        ],
        "mesCorrente": "2026-10",
        "mesAnterior": "2026-09"
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
        "metaKr1": 80,
        "janelaEngajada": 28,
        "pedidosEngajada": 14,
        "metaKr2": 38,
        "faturamentoMinimo": 1000,
        "metaKr3": 50,
        "desdeEngajada": "2026-09-22",
        "desdeAnterior": "2026-08-25",
        "ateAnterior": "2026-09-21"
    },
    "kr1": {
        "meta": 80,
        "parceiros": [
            {
                "id": 28627,
                "nome": "Açaí Rota 66",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2026-10-16",
                "pedidos": 0,
                "atingiu": false,
                "concluida": false,
                "diasRestantes": 11,
                "relancamento": false,
                "trocaDono": false,
                "docAnterior": "",
                "docAtual": "145.911.827-89"
            },
            {
                "id": 28628,
                "nome": "Delivery Rota 66",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2026-10-16",
                "pedidos": 0,
                "atingiu": false,
                "concluida": false,
                "diasRestantes": 11,
                "relancamento": false,
                "trocaDono": false,
                "docAnterior": "",
                "docAtual": "145.911.827-89"
            },
            {
                "id": 28618,
                "nome": "Açaí do Eton",
                "cidade": "Espera Feliz",
                "lancamento": "2026-10-13",
                "pedidos": 6,
                "atingiu": true,
                "concluida": false,
                "diasRestantes": 8,
                "relancamento": false,
                "trocaDono": false,
                "docAnterior": "",
                "docAtual": "151.054.676-63"
            },
            {
                "id": 28617,
                "nome": "Bacon Fest",
                "cidade": "Carangola",
                "lancamento": "2026-10-07",
                "pedidos": 6,
                "atingiu": true,
                "concluida": false,
                "diasRestantes": 2,
                "relancamento": false,
                "trocaDono": false,
                "docAnterior": "",
                "docAtual": "33.186.334/0001-50"
            }
        ]
    },
    "kr2": {
        "meta": 38,
        "parceiros": [
            {
                "id": 28606,
                "nome": "Casa do Pastel",
                "cidade": "Barroso",
                "lancamento": "2026-10-02",
                "pedidos28d": 33,
                "pedidos28dAnterior": 0,
                "engajada": true,
                "cruzou": true,
                "caiu": false,
                "ultimoPedido": "2026-10-16",
                "diasSemPedido": 3
            },
            {
                "id": 27373,
                "nome": "Açaí Dicasa",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2025-03-07",
                "pedidos28d": 21,
                "pedidos28dAnterior": 10,
                "engajada": true,
                "cruzou": true,
                "caiu": false,
                "ultimoPedido": "2026-10-18",
                "diasSemPedido": 1
            },
            {
                "id": 27326,
                "nome": "Salgados Ki Massa",
                "cidade": "Bom Jesus do Itabapoana - RJ / Bom Jesus do Norte - ES",
                "lancamento": "2025-02-13",
                "pedidos28d": 19,
                "pedidos28dAnterior": 11,
                "engajada": true,
                "cruzou": true,
                "caiu": false,
                "ultimoPedido": "2026-10-15",
                "diasSemPedido": 4
            },
            {
                "id": 28307,
                "nome": "Receita de Família",
                "cidade": "Espera Feliz",
                "lancamento": "2026-05-08",
                "pedidos28d": 13,
                "pedidos28dAnterior": 9,
                "engajada": false,
                "cruzou": false,
                "caiu": false,
                "ultimoPedido": "2026-10-18",
                "diasSemPedido": 1
            },
            {
                "id": 26882,
                "nome": "Espaço Gourmet",
                "cidade": "Carandaí",
                "lancamento": "2024-06-06",
                "pedidos28d": 12,
                "pedidos28dAnterior": 17,
                "engajada": false,
                "cruzou": false,
                "caiu": true,
                "ultimoPedido": "2026-10-18",
                "diasSemPedido": 1
            },
            {
                "id": 27072,
                "nome": "Bocão Lanches e Açaiteria",
                "cidade": "Carangola",
                "lancamento": "2024-09-19",
                "pedidos28d": 12,
                "pedidos28dAnterior": 15,
                "engajada": false,
                "cruzou": false,
                "caiu": true,
                "ultimoPedido": "2026-10-14",
                "diasSemPedido": 5
            },
            {
                "id": 26882,
                "nome": "Espaço Gourmet",
                "cidade": "Carandaí",
                "lancamento": "2024-06-06",
                "pedidos28d": 12,
                "pedidos28dAnterior": 17,
                "engajada": false,
                "cruzou": false,
                "caiu": true,
                "ultimoPedido": "2026-10-18",
                "diasSemPedido": 1
            },
            {
                "id": 27072,
                "nome": "Bocão Lanches e Açaiteria",
                "cidade": "Carangola",
                "lancamento": "2024-09-19",
                "pedidos28d": 12,
                "pedidos28dAnterior": 15,
                "engajada": false,
                "cruzou": false,
                "caiu": true,
                "ultimoPedido": "2026-10-14",
                "diasSemPedido": 5
            },
            {
                "id": 26766,
                "nome": "Pachola Lanches",
                "cidade": "Espera Feliz",
                "lancamento": "2024-03-14",
                "pedidos28d": 96,
                "pedidos28dAnterior": 107,
                "engajada": true,
                "cruzou": false,
                "caiu": false,
                "ultimoPedido": "2026-10-17",
                "diasSemPedido": 2
            },
            {
                "id": 27090,
                "nome": "Delivery da Marina",
                "cidade": "Carangola",
                "lancamento": "2024-10-04",
                "pedidos28d": 87,
                "pedidos28dAnterior": 112,
                "engajada": true,
                "cruzou": false,
                "caiu": false,
                "ultimoPedido": "2026-10-18",
                "diasSemPedido": 1
            }
        ]
    },
    "kr3": {
        "meta": 50,
        "lojas": [
            {
                "id": 27972,
                "nome": "EXPRESS DI ROMA PIZZA",
                "cidade": "Patrocínio",
                "ligada": true,
                "porMes": {
                    "2026-09": 38788.2,
                    "2026-10": 25389.1
                },
                "faturamentoMes": 25389.1,
                "acima": true
            },
            {
                "id": 28241,
                "nome": "Restaurante do Darcy",
                "cidade": "Guaçuí",
                "ligada": true,
                "porMes": {
                    "2026-09": 17860,
                    "2026-10": 12145
                },
                "faturamentoMes": 12145,
                "acima": true
            },
            {
                "id": 28276,
                "nome": "Star Burguer",
                "cidade": "Barroso",
                "ligada": true,
                "porMes": {
                    "2026-09": 16090.61,
                    "2026-10": 8810.49
                },
                "faturamentoMes": 8810.49,
                "acima": true
            },
            {
                "id": 27873,
                "nome": "Lalanza Hamburgueria e Pizzaria",
                "cidade": "Martinho Campos",
                "ligada": true,
                "porMes": {
                    "2026-09": 13717,
                    "2026-10": 8291
                },
                "faturamentoMes": 8291,
                "acima": true
            }
        ]
    }
} as unknown as OkrTrimestre;
