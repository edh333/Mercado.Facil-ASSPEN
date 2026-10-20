import React from 'react';
import { useApp } from '../../context/StoreContext';
import { formatarMoeda } from '../../utils';
import { ComprovanteAlvara } from '../../utils/printUtils';
import { ConfirmacaoDestrutiva } from './ConfirmacaoDestrutiva';
import { ComprovanteAlvaraModal } from './ComprovanteAlvaraModal';

/** Alvo de uma devolução por alvará (soltura/liberdade). */
export interface AlvoDevolucao {
  id: string;
  name?: string;
  cpf?: string;
  walletBalance?: number;
  /** Rótulo usado na descrição ("este familiar" por padrão). */
  rotulo?: string;
}

/**
 * DEVOLUÇÃO DE SALDO POR ALVARÁ — fluxo reutilizável.
 *
 * Encapsula o ciclo completo (confirmação → senha mestra → chamada à Function
 * `devolucaoAlvara` → recibo cupom/A4) para que o botão "Devolver saldo" possa
 * ser repetido em qualquer tela sem duplicar lógica. Antes isso ficava copiado
 * na Carteira e na aba de Internos; agora há uma única fonte.
 *
 * Uso:
 *   const { solicitar, modais } = useAlvaraReturn(onRequestMasterPassword);
 *   <button onClick={() => solicitar({ id: u.id, name: u.name, walletBalance: u.walletBalance })}>Devolver saldo</button>
 *   {modais}
 */
export function useAlvaraReturn(
  onRequestMasterPassword?: (callback: (senhaMestra: string) => void) => void
) {
  const { devolucaoAlvara, settings } = useApp();
  const [alvo, setAlvo] = React.useState<AlvoDevolucao | null>(null);
  const [processando, setProcessando] = React.useState(false);
  const [comprovantes, setComprovantes] = React.useState<ComprovanteAlvara[] | null>(null);
  // Token de idempotência por devolução (novo a cada alvo; reusado em retry).
  const tokenRef = React.useRef<string>('');

  const solicitar = React.useCallback((t: AlvoDevolucao) => {
    if (!t || Number(t.walletBalance || 0) <= 0) return;
    tokenRef.current = crypto.randomUUID();
    setAlvo(t);
  }, []);

  const confirmar = async (senhaMestra: string) => {
    const t = alvo;
    if (!t) return;
    if (Number(t.walletBalance || 0) <= 0) { setAlvo(null); return; }
    setProcessando(true);
    try {
      const token = tokenRef.current || (tokenRef.current = crypto.randomUUID());
      const data = await devolucaoAlvara(
        t.id,
        `Devolução por alvará — ${t.name || t.cpf || '—'}`,
        senhaMestra,
        token
      );
      const comprovante = data?.comprovante;
      if (comprovante) setComprovantes([comprovante as ComprovanteAlvara]);
      tokenRef.current = '';
    } catch {
      // o contexto já exibiu a notificação de erro desta chamada
    } finally {
      setProcessando(false);
      setAlvo(null);
    }
  };

  const modais = (
    <>
      <ConfirmacaoDestrutiva
        isOpen={alvo !== null}
        titulo="Devolução por Alvará"
        descricao={`Devolver via PIX R$ ${formatarMoeda(Number(alvo?.walletBalance || 0))} de ${alvo?.name || alvo?.cpf || alvo?.rotulo || 'este familiar'} por alvará (soltura/liberdade)? O saldo será zerado e a senha mestra será exigida. Em seguida você escolhe imprimir o recibo em cupom (80mm) ou A4.`}
        semDigitar
        processando={processando}
        onConfirm={() => {
          if (!alvo) return;
          if (onRequestMasterPassword) onRequestMasterPassword((senha) => confirmar(senha));
          else confirmar('');
        }}
        onClose={() => { if (!processando) setAlvo(null); }}
      />
      <ComprovanteAlvaraModal
        comprovantes={comprovantes}
        settings={settings}
        onClose={() => setComprovantes(null)}
      />
    </>
  );

  return { solicitar, modais };
}
