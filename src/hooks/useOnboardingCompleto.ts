import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Detecta parceiros que ACABARAM de completar as 5 etapas do onboarding
 * (ver netlify/functions/onboarding-parceiro.ts), pra disparar o alerta
 * "onboarding 100% concluído" no dashboard.
 *
 * A régua de "o que já foi visto" é o timestamp de conclusão mais recente,
 * guardado no localStorage — assim um refresh de página não repete o alerta,
 * mas cada navegador/dispositivo tem sua própria régua (é intencional: o
 * alerta é local ao dashboard aberto, não uma notificação central).
 *
 * Na primeira carga (sem régua salva) só posiciona a régua no que já existe,
 * sem alertar — senão todo onboarding histórico já concluído dispararia de
 * uma vez na primeira vez que alguém abrir o dashboard.
 */

const FN_URL = '/.netlify/functions/onboarding-parceiro';
const POLL_MS = 30_000;
const STORAGE_KEY = 'onboarding100_ultimaConclusaoVista';

export interface ParceiroOnboardingCompleto {
    id: number;
    estabelecimentoId: number;
    estabelecimento: string;
    cidade: string;
    concluidoEm: string;
}

interface ApiRow {
    id: number;
    estabelecimentoId: number;
    estabelecimento: string;
    cidade: string;
    completo: boolean;
    concluidoEm: string | null;
}

async function fetchOnboarding(): Promise<ApiRow[]> {
    const res = await fetch(FN_URL, { credentials: 'include' as RequestCredentials, cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false || !Array.isArray(json?.parceiros)) {
        throw new Error(json?.error || `Erro ${res.status} ao carregar onboarding.`);
    }
    return json.parceiros as ApiRow[];
}

export function useOnboardingCompleto(enabled = true) {
    const [novos, setNovos] = useState<ParceiroOnboardingCompleto[]>([]);
    const ultimaVistaRef = useRef<number>(Number(localStorage.getItem(STORAGE_KEY)) || 0);
    const inicializouRef = useRef(false);

    const verificar = useCallback(async () => {
        let parceiros: ApiRow[];
        try {
            parceiros = await fetchOnboarding();
        } catch {
            return; // falha de rede: silencioso, o próximo poll tenta de novo
        }

        const completos = parceiros.filter(
            (p): p is ApiRow & { concluidoEm: string } => p.completo && !!p.concluidoEm,
        );

        if (!inicializouRef.current) {
            inicializouRef.current = true;
            const maisRecente = completos.reduce(
                (max, p) => Math.max(max, Date.parse(p.concluidoEm)),
                ultimaVistaRef.current,
            );
            ultimaVistaRef.current = maisRecente;
            localStorage.setItem(STORAGE_KEY, String(maisRecente));
            return;
        }

        const baseline = ultimaVistaRef.current;
        const recemConcluidos = completos
            .filter(p => Date.parse(p.concluidoEm) > baseline)
            .sort((a, b) => Date.parse(a.concluidoEm) - Date.parse(b.concluidoEm));

        if (recemConcluidos.length === 0) return;

        ultimaVistaRef.current = recemConcluidos.reduce(
            (max, p) => Math.max(max, Date.parse(p.concluidoEm)),
            baseline,
        );
        localStorage.setItem(STORAGE_KEY, String(ultimaVistaRef.current));
        setNovos(prev => [
            ...prev,
            ...recemConcluidos.map(p => ({
                id: p.id,
                estabelecimentoId: p.estabelecimentoId,
                estabelecimento: p.estabelecimento,
                cidade: p.cidade,
                concluidoEm: p.concluidoEm,
            })),
        ]);
    }, []);

    useEffect(() => {
        if (!enabled) return;
        verificar();
        const intervalId = setInterval(verificar, POLL_MS);
        return () => clearInterval(intervalId);
    }, [enabled, verificar]);

    const limparNovo = useCallback((id: number) => {
        setNovos(prev => prev.filter(p => p.id !== id));
    }, []);

    return { novos, limparNovo };
}
