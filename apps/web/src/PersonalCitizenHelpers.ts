/**
 * Nex Personal trusted citizen helpers.
 * Browser-only arithmetic and educational guides: no identity numbers, CPF,
 * contract bodies, debt amounts, municipality, or personal details sent to API.
 * No third-party calls, automatic searches, advertising or persisted drafts.
 */
export type CitizenTask='iptu'|'identity'|'construction'|'vehicle';
export type LegalTopic='contracts'|'debt'|'condo'|'labor';
export type CitizenGuide={title:string;steps:string[];officialLinks:Array<{title:string;url:string}>;caution:string};
export function citizenGuide(task:CitizenTask,city:string,state:string):CitizenGuide{
 const place=city.trim()&&state.trim()?city.trim()+' / '+state.trim():city.trim()||'sua cidade';
 switch(task){
  case 'iptu': return {
   title:'2ª via do IPTU em '+place,
   steps:['Procure o portal oficial da Prefeitura de '+place+' e a seção Fazenda / Tributos / IPTU.',
    'Acesse a opção 2ª via do carnê, guia ou parcela do IPTU, conforme disponibilizada pelo município.',
    'Verifique se o serviço pede inscrição imobiliária, cadastro do imóvel ou dados do contribuinte. Preencha somente dentro do portal oficial.',
    'Confira exercício, parcela, vencimento, beneficiário e código de barras antes de pagar. Se não houver emissão eletrônica, solicite orientação à Secretaria Municipal de Finanças.'],
   officialLinks:[],caution:'O endereço do portal, os documentos, o prazo e a forma de emissão são municipais. Não fornecemos nem emitimos boleto ou guia.'
  };
  case 'identity':return {
   title:'Agendar a nova Carteira de Identidade Nacional (CIN)',
   steps:['Abra a relação oficial de órgãos emissores pelo gov.br e escolha seu estado.',
    'Siga o agendamento no órgão estadual responsável. Datas e disponibilidade dependem do estado ou unidade.',
    'Confira os documentos pedidos, especialmente certidão de nascimento ou casamento, e outras exigências da unidade.',
    'Compareça na data indicada e mantenha o protocolo. A primeira emissão da CIN é gratuita; verifique regras para segunda via.'],
   officialLinks:[{title:'Onde emitir e agendar sua CIN — gov.br',url:'https://www.gov.br/governodigital/pt-br/identidade/cin/duvidas-frequentes-sobre-a-cin-campanha'}],
   caution:'O Nex Personal não agenda a CIN, não solicita CPF e nunca deve pedir sua senha gov.br.'};
  case 'construction':return {
   title:'Como solicitar alvará de construção em '+place,
   steps:['Consulte a Prefeitura de '+place+' na área Urbanismo, Obras ou Licenciamento de Construções.',
    'Peça informações sobre zoneamento, uso do solo, coeficiente de aproveitamento e consulta prévia do terreno.',
    'Verifique exigência de projeto técnico, profissional habilitado e registro de responsabilidade (ART ou RRT), conforme o caso.',
    'Confira lista de documentos, taxas oficiais, protocolos e eventual licença ambiental ou exigências do condomínio.',
    'Faça o pedido pelo canal municipal indicado e acompanhe o protocolo antes de começar a obra.'],
   officialLinks:[],caution:'Regras, taxas e aprovações variam por município, tipo de imóvel e intervenção. Este roteiro não autoriza iniciar obras nem substitui profissional técnico.'};
  case 'vehicle':return {
   title:'Serviços do Detran do seu estado',
   steps:['Confirme o endereço do Detran do seu estado usando o portal governamental oficial.',
    'Escolha o serviço específico: CNH, licenciamento, transferência, multa ou documentação.',
    'Verifique requisitos, taxas, canais de agendamento e situação do veículo pelo portal oficial, não por links de terceiros.',
    'Não informe CPF, RENAVAM, senha gov.br, documento ou pagamento em páginas enviadas por desconhecidos.'],
   officialLinks:[],caution:'Os procedimentos são estaduais; não há consulta nem agendamento automático nesta homologação.'};
 }
}
export function parseMoney(text:string){
 const normalized=text.trim().replace(/R\$/gi,'').replace(/\s/g,'');
 const value=normalized.includes(',')?normalized.replace(/\./g,'').replace(',','.'):normalized;
 if(!/^\d{1,11}(?:\.\d{1,2})?$/.test(value))throw new Error('Valor inválido. Use o formato 1.250,00.');
 const [w,c='']=value.split('.'),minor=BigInt(w)*100n+BigInt((c+'00').slice(0,2));
 if(minor<=0n)throw new Error('Informe valor maior que zero.');
 return minor;
}
export function brl(minor:bigint){
 const n=minor<0n?-minor:minor;
 return (minor<0n?'-':'')+'R$ '+(n/100n).toLocaleString('pt-BR')+','+String(n%100n).padStart(2,'0');
}
export function debtScenario(input:{claimedMinor:bigint;upfrontMinor:bigint;installments:number;installmentMinor:bigint;monthlyFreeMinor?:bigint}){
 if(input.claimedMinor<=0n||input.upfrontMinor<0n||input.installmentMinor<0n||input.installments<0||input.installments>120||(!input.installments&&input.installmentMinor>0n))
  throw new Error('Confira os valores e a quantidade de parcelas.');
 if(input.claimedMinor>100000000000000n||input.upfrontMinor>100000000000000n||input.installmentMinor>100000000000000n)
  throw new Error('Valor fora do limite do simulador.');
 const total=input.upfrontMinor+input.installmentMinor*BigInt(input.installments);
 if(total===0n)throw new Error('A proposta não pode ter custo zero neste simulador.');
 const delta=input.claimedMinor-total;
 const monthlyAffordable=input.monthlyFreeMinor===undefined?null:input.installmentMinor<=input.monthlyFreeMinor;
 return {totalMinor:total,differenceMinor:delta,cheaperNominal:delta>0n,monthlyAffordable,
  caveat:'Comparação nominal baseada apenas nos números informados. Não valida a dívida, encargos, CET, acordo, suspensão de cobrança nem efeitos sobre restrições cadastrais.'};
}
export function debtNegotiationDraft(creditor:string,claimedMinor:bigint,proposalTotalMinor:bigint){
 const who=creditor.trim().slice(0,100);
 if(!who)throw new Error('Informe quem está cobrando.');
 return 'Assunto: Solicitação de proposta formal de renegociação\n\n'+
  'Prezados responsáveis pelo atendimento de '+who+',\n\n'+
  'Estou revisando uma cobrança apresentada no valor de '+brl(claimedMinor)+'. Considero uma proposta cujo valor nominal total seria '+brl(proposalTotalMinor)+'.\n\n'+
  'Solicito, antes de qualquer aceite:\n'+
  '1. Identificação do credor atual, contrato de origem e memória de cálculo do valor cobrado;\n'+
  '2. Discriminação do principal, juros, multas, encargos e eventual CET;\n'+
  '3. Proposta oficial com entrada, parcelas, datas, custo total e consequências de atraso;\n'+
  '4. Condições de quitação, emissão do termo de acordo, comprovantes e atualização de cadastros quando aplicável;\n'+
  '5. Canal oficial para conferência da autenticidade e do beneficiário do pagamento.\n\n'+
  'Este contato não constitui reconhecimento da exatidão da cobrança nem aceitação de qualquer proposta.\n'+
  'Aguardo os documentos para avaliação.\n\nObrigado.';
}
export function legalChecklist(topic:LegalTopic,body:string){
 const checks:Record<LegalTopic,Array<[string,RegExp]>>={
  contracts:[['Partes e objeto',/parte|contratante|objeto/],['Valores e reajustes',/valor|pre[cç]o|reajuste/],['Rescisão e multas',/rescis[aã]o|multa|cancelamento/],['Prazos',/prazo|vig[eê]ncia|data/]],
  debt:[['Origem da cobrança',/contrato|origem|credor/],['Valor total e encargos',/valor|juros|encargo|cet/],['Quitação e baixa',/quita[cç][aã]o|baixa|extin[cç][aã]o/],['Atraso e penalidades',/atraso|multa|vencimento/]],
  condo:[['Convenção e regimento',/conven[cç][aã]o|regimento/],['Ata e decisão assemblear',/ata|assembleia|qu[oó]rum/],['Multas e notificação',/multa|notifica[cç][aã]o/],['Competência e procedimento',/s[ií]ndico|conselho|prazo/]],
  labor:[['Vínculo e modalidade',/empregado|empregador|contrato|v[ií]nculo/],['Jornada e remuneração',/jornada|sal[aá]rio|hora/],['Férias e verbas',/f[eé]rias|fgts|d[eé]cimo|rescis[aã]o/],['Datas e documentos',/data|admiss[aã]o|aviso|prazo/]]
 };
 const text=body.slice(0,4000).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const missing=checks[topic].filter(([,test])=>!test.test(text)).map(([name])=>name);
 return {reviewed:body.trim().length>0,missing:body.trim()?missing:checks[topic].map(x=>x[0]),
  disclaimer:'Checklist automatizado por palavras-chave, sem análise jurídica da validade, prescrição, abusividade ou direitos no caso concreto. Consulte advogado, Defensoria ou Procon conforme necessidade.'};
}
