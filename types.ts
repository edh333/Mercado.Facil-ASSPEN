
export enum UserRole {
  ADMIN = 'ADMIN',
  FAMILY = 'FAMILY'
}

export enum OrderStatus {
  PENDING = 'Pendente',
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
  SOFT_PASTEL = 'soft_pastel'
}

export interface Message {
  id: string;
  userId: string;
  text: string;
  date: string;
  read: boolean;
  fromAdmin: boolean;
}

export interface Product {
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
  password?: string;
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
  inmateLocation?: InmateLocation;
  deliveryLocation?: InmateLocation; // Alias
  printCount?: number;
  inmateName?: string; // Snapshot
  inmateCpf?: string; // Snapshot
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
  status?: 'PENDING' | 'PAID';
  category?: string;
  type?: 'SUPPLIER' | 'OPERATIONAL';
  observation?: string; // Novo campo para detalhes
}

export interface AppConfig {
  appName: string;
  institutionName: string;
  cnpj: string;
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  footerText: string;
  contactPhone: string;
  contactEmail: string;
  contactAddress: string;
  adminPassword?: string;
  pixKeys: string[];
  loginImageUrl?: string;
  loginTitle?: string;
  systemName?: string;
  theme: ThemeOption;
  customWelcomeMessage?: string;
  customReceiptText?: string; // Campo novo para texto do cupom
  customReceiptTitle?: string; // Novo: Título do Cupom (ASSPEN - Gestão)
  customReceiptSubtitle?: string; // Novo: Subtítulo (CDP Peixoto...)
  customReceiptDocName?: string; // Novo: Nome do Doc (CUPOM DE ENTREGA)
}

export interface AuditLog {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  details?: string;
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
  type: 'success' | 'error' | 'info';
}