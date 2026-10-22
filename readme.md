# caisUp — Backend & Banco de Dados

API REST, WebSockets e modelagem de banco de dados da plataforma de matchmaking corporativo que conecta Startups em busca de captação a Investidores.

---

## 👨‍💻 Desenvolvedor

**Nome do Projeto:** CAISUP

---

## 🔗 Links do Projeto

| Recurso | Link |
|---------|------|
| 🌐 Aplicação em Produção | [plataforma-matchmaking-frontend-dep.vercel.app](https://plataforma-matchmaking-frontend-dep.vercel.app/) |
| ⚙️ Repositório Back-End | [Plataforma_matchmaking_backend-banco_deploy](https://github.com/AllanLemosFalcao/Plataforma_matchmaking_backend-banco_deploy) |
| 🎨 Repositório Front-End | [Plataforma_matchmaking_frontend_deploy](https://github.com/AllanLemosFalcao/Plataforma_matchmaking_frontend_deploy) |

---

## 🦖 Sobre o Projeto (Back-End)

O backend do **caisUp** é uma API construída em Node.js com TypeScript e Express. Ele fornece a inteligência de negócios para o aplicativo, um algoritmo de "score" para recomendação de conexões, autenticação segura via JWT, gerenciamento persistente de dados usando Prisma ORM e um servidor WebSocket acoplado para chat em tempo real.

---

## ✅ Funcionalidades

- 🔐 **Autenticação**: Registro e login com criptografia Bcrypt e geração de token JWT.
- 🎯 **Algoritmo de Matchmaking**: Sistema de recomendação que cruza dados (segmentos e localização) e atribui *scores*.
- 🤝 **Interesses e Matches**: Lógica de aceite, recusa e registro de interesses mútuos.
- 💬 **WebSockets (Real-time)**: Salas exclusivas de chat geradas dinamicamente para interações instantâneas.
- 📊 **Estatísticas (Dashboard)**: Contagem em tempo real de envios, recebimentos e matches ativos.
- 🛠️ **Self-Healing**: Auto-cura na criação de conversas, garantindo que o banco gere instâncias faltantes automaticamente sem quebrar o chat.

---

## 🛠️ Tecnologias

- **Node.js** (Ambiente de execução)
- **TypeScript** (Tipagem estática segura)
- **Express (v5)** (Framework Web)
- **Prisma ORM** (Mapeamento relacional de dados)
- **MySQL via TiDB** (Banco de dados relacional em nuvem)
- **Socket.io** (Comunicação bidirecional em tempo real)
- **Bcryptjs & JWT** (Segurança e Autenticação)
- **Render** (Deploy da API)

---

## 📋 Endpoints Principais

### Autenticação & Perfil
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/register` | Cadastro de Usuário (Startup/Investidor) com transação segura no banco |
| POST | `/api/auth/login` | Login e geração de token JWT |
| PUT | `/api/perfil` | Atualiza dados do perfil (segmentos, teses, etc) |
| GET | `/api/perfil/:id` | Busca detalhes públicos de um perfil pelo ID |

### Matchmaking (Busca e Recomendação)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/buscar` | Busca perfis baseada em filtros e calcula o score de aderência |
| GET | `/api/recomendacoes` | Sugere os 4 melhores perfis cruzando teses e segmentos |
| POST | `/api/match/interesse` | Registra intenção de conexão (Like) |
| GET | `/api/match/pendentes` | Lista quem curtiu o usuário logado |
| POST | `/api/match/aceitar` | Confirma o match e gera sala de conversa |
| POST | `/api/match/recusar` | Recusa e descarta a intenção de conexão |
| GET | `/api/match/listar` | Lista os matches ativos para o chat |

### Mensageria (WebSocket/REST)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/mensagens/:matchId` | Carrega o histórico de mensagens de uma conversa |
| POST | `/api/mensagens` | Salva mensagem no BD e emite evento WebSocket (`nova_mensagem`) |

### Dashboard
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/dashboard` | Retorna o resumo numérico de interações |
| GET | `/api/dashboard/detalhes` | Retorna o histórico profundo de interações ativas/inativas |

---

## 📦 Como Rodar Localmente

### 1. Pré-requisitos

- [Node.js](https://nodejs.org/) (v18+)
- NPM ou Yarn
- Servidor MySQL local ou banco remoto (TiDB/PlanetScale).

### 2. Clonar o Repositório

```bash
git clone https://github.com/AllanLemosFalcao/Plataforma_matchmaking_backend-banco_deploy.git
cd Plataforma_matchmaking_backend-banco_deploy
```

### 3. Configurar o Banco de Dados

Crie um arquivo `.env` na raiz do projeto contendo as seguintes variáveis:

```env
PORT=3000
JWT_SECRET=sua_chave_secreta_super_segura
DATABASE_URL="mysql://USUARIO:SENHA@HOST:PORTA/plataforma_matchmaking"
```

### 4. Preparar o Banco (Prisma)

Sincronize sua estrutura local e gere os clientes do Prisma:

```bash
npm install
npx prisma generate
```
*(Opcional: Execute o arquivo `modelo_er_matchmaking.sql` diretamente no seu SGBD preferido caso queira criar a estrutura do zero)*

### 5. Executar o Projeto

```bash
npm run dev
```

A API REST e o WebSocket estarão operando em: `http://localhost:3000`

---

## 📁 Estrutura do Projeto

```
backend/
├── src/
│   ├── controllers/
│   │   ├── authController.ts       # Cadastro e Login (Transações)
│   │   ├── buscaController.ts      # Filtros e algoritmo de Scoring
│   │   ├── dashboardController.ts  # Métricas e contadores
│   │   ├── matchController.ts      # Fluxo de dar "match", aceitar/recusar
│   │   ├── mensagemController.ts   # Chat REST com disparo de Socket.io
│   │   ├── perfilController.ts     # Edição de perfil
│   │   └── recomendacaoController.ts # Motor de recomendação
│   ├── middlewares/
│   │   └── authMiddleware.ts       # Validação do Token Bearer JWT
│   ├── routes/
│   │   └── index.ts                # Definição dos Endpoints
│   └── server.ts                   # Boot do Express + Instância Socket.io
├── prisma/
│   └── schema.prisma               # Modelagem e relacionamento ORM
├── modelo_er_matchmaking.sql       # Script SQL nativo puro
├── package.json
└── tsconfig.json
```

---

## 🚀 Deploy e Variáveis (Render)

A API foi conteinerizada e está configurada para deploy via plataforma de nuvem **Render**.
É necessário definir as seguintes chaves em produção (Environment Variables):

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | String de conexão do MySQL |
| `JWT_SECRET` | Chave de validação de tokens |

*(Dica: Configure o CORS no `server.ts` apontando estritamente para a sua URL da Vercel para maior segurança).*

---

## 🔒 Segurança

- Senhas *hasheadas* utilizando `bcryptjs` antes de persistir no banco.
- Validação de rotas privadas protegidas pelo `authMiddleware` via **JWT Bearer Token**:
  ```http
  Authorization: Bearer <seu_token_aqui>
  ```
- Mapeamento robusto com ORM Prisma (prevenção nativa contra SQL Injection).

---

## 🗄️ Banco de Dados (Estrutura Principal)

A modelagem é fortemente relacional, suportando entidades distintas baseadas em um Usuário Base:

| Tabela/Entidade | Descrição |
|--------|-----------|
| `usuario` | Base de autenticação (UUID, Email, Senha Hash, Tipo). |
| `startup` | Detalhamentos do perfil Startup (Estágio, Investimento buscado). |
| `investidor` | Detalhamentos do perfil Investidor (Faixas de ticket, teses). |
| `segmento` / `*_segmento` | Tabelas associativas (N:M) de mercados/segmentos de atuação. |
| `interesse` | Registro transitório pendente/aceito entre investidor e startup. |
| `match_conexao` | Conexões oficiais originadas de interesses aceitos. |
| `conversa` & `mensagem` | Armazenamento de chats atrelados às conexões. |

---

## 📝 Licença

Projeto de código aberto desenvolvido para fins educacionais e de portfólio.
