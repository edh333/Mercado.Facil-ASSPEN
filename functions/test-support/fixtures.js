// Fixtures compartilhadas dos testes de integração das Cloud Functions.
import bcrypt from "bcryptjs";
import { fake } from "./harness.js";

export const MASTER_PASSWORD = "senha-mestra-123";

// rounds baixos: o teste só precisa que bcrypt.compare valide a senha.
const MASTER_HASH = bcrypt.hashSync(MASTER_PASSWORD, 4);

const HORA_ATRAS = () => fake.Timestamp.fromDate(new Date(Date.now() - 3600 * 1000));

/**
 * Banco base: operador de PDV, admin principal, dois usuários com carteira,
 * um usuário de fiado, dois produtos, senha mestra e um caixa ABERTO do op1.
 */
export function baseSeed() {
  return {
    users: {
      op1: {
        authUid: "op1",
        role: "vendedor",
        status: "active",
        name: "Operador Um",
        cpf: "11144477735",
      },
      admin1: {
        authUid: "admin1",
        role: "admin",
        status: "active",
        name: "Admin Um",
        mainAdmin: true,
        cpf: "52998224725",
      },
      u1: {
        authUid: "u1",
        role: "user",
        status: "active",
        name: "Fulano da Silva",
        cpf: "52998224725",
        inmateCpf: "52998224725",
        walletBalance: 100,
        weeklySpent: 0,
      },
      u2: {
        authUid: "u2",
        role: "user",
        status: "active",
        name: "Beltrano Souza",
        cpf: "11144477735",
        walletBalance: 50,
        weeklySpent: 0,
      },
      fiado1: {
        authUid: "fiado1",
        role: "user",
        status: "active",
        name: "Cliente Fiado",
        cpf: "16899535009",
        allowCredit: true,
        creditLimit: 500,
        currentDebt: 0,
        weeklySpent: 0,
      },
    },
    products: {
      p1: { name: "Arroz 5kg", price: 10, stock: 100, category: "Geral" },
      p2: { name: "Feijão 1kg", price: 8.5, stock: 50, category: "Geral" },
    },
    settings: {
      private: { masterPasswordHash: MASTER_HASH },
      general: { cancelWindowDays: 5, weeklyWalletLimit: 1000 },
    },
    cash_sessions: {
      s1: {
        operatorId: "op1",
        operatorName: "Operador Um",
        status: "open",
        openedAt: HORA_ATRAS(),
        closedAt: null,
        initialBalance: 0,
        currentBalance: 0,
        supplements: [],
        withdrawals: [],
        closedBalance: 0,
        openedBy: "op1",
      },
    },
  };
}
