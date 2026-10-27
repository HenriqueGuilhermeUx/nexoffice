/**
 * Nexa PF Maya: deterministic, local-only navigation coordinator.
 * Never sends free text to Wallet, Agentics, an external model or a backend.
 * This is NOT an LLM integration and does not authorize financial actions.
 */
export type MayaIntent='expenses'|'financial'|'planning'|'investments'|'shopping'|'simulations'|'payments'|'contracts'|'public_services'|'debt_review'|'legal_support'|'crypto'|'privacy';
export type MayaDestination=
 |{section:'agents';agent:Exclude<MayaIntent,'crypto'|'privacy'>}
 |{section:'crypto'|'privacy';agent:null};

export type MayaRoute={
 label:string;description:string;destination:MayaDestination;
 capability:'personal.local_navigation';requiresExternalConsent:false;
 sharesWalletSession:false;mayExecuteFinancialOperation:false;
};

const ROUTES:Readonly<Record<MayaIntent,MayaRoute>>={
 expenses:{label:'Mila · Gastos',description:'Verificar gastos e encontrar oportunidades de economia.',destination:{section:'agents',agent:'expenses'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 financial:{label:'Nina · Finanças',description:'Organizar o panorama das suas contas e despesas.',destination:{section:'agents',agent:'financial'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 planning:{label:'Liz · Metas',description:'Planejar objetivos e prioridades financeiras.',destination:{section:'agents',agent:'planning'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 investments:{label:'Léo · Investimentos',description:'Abrir análise informativa de investimentos.',destination:{section:'agents',agent:'investments'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 shopping:{label:'Bia · Compras',description:'Avaliar o impacto de uma compra.',destination:{section:'agents',agent:'shopping'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 simulations:{label:'Ben · Simulações',description:'Comparar cenários e parcelas antes de decidir.',destination:{section:'agents',agent:'simulations'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 payments:{label:'Ravi · Contas a vencer',description:'Organizar pagamentos previstos sem executar Pix.',destination:{section:'agents',agent:'payments'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 contracts:{label:'Mel · Contratos',description:'Revisar pontos de atenção de documentos.',destination:{section:'agents',agent:'contracts'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 public_services:{label:'Theo · Serviços públicos',description:'Orientar serviços e documentação pública.',destination:{section:'agents',agent:'public_services'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 debt_review:{label:'Joca · Dívidas',description:'Avaliar propostas de renegociação.',destination:{section:'agents',agent:'debt_review'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 legal_support:{label:'Bella · Direitos',description:'Entender dúvidas sobre contratos e direitos.',destination:{section:'agents',agent:'legal_support'},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 crypto:{label:'Assistente Nexa · Wallet',description:'Abrir a área Cripto & Wallet, onde o Assistente da Wallet será a referência. Não transmite o pedido nem sua sessão.',destination:{section:'crypto',agent:null},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false},
 privacy:{label:'Privacidade Nexa',description:'Consultar como seus dados são utilizados.',destination:{section:'privacy',agent:null},capability:'personal.local_navigation',requiresExternalConsent:false,sharesWalletSession:false,mayExecuteFinancialOperation:false}
};

const WORDS:ReadonlyArray<readonly [MayaIntent,RegExp]>=[
 ['privacy',/\b(privacidade|lgpd|consentimento|excluir (meus )?dados|apagar (meus )?dados)\b/i],
 ['crypto',/\b(cripto|usdc|bitcoin|btc|pix|metamask|wallet|carteira digital|transferir|sacar|enviar dinheiro|trocar cripto|conectar carteira)\b/i],
 ['debt_review',/\b(d[ií]vid|renegoci|acordo|parcelamento de d[ií]vida|inadimpl|cobran[cç]a)\b/i],
 ['public_services',/\b(detran|iptu|rg|cin|inss|licen[cç]a|[óo]rg[aã]o p[úu]blico)\b/i],
 ['legal_support',/\b(direit|justi[cç]a|processo judicial|advogad|lei|procon)\b/i],
 ['contracts',/\b(contrato|cl[áa]usula|assinatura eletr[oô]nica|documento)\b/i],
 ['investments',/\b(invest|rendiment|a[cç][aã]o|cdb|tesouro|bolsa|fiis?|fundo de investimento)\b/i],
 ['shopping',/\b(compr|parcelas? de compra|celular|pre[cç]o|cart[aã]o de cr[eé]dito)\b/i],
 ['simulations',/\b(simul|cen[áa]rio|proje[cç][aã]o|juros compostos)\b/i],
 ['payments',/\b(contas? a vencer|boleto|venciment|pagar conta)\b/i],
 ['planning',/\b(meta|objetivo|planej|guardar dinheiro|poup|viagem|economizar para)\b/i],
 ['expenses',/\b(gasto|despesa|economiz|or[cç]amento|cortar custo)\b/i],
 ['financial',/\b(financ|saldo|patrim[oô]nio|dinheiro|extrato|renda)\b/i]
];

export const MAYA_QUICK_INTENTS:ReadonlyArray<MayaIntent>=['expenses','planning','investments','debt_review','contracts','crypto'];
export function mayaRouteFor(intent:MayaIntent):MayaRoute{return ROUTES[intent];}
export function routeMayaIntent(raw:string):MayaRoute|null{
 if(typeof raw!=='string'||raw.length>240)return null;
 const query=raw.trim().normalize('NFKC');
 if(query.length<3)return null;
 const item=WORDS.find(([,rule])=>rule.test(query));
 return ROUTES[item?.[0]||'planning'];
}
