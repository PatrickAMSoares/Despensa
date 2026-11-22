// Leitura da NFC-e (nota fiscal do consumidor) a partir do QR Code.
// O QR Code traz um link da Secretaria da Fazenda. Como o navegador não pode ler páginas de outro site
// (bloqueio CORS), a página é buscada por uma pequena função "proxy" (netlify/functions/nfce.mjs).

import { norm } from './store.js';

/* ---------- link do QR Code ---------- */
export function lerLinkNota(texto) {
  const t = String(texto || '').trim();
  let url;
  try { url = new URL(t); } catch { return null; }
  if (!/^https?:$/.test(url.protocol) || !url.hostname.endsWith('.gov.br')) return null;
  const m = decodeURIComponent(url.search + url.hash).match(/(\d{44})/);
  if (!m) return null;
  const chave = m[1];
  return { url: url.href, chave, uf: chave.slice(0, 2), cnpj: chave.slice(6, 20), modelo: chave.slice(20, 22) };
}

/* ---------- busca da página pela função proxy ---------- */
export async function buscarPaginaNota(proxy, link) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(`${proxy}?url=${encodeURIComponent(link)}`, { signal: ctrl.signal });
    const html = await r.text();
    if (!r.ok) throw Object.assign(new Error(`A Fazenda respondeu com erro (${r.status}).`), { amigavel: true });
    return html;
  } catch (e) {
    if (e.amigavel) throw e;
    throw Object.assign(new Error(e.name === 'AbortError' ? 'A consulta demorou demais. Tente de novo.' : 'Não consegui consultar a nota. Verifique a internet.'), { amigavel: true });
  } finally { clearTimeout(t); }
}

/* ---------- interpretação da página ---------- */
const num = (s) => {
  if (s == null) return NaN;
  const t = String(s).replace(/[^\d,.-]/g, '');
  if (!t) return NaN;
  // formato brasileiro: 1.234,56
  return Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
};
const limpa = (s) => String(s || '').replace(/\s+/g, ' ').trim();

export function interpretarNota(html, info) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script, style').forEach((el) => el.remove());
  let itens = itensPadraoNacional(doc);
  if (!itens.length) itens = itensPorTexto(doc);
  if (!itens.length) itens = itensPorTabela(doc);

  const texto = limpa(doc.body ? doc.body.textContent : '');
  const total = primeiroNumero(texto, [/valor\s+a\s+pagar\s*r\$\s*:?\s*([\d.,]+)/i, /valor\s+total\s*(?:da\s+nota)?\s*r\$\s*:?\s*([\d.,]+)/i, /total\s*r\$\s*:?\s*([\d.,]+)/i]);
  const mData = texto.match(/emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/i)
    || texto.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  let data = null;
  if (mData) {
    const [, d, mo, a, h = '12', mi = '00', se = '00'] = mData;
    data = new Date(`${a}-${mo}-${d}T${h}:${mi}:${se}-03:00`).toISOString();
  }
  const nomeLoja = limpa(
    doc.querySelector('#u20, .txtTopo, #conteudo .txtTopo')?.textContent
    || doc.querySelector('h1, h2, h3')?.textContent || '',
  ).slice(0, 80);

  const somaItens = itens.reduce((s, it) => s + (it.total || 0), 0);
  return {
    id: info.chave,
    url: info.url,
    date: data || new Date().toISOString(),
    dataEncontrada: !!data,
    store: { name: nomeLoja || 'Loja', cnpj: info.cnpj },
    total: Number.isFinite(total) ? total : Math.round(somaItens * 100) / 100,
    totalEncontrado: Number.isFinite(total),
    items: itens,
  };
}

function primeiroNumero(texto, regexes) {
  for (const r of regexes) { const m = texto.match(r); if (m) { const n = num(m[1]); if (Number.isFinite(n)) return n; } }
  return NaN;
}

// Layout usado pela maioria das Fazendas (tabela "tabResult")
function itensPadraoNacional(doc) {
  const linhas = doc.querySelectorAll('#tabResult tr, table.tabResult tr');
  const itens = [];
  linhas.forEach((tr) => {
    const desc = limpa(tr.querySelector('.txtTit, .txtTit2')?.textContent);
    if (!desc) return;
    const cod = limpa(tr.querySelector('.RCod')?.textContent).replace(/.*c[óo]digo\s*:?\s*/i, '').replace(/[()]/g, '').trim();
    const qty = num(limpa(tr.querySelector('.Rqtd')?.textContent).replace(/qtde\.?\s*:?/i, ''));
    const unit = limpa(tr.querySelector('.RUN')?.textContent).replace(/^un\s*:?\s*/i, '');
    const unitPrice = num(limpa(tr.querySelector('.RvlUnit')?.textContent).replace(/vl\.?\s*unit\.?\s*:?/i, ''));
    const total = num(tr.querySelector('.valor')?.textContent);
    itens.push(item({ desc, code: cod, qty, unit, unitPrice, total }));
  });
  return itens.filter(Boolean);
}

