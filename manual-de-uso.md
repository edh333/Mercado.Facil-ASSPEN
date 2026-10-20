# Manual de Uso - Mercado Fácil (ASSPEN/MT)

Este guia prático descreve as principais funcionalidades do sistema profissionalizado para a ASSPEN/MT.

## 1. Acesso Administrativo e Mobilidade
- **Versão Online:** Acesse via link oficial (`web.app`).
- **Versão Local (Modo Pendrive):** Use o arquivo executável na pasta `dist-electron`.
- **Login:** Use o e-mail cadastrado ou o CPF e a senha definida.

### 1.1 Navegação Rápida (Atalhos)
- **Central de Atalhos (Ctrl+K):** abre um painel de busca que encontra qualquer função, produto, relatório ou conexão. Digite para filtrar e tecle **Enter** para abrir o primeiro resultado. Também disponível pelo ícone de teclado no topo da tela.
- **Teclas de função (F1–F12):** navegação direta entre as telas (F2 = Venda Direta/PDV, F4 = Relatórios, F5 = Produtos, F11 = Caixa, etc.).
- **Tecla `?`:** mostra a lista completa de atalhos de teclado (com opção de imprimir).

## 2. PDV / Venda Direta (NOVO) 🚀
Permite realizar vendas presenciais para internos que possuam crédito ou pagamento imediato.
1. Clique no botão **"Venda Direta (PDV)"** no menu lateral.
2. Busque o cliente (por nome ou CPF do interno/familiar).
3. Selecione os produtos e quantidades.
4. Escolha a forma de pagamento (**Saldo da Carteira**, **PIX**, **Dinheiro**, **Fiado** ou **Fiado 30 dias**). Vendas fiadas e descontos acima de 20% exigem autorização (senha mestra; acima de 20% também a senha do admin logado).
5. Finalize para gerar o cupom de entrega.

## 3. Gestão de Catálogo e Impressão
- **Adicionar/Editar:** Na aba **Catálogo**, você pode gerenciar os produtos, preços e estoque.
- **Importação XML:** Importe notas fiscais (.xml) para atualizar estoque e preços automaticamente.
- **Imprimir Catálogo:** Clique em **"Imprimir Catálogo"** para gerar uma lista de preços oficial da ASSPEN para enviar às unidades prisionais.

## 4. Gestão de Pedidos
- **Busca Avançada:** Pesquise por Nome, CPF ou Data (formato AAAA-MM-DD).
- **Status:** Altere o status dos pedidos para controlar a logística (Pendente, Preparando, Entregue).
- **Estorno:** Administradores podem estornar pedidos, o que devolve o produto ao estoque e o dinheiro à carteira do interno automaticamente.

## 5. Configurações e Segurança
- **Senha Mestra:** Ações críticas (Reset, Limpeza) exigem a senha mestra definida.
- **Múltiplos Admins:** O Administrador Master pode criar outros usuários com acesso ao painel.
- **Chaves PIX:** Configure múltiplas chaves PIX para exibição no sistema.
- **Temas:** Escolha entre diferentes identidades visuais (incluindo o oficial da Polícia Penal MT).

## 6. Portabilidade e Operação Offline (Super Profissional) 🛠️
O sistema foi projetado para ser resiliente e funcionar mesmo em locais sem qualquer acesso à rede.

### 6.1 Como usar via Pendrive (Executável Único)
1.  **Localize o Executável:** Vá na pasta `dist-electron` e procure pelo arquivo `Mercado Facil ASSPEN.exe` (ou similar com ícone do sistema).
2.  **Copie para o Pendrive:** Você pode levar apenas este arquivo (versão portátil) para qualquer computador Windows.
3.  **Funcionamento Sem Internet:** Graças à tecnologia de **Cache Inteligente (IndexedDB)**, você pode realizar vendas, cadastrar internos e lançar despesas mesmo se o cabo de rede estiver desconectado.
4.  **Sincronização Automática:** Assim que o computador detectar internet, o sistema "acorda" e envia todos os dados salvos localmente para as nuvens do Google automaticamente, sem você precisar fazer nada.
5.  **Modo de Emergência Offline:** Se a internet cair e o login não conseguir abrir, a tela de login mostra a caixa "Sem internet — modo de emergência". Digite a senha de login do administrador e clique em Desbloquear para operar em emergência (faixa vermelha no topo). Funciona na máquina em que o admin já fez login com internet pelo menos uma vez; a sessão expira sozinha (3h) e as vendas vão para a fila local. Ao reconectar, clique em "Sair" no aviso e entre com o login normal para sincronizar.

### 6.2 Capacidade Técnica e Escalabilidade
Este sistema utiliza a infraestrutura **Google Cloud (Firestore)**, o que garante:
*   **Clientes:** Suporte para até **1.000.000** de conexões simultâneas.
*   **Registros:** Capacidade para **Bilhões** de documentos (Produtos, Vendas, Internos).
*   **Velocidade:** Processamento de até **10.000** gravações por segundo.
*   **Segurança:** Criptografia de ponta a ponta e backups redundantes automáticos no Datacenter.
*   **Estabilidade:** O sistema utiliza "Code Splitting", carregando apenas o necessário para economizar memória do computador.

## 7. Backup e Manutenção
- **Backup Semanal:** Na aba **Configurações**, use o botão **"Backup Completo"** regularmente.
- **Limpeza:** A função "Limpar Dados Antigos" ajuda a manter o sistema rápido após meses de uso intenso.

---
*Desenvolvido para ASSPEN/MT - Profissionalismo e Qualidade na Gestão.*
