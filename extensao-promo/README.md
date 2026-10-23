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

3. **Liberar o ID no Netlify.** O `manifest.json` fixa o ID da extensão (ver
   *Passar pra outra pessoa*), então é um valor só, uma vez:

   ```
   ALLOWED_EXTENSION_IDS = dmjoddbhaikhkocbcanjofpnejbiofde
   ```

   Depois **redeploy** — env nova só vale pro próximo build. Sem isso toda
   chamada volta 403: as functions só respondem a origem conhecida.

   > Confira o ID real em `chrome://extensions` (ou nas opções da extensão)
   > antes de salvar. É ele que vale.

4. **Escolher o quadro padrão.** Ainda nas opções: o quadro que já vem
   selecionado no painel e, se quiser, a lista que vem junto. É só o padrão —
   o painel deixa trocar de quadro na hora.

## Passar pra outra pessoa

O Chrome deriva o ID de uma extensão descompactada do **caminho da pasta**, e
é o ID que as functions conferem (`ALLOWED_EXTENSION_IDS`). Sem cuidado, cada
pessoa que instala ganha um ID diferente e leva 403 — e você teria que somar um
ID novo na variável, com redeploy, a cada pessoa.

Por isso o `manifest.json` traz uma `key`: ela **fixa o ID** em
`dmjoddbhaikhkocbcanjofpnejbiofde` pra todo mundo, de qualquer pasta. É a chave
pública, pode ficar no repositório. Então a variável leva **um valor só**,
pra sempre.

### Para quem vai instalar

1. Pegar a pasta `extensao-promo/` — `git pull` se a pessoa tem o repositório,
   ou um zip dela se não tem.
2. `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem
   compactação** → escolher a pasta.
3. Pronto. Não precisa mexer em opções nem no Netlify: o ID é o mesmo, e o
   quadro padrão é escolha de cada um.

Para atualizar depois: `git pull` (ou zip novo) e o ⟳ no cartão da extensão.
Não há atualização automática por esse caminho.

> O Chrome mostra um balão "Desative as extensões de desenvolvedor" a cada
> abertura. É chato, mas é só fechar — não desinstala nada.

### Quando valer a pena ir pra Web Store

O caminho acima não escala bem: cada atualização é manual, e o balão de
desenvolvedor incomoda. Se passar de um punhado de pessoas, ou se forem pessoas
que não vão lidar com pasta e modo do desenvolvedor, vale publicar como
**não listada** na Chrome Web Store (só quem tem o link instala): conta de
desenvolvedor custa US$ 5 uma vez, a revisão leva alguns dias, e aí vem
atualização automática e instalação em um clique. O ID muda ao publicar — seria
preciso trocar o valor em `ALLOWED_EXTENSION_IDS` mais uma vez.

> Distribuir `.crx` solto não funciona: o Chrome bloqueia instalação de fora da
> loja desde 2018, a não ser por política de empresa (MDM) nas máquinas.

## Usar

- Clica no ícone → **arrasta** pra recortar. `Tela toda` pega a janela inteira,
  `Esc` cancela.
- O print cai na **gaveta**. Repete o ＋ pra somar quantos quiser — inclusive
  de outra aba.
- **⌘V / Ctrl+V** cola imagem da área de transferência direto na gaveta.
  Arrastar arquivo pra cima do painel também vale, e **+ arquivo** abre o
  seletor (áudio, PDF, o que for). **✕** tira um item da gaveta.
- No painel: **Card novo** (modelo, nome, lista, descrição) ou **Card
  existente** (busca por nome — ignora acento e maiúscula, então `acai` acha
  `Açaí`).
- `Esc` fecha o painel — a gaveta fica guardada.

### Gaveta

A coleta não termina num print só: a conversa costuma precisar de dois ou três,
mais o áudio, mais a tela do CMS confirmando a ativação. Então o print não vai
direto pro card — ele entra numa **gaveta**, e você publica tudo de uma vez.

Ela mora em `chrome.storage.local`, não na memória, por dois motivos que se
somam: o service worker é morto depois de ~30s parado, e o painel vive dentro
de **uma** aba — o print do CMS vem de outra, e trocar de aba mata o painel
junto com a página. No storage, dá pra capturar no WhatsApp, pular pro CMS e
continuar a mesma coleta.

Imagem entra pelos três caminhos com prévia na gaveta — colada, arrastada ou
escolhida no seletor. O que não é imagem (áudio, PDF) aparece como caixinha com
o nome do arquivo.

O listener do **colar** fica no painel, não no `document`: capturar no document
roubaria o paste da página, e colar imagem numa conversa do WhatsApp Web tem que
continuar funcionando. Por isso o painel recebe foco ao abrir — assim o ⌘V cai
nele sem precisar clicar antes. Colar **texto** no campo de comentário segue o
caminho normal; só imagem é interceptada.

Daí também o `unlimitedStorage` no manifest: a gaveta guarda os prints em
base64 até a publicação, e o teto padrão de 10 MB do `storage.local` estoura
com poucos recortes de tela Retina.

> O manifest não leva comentário explicando nada disso: JSON não tem comentário,
> e chave `_comment_*` faz o Chrome mostrar "Avisos" de chave desconhecida no
> cartão da extensão. O lugar da explicação é aqui.

Com a gaveta cheia, o botão **Gaveta (N)** aparece na barra do recorte: serve
pra ir direto ao painel (juntar o áudio, publicar) sem ter que tirar um print
que você não quer.

Tudo vira **um comentário só**, nesta ordem: o texto que você escreveu, depois
as imagens, depois os links dos arquivos. Imagem em comentário no Trello é, por
dentro, anexo do card + markdown apontando pro preview — é o que o app oficial
faz, e o motivo de `trello-card-anexar` já devolver `previewUrl` pronto. Áudio
não tem preview: entra como anexo e o comentário leva o link.

```
Parceiro aceitou a promo de 20% e já ativei no CMS

