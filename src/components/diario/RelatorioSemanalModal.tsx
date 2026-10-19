import { useCallback, useMemo } from 'react';
import type { AnotacaoDiario } from '../../types/diario';
import { useDiario } from '../../hooks/useDiario';
import { useTrelloAtividadeHoje } from '../../hooks/useTrelloAtividadeHoje';
import { useOkrTrimestre, trimestreAtual } from '../../hooks/useOkrTrimestre';
import { useExclusaoOkr } from '../../hooks/marcacoesOkr';
import { calcularFiguras } from '../../utils/okrFiguras';
import { secoesEngajamento } from '../../utils/relatorioEngajamento';
import type { BlocoExtra } from './RelatorioModal';
import { janelaDaSemana, semanaAnterior, rotuloPeriodo, hojeSP, fimDaSemana } from '../../utils/diarioDatas';
import { montarRelatorioSemanal } from '../../utils/relatorioSemanal';
import { nomeArquivoRelatorio } from '../../utils/relatorioDiario';
import RelatorioModal from './RelatorioModal';

/**
 * Relatório da semana — o que vai pro Discord do chefe na sexta.
 *
 * Busca os próprios dados (duas semanas de diário, duas de Trello e o plano de
 * recuperação do trimestre) e só é montado quando a pessoa abre: são cinco
 * consultas, caras demais pra rodarem junto com a aba Diário o tempo todo.
 *
 * O plano de recuperação entra porque é o que o chefe disse que conta — loja
 * que estava em risco e voltou a vender, e o que ainda está em andamento. Os
 * números vêm de `calcularFiguras`, o mesmo cálculo da aba OKR: recalcular
 * aqui criaria um segundo placar, pronto pra divergir do que a tela mostra.
 */

interface RelatorioSemanalModalProps {
    perfil: string;
    /** Qualquer dia da semana desejada — a janela é derivada dele. */
    dia: string;
    cidadePorParceiro: Map<string, string>;
    onFechar: () => void;
}

export default function RelatorioSemanalModal({
    perfil, dia, cidadePorParceiro, onFechar,
}: RelatorioSemanalModalProps) {
    const hoje = hojeSP();
    const janela = useMemo(() => janelaDaSemana(dia, hoje), [dia, hoje]);
    const anterior = useMemo(() => semanaAnterior(janela), [janela]);

    const { anotacoes, carregando: carregandoDiario } = useDiario(perfil, janela.de, janela.ate);

    const { data: atividadeBruta, isLoading: carregandoTrello } = useTrelloAtividadeHoje({
        de: janela.de, ate: janela.ate, anexos: true,
    });
    const { data: anteriorBruta, isLoading: carregandoAnterior } = useTrelloAtividadeHoje({
        de: anterior.de, ate: anterior.ate, anexos: true,
    });

    // ── Engajamento das lojas (KR 2) ─────────────────────────────────────
    const trimestre = trimestreAtual();
    const { dados: okr } = useOkrTrimestre(trimestre);
    const fora = useExclusaoOkr();

    const figuras = useMemo(
        () => (okr ? calcularFiguras(okr, fora.ids) : null),
        [okr, fora.ids],
    );

    const secoesPlano = useMemo(
        () => (okr && figuras
            ? secoesEngajamento({
                lojas: figuras.engajamento,
                parametros: okr.parametros,
                engajadas: figuras.kr2.feito,
                base: figuras.kr2.base,
                pct: figuras.kr2.pct,
            })
            : []),
        [okr, figuras],
    );

    const blocosExtras: BlocoExtra[] = useMemo(
        () => (secoesPlano.length === 0 || !figuras ? [] : [{
            id: 'recuperacao',
            titulo: 'Engajamento das lojas (KR 2)',
            detalhe: `${figuras.kr2.cruzaram} viraram · ${figuras.kr2.quaseLa} quase lá · ${figuras.kr2.cairam} caíram`,
        }]),
        [secoesPlano, figuras],
    );

    // O hook segura a resposta antiga enquanto busca a nova; sem conferir a
    // janela, a semana passada apareceria como se fosse a atual.
    const atividade = atividadeBruta?.de === janela.de && atividadeBruta?.ate === janela.ate ? atividadeBruta : null;
    const atividadeAnterior = anteriorBruta?.de === anterior.de && anteriorBruta?.ate === anterior.ate ? anteriorBruta : null;

    const montarTexto = useCallback(
        (
            escolhidas: AnotacaoDiario[],
            incluirTrello: boolean,
            extrasDesligados: ReadonlySet<string>,
        ) => montarRelatorioSemanal({
            perfil,
            janela,
            anotacoes: escolhidas,
            atividade: incluirTrello ? atividade : null,
            janelaAnterior: anterior,
            // Sem o bloco do Trello não existe comparativo: ele é feito só de
            // número do Trello, justamente por não passar pela curadoria.
            atividadeAnterior: incluirTrello ? atividadeAnterior : null,
            cidadePorParceiro,
            secoesRecuperacao: extrasDesligados.has('recuperacao') ? [] : secoesPlano,
        }),
        [perfil, janela, anterior, atividade, atividadeAnterior, cidadePorParceiro, secoesPlano],
    );

    // Semana ainda correndo: o comparativo usa a MESMA quantidade de dias dos
    // dois lados, e dizer isso evita a leitura de que a semana passada "rendeu
    // mais" só por estar inteira.
    const semanaFechada = janela.ate === fimDaSemana(dia);
    const aviso = semanaFechada
        ? undefined
        : `Semana ainda correndo: o comparativo usa os mesmos dias dos dois lados (${rotuloPeriodo(anterior)}).`;

    return (
        <RelatorioModal
            titulo="Relatório da semana"
            subtitulo={rotuloPeriodo(janela)}
            anotacoes={anotacoes}
            atividade={atividade}
            blocosExtras={blocosExtras}
            montarTexto={montarTexto}
            nomeArquivo={nomeArquivoRelatorio(janela.de, perfil, 'semanal')}
            // A OKR fica de fora da trava de carregamento de propósito: é a
            // consulta mais lenta, e travar o relatório inteiro por ela faria
            // esperar por um bloco que é opcional. Ele aparece quando chegar.
            carregando={carregandoDiario || carregandoTrello || carregandoAnterior}
            aviso={aviso}
            onFechar={onFechar}
        />
    );
}
