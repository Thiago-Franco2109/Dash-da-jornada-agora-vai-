import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { useAuth } from '../context/AuthContext';
import { useManagerSession } from '../context/ManagerSessionContext';
import { getProfileInfo, type ProfileInfo } from '../config/profiles';
import type { EnrichedPerformanceRow } from '../utils/calculations';
import type { AppView } from '../types/views';
import AnalystHome from './home/AnalystHome';
import CeoHome from './home/CeoHome';

const BALOO = "'Baloo 2', 'Manrope', sans-serif";

function greetingFor(hour: number): string {
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
}

/** Primeiro nome, para o caso de não haver perfil escolhido. */
function firstName(fullName?: string): string | undefined {
    return fullName?.trim().split(/\s+/)[0];
}

interface HomeViewProps {
    /** Parceiros em jornada já filtrados pela carteira de quem entrou. */
    rows: EnrichedPerformanceRow[];
    onPartnerClick: (row: EnrichedPerformanceRow) => void;
    onNavigate: (view: AppView) => void;
}

export default function HomeView({ rows, onPartnerClick, onNavigate }: HomeViewProps) {
    const { user } = useAuth();
    const { profile } = useManagerSession();
    const info = getProfileInfo(profile);

    return (
        <HomeGreeting info={info} fallbackName={firstName(user?.name)}>
            {/* O CEO não tem carteira: pauta individual não faria sentido para ele. */}
            {profile === 'ULYSSES'
                ? <CeoHome onNavigate={onNavigate} />
                : <AnalystHome rows={rows} onPartnerClick={onPartnerClick} onNavigate={onNavigate} />}
        </HomeGreeting>
    );
}

interface HomeGreetingProps {
    info?: ProfileInfo;
    /** Usado quando ainda não há perfil escolhido. */
    fallbackName?: string;
    children?: ReactNode;
}

/** Saudação e mostrador do dia; o miolo abaixo varia por perfil. */
export function HomeGreeting({ info, fallbackName, children }: HomeGreetingProps) {
    // Mantém a saudação e a data corretas em abas que ficam abertas por horas.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    const name = info?.label ?? fallbackName;
    const greeting = greetingFor(now.getHours());

    return (
        <div className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-900">
            <div className="max-w-7xl mx-auto p-6 sm:p-8 space-y-8">
                <section
                    className="relative w-full overflow-hidden rounded-3xl p-7 sm:p-8 shadow-xl"
                    style={{ background: 'linear-gradient(135deg, #2a9e5c 0%, #0d5f2c 60%, #0a4a23 100%)' }}
                >
                    {/* Brilho de fundo, puramente decorativo */}
                    <div
                        aria-hidden="true"
                        className="absolute -top-28 -right-16 size-80 rounded-full blur-3xl pointer-events-none"
                        style={{ background: 'rgba(94, 240, 122, .3)' }}
                    />

                    <div className="relative flex flex-col sm:flex-row sm:items-center gap-7">
                        {info && (
                            <div
                                className="shrink-0 size-24 sm:size-28 rounded-full border-4 border-white overflow-hidden shadow-lg"
                                style={{ background: `linear-gradient(160deg, ${info.tint[0]}, ${info.tint[1]})` }}
                            >
                                {info.avatar ? (
                                    <img src={info.avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div
                                        className="w-full h-full flex items-center justify-center text-white text-4xl"
                                        style={{ fontFamily: BALOO, fontWeight: 800 }}
                                    >
                                        {info.label.charAt(0)}
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="min-w-0 flex-1">
                            <h1
                                className="text-white text-3xl sm:text-5xl leading-tight"
                                style={{ fontFamily: BALOO, fontWeight: 800, textShadow: '0 3px 0 rgba(3, 30, 14, .35)' }}
                            >
                                {name ? `${greeting}, ${name}!` : `${greeting}!`}
                            </h1>
                            {info && (
                                <p className="mt-2 text-sm sm:text-base font-semibold text-emerald-50/85">
                                    Você está vendo {info.scope}.
                                </p>
                            )}
                        </div>

                        {/* Mostrador do dia */}
                        <div className="shrink-0 self-start sm:self-center rounded-2xl bg-white/12 border border-white/25 backdrop-blur-sm px-6 py-4 text-center min-w-[9.5rem]">
                            <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-50/75">
                                {format(now, 'EEEE', { locale: ptBR })}
                            </div>
                            <div
                                className="text-white text-5xl leading-none my-1"
                                style={{ fontFamily: BALOO, fontWeight: 800 }}
                            >
                                {format(now, 'dd')}
                            </div>
                            <div className="text-sm font-bold text-emerald-50/90">
                                {format(now, "MMMM 'de' yyyy", { locale: ptBR })}
                            </div>
                            <div className="mt-2 pt-2 border-t border-white/20 text-xs font-bold text-emerald-50/70 tabular-nums">
                                {format(now, 'dd/MM/yyyy')}
                            </div>
                        </div>
                    </div>
                </section>

                {children}
            </div>
        </div>
    );
}
