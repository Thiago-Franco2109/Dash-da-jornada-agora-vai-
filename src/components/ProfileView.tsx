import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProductMode } from '../context/ProductModeContext';
import { identifyManagerFromUser, type Manager } from '../config/managerMapping';
import { useAtivacoesDiarias } from '../hooks/useAtivacoesDiarias';
import { computeMeuRitmo } from '../utils/minhasAtivacoes';

function hojeLocalStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function MeuRitmoCard({ manager }: { manager: Manager }) {
    const { mode } = useProductMode();
    const { rows, loading, error } = useAtivacoesDiarias();

    // hojeStr é recalculado a cada render (não fica preso a quando rows/mode
    // mudaram por último) — senão "Hoje" congela se a aba ficar aberta
    // passando da meia-noite sem esses valores mudarem de referência.
    const hojeStr = hojeLocalStr();
    const ritmo = useMemo(
        () => computeMeuRitmo(rows, manager, mode, hojeStr),
        [rows, manager, mode, hojeStr],
    );

    const maxDia = Math.max(1, ...ritmo.porDiaSemana.map(d => d.total));
    const faltamPraRecorde = ritmo.recorde ? ritmo.recorde.total - ritmo.hoje.total : null;

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-emerald-500">local_offer</span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Meu ritmo de ativações</h3>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Cupons de destaque + promoções aprovadas nas suas cidades — a métrica do seu dia a dia.
            </p>

            {loading ? (
                <p className="text-sm text-slate-400">Calculando no banco…</p>
            ) : error ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">Não foi possível carregar: {error}</p>
            ) : (
                <>
                    <div className="flex items-end gap-3 h-28 mb-2">
                        {ritmo.porDiaSemana.map(d => (
                            <div key={d.dow} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                                <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{d.total}</span>
                                <div
                                    className="w-full rounded-t-md bg-emerald-400/80 dark:bg-emerald-500/70"
                                    style={{ height: `${(d.total / maxDia) * 100}%`, minHeight: d.total > 0 ? '4px' : '0' }}
                                />
                                <span className="text-[11px] font-semibold text-slate-400 uppercase">{d.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-slate-100 dark:border-slate-700">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Recorde diário</p>
                            {ritmo.recorde ? (
                                <p className="text-slate-900 dark:text-white font-semibold">
                                    {ritmo.recorde.total} <span className="text-slate-400 text-sm font-normal">em {ritmo.recorde.dia.split('-').reverse().join('/')}</span>
                                </p>
                            ) : (
                                <p className="text-slate-400 text-sm">Sem dado ainda</p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Hoje</p>
                            <p className="text-slate-900 dark:text-white font-semibold">
                                {ritmo.hoje.total}{' '}
                                {faltamPraRecorde !== null && (
                                    <span className={`text-sm font-normal ${faltamPraRecorde <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                                        {faltamPraRecorde <= 0 ? '🎉 novo recorde!' : `faltam ${faltamPraRecorde} pro recorde`}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        Aproximação: o banco não guarda quem ativou, só a cidade — aqui contamos tudo nas cidades sob sua gestão.
                        Dias mais antigos podem estar levemente subcontados (o banco só guarda a última mudança de status de cada item).
                    </p>
                </>
            )}
        </div>
    );
}

export default function ProfileView() {
    const { user, logout } = useAuth();

    if (!user) return null;

    const managerRole = identifyManagerFromUser(user);
    const manager: Manager | null = managerRole === 'THIAGO' || managerRole === 'LAÍS' ? managerRole : null;

    return (
        <div className="flex-1 bg-white dark:bg-slate-900 overflow-y-auto p-6 md:p-10">
            <div className="max-w-3xl mx-auto space-y-8 animate-fade-in">
                
                {/* Header */}
                <div>
                    <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Meu Perfil</h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Gerencie suas informações e preferências da conta</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {/* Top Accent */}
                    <div className="h-24 bg-gradient-to-r from-emerald-500 to-teal-500"></div>
                    
                    <div className="px-8 pb-8 relative">
                        {/* Avatar */}
                        <div className="relative -mt-12 mb-4 flex justify-between items-end">
                            {user.picture ? (
                                <img 
                                    src={user.picture} 
                                    alt="Avatar" 
                                    className="size-24 rounded-2xl border-4 border-white dark:border-slate-800 shadow-md bg-white object-cover" 
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="size-24 rounded-2xl border-4 border-white dark:border-slate-800 shadow-md bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-4xl text-slate-400">person</span>
                                </div>
                            )}
                            
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs font-bold rounded-full ring-1 ring-inset ring-emerald-600/20 mb-2">
                                <span className="material-symbols-outlined text-[14px]">verified</span>
                                Conta Google Verificada
                            </span>
                        </div>

                        {/* Info */}
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{user.name || 'Usuário Sem Nome'}</h2>
                                <p className="text-slate-500 dark:text-slate-400">{user.email}</p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-slate-200 dark:border-slate-700">
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Identificação Interna</p>
                                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                        <span className="material-symbols-outlined text-emerald-500">badge</span>
                                        <span className="font-semibold">{managerRole ? `Gestor: ${managerRole}` : 'Membro Padrão'}</span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1">Usado para filtrar automaticamente suas lojas no dashboard.</p>
                                </div>
                                
                                <div>
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Permissões de Acesso</p>
                                    <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                                        <span className="material-symbols-outlined text-amber-500">shield_person</span>
                                        <span className="font-semibold">Leitura & Escrita (Supabase)</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {manager && <MeuRitmoCard manager={manager} />}

                {/* Secção de Ações */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Sessão</h3>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Encerrar Sessão</p>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Sair da sua conta neste navegador.</p>
                        </div>
                        <button
                            onClick={logout}
                            className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40 rounded-lg font-bold text-sm transition-colors flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">logout</span>
                            Deslogar
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}
