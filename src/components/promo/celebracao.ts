/**
 * Comemoração ao marcar uma promoção como ativa.
 *
 * POR QUE ISTO EXISTE
 * A coluna Promoções virou lista de trabalho, e trabalho sem retorno visível
 * cansa. Marcar "Promo ativa" é o momento em que a tarefa fecha — é ali que o
 * retorno tem que acontecer, não um dia depois quando a réplica alcançar.
 *
 * O QUE ELA NÃO FAZ
 * Não mexe no KPI de Captação de Promoção. Aquele número tem meta (80%) e é
 * medido no banco; se marcar à mão o movesse, bateria-se a meta clicando. O
 * que a marcação move é o "+N" ao lado — ver JornadaKpiMetas.
 *
 * Sem dependência externa: o confete é DOM puro e o som é sintetizado no
 * WebAudio, então nada de CDN (bloqueado) nem arquivo de áudio no bundle.
 */

const CHAVE_SOM = 'promo.comemoracao.som';

export function somLigado(): boolean {
    try {
        return localStorage.getItem(CHAVE_SOM) !== 'off';
    } catch {
        return false; // navegador bloqueando storage: silêncio é o padrão seguro
    }
}

export function alternarSom(): boolean {
    const novo = !somLigado();
    try {
        localStorage.setItem(CHAVE_SOM, novo ? 'on' : 'off');
    } catch { /* sem storage: vale só nesta aba */ }
    return novo;
}

function menosMovimento(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Acorde curto (dó–mi–sol) no WebAudio.
 *
 * O AudioContext nasce suspenso até um gesto do usuário — aqui sempre há um,
 * porque isto só roda no clique de marcar. Qualquer falha é engolida: som é
 * enfeite, não pode derrubar a marcação.
 */
function tocar() {
    try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return;
        const ctx = new Ctx();
        const agora = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((hz, i) => {
            const osc = ctx.createOscillator();
            const ganho = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = hz;
            const t = agora + i * 0.07;
            ganho.gain.setValueAtTime(0, t);
            ganho.gain.linearRampToValueAtTime(0.18, t + 0.02);
            ganho.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
            osc.connect(ganho).connect(ctx.destination);
            osc.start(t);
            osc.stop(t + 0.36);
        });
        setTimeout(() => ctx.close().catch(() => { }), 900);
    } catch { /* sem áudio, segue a vida */ }
}

const CORES = ['#10b981', '#34d399', '#fbbf24', '#38bdf8', '#f472b6'];

/** Estouro de confete ancorado no elemento que foi clicado. */
function confete(ancora: Element) {
    const r = ancora.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const palco = document.createElement('div');
    palco.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999';
    document.body.appendChild(palco);

    for (let i = 0; i < 22; i++) {
        const p = document.createElement('span');
        const ang = (Math.PI * 2 * i) / 22 + Math.random() * 0.3;
        const dist = 38 + Math.random() * 46;
        p.style.cssText = `position:absolute;left:${x0}px;top:${y0}px;width:6px;height:6px;border-radius:1px;`
            + `background:${CORES[i % CORES.length]};opacity:1;will-change:transform,opacity`;
        palco.appendChild(p);
        p.animate(
            [
                { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
                {
                    transform: `translate(${Math.cos(ang) * dist - 3}px, ${Math.sin(ang) * dist + 26}px)`
                        + ` scale(0.4) rotate(${Math.random() * 540 - 270}deg)`,
                    opacity: 0,
                },
            ],
            { duration: 760 + Math.random() * 260, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
        );
    }
    setTimeout(() => palco.remove(), 1200);
}

/**
 * Faixa curta com o que acabou de ser feito e um botão de mudo — o mudo
 * aparece exatamente quando é relevante (logo depois do som tocar), em vez de
 * virar mais uma preferência escondida numa tela de configuração.
 */
function faixa(texto: string) {
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:9999;'
        + 'display:flex;align-items:center;gap:10px;padding:9px 14px;border-radius:999px;'
        + 'background:#064e3b;color:#d1fae5;font:600 12px/1 ui-sans-serif,system-ui,sans-serif;'
        + 'box-shadow:0 10px 30px rgba(0,0,0,.25)';

    const msg = document.createElement('span');
    msg.textContent = texto;
    el.appendChild(msg);

    const mudo = document.createElement('button');
    mudo.type = 'button';
    mudo.style.cssText = 'all:unset;cursor:pointer;opacity:.75;font-size:13px;line-height:1';
    const pintar = () => {
        mudo.textContent = somLigado() ? '🔊' : '🔇';
        mudo.title = somLigado() ? 'Desligar o som das comemorações' : 'Ligar o som das comemorações';
    };
    pintar();
    mudo.onclick = e => { e.stopPropagation(); alternarSom(); pintar(); };
    el.appendChild(mudo);

    document.body.appendChild(el);
    const anim = el.animate(
        [{ opacity: 0, transform: 'translate(-50%,10px)' }, { opacity: 1, transform: 'translate(-50%,0)' }],
        { duration: 180, easing: 'ease-out', fill: 'forwards' },
    );
    setTimeout(() => {
        anim.reverse();
        setTimeout(() => el.remove(), 220);
    }, 3200);
}

/** Chamada no clique de "Promo ativa". `ancora` é o elemento clicado. */
export function comemorarPromoAtiva(ancora: Element | null, campanha: string) {
    if (somLigado()) tocar();
    if (!menosMovimento() && ancora) confete(ancora);
    faixa(`Promo ativa em ${campanha}`);
}
