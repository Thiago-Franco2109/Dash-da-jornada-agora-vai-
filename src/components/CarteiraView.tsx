import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import type { CarteiraEstabelecimento, CarteiraMetrica, CarteiraRow } from '../types/carteira';
import { cityBelongsToManager, type Manager } from '../config/managerMapping';
import { getInitialGrupo } from '../config/carteiraGrupoMapping';
import { useCarteiraClassificacao } from '../hooks/useCarteiraClassificacao';
import { fetchCarteiraDrillDown } from '../hooks/useCarteiraData';
import { pctCellClass, CARTEIRA_COLUMNS as COLUMNS } from '../utils/carteiraColumns';
import EstablishmentDrillDownModal from './EstablishmentDrillDownModal';

interface CarteiraViewProps {
    rows: CarteiraRow[];
    isLoading: boolean;
    isRefreshing?: boolean;
    error: string | null;
    isUsingCache: boolean;
    lastSyncTime: Date | null;
    onRefresh: () => void;
    managerFilter?: string;
    /** Abre a tela interna do parceiro (mesma navegação da busca Cmd+K). */
    onNavigateToPartner?: (estabelecimento: CarteiraEstabelecimento) => void;
}

/**
 * Célula de texto que vira input ao clicar. Salva ao sair do campo ou no
 * Enter; Esc desfaz. Usada só em divisão e grupo, que são digitados à mão.
 */
function CelulaEditavel({
    valor,
    rotulo,
    cidade,
    onSalvar,
}: {
    valor: string;
    rotulo: string;
    cidade: string;
    onSalvar: (valor: string) => void;
}) {
    const [editando, setEditando] = useState(false);
    const [rascunho, setRascunho] = useState(valor);

    if (!editando) {
        return (
            <button
                type="button"
                onClick={() => { setRascunho(valor); setEditando(true); }}
                title={`Editar ${rotulo} de ${cidade}`}
                className={`w-full text-left px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    valor ? 'text-slate-700 dark:text-slate-300' : 'text-slate-300 dark:text-slate-600 italic'
                }`}
            >
                {valor || 'definir'}
            </button>
        );
    }

    const confirmar = () => { setEditando(false); onSalvar(rascunho.trim()); };

    return (
        <input
            autoFocus
            value={rascunho}
            onChange={e => setRascunho(e.target.value)}
            onBlur={confirmar}
            onKeyDown={e => {
                if (e.key === 'Enter') confirmar();
                if (e.key === 'Escape') { setRascunho(valor); setEditando(false); }
            }}
            aria-label={`${rotulo} de ${cidade}`}
            className="w-28 px-1 py-0.5 rounded border border-emerald-400 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none"
        />
    );
}

