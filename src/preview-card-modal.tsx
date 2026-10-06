/**
 * Entrada isolada para conferir o modal de card do Trello sem login.
 *
 * Exercita Functions `trello-card-detalhe` / `trello-card-anexar` /
 * `trello-anexo` → hook → CardDetalheModal de verdade: dá pra colar print,
 * comentar, editar e excluir comentário — tudo contra o Trello REAL.
 *
 * Rode `npm run dev` e abra
 * http://localhost:5173/preview-card-modal.html?cardId=<id do card>
 *
 * Não entra no build de produção: `vite.config.ts` não declara
 * `rollupOptions.input`, então só `index.html` é empacotado.
 */
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import CardDetalheModal from './components/trello/CardDetalheModal';
import { useTrelloCardDetalhe } from './hooks/useTrelloCardDetalhe';
import './index.css';

const CARD_ID = new URLSearchParams(location.search).get('cardId') ?? '';

export default function App() {
    const detalhe = useTrelloCardDetalhe();
    const { abrir } = detalhe;

    useEffect(() => {
        if (CARD_ID) abrir(CARD_ID);
    }, [abrir]);

    if (!CARD_ID) {
        return (
            <p className="p-8 text-sm text-slate-600 dark:text-slate-300">
                Passe o card na URL: <code>?cardId=&lt;id do card no Trello&gt;</code>
            </p>
        );
    }

    return (
        <CardDetalheModal
            aberto={detalhe.aberto}
            card={detalhe.card}
            meuId={detalhe.meuId}
            isLoading={detalhe.isLoading}
            error={detalhe.error}
            onFechar={() => { /* sem o que fechar nessa página */ }}
            onComentar={detalhe.comentar}
            onEditarComentario={detalhe.editarComentario}
            onExcluirComentario={detalhe.excluirComentario}
            enviandoComentario={detalhe.enviandoComentario}
            erroComentario={detalhe.erroComentario}
            onEditarPrazo={detalhe.editarPrazo}
            salvandoPrazo={detalhe.salvandoPrazo}
            erroPrazo={detalhe.erroPrazo}
        />
    );
}

createRoot(document.getElementById('root')!).render(<App />);
