
import { useState, useMemo } from 'react';
import {
    INITIAL_CITY_MANAGER_MAP,
    type Manager,
    type ProductModeKey,
} from '../config/managerMapping';
import { type EnrichedPerformanceRow } from '../utils/calculations';
import { useProductMode } from '../context/ProductModeContext';
import type { AtribuicoesCs } from '../hooks/useAtribuicaoCs';

interface ManagersViewProps {
    data: EnrichedPerformanceRow[];
    onMappingChange: () => void;
    atribuicoes: AtribuicoesCs;
    salvarCidade: (cidade: string, analista: Manager, mode: ProductModeKey) => Promise<unknown>;
    salvarParceiro: (
        estabId: string,
        analista: Manager,
        mode: ProductModeKey,
        info?: { estabelecimento?: string; cidade?: string },
    ) => Promise<void>;
}

export default function ManagersView({ data, onMappingChange, atribuicoes, salvarCidade, salvarParceiro }: ManagersViewProps) {
    const { mode, theme } = useProductMode();
    const [searchTerm, setSearchTerm] = useState('');
    const [buscaLoja, setBuscaLoja] = useState('');
    const [erro, setErro] = useState<string | null>(null);

    const overrides = atribuicoes.porCidade[mode] ?? {};
    const porLoja = useMemo(() => atribuicoes.porParceiro[mode] ?? {}, [atribuicoes, mode]);

    // Cidade "com carteira" = cidade que o marketplace já gerencia de fato
    // (cs_cidade no Supabase + a semente fixa). Não vem de contar
    // estabelecimento no banco: a própria loja de CD também tem delivery=1,
    // então toda cidade "se autodeclararia" com carteira e o filtro nunca
    // sobraria nada.
    const cidadesComCarteira = useMemo(
        () => new Set([
            ...Object.keys(INITIAL_CITY_MANAGER_MAP),
            ...Object.keys(atribuicoes.porCidade.marketplace ?? {}),
        ]),
        [atribuicoes],
    );

    /** Lojas fora da carteira: sem cidade, ou em cidade onde não operamos marketplace. */
    const lojasSemCarteira = useMemo(() => {
        if (cidadesComCarteira.size === 0) return [];
        return data
            .filter(d => {
                const cidade = (d.cidade || '').trim();
                return !cidade || !cidadesComCarteira.has(cidade);
            })
            .sort((a, b) => (a.estabelecimento || '').localeCompare(b.estabelecimento || '', 'pt-BR'));
    }, [data, cidadesComCarteira]);

    const lojasFiltradas = useMemo(() => {
        const termo = buscaLoja.trim().toLowerCase();
        if (!termo) return lojasSemCarteira;
        return lojasSemCarteira.filter(l =>
            (l.estabelecimento || '').toLowerCase().includes(termo)
            || (l.cidade || '').toLowerCase().includes(termo));
    }, [lojasSemCarteira, buscaLoja]);

    const contagemPorCs = useMemo(() => {
        const conta = { THIAGO: 0, 'LAÍS': 0, semDono: 0 };
        for (const loja of lojasSemCarteira) {
            const atribuido = porLoja[String(loja.estab_id ?? '')]?.analista;
            if (atribuido === 'THIAGO') conta.THIAGO++;
            else if (atribuido === 'LAÍS') conta['LAÍS']++;
            else conta.semDono++;
        }
        return conta;
    }, [lojasSemCarteira, porLoja]);

    const allCities = useMemo(() => {
        const fromData = Array.from(new Set(data.map(d => d.cidade).filter(Boolean)));
        const fromInitial = Object.keys(INITIAL_CITY_MANAGER_MAP);
        return Array.from(new Set([...fromData, ...fromInitial])).sort();
    }, [data]);

    const filteredCities = allCities.filter(city =>
        city.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    const handleManagerChange = async (city: string, manager: Manager) => {
        try {
            setErro(null);
            await salvarCidade(city, manager, mode);
            onMappingChange();
        } catch (err) {
            setErro(err instanceof Error ? err.message : `Falha ao salvar ${city}`);
        }
    };

    const handleLojaChange = async (loja: EnrichedPerformanceRow, manager: Manager) => {
        const estabId = String(loja.estab_id ?? '').trim();
        if (!estabId) {
            setErro(`${loja.estabelecimento} não tem ESTAB_ID — não dá para atribuir.`);
            return;
        }
        try {
            setErro(null);
            await salvarParceiro(estabId, manager, mode, {
                estabelecimento: loja.estabelecimento,
                cidade: loja.cidade,
            });
            onMappingChange();
        } catch (err) {
            setErro(err instanceof Error ? err.message : `Falha ao salvar ${loja.estabelecimento}`);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                    <div className="size-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                        <span className="material-symbols-outlined text-3xl">badge</span>
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Gestão por Cidade</h1>
                        <p className="text-slate-500 text-sm">
                            Defina qual gestor é responsável por cada cidade em <strong>{theme.label}</strong>.
                            Isso afeta os filtros e relatórios.
                        </p>
                    </div>
                </div>
            </header>

            {erro && (
                <div className="mb-6 p-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-300">
                    {erro}
                </div>
            )}

            {/* Lojas fora da carteira — atribuição loja a loja */}
            <div className="mb-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-3 mb-1">
                        <span className="material-symbols-outlined text-amber-500">storefront</span>
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lojas fora da carteira</h2>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Lojas em cidades onde não temos carteira montada (ou sem cidade definida).
                        Aqui a cidade não ajuda a decidir, então o dono é escolhido loja a loja.
                    </p>
                </div>

                <div className="p-5 flex flex-col gap-4">
                    <div className="flex flex-wrap gap-3 text-sm">
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 font-medium">
                            <span className="material-symbols-outlined text-[16px]">person</span>
                            Thiago: <strong>{contagemPorCs.THIAGO}</strong>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400 font-medium">
                            <span className="material-symbols-outlined text-[16px]">person</span>
                            Laís: <strong>{contagemPorCs['LAÍS']}</strong>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 font-medium">
                            Sem dono: <strong>{contagemPorCs.semDono}</strong>
                        </span>
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 font-medium">
                            Total: <strong>{lojasSemCarteira.length}</strong>
                        </span>
                    </div>

                    {lojasSemCarteira.length > 0 && (
                        <>
                            <div className="relative max-w-md">
                                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar loja ou cidade..."
                                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    value={buscaLoja}
                                    onChange={(e) => setBuscaLoja(e.target.value)}
                                />
                            </div>

                            <div className="max-h-96 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
                                <table className="w-full text-left border-collapse">
                                    <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Loja</th>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cidade</th>
                                            <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">CS responsável</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                                        {lojasFiltradas.map(loja => {
                                            const estabId = String(loja.estab_id ?? '');
                                            const atual = porLoja[estabId]?.analista ?? 'DESCONHECIDO';
                                            return (
                                                <tr key={estabId || loja.estabelecimento} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                                    <td className="px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                        {loja.estabelecimento}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                                                        {loja.cidade || <span className="italic text-slate-300 dark:text-slate-600">sem cidade</span>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <select
                                                            value={atual}
                                                            onChange={(e) => handleLojaChange(loja, e.target.value as Manager)}
                                                            aria-label={`CS responsável por ${loja.estabelecimento}`}
                                                            className={`text-sm font-medium rounded-lg px-3 py-1.5 border outline-none transition-all ${
                                                                atual === 'THIAGO' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30' :
                                                                atual === 'LAÍS' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/30' :
                                                                'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                            }`}
                                                        >
                                                            <option value="THIAGO">THIAGO</option>
                                                            <option value="LAÍS">LAÍS</option>
                                                            <option value="DESCONHECIDO">Sem dono</option>
                                                        </select>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {lojasSemCarteira.length === 0 && (
                        <p className="text-sm text-slate-400 italic">
                            Toda loja deste modo está em cidade com carteira montada — nada para atribuir aqui.
                        </p>
                    )}
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="relative max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                        <input
                            type="text"
                            placeholder="Buscar cidade..."
                            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Cidade</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Gestor Responsável</th>
                                <th className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                            {filteredCities.map(city => {
                                const override = overrides[city];
                                const initial = INITIAL_CITY_MANAGER_MAP[city];
                                const effective = override || initial || 'DESCONHECIDO';

                                return (
                                    <tr key={city} className="group hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{city}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <select
                                                value={effective}
                                                onChange={(e) => handleManagerChange(city, e.target.value as Manager)}
                                                className={`text-sm font-medium rounded-lg px-3 py-1.5 border outline-none transition-all ${
                                                    effective === 'THIAGO' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800/30' :
                                                    effective === 'LAÍS' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800/30' :
                                                    'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                                }`}
                                            >
                                                <option value="THIAGO">THIAGO</option>
                                                <option value="LAÍS">LAÍS</option>
                                                <option value="DESCONHECIDO">Sem Gestor</option>
                                            </select>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {override ? (
                                                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-tight bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-full border border-amber-100 dark:border-amber-800/30">
                                                    <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
                                                    Cadastrado
                                                </span>
                                            ) : initial ? (
                                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">Definição Padrão</span>
                                            ) : (
                                                <span className="text-[10px] font-medium text-slate-300 dark:text-slate-600 italic">Não mapeado</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredCities.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-500 text-sm">
                                        Nenhuma cidade encontrada para "{searchTerm}"
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <footer className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30 rounded-2xl flex items-start gap-3">
                <span className="material-symbols-outlined text-blue-500 mt-0.5">info</span>
                <div>
                    <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">Como funciona o Gestor Responsável?</h4>
                    <p className="text-xs text-blue-800/70 dark:text-blue-400/70 leading-relaxed">
                        A atribuição fica salva no Supabase e vale para todo mundo — antes era o navegador de cada um que guardava, então cada máquina tinha uma verdade.
                        Cidade vale para o marketplace; no Cardápio Digital, vendido para o país inteiro, o que manda é a atribuição loja a loja acima (ela ganha da cidade).
                        As definições são separadas para Marketplace e Cardápio Digital.
                    </p>
                </div>
            </footer>
        </div>
    );
}