// Plano B: procura o padrão "DESCRIÇÃO (Código: X) Qtde.: 1 UN: UN Vl. Unit.: 3,99 Vl. Total 3,99" no texto
function itensPorTexto(doc) {
  // procura os elementos mais internos que contêm o padrão (evita juntar o cabeçalho da página à descrição)
  const teste = /C[óo]digo\s*:?[^)]*\)\s*Qtde/i;
  const blocos = [...doc.querySelectorAll('body *')].filter((el) => teste.test(el.textContent) && ![...el.children].some((c) => teste.test(c.textContent)));
  return blocos.flatMap((el) => itensDoTexto(el.textContent));
}

function itensDoTexto(texto) {
  const t = limpa(texto);
  const re = /([^()]{2,120}?)\s*\(\s*C[óo]digo\s*:?\s*([\w.-]+)\s*\)\s*Qtde\.?\s*:?\s*([\d.,]+)\s*UN\s*:?\s*([A-Za-z]{1,6})\s*Vl\.?\s*Unit\.?\s*:?\s*([\d.,]+)\s*(?:Vl\.?\s*Total)?\s*:?\s*([\d.,]+)/gi;
  const itens = [];
  let m;
  while ((m = re.exec(t))) {
    itens.push(item({ desc: m[1].replace(/^.*?(?:Vl\.?\s*Total\s*[\d.,]+\s*)/i, ''), code: m[2], qty: num(m[3]), unit: m[4], unitPrice: num(m[5]), total: num(m[6]) }));
  }
  return itens.filter(Boolean);
}

// Plano C: tabela genérica com colunas Código / Descrição / Qtde / Un / Valor unit / Valor total
function itensPorTabela(doc) {
  for (const tab of doc.querySelectorAll('table')) {
    const cab = [...tab.querySelectorAll('tr')].find((tr) => /descri/i.test(tr.textContent) && /(qtd|quant)/i.test(tr.textContent));
    if (!cab) continue;
    const nomes = [...cab.children].map((c) => norm(c.textContent));
    const col = (re) => nomes.findIndex((n) => re.test(n));
    const iDesc = col(/descri/), iQtd = col(/qtd|quant/), iUn = col(/^un/), iCod = col(/codigo|cod\b/);
    const iUnit = col(/unit/), iTot = nomes.length - 1 - [...nomes].reverse().findIndex((n) => /total|valor/.test(n));
    const itens = [];
    let depois = false;
    for (const tr of tab.querySelectorAll('tr')) {
      if (tr === cab) { depois = true; continue; }
      if (!depois) continue;
      const c = [...tr.children].map((x) => limpa(x.textContent));
      if (c.length < nomes.length - 1 || !c[iDesc]) continue;
      itens.push(item({ desc: c[iDesc], code: iCod >= 0 ? c[iCod] : '', qty: num(c[iQtd]), unit: iUn >= 0 ? c[iUn] : 'UN', unitPrice: iUnit >= 0 ? num(c[iUnit]) : NaN, total: num(c[iTot]) }));
    }
    if (itens.filter(Boolean).length) return itens.filter(Boolean);
  }
  return [];
}

function item({ desc, code, qty, unit, unitPrice, total }) {
  desc = limpa(desc);
  if (!desc || desc.length < 2) return null;
  if (!Number.isFinite(qty) || qty <= 0) qty = 1;
  if (!Number.isFinite(total) && Number.isFinite(unitPrice)) total = unitPrice * qty;
  if (!Number.isFinite(unitPrice) && Number.isFinite(total)) unitPrice = total / qty;
  if (!Number.isFinite(total)) return null;
  return {
    desc, code: limpa(code), qty, unit: limpa(unit || 'UN').toUpperCase(),
    unitPrice: Math.round(unitPrice * 100) / 100, total: Math.round(total * 100) / 100,
    categoryGuess: categoriaPelaDescricao(desc),
  };
}

/* ---------- vínculo item da nota → produto da despensa ---------- */
export function eanValido(code) {
  const d = String(code || '');
  if (!/^\d{8}$|^\d{12,14}$/.test(d)) return false;
  const dig = d.split('').map(Number);
  const dv = dig.pop();
  const soma = dig.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === dv;
}