export default function CarteiraView({
    rows,
    isLoading,
    isRefreshing = false,
    error,
    isUsingCache,
    lastSyncTime,
    onRefresh,
    managerFilter = '',
    onNavigateToPartner,
}: CarteiraViewProps) {
    const [grupoFilter, setGrupoFilter] = useState('');
    const [cidadeFilter, setCidadeFilter] = useState('');
    const [erroSalvar, setErroSalvar] = useState<string | null>(null);
    const [drillDown, setDrillDown] = useState<{ cidade: string; metrica: CarteiraMetrica; label: string } | null>(null);

    // Divisão e grupo não existem no banco Bigou: são classificação comercial,
    // guardada no Supabase e editada aqui mesmo (ver carteira_cidade.sql).
    const { mapa: classificacao, salvar } = useCarteiraClassificacao();

    const rowsClassificadas = useMemo(
        () => rows.map(row => ({
            ...row,
            divisao: classificacao[row.cidade]?.divisao || row.divisao,
            grupo: classificacao[row.cidade]?.grupo || row.grupo || getInitialGrupo(row.cidade),
        })),
        [rows, classificacao],
    );

    const salvarClassificacao = async (cidade: string, campo: 'divisao' | 'grupo', valor: string) => {
        const atual = classificacao[cidade] ?? { divisao: '', grupo: '' };
        if ((atual[campo] ?? '') === valor) return;
        try {
            setErroSalvar(null);
            await salvar(cidade, { ...atual, [campo]: valor });
        } catch (err) {
            setErroSalvar(err instanceof Error ? err.message : `Falha ao salvar ${campo} de ${cidade}`);
        }
    };

    const grupos = useMemo(
        () => Array.from(new Set(rowsClassificadas.map(r => r.grupo).filter(Boolean))).sort(),
        [rowsClassificadas],
    );

    const filteredRows = useMemo(() => {
        return rowsClassificadas.filter(row => {
            if (managerFilter && !cityBelongsToManager(row.cidade, managerFilter as Manager)) return false;
            if (grupoFilter && row.grupo !== grupoFilter) return false;
            if (cidadeFilter && !row.cidade.toLowerCase().includes(cidadeFilter.toLowerCase())) return false;
            return true;
        });
    }, [rowsClassificadas, grupoFilter, cidadeFilter, managerFilter]);

    const totals = useMemo(() => {
        return filteredRows.reduce(
            (acc, row) => ({
                total: acc.total + row.total,
                ativos: acc.ativos + row.ativos,
                suspenso: acc.suspenso + row.suspenso,
                pendente: acc.pendente + row.pendente,
                promoAprovada: acc.promoAprovada + row.promoAprovada,
                semPromo: acc.semPromo + row.semPromo,
                cupomAprovado: acc.cupomAprovado + row.cupomAprovado,
                semCupom: acc.semCupom + row.semCupom,
            }),
            {
                total: 0,
                ativos: 0,
                suspenso: 0,
                pendente: 0,
                promoAprovada: 0,
                semPromo: 0,
                cupomAprovado: 0,
                semCupom: 0,
            },
        );
    }, [filteredRows]);

    const renderCell = (row: CarteiraRow, col: (typeof COLUMNS)[number]) => {
        const { key, isPct, metrica, label } = col;
        const value = row[key];

        if (key === 'divisao' || key === 'grupo') {
            return (
                <td key={key} className="px-2 py-2 text-sm text-left whitespace-nowrap">
                    <CelulaEditavel
                        valor={String(value ?? '')}
                        rotulo={key === 'divisao' ? 'divisão' : 'grupo'}
                        cidade={row.cidade}
                        onSalvar={valor => salvarClassificacao(row.cidade, key, valor)}
                    />
                </td>
            );
        }

        if (isPct && typeof value === 'number') {
            return (
                <td key={String(key)} className={`px-2 py-2 text-center text-sm ${pctCellClass(value)}`}>
                    {value}%
                </td>
            );
        }

        if (metrica && typeof value === 'number') {
            return (
                <td key={String(key)} className="px-2 py-2 text-center">
                    <button
                        type="button"
                        onClick={() => setDrillDown({ cidade: row.cidade, metrica, label })}
                        disabled={value === 0}
                        className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums px-2 py-0.5 rounded hover:bg-primary/10 hover:text-primary disabled:hover:bg-transparent disabled:cursor-default transition-colors"
                    >
                        {value.toLocaleString('pt-BR')}
                    </button>
                </td>
            );
        }

        return (
            <td
                key={String(key)}
                className={`px-2 py-2 text-sm text-slate-700 dark:text-slate-300 ${
                    key === 'cidade' ? 'text-left whitespace-nowrap' : 'text-center'
                }`}
            >
                {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
            </td>
        );
    };

    return (
        <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white dark:bg-slate-900">
            <div className="shrink-0 px-6 py-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div>
                        <h1 className="text-slate-900 dark:text-white text-3xl font-bold leading-tight tracking-tight mb-2">
                            Carteira
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 text-base">
                            Visão por cidade e grupo — contagens direto do banco Bigou.
                        </p>
                        {managerFilter && (
                            <p className="text-xs text-primary font-semibold mt-1">
                                Filtrando carteira de {managerFilter}
                            </p>
                        )}
                        <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                            <strong>Divisão</strong> e <strong>grupo</strong> são classificação de vocês: clique na célula para editar.
                        </p>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={isLoading || isRefreshing}
                            className="flex items-center gap-2 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <span className={`material-symbols-outlined text-lg ${isLoading || isRefreshing ? 'animate-spin text-primary' : ''}`}>
                                sync
                            </span>
                            {isLoading || isRefreshing ? 'Atualizando...' : 'Atualizar agora'}
                        </button>
                        {lastSyncTime && (
                            <p className="text-xs text-slate-400 mt-2">
                                Última atualização: {format(lastSyncTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                            </p>
                        )}
                    </div>
                </div>

                {isUsingCache && (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                        Exibindo cache local — não foi possível sincronizar agora.
                    </div>
                )}
                {error && !isUsingCache && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
                        {error}
                    </div>
                )}

                {erroSalvar && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-500/10 border border-red-200 rounded-lg text-sm text-red-700 dark:text-red-300">
                        Não deu para salvar a classificação: {erroSalvar}
                    </div>
                )}
            </div>

            <div className="shrink-0 px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap gap-3 items-center bg-slate-50/50 dark:bg-slate-900/50">
                <label className="flex items-center gap-2 text-sm">
                    <span className="text-slate-500 font-medium">Grupo</span>
                    <select
                        value={grupoFilter}
                        onChange={e => setGrupoFilter(e.target.value)}
                        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    >
                        <option value="">Todos</option>
                        {grupos.map(g => (
                            <option key={g} value={g}>{g}</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm flex-1 min-w-[200px]">
                    <span className="text-slate-500 font-medium">Cidade</span>
                    <input
                        type="search"
                        value={cidadeFilter}
                        onChange={e => setCidadeFilter(e.target.value)}
                        placeholder="Filtrar cidade..."
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm"
                    />
                </label>
                <span className="text-xs text-slate-400 ml-auto">
                    {filteredRows.length} linha{filteredRows.length !== 1 ? 's' : ''}
                </span>
            </div>

            <div className="flex-1 min-h-0 overflow-auto p-4 md:p-6">
                {isLoading && rows.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3" />
                        <p className="text-slate-500 text-sm">Carregando carteira...</p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm min-w-max">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                            <thead className="bg-slate-100 dark:bg-slate-800">
                                <tr>
                                    {COLUMNS.map(col => (
                                        <th
                                            key={col.key}
                                            scope="col"
                                            className={`px-2 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300 ${
                                                col.align === 'left' ? 'text-left' : 'text-center'
                                            }`}
                                        >
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                {filteredRows.map(row => (
                                    <tr key={`${row.cidade}-${row.grupo}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                        {COLUMNS.map(col => renderCell(row, col))}
                                    </tr>
                                ))}
                            </tbody>
                            {filteredRows.length > 0 && (
                                <tfoot className="bg-slate-50 dark:bg-slate-800/80 border-t-2 border-slate-200 dark:border-slate-600">
                                    <tr className="font-bold text-sm text-slate-800 dark:text-slate-200">
                                        <td colSpan={3} className="px-2 py-3 text-left">
                                            Total ({filteredRows.length} grupos)
                                        </td>
                                        <td className="px-2 py-3 text-center">{totals.total.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.ativos.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.suspenso.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.pendente.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{totals.promoAprovada.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.semPromo.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center text-slate-400">—</td>
                                        <td className="px-2 py-3 text-center">{totals.cupomAprovado.toLocaleString('pt-BR')}</td>
                                        <td className="px-2 py-3 text-center">{totals.semCupom.toLocaleString('pt-BR')}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                        {filteredRows.length === 0 && !isLoading && (
                            <p className="p-8 text-center text-sm text-slate-500">Nenhum dado encontrado para os filtros atuais.</p>
                        )}
                    </div>
                )}
            </div>

            {drillDown && (
                <EstablishmentDrillDownModal
                    title={`${drillDown.label} - ${drillDown.cidade}`}
                    fetchList={() => fetchCarteiraDrillDown(drillDown.cidade, drillDown.metrica)}
                    onNavigateToPartner={onNavigateToPartner}
                    onClose={() => setDrillDown(null)}
                />
            )}
        </div>
    );
}
