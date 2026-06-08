# HANDOFF: Migração do Sistema de Autenticação e Dados

## 🗓 Realizado em: 18 de Março de 2026 às 20:03 (BRT)

### 1. Migração de Autenticação (Google OAuth)
- **O QUE MUDOU**: O sistema de login local (e-mail + senha + 2FA manual) foi removido.
- **NOVO FLUXO**: Agora o acesso é feito via Google OAuth gerenciado pelo **Bigou Sheets Gateway**.
- **COMPONENTES**:
  - `AuthContext.tsx`: Toda a lógica de sessão baseada em cookies `httpOnly`.
  - `LoginPage.tsx`: Interface simplificada apenas com o botão "Entrar com Google".
  - **Removido**: Pasta `/backend`, `TwoFAPage.tsx` e scripts relacionados a senhas locais.

### 2. Fonte de Dados (Bigou Sheets Gateway)
- **O QUE MUDOU**: Os dados deixaram de ser baixados no "build" para serem buscados em tempo real (runtime) do Gateway.
- **CONFIGURAÇÃO**:
  - `dataSource.ts`: Atualizado para o ID da nova planilha `[REDACTED]` e aba `NOVOS`.

  - `dataSync.ts`: Motor de tratamento de dados foi refatorado para ler objetos JSON do Gateway e pular metadados das linhas 2-5 da planilha.
- **LIMPEZA**: Removidos os scripts `syncSheets.js` e o arquivo `remoteData.json`.

### 3. Ajuste Crítico na Planilha (Ação Necessária)
Para que as colunas de métricas (**Status, Lançamento e Weeks G-J**) parem de aparecer como `NaN` no Dashboard:

#### Procedimento:
1. Vá na aba **`NOVOS`** da planilha original.
2. Na **LINHA 1** (mesmo que haja filtros abaixo), você precisa nomear as colunas assim:
   - **A1**: `Cidade`
   - **B1**: `ID`
   - **C1**: `Estabelecimento`
   - **D1**: `Status`
   - **E1**: `Lancamento`
   - **F1**: `Responsavel`
   - **G1**: `Week_1`
   - **H1**: `Week_2`
   - **I1**: `Week_3`
   - **J1**: `Week_4`

**Por que?** O Gateway do Bigou só mapeia as colunas que possuem um cabeçalho explícito na primeira linha da aba.

### 4. Variaveis de Ambiente (.env)
Certifique-se de configurar a variável abaixo no local do deploy ou no seu `.env.local`:
`VITE_API_ORIGIN=https://bigou-sheets-api.netlify.app`

---
**Status do Sistema**: Funcional em `localhost:5173`. Autenticação validada. Aguardando ajuste de cabeçalhos na planilha para leitura de métricas completas.
