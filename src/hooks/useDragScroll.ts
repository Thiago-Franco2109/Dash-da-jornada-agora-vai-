import { useRef } from 'react';

/**
 * Arrastar com o mouse pra rolar um container horizontalmente (como o
 * próprio board do Trello) — clica em qualquer área vazia e arrasta.
 *
 * O truque do `movimentoTotal`: sem isso, ao soltar o mouse depois de
 * arrastar, o navegador ainda dispara um "click" no elemento embaixo do
 * cursor (ex.: abriria o card sozinho). Só suprime o click se o mouse de
 * fato se moveu mais que alguns pixels — um clique de verdade (sem arrastar)
 * passa direto.
 */
export function useDragScroll<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const estado = useRef({ arrastando: false, movimentoTotal: 0, startX: 0, startScrollLeft: 0 });

    const onMouseDown = (e: React.MouseEvent) => {
        if (e.button !== 0) return;
        const el = ref.current;
        if (!el) return;
        estado.current = { arrastando: true, movimentoTotal: 0, startX: e.clientX, startScrollLeft: el.scrollLeft };
    };

    const onMouseMove = (e: React.MouseEvent) => {
        if (!estado.current.arrastando) return;
        const el = ref.current;
        if (!el) return;
        const delta = e.clientX - estado.current.startX;
        estado.current.movimentoTotal = Math.max(estado.current.movimentoTotal, Math.abs(delta));
        el.scrollLeft = estado.current.startScrollLeft - delta;
    };

    const pararDeArrastar = () => {
        estado.current.arrastando = false;
    };

    // Captura o clique logo em seguida de um arrasto real (>4px) e cancela —
    // sem isso o card embaixo do cursor abriria sozinho ao soltar o mouse.
    const onClickCapture = (e: React.MouseEvent) => {
        if (estado.current.movimentoTotal > 4) {
            e.preventDefault();
            e.stopPropagation();
        }
        estado.current.movimentoTotal = 0;
    };

    return {
        ref,
        arrastavel: {
            onMouseDown,
            onMouseMove,
            onMouseUp: pararDeArrastar,
            onMouseLeave: pararDeArrastar,
            onClickCapture,
        },
    };
}
