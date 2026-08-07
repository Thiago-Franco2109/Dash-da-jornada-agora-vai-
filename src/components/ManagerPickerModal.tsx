import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionProfile } from '../config/managerSession';
import { PROFILES } from '../config/profiles';

interface ManagerPickerModalProps {
    /** Aplica o perfil. Dispara no clique, antes da animação de saída. */
    onSelect: (profile: SessionProfile) => void;
    /** Avisa que a animação de saída terminou e a tela já pode ser desmontada. */
    onExited: () => void;
    /** Sai da conta Google e volta para a tela de login. */
    onSignOut?: () => void;
    /** E-mail da conta conectada, exibido no rodapé. */
    accountEmail?: string | null;
}

/**
 * Foto de fundo opcional. Solte um arquivo em `public/` (ex.: uma foto da cidade)
 * e aponte aqui — ex.: '/picker-backdrop.jpg'. Vazio = só o fundo em CSS.
 */
const BACKDROP_SRC = '';

/**
 * Duração da saída. Precisa bater com a animação `mp-exit` do CSS: o perfil
 * só é confirmado quando a tela já está invisível, para o painel atrás não
 * mudar de conteúdo à vista de quem escolheu.
 */
const EXIT_MS = 620;

/** Estrelinhas e confetes do fundo — puramente decorativos. */
const SPARKS = [
    { top: '12%', left: '6%', size: 46, delay: 0, tone: 'gold', kind: 'star' },
    { top: '26%', left: '88%', size: 62, delay: 1.4, tone: 'gold', kind: 'star' },
    { top: '62%', left: '4%', size: 34, delay: 2.1, tone: 'white', kind: 'star' },
    { top: '74%', left: '92%', size: 40, delay: 0.7, tone: 'gold', kind: 'star' },
    { top: '8%', left: '68%', size: 26, delay: 2.6, tone: 'white', kind: 'star' },
    { top: '46%', left: '95%', size: 22, delay: 1.9, tone: 'white', kind: 'star' },
    { top: '18%', left: '22%', size: 18, delay: 0.4, tone: 'lime', kind: 'bar' },
    { top: '70%', left: '18%', size: 22, delay: 1.2, tone: 'gold', kind: 'bar' },
    { top: '34%', left: '78%', size: 16, delay: 2.4, tone: 'lime', kind: 'bar' },
    { top: '86%', left: '60%', size: 20, delay: 1.7, tone: 'gold', kind: 'bar' },
] as const;

const STAR_PATH =
    'M12 0c1 7.2 4.8 11 12 12-7.2 1-11 4.8-12 12-1-7.2-4.8-11-12-12 7.2-1 11-4.8 12-12z';

