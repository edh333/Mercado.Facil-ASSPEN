
export enum UserRole {
  ADMIN = 'ADMIN',
  FAMILY = 'FAMILY'
}

/** Normaliza o role salvo no Firestore (pode vir como 'admin' minúsculo ou 'ADMIN') para o enum do app. */
export function toUserRole(role?: string | null | undefined): UserRole {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'master' ? UserRole.ADMIN : UserRole.FAMILY;
}

export type SystemRole = 'admin' | 'manager' | 'operator' | 'user';

export enum OrderStatus {
  PENDING = 'pending',
  PENDING_PAYMENT = 'pending_payment',
  PAID = 'paid',
  PREPARING = 'preparing',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled'
}

export enum ThemeOption {
  POLICE_MT = 'police_mt',
  PROFESSIONAL_BLUE = 'professional_blue',
  MODERN_GREEN = 'modern_green',
  ELEGANT_PURPLE = 'elegant_purple',
  VIBRANT_ORANGE = 'vibrant_orange',
  HIGH_CONTRAST = 'high_contrast',
  CYBER_DARK = 'cyber_dark',
  SOFT_PASTEL = 'soft_pastel',
  WINDOWS_BLUE = 'windows_blue'
}

export interface Message {
  id: string;
  userId: string;
  text: string;
  date: string;
  read: boolean;
  fromAdmin: boolean;
}

export type SalesChannel = 'both' | 'user' | 'admin';

export interface Product {
  brand?: string;
  barcode?: string;
  dynamicPrice?: boolean;
  ean?: string;
  id: string;
  name: string;
  description: string;
  price: number;
  costPrice: number;
  margin: number;
  category: string;
  imageUrl: string;
  stock: number;
  restricted: boolean;
  available: boolean;
  weight?: string;
  supplierId?: string;
  promoPrice?: number;
  minStock?: number;
  lastSoldAt?: string;
  supplier?: string;
  salesChannel?: SalesChannel;
}

export interface CartItem extends Product {
  quantity: number;
  priceAtPurchase: number;
  productId: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  authUid?: string;
  cpf?: string;
  rg?: string;
  phone?: string;
  address?: string;
  visitorCard?: string;
  selectedUnitId?: string;
  unitId?: string;
  inmateName?: string;
  prisonerName?: string; // Alias for inmateName
  inmateCpf?: string;
  prisonerCpf?: string; // Alias for inmateCpf
  relationship?: string;
  kinship?: string; // Alias
  status: 'pending' | 'active' | 'suspended';
  approved: boolean;
  suspended?: boolean; // Alias for status check
  overLimitFlag?: boolean;
  documentUrl?: string;
  createdAt?: string;
  permissions?: string[]; // New: Granular permissions for secondary admins
  showFinanceEntries?: boolean; // New: Toggle for Principal Admin to hide/show entries
  walletBalance?: number; // New: Dynamic Credit for Inmate
  weeklySpent?: number; // New: Tracks spend against limit
  lastSpentReset?: string; // New: ISO date of last limit reset
  autorizacaoExcepcional?: boolean; // Admin override for weekly limit
  allowCredit?: boolean; // New: Master toggle for UI/UX credit buttons
}


export interface InmateLocation {
  raio: string; // Alias ray
  ray?: string;
  ala: string; // Alias wing
  wing?: string;
  cela: string; // Alias cell
  cell?: string;
  isWorker?: boolean;
}

export interface Order {
  id: string;
  userId: string;
  userName?: string;
  userCpf?: string;
  unitId: string;
  unitName?: string;
  items: { productId: string; quantity: number; priceAtPurchase: number; name?: string; description?: string; category?: string; imageUrl?: string; restricted?: boolean }[];
  total: number;
  status: string;
  createdAt?: string;
  date: string; // Alias for createdAt
  deliveryDate?: string;
  paymentProofUrl?: string;
  proofHash?: string;
  proofSize?: number;
  proofMime?: string;
  inmateLocation?: InmateLocation;
  deliveryLocation?: InmateLocation; // Alias
  printCount?: number;
  inmateName?: string; // Snapshot
  inmateCpf?: string; // Snapshot
  operatorName?: string; // Snapshot do operador PDV
  paymentMethod?: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'MIXED' | 'FIADO';
  payments?: { method: 'PIX' | 'WALLET' | 'CASH' | 'CARD' | 'FIADO'; amount: number }[];
  change?: number;
  cardBrand?: string;
  walletBalanceBefore?: number;
  walletBalanceAfter?: number;
  jointWallet?: {
    secondUserId: string;
    secondUserName?: string;
    secondUserCpf?: string;
    secondWalletAmount: number;
    firstWalletAmount?: number;
  };
  deleted?: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  cnpjOrCpf: string;
  contact: string;
  description: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string;
  recipientName: string;
  recipientDoc: string;
  recipientCpf?: string;
  status?: 'PENDING' | 'PAID';
  category?: string;
  type?: 'SUPPLIER' | 'OPERATIONAL';
  observation?: string; // Novo campo para detalhes
  debitAccount?: 'CAIXA' | 'BANCO' | 'PIX';
  deleted?: boolean;
}

