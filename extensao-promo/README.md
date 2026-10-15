# Print pro Trello

Extensão de Chrome pra registrar promoção sem sair da página: clica no ícone,
arrasta pra recortar um pedaço da tela, e o print vai pro Trello — ou criando
um card novo, ou grudando num card que já existe.

## Como funciona por dentro

```
clique no ícone
   └─ background.js injeta selecao.js na aba
         └─ você arrasta → overlay some → captureVisibleTab → recorte no OffscreenCanvas
               └─ painel abre com a prévia
                     ├─ "Card novo"       → trello-card-criar  + trello-card-anexar
                     └─ "Card existente"  → trello-card-anexar (+ trello-card-comentar)
```

O token do Trello **não** fica na extensão. Ela fala com as Netlify Functions
do painel (`netlify/functions/trello-*`), que já guardam `TRELLO_API_KEY` e
`TRELLO_TOKEN` como env de servidor. Quem instalar a extensão não ganha o token.

Todo fetch sai do service worker, nunca do content script: content script roda
na origem da página, então a chamada viraria cross-origin e esbarraria em CORS.
Do service worker, com o host em `host_permissions`, o Chrome dispensa CORS.

## Instalar

1. **Publicar as functions.** Três são novas — `trello-card-criar`,
   `trello-boards`, `trello-board-conteudo` — então precisa de um deploy antes
   de a extensão funcionar.

2. **Carregar a extensão.** `chrome://extensions` → liga o **Modo do
   desenvolvedor** → **Carregar sem compactação** → escolhe esta pasta
   (`extensao-promo/`).

3. **Liberar o ID no Netlify.** Abre as opções da extensão (botão **Detalhes**
   → *Opções de extensão*), copia o ID que aparece lá em cima e põe na variável
   de ambiente do site:

   ```
   ALLOWED_EXTENSION_IDS = <id-da-extensao>
   ```

   Depois **redeploy** — env nova só vale pro próximo build. Sem isso toda
   chamada volta 403: as functions só respondem a origem conhecida.

   > Esse ID muda se você remover e carregar a pasta de novo. Se começar a dar
   > 403 do nada, confere se ainda é o mesmo.

4. **Escolher o quadro.** Ainda nas opções: o quadro das promoções e, se
   quiser, a lista que já vem selecionada quando for criar card.

## Usar

- Clica no ícone → **arrasta** pra recortar. `Tela toda` pega a janela inteira,
  `Esc` cancela.
- No painel: **Card novo** (modelo, nome, lista, descrição) ou **Card
  existente** (busca por nome — ignora acento e maiúscula, então `acai` acha
  `Açaí`).
- `⟳` refaz o recorte sem perder o painel. `Esc` fecha.

O nome do card já vem preenchido com o título da aba e a descrição com o link
da página — é o que você digitaria mesmo, dá pra só ajustar.

### Modelo

Card novo pode nascer de um **card template do Trello** (aquele com o ícone de
fôrma). Ele vem com o checklist e as labels do template; o anexo e os
comentários não são copiados, porque esses vêm do uso real.

O select de modelo só aparece se o quadro tiver algum template, e quando houver
**exatamente um** ele já entra escolhido — é o modelo da casa. A descrição do
template preenche o campo na hora da escolha, em vez de ir escondida: dá pra
ver e editar antes de criar. Se você já tinha digitado algo ali, trocar de
modelo não apaga o que você escreveu.

No quadro de captação, o template traz o checklist de prospecção — que inclui
justamente *"anexar print da conversa"* e *"anexar print do CMS"*, os dois
passos que a extensão resolve num clique.

## Limites

- **Só a parte visível da aba.** `captureVisibleTab` não rola a página; o que
  está fora da tela não entra. Se a promoção for comprida, dá dois prints.
- **Nada de página interna do Chrome.** `chrome://` (configurações, histórico,
  extensões, nova aba), Web Store, `view-source:`, `devtools://` e páginas de
  outras extensões. O Chrome proíbe injetar script nelas — senão uma extensão
  poderia reescrever sua tela de configurações ou desativar as outras. O ícone
  pisca um `✕` vermelho e não acontece nada.

  Site normal em https nunca cai nessa lista, então pro uso do dia a dia não
  encosta. PDF aberto no Chrome deve funcionar (ele envolve o arquivo num
  documento HTML, e a captura pega o que está pintado) — mas isso não foi
  testado.
- **Anexo até ~3,5 MB.** Acima disso a extensão converte pra JPEG e, se ainda
  passar, vai reduzindo a escala — porque a function corta em 4 MB e o corpo
  chega nela em base64 (+33%).
- **Outro host no lugar do Netlify?** Tem que entrar em `host_permissions` no
  `manifest.json` também, senão o Chrome bloqueia o fetch. A tela de opções
  avisa quando o host salvo não está previsto.

## Mexer no código

| Arquivo | O que é |
| --- | --- |
| `manifest.json` | Permissões e registro (MV3) |
| `background.js` | Service worker: print, recorte, chamadas às functions |
| `selecao.js` | Content script: overlay de recorte e painel (tudo em shadow DOM) |
| `opcoes.html` / `opcoes.js` | Tela de opções |
| `icones/gerar-icones.py` | Redesenha os PNGs do ícone (só rodar se mudar o desenho) |

Depois de editar, volta em `chrome://extensions` e clica no ⟳ do cartão da
extensão. Mudança em `selecao.js` ainda precisa de um F5 na aba de teste — a
versão antiga continua injetada até a página recarregar.