export default function ManagerPickerModal({ onSelect, onExited, onSignOut, accountEmail }: ManagerPickerModalProps) {
    const [hasBackdrop, setHasBackdrop] = useState(Boolean(BACKDROP_SRC));
    const [leaving, setLeaving] = useState<SessionProfile | null>(null);
    const exitTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(exitTimer.current), []);

    const choose = useCallback((id: SessionProfile) => {
        if (leaving) return;

        // Aplica antes de animar: enquanto a tela ainda está opaca, o painel
        // atrás já troca para o perfil certo, sem nada piscando na revelação.
        onSelect(id);

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            onExited();
            return;
        }

        setLeaving(id);
        exitTimer.current = window.setTimeout(onExited, EXIT_MS);
    }, [leaving, onSelect, onExited]);

    return (
        <div
            className={`mp-root${leaving ? ' mp-root--leaving' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="manager-picker-title"
        >
            <style>{STYLES}</style>

            <div className="mp-scene" aria-hidden="true">
                {hasBackdrop && (
                    <img
                        className="mp-photo"
                        src={BACKDROP_SRC}
                        alt=""
                        onError={() => setHasBackdrop(false)}
                    />
                )}
                <div className="mp-glow mp-glow--a" />
                <div className="mp-glow mp-glow--b" />
                <svg className="mp-hills" viewBox="0 0 1440 340" preserveAspectRatio="none">
                    <path d="M0 168C286 74 618 96 900 178c206 60 386 74 540 46v116H0z" fill="#0a4a22" opacity=".85" />
                    <path d="M0 214C300 128 640 152 928 232c186 52 356 62 512 38v70H0z" fill="#07361a" />
                    <path
                        d="M0 168C286 74 618 96 900 178c206 60 386 74 540 46"
                        fill="none"
                        stroke="#5ef07a"
                        strokeWidth="3"
                        opacity=".5"
                    />
                </svg>

                {SPARKS.map((spark, i) =>
                    spark.kind === 'star' ? (
                        <svg
                            key={i}
                            className={`mp-spark mp-spark--${spark.tone}`}
                            style={{ top: spark.top, left: spark.left, width: spark.size, animationDelay: `${spark.delay}s` }}
                            viewBox="0 0 24 24"
                        >
                            <path d={STAR_PATH} />
                        </svg>
                    ) : (
                        <span
                            key={i}
                            className={`mp-confetti mp-spark--${spark.tone}`}
                            style={{ top: spark.top, left: spark.left, width: spark.size, animationDelay: `${spark.delay}s` }}
                        />
                    )
                )}
            </div>

            <div className="mp-stage">
                <div className="mp-brand" style={{ ['--d' as string]: '0s' }}>
                    <img src="/favicon.png" alt="" className="mp-brand__mark" />
                    <span className="mp-brand__word">bigou</span>
                </div>

                <h1 id="manager-picker-title" className="mp-title" style={{ ['--d' as string]: '.08s' }}>
                    <span className="mp-word" data-text="QUEM">QUEM</span>{' '}
                    <span className="mp-word mp-word--lime" data-text="VAI">VAI</span>{' '}
                    <span className="mp-word mp-word--lime" data-text="ENTRAR?">ENTRAR?</span>
                </h1>

                <p className="mp-sub" style={{ ['--d' as string]: '.18s' }}>
                    Escolha seu perfil para continuar.
                </p>

                <div className="mp-grid">
                    {PROFILES.map((option, i) => (
                        <button
                            key={option.id}
                            type="button"
                            autoFocus={i === 0}
                            disabled={leaving !== null}
                            onClick={() => choose(option.id)}
                            className={`mp-card${leaving === option.id ? ' mp-card--chosen' : ''}`}
                            style={{ ['--d' as string]: `${0.26 + i * 0.08}s` }}
                        >
                            <span
                                className="mp-avatar"
                                style={{
                                    ['--tint-a' as string]: option.tint[0],
                                    ['--tint-b' as string]: option.tint[1],
                                }}
                            >
                                {option.avatar ? (
                                    <img src={option.avatar} alt="" className="mp-avatar__img" />
                                ) : (
                                    <span className="mp-avatar__initial">{option.label.charAt(0)}</span>
                                )}
                            </span>
                            <span className="mp-card__name">{option.label}</span>
                            <span className="mp-card__desc">{option.description}</span>
                            <span className="mp-card__dash" />
                        </button>
                    ))}
                </div>

                {onSignOut && (
                    <button
                        type="button"
                        onClick={onSignOut}
                        className="mp-alt"
                        style={{ ['--d' as string]: '.44s' }}
                    >
                        <span className="material-symbols-outlined">group</span>
                        Entrar com outra conta
                    </button>
                )}

                <footer className="mp-foot" style={{ ['--d' as string]: '.52s' }}>
                    {accountEmail && <span className="mp-foot__account">Conectado como {accountEmail}</span>}
                    <span>Sua escolha vale até você fechar a aba.</span>
                </footer>
            </div>
        </div>
    );
}

const STYLES = `
.mp-root {
  --ink: #052c14;
  --deep: #04240f;
  --brand: #32ba72;
  --lime: #5ef07a;
  --gold: #ffd23f;
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: clamp(16px, 3vh, 36px) 20px;
  background: radial-gradient(120% 90% at 50% -10%, #1a7a3f 0%, #0b4a23 42%, var(--deep) 100%);
  font-family: 'Manrope', sans-serif;
  -webkit-font-smoothing: antialiased;
}

/* ── Cenário de fundo ───────────────────────────────────────── */
.mp-scene { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }

.mp-photo {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: cover;
  opacity: .38;
  filter: saturate(.8) brightness(.65);
}

.mp-glow { position: absolute; border-radius: 50%; filter: blur(90px); }
.mp-glow--a { top: -18%; left: 50%; width: 780px; height: 520px; transform: translateX(-50%); background: rgba(94, 240, 122, .28); }
.mp-glow--b { bottom: -22%; left: 12%; width: 620px; height: 460px; background: rgba(50, 186, 114, .22); }

.mp-hills { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 42vh; min-height: 240px; }

.mp-spark { position: absolute; aspect-ratio: 1; opacity: .85; }
.mp-spark--gold { fill: var(--gold); color: var(--gold); }
.mp-spark--white { fill: #fff; color: #fff; }
.mp-spark--lime { fill: var(--lime); color: var(--lime); }

.mp-confetti {
  position: absolute;
  aspect-ratio: 5 / 2;
  border-radius: 3px;
  background: currentColor;
  opacity: .7;
  transform: rotate(-24deg);
}

/* ── Conteúdo ───────────────────────────────────────────────── */
.mp-stage {
  position: relative;
  width: 100%;
  max-width: 1080px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.mp-brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 28px 10px;
  margin-bottom: clamp(16px, 3vh, 32px);
  border-radius: 0 0 26px 26px;
  background: linear-gradient(180deg, #0f6b34, #0a4a23);
  box-shadow: 0 10px 30px rgba(0, 0, 0, .35), inset 0 -2px 0 rgba(94, 240, 122, .5);
}
.mp-brand__mark { width: 40px; height: 40px; border-radius: 12px; object-fit: cover; }
.mp-brand__word {
  font-family: 'Baloo 2', 'Manrope', sans-serif;
  font-weight: 800;
  font-size: 30px;
  line-height: 1;
  color: #fff;
  letter-spacing: -.01em;
}

.mp-title {
  font-family: 'Baloo 2', 'Manrope', sans-serif;
  font-weight: 800;
  font-size: clamp(2.2rem, 7.6vw, 5.4rem);
  line-height: 1.05;
  letter-spacing: .045em;
  margin: 0;
  text-wrap: balance;
}

/*
 * Cada palavra é desenhada em três camadas empilhadas, de fora para dentro:
 *   elemento  → contorno escuro grosso (destaca do fundo verde)
 *   ::before  → contorno branco
 *   ::after   → preenchimento (branco ou gradiente lime)
 * O texto do elemento fica transparente só para preservar a largura do layout.
 */
.mp-word {
  position: relative;
  display: inline-block;
  color: transparent;
  -webkit-text-stroke: .17em rgba(4, 34, 16, .55);
  filter: drop-shadow(0 .05em 0 rgba(3, 26, 12, .5));
}
.mp-word::before,
.mp-word::after {
  content: attr(data-text);
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
}
/* camada do contorno branco */
.mp-word::before {
  -webkit-text-stroke: .105em #fff;
  color: transparent;
  filter: drop-shadow(0 0 16px rgba(94, 240, 122, .4));
}
/* camada do preenchimento — zera o contorno herdado do elemento pai */
.mp-word::after {
  -webkit-text-stroke: 0;
  color: #fff;
}
.mp-word--lime::after {
  background: linear-gradient(180deg, #7dff92 0%, #2fcf55 52%, #0f9440 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.mp-sub {
  margin: clamp(8px, 1.6vh, 16px) 0 clamp(20px, 3.6vh, 36px);
  max-width: 34ch;
  font-size: clamp(.95rem, 1.6vw, 1.15rem);
  font-weight: 700;
  color: rgba(255, 255, 255, .88);
  text-shadow: 0 2px 8px rgba(0, 0, 0, .45);
}

/* ── Cards de perfil ────────────────────────────────────────── */
.mp-grid {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(16px, 2.4vw, 28px);
  width: 100%;
}

.mp-card {
  position: relative;
  flex: 0 1 260px;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 26px 20px 22px;
  border: 2px solid rgba(255, 255, 255, .16);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(33, 145, 74, .95), rgba(10, 70, 33, .95));
  box-shadow: 0 18px 40px rgba(0, 0, 0, .38), inset 0 1px 0 rgba(255, 255, 255, .18);
  cursor: pointer;
  transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease;
}
.mp-card:hover,
.mp-card:focus-visible {
  transform: translateY(-8px);
  border-color: var(--lime);
  box-shadow: 0 26px 54px rgba(0, 0, 0, .45), 0 0 0 4px rgba(94, 240, 122, .28), inset 0 1px 0 rgba(255, 255, 255, .24);
  outline: none;
}
.mp-card:focus-visible { border-color: var(--gold); box-shadow: 0 26px 54px rgba(0,0,0,.45), 0 0 0 4px rgba(255, 210, 63, .55); }
.mp-card:active { transform: translateY(-2px); }

.mp-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: clamp(112px, 14vw, 138px);
  aspect-ratio: 1;
  margin-bottom: 16px;
  border-radius: 50%;
  border: 5px solid #fff;
  background: linear-gradient(160deg, var(--tint-a), var(--tint-b));
  box-shadow: 0 10px 24px rgba(0, 0, 0, .35);
  overflow: hidden;
  transition: transform .22s ease;
}
.mp-card:hover .mp-avatar,
.mp-card:focus-visible .mp-avatar { transform: scale(1.05); }
.mp-avatar__img { width: 100%; height: 100%; object-fit: cover; }
.mp-avatar__initial {
  font-family: 'Baloo 2', 'Manrope', sans-serif;
  font-weight: 800;
  font-size: clamp(3rem, 5.4vw, 3.9rem);
  line-height: 1;
  color: #fff;
  text-shadow: 0 3px 0 rgba(0, 0, 0, .22);
}

.mp-card__name {
  font-family: 'Baloo 2', 'Manrope', sans-serif;
  font-weight: 800;
  font-size: clamp(1.5rem, 2.4vw, 1.85rem);
  line-height: 1.15;
  color: #fff;
  text-shadow: 0 3px 0 rgba(3, 30, 14, .45);
}
.mp-card__desc {
  font-size: .82rem;
  font-weight: 600;
  color: rgba(190, 255, 208, .9);
}
.mp-card__dash {
  width: 46px;
  height: 5px;
  margin-top: 12px;
  border-radius: 999px;
  background: var(--gold);
  transform: scaleX(0);
  transition: transform .22s ease;
}
.mp-card:hover .mp-card__dash,
.mp-card:focus-visible .mp-card__dash { transform: scaleX(1); }

/* ── Ação secundária e rodapé ───────────────────────────────── */
.mp-alt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: clamp(20px, 3.4vh, 34px);
  padding: 14px 38px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(180deg, #46d46b, #1f9f4c);
  box-shadow: 0 12px 26px rgba(0, 0, 0, .34), inset 0 -3px 0 rgba(3, 60, 24, .45), inset 0 2px 0 rgba(255, 255, 255, .3);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 800;
  cursor: pointer;
  transition: transform .18s ease, filter .18s ease;
}
.mp-alt:hover { transform: translateY(-2px); filter: brightness(1.06); }
.mp-alt:focus-visible { outline: 3px solid var(--gold); outline-offset: 3px; }
.mp-alt:active { transform: translateY(1px); }
.mp-alt .material-symbols-outlined { font-size: 22px; }

.mp-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 18px;
  margin-top: clamp(16px, 2.8vh, 28px);
  font-size: .78rem;
  font-weight: 600;
  color: rgba(255, 255, 255, .62);
}
.mp-foot__account {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, .18);
  background: rgba(0, 0, 0, .22);
  color: rgba(255, 255, 255, .78);
}

/* ── Movimento ──────────────────────────────────────────────── */
@media (prefers-reduced-motion: no-preference) {
  .mp-brand, .mp-title, .mp-sub, .mp-card, .mp-alt, .mp-foot {
    animation: mp-rise .55s cubic-bezier(.2, .8, .3, 1) both;
    animation-delay: var(--d, 0s);
  }
  .mp-spark, .mp-confetti { animation: mp-float 5.5s ease-in-out infinite; }
}

@keyframes mp-rise {
  from { opacity: 0; transform: translateY(22px) scale(.96); }
  to { opacity: 1; transform: none; }
}

@keyframes mp-float {
  0%, 100% { transform: translateY(0) rotate(0deg); opacity: .55; }
  50% { transform: translateY(-14px) rotate(12deg); opacity: .95; }
}

/* Mantém os perfis numa fileira só até o ponto em que eles ainda cabem. */
@media (max-width: 900px) {
  .mp-grid { gap: 14px; }
  .mp-card { flex-basis: 200px; min-width: 172px; padding: 20px 14px 18px; }
  .mp-avatar { width: 104px; margin-bottom: 12px; }
  .mp-card__name { font-size: 1.4rem; }
  .mp-card__desc { font-size: .76rem; }
}

@media (max-width: 520px) {
  .mp-card { flex-basis: 100%; padding: 18px 16px 16px; }
  .mp-avatar { width: 86px; margin-bottom: 10px; }
  .mp-avatar__initial { font-size: 2.6rem; }
  .mp-card__name { font-size: 1.4rem; }
  .mp-card__dash { margin-top: 10px; }
  .mp-alt { width: 100%; }
}

/* ──────────────────────────────────────────────────────────────
   Saída: o card escolhido cresce e a tela se abre para o painel.
   Os seletores descendem de .mp-root--leaving para vencerem as
   animações de entrada declaradas acima.
   ────────────────────────────────────────────────────────────── */
.mp-card:disabled { cursor: default; }

.mp-root--leaving {
  pointer-events: none;
  animation: mp-exit .62s cubic-bezier(.55, 0, .85, .2) forwards;
}

@keyframes mp-exit {
  0%   { opacity: 1; transform: scale(1); }
  45%  { opacity: 1; }
  100% { opacity: 0; transform: scale(1.14); }
}

/* Tudo que não é o card escolhido sai da frente primeiro. */
.mp-root--leaving .mp-brand,
.mp-root--leaving .mp-title,
.mp-root--leaving .mp-sub,
.mp-root--leaving .mp-alt,
.mp-root--leaving .mp-foot,
.mp-root--leaving .mp-card:not(.mp-card--chosen) {
  animation: mp-recede .26s ease forwards;
}

@keyframes mp-recede {
  to { opacity: 0; transform: translateY(6px) scale(.94); }
}

.mp-root--leaving .mp-card--chosen {
  z-index: 2;
  border-color: var(--gold);
  animation: mp-chosen .62s cubic-bezier(.2, .75, .3, 1) forwards;
}

@keyframes mp-chosen {
  0%   { transform: translateY(0) scale(1); box-shadow: 0 18px 40px rgba(0, 0, 0, .38); }
  28%  { transform: translateY(-16px) scale(1.07); box-shadow: 0 30px 60px rgba(0, 0, 0, .45), 0 0 0 6px rgba(255, 210, 63, .55); }
  100% { transform: translateY(-8px) scale(1.16); box-shadow: 0 34px 70px rgba(0, 0, 0, .5), 0 0 0 3px rgba(255, 210, 63, .2); }
}

.mp-root--leaving .mp-card--chosen .mp-avatar { animation: mp-avatar-pop .62s cubic-bezier(.2, .75, .3, 1) forwards; }

@keyframes mp-avatar-pop {
  0%   { transform: scale(1); }
  30%  { transform: scale(1.12); }
  100% { transform: scale(1.06); }
}

.mp-root--leaving .mp-card--chosen .mp-card__dash { transform: scaleX(1); }

@media (prefers-reduced-motion: reduce) {
  .mp-root--leaving { display: none; }
}
`;
