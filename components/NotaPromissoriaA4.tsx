import React from 'react';
import { formatarMoeda } from '../utils';
import { toDate } from '../utils/dateUtils';
import { Printer, X, ShieldCheck, FileText, User, DollarSign, Calendar, Hash } from 'lucide-react';

interface NotaPromissoriaA4Props {
  data: {
    devedorNome: string;
    devedorCpf: string;
    valor: number;
    dataEmissao: string;
    dataVencimento: string;
    protocolo: string;
    instituicao: string;
    avalistaNome?: string;
  };
  onClose?: () => void;
  embedded?: boolean;
}

const UNIDADES = ['', 'UM', 'DOIS', 'TRÊS', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE', 'DEZ',
  'ONZE', 'DOZE', 'TREZE', 'QUATORZE', 'QUINZE', 'DEZESSEIS', 'DEZESSETE', 'DEZOITO', 'DEZENOVE'];
const DEZENAS = ['', 'DEZ', 'VINTE', 'TRINTA', 'QUARENTA', 'CINQUENTA', 'SESSENTA', 'SETENTA', 'OITENTA', 'NOVENTA'];
const CENTENAS = ['', 'CEM', 'DUZENTOS', 'TREZENTOS', 'QUATROCENTOS', 'QUINHENTOS', 'SEISCENTOS', 'SETECENTOS', 'OITOCENTOS', 'NOVECENTOS'];

const grupoPorExtenso = (n: number): string => {
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  let texto = '';
  if (centena > 0) {
    texto += centena === 1 && resto === 0 ? 'CEM' : (centena === 1 ? 'CENTO' : CENTENAS[centena]);
  }
  if (resto > 0) {
    if (texto) texto += ' E ';
    if (resto < 20) texto += UNIDADES[resto];
    else {
      const dez = Math.floor(resto / 10);
      const uni = resto % 10;
      texto += DEZENAS[dez];
      if (uni > 0) texto += ` E ${UNIDADES[uni]}`;
    }
  }
  return texto;
};

export const valorPorExtenso = (valor: number): string => {
  if (valor <= 0) return 'ZERO REAIS';
  const parteInteira = Math.floor(valor);
  const parteCentavos = Math.round((valor - parteInteira) * 100);

  let inteiroExtenso = '';
  const milhoes = Math.floor(parteInteira / 1000000);
  const milhares = Math.floor((parteInteira % 1000000) / 1000);
  const unidadesFinais = parteInteira % 1000;

  if (milhoes > 0) {
    inteiroExtenso += milhoes === 1 ? 'UM MILHÃO' : `${grupoPorExtenso(milhoes)} MILHÕES`;
  }
  if (milhares > 0) {
    if (inteiroExtenso) inteiroExtenso += ' E ';
    inteiroExtenso += milhares === 1 ? 'MIL' : `${grupoPorExtenso(milhares)} MIL`;
  }
  if (unidadesFinais > 0) {
    if (inteiroExtenso) inteiroExtenso += ' E ';
    inteiroExtenso += grupoPorExtenso(unidadesFinais);
  }

  let extenso = `${inteiroExtenso || 'ZERO'} ${inteiroExtenso === 'UM' ? 'REAL' : 'REAIS'}`;
  if (parteCentavos > 0) {
    const centavosTexto = parteCentavos === 1 ? 'UM CENTAVO' : `${grupoPorExtenso(parteCentavos)} CENTAVOS`;
    extenso += ` E ${centavosTexto}`;
  }
  return extenso;
};

