# MERCADO FÁCIL ASSPEN - Sistema de Gestão para Unidade Prisional

## Visão Geral do Sistema

**Nome**: Mercado Fácil ASSPEN
**Finalidade**: Sistema de gestão de vendas, estoque e crédito para unidade prisional (APAC)
**Stack**: React 19 + TypeScript + Vite + Firebase (Firestore + Auth + Storage) + TailwindCSS 4

---

## Estrutura do Projeto

```
mercado git/
├── App.tsx                    # Componente raiz com ThemeProvider e StoreProvider
├── index.tsx                  # Entry point React
├── context/
│   ├── StoreContext.tsx       # Estado global (usuários, produtos, pedidos, etc)
│   └── ThemeContext.tsx       # Gerenciamento de tema
├── pages/
│   ├── Login.tsx              # Página de login
│   ├── UserDashboard.tsx     # Dashboard do familiar/visitante
│   └── AdminDashboard.tsx    # Dashboard administrativo completo
├── components/
│   ├── admin/                 # Componentes administrativos
│   │   ├── AdminHomeTab.tsx       # Página inicial admin
│   │   ├── AdminOrdersTab.tsx     # Gestão de pedidos
│   │   ├── AdminProductsTab.tsx   # Gestão de produtos
│   │   ├── AdminFinanceTab.tsx    # Gestão financeira
│   │   ├── AdminUsersTab.tsx      # Gestão de usuários
│   │   ├── AdminWalletTab.tsx     # Carteira de créditos
│   │   ├── AdminInmatesTab.tsx    # Gestão de internos
│   │   ├── AdminSalesModal.tsx    # Modal de vendas PDV
│   │   ├── AdminSettingsTab.tsx   # Configurações do sistema
│   │   └── ...
│   ├── user/                  # Componentes do usuário
│   ├── CupomEntrega.tsx       # Cupom de entrega para interno
│   └── ReciboA4.tsx           # Recibo formatado A4
├── types.ts                   # Definições de tipos TypeScript
├── utils.ts                   # Funções utilitárias
├── constants.ts               # Constantes (temas, informações da APAC)
└── firebase.ts                # Configuração Firebase
```

---

## Funcionalidades Principais

### 1. Autenticação e Usuários

- **Login Familiar**: CPF + senha
- **Login Admin**: E-mail + senha
- **Recuperação de Senha**: Por CPF
- **Papéis**:
  - `ADMIN` - Administrador master
  - `FAMILY` - Familiar/visitante
- **Estados de usuário**: `pending`, `active`, `suspended`

### 2. Gestão de Produtos

- Cadastro manual de produtos
- Importação via XML de nota fiscal (NFe)
- Controle de estoque com alerta de mínimo
- Categorias: Carnes, Laticínios, Bebidas, etc.
- Código de barras / EAN
- Margem de lucro automática
- Preço dinâmico (permite alterar no momento da venda)

### 3. Sistema de Vendas (PDV)

- Venda presencial via admin (cash, PIX, cartão, wallet)
- Venda online via app do familiar
- Controle de estoque em tempo real
- Geração de PIX via QR Code
- Cálculo de troco
- Vendas mistas (múltiplas formas de pagamento)

### 4. Carteira de Créditos do Interno

- **Saldo**: Crédito disponível para compras
- **Limite Semanal**: Configurável (padrão R$ 300)
- **Histórico**: Todas transações (depósito, compra, saque)
- **Depósito**: Familiar faz depósito via PIX/comprovante
- **Saque**: Interno pode sacar (se habilitado)
- **Controle de gastos**: Limite semanal por interno

### 5. Gestão Financeira

- **Receitas**: Vendas, depósitos
- **Despesas**: Saídas manuais
- **Relatórios**: Vendas por período, produtos, categorias
- **Fechamento de caixa**: Diário/semanal
- **Backup**: Exportação JSON