// Abreviações comuns em notas de supermercado
const ABREV = {
  bisc: 'biscoito', rech: 'recheado', refrig: 'refrigerante', refri: 'refrigerante', deterg: 'detergente',
  sab: 'sabao', amac: 'amaciante', cr: 'creme', dent: 'dental', pap: 'papel', hig: 'higienico', choc: 'chocolate',
  leit: 'leite', integ: 'integral', desn: 'desnatado', cafe: 'cafe', acuc: 'acucar', ref: 'refinado', marg: 'margarina',
  queij: 'queijo', pres: 'presunto', mort: 'mortadela', ling: 'linguica', frang: 'frango', cong: 'congelado',
  macarr: 'macarrao', mac: 'macarrao', esp: 'espaguete', azeit: 'azeite', ext: 'extra', vg: 'virgem', trad: 'tradicional',
  cx: 'caixa', pct: 'pacote', lt: 'lata', gf: 'garrafa', shamp: 'shampoo', cond: 'condicionador', desod: 'desodorante',
  sabon: 'sabonete', agua: 'agua', min: 'mineral', s: 'sem', c: 'com', gas: 'gas', suc: 'suco', iog: 'iogurte',
};
const PARADAS = new Set(['de', 'da', 'do', 'com', 'sem', 'e', 'un', 'und', 'tp', 'tipo', 'c', 's', 'x']);

function palavras(texto) {
  return norm(texto).replace(/(\d)\s*(kg|g|gr|ml|l|lt|un)\b/g, '$1$2').split(/[^a-z0-9]+/)
    .filter(Boolean).map((w) => ABREV[w] || w).filter((w) => !PARADAS.has(w) && w.length > 1);
}

function semelhanca(a, b) {
  const A = palavras(a), B = palavras(b);
  if (!A.length || !B.length) return 0;
  let iguais = 0;
  for (const w of A) if (B.some((x) => x === w || (w.length >= 4 && x.length >= 4 && (x.startsWith(w) || w.startsWith(x))))) iguais++;
  return iguais / Math.max(A.length, B.length);
}

// Para cada item: { status: 'certo'|'sugestao'|'novo', productId }
export function vincularItens(itens, produtos) {
  return itens.map((it) => {
    if (eanValido(it.code)) {
      const p = produtos.find((x) => x.barcode === it.code || x.barcode === it.code.replace(/^0+/, ''));
      if (p) return { status: 'certo', productId: p.id };
    }
    const d = norm(it.desc);
    const porApelido = produtos.find((p) => (p.notaAliases || []).includes(d));
    if (porApelido) return { status: 'certo', productId: porApelido.id };
    let melhor = null, nota = 0;
    for (const p of produtos) {
      const s = semelhanca(it.desc, p.name);
      if (s > nota) { nota = s; melhor = p; }
    }
    if (melhor && nota >= 0.34) return { status: 'sugestao', productId: melhor.id };
    return { status: 'novo', productId: null };
  });
}

// "ARROZ T1 CAMIL 5KG" → "Arroz T1 Camil 5kg"
export function nomeBonito(desc) {
  return limpa(desc).toLowerCase()
    .replace(/(\d)\s*(kg|g|gr|ml|l|lt)\b/g, '$1 $2')
    .split(' ')
    .map((w) => (/^\d/.test(w) || /^(kg|g|gr|ml|l|lt|un)$/.test(w) ? w : (ABREV[norm(w)] && ABREV[norm(w)] !== norm(w) && w.length >= 3 ? ABREV[norm(w)] : w)))
    .map((w, i) => (/^\d/.test(w) || /^(kg|g|gr|ml|l|lt|un|de|da|do|com|sem)$/.test(w) && i > 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

export function categoriaPelaDescricao(desc) {
  const t = ` ${palavras(desc).join(' ')} `;
  const tem = (...ws) => ws.some((w) => t.includes(` ${w}`));
  if (tem('congelado', 'sorvete', 'lasanha', 'pizza', 'nuggets', 'hamburguer', 'empanado')) return 'Congelados';
  if (tem('detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanit', 'sanitaria', 'limpador', 'esponja', 'alvejante', 'multiuso', 'saco lixo', 'lixo', 'veja', 'lustra')) return 'Limpeza';
  if (tem('shampoo', 'condicionador', 'sabonete', 'creme dental', 'dental', 'escova', 'desodorante', 'papel higienico', 'higienico', 'absorvente', 'fralda', 'fio dental', 'barbear', 'hidratante')) return 'Higiene';
  if (tem('refrigerante', 'suco', 'cerveja', 'agua mineral', 'mineral', 'vinho', 'leite', 'cha ', 'energetico', 'isotonico', 'nectar')) return 'Bebidas';
  if (tem('carne', 'frango', 'presunto', 'queijo', 'mortadela', 'linguica', 'salsicha', 'bacon', 'peito', 'coxa', 'file', 'patinho', 'acem', 'costela', 'mussarela', 'salame', 'peixe', 'tilapia')) return 'Carnes/Frios';
  if (tem('banana', 'maca', 'tomate', 'cebola', 'batata', 'alface', 'laranja', 'limao', 'cenoura', 'alho', 'mamao', 'uva', 'abacate', 'pepino', 'abobora', 'repolho', 'brocolis', 'melancia', 'morango', 'pera')) return 'Hortifrúti';
  return 'Mercearia';
}