export const NotaPromissoriaA4: React.FC<NotaPromissoriaA4Props> = ({ data, onClose, embedded }) => {
  if (!data) return <div className="p-20 text-center text-slate-400 font-black uppercase tracking-widest">Erro: Dados da nota não localizados</div>;
  const emitDate = toDate(data.dataEmissao);
  const dueDate = toDate(data.dataVencimento);
  const dateLong = (d: Date | undefined) => d?.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' }) || '';
  const dateShort = (d: Date | undefined) => d?.toLocaleDateString('pt-BR') || '';

  return (
    <div id="print-root" className={`documento-a4 ${embedded
      ? "bg-white overflow-visible"
      : "fixed inset-0 z-[500] bg-slate-100 overflow-y-auto custom-scrollbar animate-fadeIn print:overflow-visible cupom-gerencial-print"}`}>
      {!embedded && (
      <div className="sticky top-0 bg-white/90 backdrop-blur-md border-b-2 border-slate-200 p-5 flex justify-between items-center z-[510] shadow-xl print:hidden">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-lg"><FileText size={24} /></div>
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tighter text-lg leading-none">Nota Promissória</h3>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Documento de Obrigação de Pagamento</p>
          </div>
        </div>
        <div className="flex gap-4">
          <button onClick={() => setTimeout(() => window.print(), 350)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl hover:-translate-y-1 active:scale-95 transition-all">
            <Printer size={20} /> Imprimir
          </button>
          {onClose && (
            <button onClick={onClose} className="bg-white border-2 border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-600 px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 transition-all shadow-md active:scale-95">
              <X size={20} /> Encerrar
            </button>
          )}
        </div>
      </div>
      )}

      <div className="bg-white text-black p-10 w-full max-w-[210mm] min-h-[297mm] mx-auto relative font-sans shadow-2xl print:shadow-none print:w-full print:m-0 print:p-8 box-border my-10 print:my-0">
        <div className="border-[3px] border-slate-900 p-10 h-full flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02] -rotate-12 select-none">
            <ShieldCheck size={500} />
          </div>

          <div className="relative z-10 flex flex-col min-h-full">
            {/* Header */}
            <div className="flex justify-between items-start border-b-[3px] border-slate-900 pb-6 mb-10">
              <div className="flex items-center gap-6">
                <div className="bg-slate-900 p-4 rounded-2xl"><ShieldCheck size={40} className="text-white" /></div>
                <div>
                  <h1 className="text-2xl font-black uppercase tracking-tight leading-none text-slate-900">{data.instituicao}</h1>
                  <p className="text-[10px] font-black text-slate-500 mt-2 uppercase tracking-[0.2em]">Sistema de Gestão Prisional</p>
                </div>
              </div>
              <div className="text-right">
                <div className="inline-block px-4 py-2 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-md mb-2">Documento Exigível</div>
                <h2 className="text-3xl font-black uppercase tracking-tighter text-slate-900">Nota Promissória</h2>
                <p className="text-sm font-bold text-slate-500 mt-1">Nº {(data.protocolo || '').toUpperCase()}</p>
              </div>
            </div>

            {/* Declaration */}
            <div className="mb-12 px-4">
              <p className="text-base text-slate-700 leading-relaxed text-justify font-medium italic">
                Eu, <span className="font-black not-italic text-slate-900 underline decoration-2 decoration-emerald-500 underline-offset-4">{(data.devedorNome || '').toUpperCase()}</span>,
                portador do CPF nº <span className="font-black not-italic text-slate-900">{data.devedorCpf}</span>,
                obrigo-me por esta única via de Nota Promissória a pagar incondicionalmente à ordem de
                <span className="font-black not-italic text-slate-900"> {(data.instituicao || '').toUpperCase()}</span>,
                ou à sua ordem, a quantia de:
              </p>
            </div>

            {/* Value Box */}
            <div className="mb-12">
              <div className="bg-slate-50 border-2 border-slate-900 p-8 rounded-2xl">
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Valor por Extenso</p>
                <p className="text-xl font-bold uppercase text-slate-900 leading-relaxed">{valorPorExtenso(data.valor)}</p>
                <div className="mt-6 pt-6 border-t-2 border-slate-200">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Valor Numérico</p>
                  <p className="text-4xl font-black font-mono tracking-tighter text-slate-900">
                    R$ {formatarMoeda(data.valor)}
                  </p>
                </div>
              </div>
            </div>

            {/* Dates Grid */}
            <div className="grid grid-cols-2 gap-8 mb-12 print-avoid-break">
              <div className="p-6 bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative">
                <Calendar className="absolute right-4 top-4 text-slate-100" size={28} />
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Data de Emissão</p>
                <p className="text-lg font-black text-slate-900 uppercase">{dateLong(emitDate)}</p>
                <p className="text-xs font-bold text-slate-500 mt-1">{dateShort(emitDate)}</p>
              </div>
              <div className="p-6 bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative">
                <DollarSign className="absolute right-4 top-4 text-slate-100" size={28} />
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Data de Vencimento</p>
                <p className="text-lg font-black text-emerald-700 uppercase">{dateLong(dueDate)}</p>
                <p className="text-xs font-bold text-slate-500 mt-1">{dateShort(dueDate)}</p>
              </div>
            </div>

            {/* Participants */}
            <div className="grid grid-cols-2 gap-8 mb-12 print-avoid-break">
              <div className="p-6 bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative">
                <User className="absolute right-4 top-4 text-slate-100" size={28} />
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Devedor</p>
                <p className="text-lg font-black uppercase text-slate-900 leading-tight">{data.devedorNome}</p>
                <p className="text-xs font-bold text-slate-500 mt-1">CPF: {data.devedorCpf}</p>
              </div>
              <div className="p-6 bg-white border-2 border-slate-200 rounded-2xl shadow-sm relative">
                <Hash className="absolute right-4 top-4 text-slate-100" size={28} />
                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Credor / Beneficiário</p>
                <p className="text-lg font-black uppercase text-slate-900 leading-tight">{data.instituicao}</p>
                {data.avalistaNome && (
                  <p className="text-xs font-bold text-slate-500 mt-1">Avalista: {data.avalistaNome}</p>
                )}
              </div>
            </div>

            {/* Legal Text */}
            <div className="mb-12 px-4">
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-[10px] text-slate-600 leading-relaxed font-medium text-justify">
                  O não pagamento no vencimento importará em protesto e inscrição nos órgãos de proteção ao crédito,
                  além de acréscimos legais de mora, juros de 1% ao mês e multa de 2% sobre o valor do título,
                  conforme art. 52 do CDC e legislação civil aplicável. A presente Nota Promissória é emitida
                  em conformidade com o Decreto-Lei nº 2.044/1908 (Lei Cambial) e Lei Uniforme de Genebra (Decreto nº 57.663/66).
                </p>
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1 min-h-[40px]" />

            {/* Signature Section */}
            <div className="mt-auto px-4 print-avoid-break">
              <div className="flex justify-between items-end border-t-2 border-slate-900 pt-10">
                <div className="text-center w-[280px]">
                  <div className="border-b-2 border-slate-300 pb-2 mb-2 h-16 flex items-end justify-center">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-wide">{data.devedorNome}</p>
                  </div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assinatura do Devedor</p>
                </div>
                <div className="text-center w-[280px]">
                  <div className="border-b-2 border-slate-300 pb-2 mb-2 h-16 flex items-end justify-center">
                    <p className="text-sm font-black text-slate-900 uppercase tracking-wide">{data.instituicao}</p>
                  </div>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Assinatura do Credor / Representante</p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-12 pt-6 border-t border-slate-100">
              <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-300">
                <span>Emissão: {dateShort(emitDate)}</span>
                <span className="tracking-[0.3em]">Protocolo: {(data.protocolo || '').toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 10mm; }
          html, body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
            width: auto !important;
            max-width: none !important;
          }
          body * { visibility: hidden !important; }
          #print-root, #print-root * { visibility: visible !important; }
          #print-root.cupom-gerencial-print {
            display: block !important;
            position: relative !important;
            inset: auto !important;
            background: white !important;
            overflow: visible !important;
            width: auto !important;
            max-width: none !important;
            font-family: inherit !important;
            z-index: auto !important;
          }
          .p-10 { padding: 0 !important; }
          .my-10 { margin: 0 !important; }
          .shadow-2xl { box-shadow: none !important; }
          .min-h-\\[297mm\\] { min-height: auto !important; }
          .p-10.p-10 { padding: 24px !important; }
          .overflow-hidden { overflow: visible !important; }
          .print-avoid-break { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};
