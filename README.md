As chaves novas do env estão comigo (Marcos), caso queira para rodar mandar mensagem para mim

# 📚 StudyAI — Plataforma de Estudos com IA

Aplicação web para estudos com inteligência artificial. O usuário cria matérias, faz upload de PDFs e conta com diversas ferramentas de IA para otimizar os estudos: geração de quizzes, flashcards, resumos, planos de estudo e mais.

---

## 🗂 Estrutura do Projeto

```
src/
├── App.tsx                         # Roteamento principal
├── main.tsx                        # Ponto de entrada React
├── contexts/
│   ├── AuthContext.tsx             # Autenticação via Supabase Auth
│   └── ThemeContext.tsx            # Tema claro/escuro
├── components/
│   ├── ProtectedRoute.tsx          # Proteção de rotas autenticadas
│   └── NavLink.tsx                 # Link com estilo ativo
├── hooks/
│   ├── use-mobile.tsx              # Detecta viewport mobile
│   └── use-toast.ts                # Hook de notificações
├── lib/
│   ├── gamification.ts             # Sistema de XP, níveis e conquistas
│   └── utils.ts                    # Utilitários gerais (cn)
├── integrations/supabase/
│   ├── client.ts                   # Cliente Supabase
│   └── types.ts                    # Tipos gerados das tabelas
└── pages/
    ├── LoginPage.tsx               # Login com email/senha
    ├── CadastroPage.tsx            # Cadastro de novo usuário
    ├── DashboardPage.tsx           # Dashboard principal
    ├── MateriaPage.tsx             # Página de uma matéria específica
    ├── QuizPage.tsx                # Realização do quiz
    ├── ResultadoPage.tsx           # Resultado após quiz
    ├── RevisaoPage.tsx             # Revisão de respostas
    ├── FlashcardsPage.tsx          # Estudo com flashcards
    ├── ListaExerciciosPage.tsx     # Lista de exercícios importada
    ├── ProfilePage.tsx             # Perfil, XP e conquistas
    ├── PlanPage.tsx                # Plano de estudos gerado por IA
    └── NotFound.tsx                # Página 404

supabase/
├── config.toml
├── migrations/                     # Migrações SQL do banco de dados
└── functions/                      # Edge Functions (IA via API)
    ├── gerar-questoes/             # Gera questões de múltipla escolha
    ├── feedback-quiz/              # Feedback detalhado pós-quiz
    ├── resumir-conteudo/           # Resumo do conteúdo do PDF
    ├── gerar-flashcards/           # Gera flashcards frente/verso
    ├── extrair-lista/              # Extrai questões de uma lista em PDF
    ├── gerar-plano-estudos/        # Gera plano de estudos personalizado
    ├── explicar-erro/              # Explica respostas erradas
    └── assistente-questao/         # Assistente de dúvidas por questão
```

---

## 🚀 Funcionalidades

### Autenticação
- Cadastro com nome, email e senha
- Login com email e senha
- Rotas protegidas com `ProtectedRoute`

### Dashboard
- Cria, visualiza e exclui matérias
- Painel com streak de dias estudados, média geral e melhor nota
- Gráfico de desempenho ao longo do tempo
- Histórico de resultados recentes com opção de exclusão
- Alternância entre tema claro e escuro

### Página de Matéria (`/materia/:id`)
- **Renomear matéria** — clique no ícone de lápis ao lado do nome no cabeçalho (passando o mouse), edite e confirme com Enter ou ✓
- Upload de PDFs (máx 10 MB) com extração de texto via `pdfjs-dist`
- Gerenciamento de documentos enviados
- Configuração de dificuldade do quiz (nota desejada de 1–10) e quantidade de questões (5–20)
- Geração de quiz com IA
- Geração de resumo para prova (painel lateral)
- Estudo com flashcards
- Importação de lista de exercícios a partir de PDF

### Quiz (`/quiz/:resultadoId`)
- Questões de múltipla escolha geradas por IA com base no conteúdo do PDF
- Assistente de dúvidas por questão
- Explicação de erros ao confirmar resposta

### Resultado e Revisão
- Nota estimada, acertos e erros
- Feedback detalhado por questão
- Botão de revisão completa das respostas

### Flashcards (`/flashcards/:materiaId`)
- Gerados automaticamente por IA a partir dos PDFs
- Cache no banco (não regera toda vez)
- Interface de virar carta (frente/verso)

### Plano de Estudos (`/plano`)
- Gerado por IA com base nas matérias e desempenho
- Salvo por usuário no banco de dados

### Perfil (`/perfil`)
- Sistema de gamificação: XP, níveis (Iniciante → Lenda) e conquistas
- Histórico de quizzes
- Atualização do nome de exibição

---

## 🗄 Banco de Dados (Supabase)

| Tabela              | Descrição                                    |
|---------------------|----------------------------------------------|
| `profiles`          | Perfil do usuário (nome)                     |
| `materias`          | Matérias criadas por cada usuário            |
| `documentos`        | PDFs enviados e texto extraído               |
| `listas_exercicios` | Listas importadas de PDF                     |
| `resultados`        | Resultados dos quizzes (nota, acertos, erros)|
| `metas_estudo`      | Meta de nota por matéria                     |
| `flashcards`        | Cache de flashcards por matéria              |
| `planos_estudo`     | Plano de estudos por usuário                 |

Todas as tabelas possuem **Row Level Security (RLS)** ativado — cada usuário acessa apenas seus próprios dados.

---

## ⚙️ Como Rodar Localmente

### Pré-requisitos
- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Chave de API de um modelo LLM (configurada nas Edge Functions)

### 1. Instale as dependências

```bash
npm install
```

### 2. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-anon-key>
```

### 3. Aplique as migrações

No painel do Supabase, execute os arquivos SQL em `supabase/migrations/` na ordem cronológica dos nomes.

### 4. Deploy das Edge Functions

```bash
supabase functions deploy gerar-questoes
supabase functions deploy feedback-quiz
supabase functions deploy resumir-conteudo
supabase functions deploy gerar-flashcards
supabase functions deploy extrair-lista
supabase functions deploy gerar-plano-estudos
supabase functions deploy explicar-erro
supabase functions deploy assistente-questao
```

Configure a variável de ambiente `OPENAI_API_KEY` (ou equivalente) nas Edge Functions pelo painel do Supabase em **Settings → Edge Functions → Secrets**.

### 5. Inicie o servidor de desenvolvimento

```bash
npm run dev
```

Acesse `http://localhost:5173`.

---

## 🏗 Stack Tecnológica

| Camada       | Tecnologia                          |
|--------------|-------------------------------------|
| Frontend     | React 18 + TypeScript + Vite        |
| Roteamento   | React Router DOM v6                 |
| UI           | shadcn/ui + Tailwind CSS            |
| Gráficos     | Recharts                            |
| Backend/DB   | Supabase (PostgreSQL + Auth + Storage) |
| IA (funções) | Supabase Edge Functions (Deno)      |
| PDF          | pdfjs-dist (extração no cliente)    |
| Estado       | React useState + TanStack Query     |

---

## ✏️ Como Renomear uma Matéria

1. Acesse a página da matéria (`/materia/:id`)
2. Passe o mouse sobre o nome da matéria no cabeçalho — um ícone de lápis (✏️) aparecerá ao lado
3. Clique no ícone para entrar no modo de edição
4. Digite o novo nome
5. Confirme com **Enter** ou clicando em **✓**, ou cancele com **Esc** ou **✕**

A alteração é salva diretamente no banco de dados e refletida instantaneamente na tela.