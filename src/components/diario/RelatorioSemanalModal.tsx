import { useCallback, useMemo } from 'react';
import type { AnotacaoDiario } from '../../types/diario';
import { useDiario } from '../../hooks/useDiario';
import { useTrelloAtividadeHoje } from '../../hooks/useTrelloAtividadeHoje';
import { janelaDaSemana, semanaAnterior, rotuloPeriodo, hojeSP, fimDaSemana } from '../../utils/diarioDatas';
import { montarRelatorioSemanal } from '../../utils/relatorioSemanal';
import { nomeArquivoRelatorio } from '../../utils/relatorioDiario';
import RelatorioModal from './RelatorioModal';

/**
 * Relatório da semana — o que vai pro Discord do chefe na sexta.
 *
 * Busca os próprios dados (duas semanas de diário e duas de Trello) e só é
 * montado quando a pessoa abre: são quatro chamadas, caras demais pra rodarem
 * junto com a aba Diário o tempo todo.
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

    // O hook segura a resposta antiga enquanto busca a nova; sem conferir a
    // janela, a semana passada apareceria como se fosse a atual.
    const atividade = atividadeBruta?.de === janela.de && atividadeBruta?.ate === janela.ate ? atividadeBruta : null;
    const atividadeAnterior = anteriorBruta?.de === anterior.de && anteriorBruta?.ate === anterior.ate ? anteriorBruta : null;

    const montarTexto = useCallback(
        (escolhidas: AnotacaoDiario[], incluirTrello: boolean) => montarRelatorioSemanal({
            perfil,
            janela,
            anotacoes: escolhidas,
            atividade: incluirTrello ? atividade : null,
            janelaAnterior: anterior,
            // Sem o bloco do Trello não existe comparativo: ele é feito só de
            // número do Trello, justamente por não passar pela curadoria.
            atividadeAnterior: incluirTrello ? atividadeAnterior : null,
            cidadePorParceiro,
        }),
        [perfil, janela, anterior, atividade, atividadeAnterior, cidadePorParceiro],
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
            montarTexto={montarTexto}
            nomeArquivo={nomeArquivoRelatorio(janela.de, perfil, 'semanal')}
            carregando={carregandoDiario || carregandoTrello || carregandoAnterior}
            aviso={aviso}
            onFechar={onFechar}
        />
    );
}