export interface AppConfig {
  activationDate?: string;
  activationKey?: string;
  activationDaysLeft?: number;
  expirationDate?: string; // Data ISO final da licença
  receiptFooter?: string;
  isTrial?: boolean;
  enablePrisonerWallet?: boolean;
  allow_user_purchases?: boolean;
  allow_balance_purchases?: boolean;
  developerEmail?: string;
  developerName?: string;
  developerPhone?: string;
  dev_name?: string;
  dev_email?: string;
  dev_phone?: string;
  logoUrl?: string;
  appName: string;
  institutionName: string;
  cnpj: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  footerText: string;
  contactPhone: string;
  contactEmail?: string;
  contactAddress?: string;
  adminPassword?: string;
  secondaryPassword?: string;
  pixKeys: string[];
  loginImageUrl?: string;
  loginTitle?: string;
  systemName?: string;
  theme: ThemeOption;
  customWelcomeMessage?: string;
  lowStockThreshold?: number;
  customReceiptText?: string; // Campo novo para texto do cupom
  customReceiptTitle?: string; // Novo: Título do Cupom (ASSPEN - Gestão)
  customReceiptSubtitle?: string; // Novo: Subtítulo (CDP Peixoto...)
  customReceiptDocName?: string; // Novo: Nome do Doc (CUPOM DE ENTREGA)
  fiscalEmission?: boolean; // Opcional: emite cupom com identificação fiscal (NF-e/NFC-e/SAT)
  fiscalModel?: string; // Modelo fiscal exibido no cupom: NF-E | NFC-E | SAT
  fiscalNumber?: string; // Número atual da sequência fiscal (informado pelo contador/equipamento)
  fiscalSeries?: string; // Série fiscal (ex.: A1)
  loginBgUrl?: string;
  loginBgType?: 'none' | 'color' | 'image';
  userDashboardBgUrl?: string;
  userDashboardBgType?: 'none' | 'color' | 'image';
  userDashboardBgBlur?: number; // Novo: Controle de desfoque
  userDashboardBgOpacity?: number; // Novo: Opacidade da máscara Escura/Clara

  // Landing Page Customization
  landingPageTagline?: string; // Título da landing page (ex: Aproxima você de quem você ama)
  landingPageSubtitle?: string; // Subtítulo da landing page
  
  // Professional Receipt Customization
  receiptMainTitleOrder?: string;
  receiptMainTitleExpense?: string;
  receiptLabelValue?: string;
  receiptLabelPayer?: string;
  receiptLabelBeneficiary?: string;
  receiptLabelHistory?: string;
  receiptLabelObservations?: string;
  receiptLabelItems?: string;
  receiptDeclaration?: string;
  receiptSignatureLabel?: string;

  // Wallet & Limits
  weeklyWalletLimit?: number;
  limiteSemanal?: number;
  autoArchiveEnabled?: boolean;
  autoArchiveDays?: number;
  receiptFontSize?: number;
  showUserCredits?: boolean;
  pdvColor?: string;
  autoPrint?: boolean;
}


export interface AuditLog {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  details?: string;
}

export interface WalletTransaction {
  id: string;
  userId: string;
  inmateCpf: string;
  amount: number;
  proofUrl: string;
  proofHash?: string;
  proofSize?: number;
  proofMime?: string;
  rejectReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  inmateName?: string;
  prisonerCpf?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  type: 'deposit' | 'purchase' | 'withdrawal' | 'correction';
  description?: string;
  payerName?: string; // Snapshot for history
  payerId?: string; // ID of the person who made the deposit
}

export interface PrisonUnit {
  id: string;
  name: string;
  city: string;
  bannedCategories: string[];
  deliveryDays: string[];
}

export interface SystemMessage {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'error' | 'success';
  targetUserId?: string;
  createdAt: string;
  expiresAt: string;
  read?: boolean;
}

export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export interface CustomerAccountTransaction {
  type: 'debt' | 'payment';
  amount: number;
  orderId?: string;
  timestamp: any;
}

export interface CustomerAccount {
  id: string;
  nome: string;
  cpf?: string;
  telefone: string;
  creditLimit: number;
  currentDebt: number;
  weeklySpent: number;
  status: 'active' | 'blocked';
  transactions: CustomerAccountTransaction[];
  createdAt?: string;
}