![print](…)
![print](…)
[📎 Audio-parceiro.ogg](…)
```

Os uploads vão em série, não em paralelo: a ordem dos prints é a ordem da
conversa, e upload concorrente embaralharia.

Gaveta esquecida expira em 24h, pra não ressurgir no meio de outro trabalho no
dia seguinte. O checklist do template **não** é marcado — isso continua manual.

### Fecho do card

Depois de publicar, três coisas que eram feitas à mão em todo card saem juntas:

| | |
| --- | --- |
| **Capa** | sai sempre. O Trello promove imagem anexada a capa do card sozinho, e aqui ela nunca é desejada. Vai por dois caminhos: `setCover=false` no upload e `idAttachmentCover: ''` no fecho |
| **Data** | `due` = o momento da publicação |
| **Concluído** | `dueComplete = true` |

Data e conclusão dependem do **Concluir** (marcado por padrão) — card de
parceiro que ainda não respondeu fica em aberto de propósito. A capa sai nos
dois casos.

> O `due` é registro, não prazo: nos 600 cards com data, ela é o dia em que o
> card nasceu, com a hora do fecho. Por isso é "agora", e não uma data futura.

**Arquivar não entra.** Os cards concluídos recentes estão fora do arquivo —
isso é feito em lote, depois, e não por card.

O nome do card já vem preenchido com o título da aba e a descrição com o link
da página — é o que você digitaria mesmo, dá pra só ajustar.

### Quadro

O **Quadro** no topo do painel vale pras duas abas e lista todos os quadros
abertos. O das opções é só o que vem selecionado: print de parceiro em queda
ou de alta taxa de cancelamento não vai pro mesmo quadro que promoção.

Trocar de quadro recarrega listas, modelos, labels e a busca de cards — tudo
era do quadro anterior. Dois detalhes que caem junto:

- a **lista padrão** só é aplicada no quadro padrão; em outro quadro ela
  escolheria uma lista qualquer sem você pedir;
- o campo **Modelo** some em quadro que não tem card template.

### Parceiro

O card criado pelo CMS (pela página do parceiro) sai padronizado, e card criado
solto quebra esse padrão. Por isso o painel tem busca de parceiro — por **ID ou
nome** — e, escolhido o parceiro, reproduz os três pedaços que o CMS põe:

| | |
| --- | --- |
| Nome | `28618 - Açaí do Eton` |
| Label | a cidade do parceiro |
| Descrição | `[LINK DO ESTABELECIMENTO](https://admin.bigou.com.br/estabelecimento/cadastro/28618)` |

Os formatos não foram inventados: saíram da leitura dos cards que o CMS já
criou no quadro.

A lista vem de `parceiros-ativos` (1426 parceiros, ~85 KB) e fica em
`chrome.storage.local` por 6h — o MySQL que as functions leem já atrasa cerca
de um dia do banco real, então segurar esse tempo não deixa nada mais velho do
que já é. Parceiro cadastrado hoje pode não aparecer; **Recarregar** nas opções
força a atualização.

### Label da cidade

Das 66 cidades com parceiro ativo, só 25 têm label no quadro, e 9 têm label
repetida (`Muriaé` existe 4 vezes, com cores diferentes). Então:

- **uma label casa** → já vem escolhida;
- **várias casam** → ganha a mais usada, contando cards arquivados junto. É o
  que desempata de verdade: a `Muriaé` do CMS aparece em 179 cards, as outras
  em 4, 3 e 1;
- **nenhuma casa** → aparece o botão **+ criar label «Cidade»**. A cor sai da
  menos usada no quadro, pra cidade nova não nascer igual às outras.

O select continua listando as outras labels do quadro — dá pra pôr `Onboarding`
ou qualquer outra no lugar.

> A comparação ignora acento, caixa e o sufixo de UF, porque a label às vezes
> traz (`Santos Dumont - MG`) e a cidade do banco não.

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