### 6. Ciclo de Pedidos

```
Pendente -> Pago -> Preparando -> Saiu para Entrega -> Entregue
                                    └──> Cancelado/Devolvido
```

### 7. Recursos do Admin

- Aprovar/suspender usuários
- Definir limite de crédito por interno
- Gerar catálogo impresso
- Visualizar comprovantes de depósito
- Estornar pedidos (devolução)
- Mesclar produtos duplicados

---

## Configurações do Firebase

O projeto usa Firebase Firestore com as seguintes coleções:

- `users` - Usuários do sistema
- `products` - Catálogo de produtos
- `orders` - Pedidos realizados
- `expenses` - Despesas
- `suppliers` - Fornecedores
- `settings` - Configurações globais
- `wallet_transactions` - Transações de carteira
- `cash_sessions` - Sessões de caixa (abertura, suprimento, sangria, fechamento)

---

## Comandos npm

```bash
npm run dev          # Iniciar servidor de desenvolvimento
npm run build       # Compilar para produção
npm run lint        # Verificar erros TypeScript
npm run electron-dev    # Modo desenvolvimento com Electron
npm run electron-build  # Build Electron desktop
```

---

## Variáveis de Ambiente (.env)

```
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=mercado-facil-mt.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mercado-facil-mt
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

---

## Temas Visuais Disponíveis

1. POLICE_MT - Azul escuro institucional
2. PROFESSIONAL_BLUE - Azul profissional
3. MODERN_GREEN - Verde moderno
4. ELEGANT_PURPLE - Roxo elegante
5. VIBRANT_ORANGE - Laranja vibrante
6. HIGH_CONTRAST - Alto contraste
7. CYBER_DARK - Escuro cyber
8. SOFT_PASTEL - Pastel suave

---

##招聘信息

**INFORMAÇÕES DA INSTITUIÇÃO**:
- Nome: ASSOCIAÇÃO DOS SERVIDORES DO SISTEMA PENAL DE PEIXOTO DE AZEVEDO / MT - ASSPEN
- CNPJ: 53.100.595/0001-13
- Fundação: 17 de Outubro de 2023
- E-mail: asspenpeixotodeazevedo@gmail.com
- Chave PIX padrão: CNPJ

---

## Estrutura de Dados Importante

### User
```typescript
{
  id: string;
  name: string;
  email: string;
  cpf: string;
  role: 'ADMIN' | 'FAMILY';
  status: 'pending' | 'active' | 'suspended';
  inmateName?: string;      // Nome do interno
  inmateCpf?: string;       // CPF do interno
  walletBalance?: number;  // Saldo na carteira
  weeklySpent?: number;    // Gasto semanal
  permissions?: string[];  // Permissões granulares
}
```

### Product
```typescript
{
  id: string;
  name: string;
  price: number;
  costPrice: number;
  margin: number;
  stock: number;
  category: string;
  barcode?: string;
  ean?: string;
  imageUrl?: string;
}
```

### Order
```typescript
{
  id: string;
  userId: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  paymentMethod: 'PIX' | 'CASH' | 'CARD' | 'WALLET';
  inmateName: string;
  createdAt: string;
}
```

---

## Problemas Conhecidos / Advertências

1. **Persistência Offline**: O Firebase usa IndexedDB para cache offline
2. **Limite de Upload**: Arquivos devem ter < 1MB (Firestore)
3. **Tempo de Sessão**: 15 minutos de inatividade faz logout automático
4. **Limite Semanal**: Padrão R$ 300/semana por interno

---

## Para Desenvolvedores Futuros

1. Este sistema usa React 19 com concurrent features
2. TailwindCSS v4 usa plugin @tailwindcss/vite
3. Firebase SDK v12+
4. Componentes usam Framer Motion para animações
5. QR Code via qrcode.react
6. Relatórios via jspdf e xlsx
7. O sistema pode ser empacotado como .exe via electron-builder