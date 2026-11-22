// Despensa — MVP local (etapa 2)
// Dados ficam no próprio aparelho (localStorage). A sincronização entra na etapa 3.

const CATEGORIAS = ['Mercearia', 'Bebidas', 'Limpeza', 'Higiene', 'Hortifrúti', 'Carnes/Frios', 'Congelados', 'Outros'];
const KEY = 'despensa.v1';
const KEY_MODO = 'despensa.modo';

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  loading: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
};

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const agoraISO = () => new Date().toISOString();
const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/* ---------- dados ---------- */
// products: { id, barcode|null, name, category, qty, createdAt, updatedAt }
// list:     { id, productId|null, name, category, checked, addedAt, motivo: 'acabou'|'manual' }
let state = carregar();

function carregar() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.products)) return { v: 1, products: s.products, list: Array.isArray(s.list) ? s.list : [] };
  } catch { /* dados corrompidos: começa vazio */ }
  return { v: 1, products: [], list: [] };
}
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { toast('Não foi possível salvar neste aparelho.'); }
}
const foto = () => JSON.stringify(state);
function voltarPara(snap) { state = JSON.parse(snap); salvar(); render(); }

const porCodigo = (code) => state.products.find((p) => p.barcode === code);
const porId = (id) => state.products.find((p) => p.id === id);

function porNaLista(p, motivo = 'acabou') {
  if (state.list.some((i) => i.productId === p.id)) return;
  state.list.push({ id: uid(), productId: p.id, name: p.name, category: p.category, checked: false, addedAt: agoraISO(), motivo });
}
function tirarDaLista(p) { state.list = state.list.filter((i) => i.productId !== p.id); }

function darEntrada(p, n = 1) {
  p.qty += n;
  p.updatedAt = agoraISO();
  tirarDaLista(p);
}
function darSaida(p) {
  if (p.qty > 0) { p.qty -= 1; p.updatedAt = agoraISO(); }
  if (p.qty === 0) porNaLista(p, 'acabou');
}

/* ---------- interface ---------- */
const ui = { tab: 'despensa', busca: '', cat: 'Todas' };

function render() {
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const pend = state.list.filter((i) => !i.checked).length;
  const badge = $('#badge-compras');
  badge.hidden = pend === 0;
  badge.textContent = pend > 99 ? '99+' : String(pend);

  const v = $('#view');
  if (ui.tab === 'despensa') v.innerHTML = telaDespensa();
  else if (ui.tab === 'compras') v.innerHTML = telaCompras();
  else v.innerHTML = telaEmBreve(ui.tab);
}

function agrupar(itens) {
  const g = {};
  for (const it of itens) (g[it.category] ||= []).push(it);
  const ordem = [...CATEGORIAS.filter((c) => g[c]), ...Object.keys(g).filter((c) => !CATEGORIAS.includes(c))];
  return ordem.map((c) => ({ cat: c, itens: g[c].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
}
const vazio = (tit, txt) => `<div class="vazio"><strong>${esc(tit)}</strong><p>${esc(txt)}</p></div>`;

/* Despensa */
function telaDespensa() {
  const estoque = state.products.filter((p) => p.qty > 0);
  const unidades = estoque.reduce((s, p) => s + p.qty, 0);
  const cats = ['Todas', ...CATEGORIAS.filter((c) => estoque.some((p) => p.category === c))];
  if (!cats.includes(ui.cat)) ui.cat = 'Todas';
  return `
    <header class="top">
      <div><h1>Despensa</h1><p class="sub">${plural(estoque.length, 'produto', 'produtos')} · ${plural(unidades, 'unidade', 'unidades')}</p></div>
      <div class="top-actions">
        <button class="icon-btn" type="button" data-act="novo" aria-label="Adicionar produto sem código">${ICON.plus}</button>
        <button class="icon-btn" type="button" data-act="config" aria-label="Backup e configurações">${ICON.gear}</button>
      </div>
    </header>
    <div class="pad">
      <label for="busca" class="sr">Buscar produto</label>
      <div class="search">${ICON.search}<input id="busca" type="search" placeholder="Buscar produto" value="${esc(ui.busca)}" autocomplete="off" enterkeyhint="search"></div>
    </div>
    <div class="chips">${cats.map((c) => `<button type="button" class="chip ${c === ui.cat ? 'on' : ''}" data-cat="${esc(c)}" aria-pressed="${c === ui.cat}">${esc(c)}</button>`).join('')}</div>
    <div id="lista-despensa" class="lista">${listaDespensa()}</div>`;
}

function listaDespensa() {
  if (!state.products.some((p) => p.qty > 0)) {
    return vazio('Sua despensa está vazia', 'Toque no botão verde e leia o código de barras dos produtos que você comprou. Itens sem código (frutas, carne, granel) entram pelo botão +.');
  }
  const q = norm(ui.busca);
  const itens = state.products.filter((p) => p.qty > 0 && (ui.cat === 'Todas' || p.category === ui.cat) && (!q || norm(p.name).includes(q)));
  if (!itens.length) return vazio('Nada encontrado', 'Tente outro nome ou outra categoria.');
  return agrupar(itens).map((g) => `
    <section class="grupo">
      <h2>${esc(g.cat)} · ${g.itens.length}</h2>
      <div class="card">${g.itens.map(linhaProduto).join('')}</div>
    </section>`).join('');
}

function linhaProduto(p) {
  const tags = (p.qty === 1 ? '<span class="tag warn">Última unidade</span>' : '') + (!p.barcode ? '<span class="tag">Sem código</span>' : '');
  return `
    <div class="row">
      <button type="button" class="row-main" data-act="editar" data-id="${p.id}">
        <span class="nome">${esc(p.name)}</span>
        <span class="tags">${tags}</span>
      </button>
      <div class="stepper">
        <button type="button" data-act="menos" data-id="${p.id}" aria-label="Tirar uma unidade de ${esc(p.name)}">−</button>
        <span class="qtd" aria-label="${p.qty} unidades">${p.qty}</span>
        <button type="button" data-act="mais" data-id="${p.id}" aria-label="Somar uma unidade de ${esc(p.name)}">+</button>
      </div>
    </div>`;
}

/* Compras */
function telaCompras() {
  const itens = state.list.map((i) => {
    const p = i.productId ? porId(i.productId) : null;
    return { ...i, name: p ? p.name : i.name, category: p ? p.category : i.category };
  });
  const marcados = itens.filter((i) => i.checked).length;
  const corpo = itens.length
    ? `<div class="lista">${agrupar(itens).map((g) => `
        <section class="grupo">
          <h2>${esc(g.cat)}</h2>
          <div class="card">${g.itens.map(linhaCompra).join('')}</div>
        </section>`).join('')}</div>`
    : vazio('Lista vazia', 'Quando um produto acabar na despensa, ele aparece aqui sozinho. Você também pode adicionar itens pelo botão +.');
  return `
    <header class="top">
      <div><h1>Compras</h1><p class="sub">${plural(itens.length, 'item', 'itens')} · ${marcados} no carrinho</p></div>
      <div class="top-actions"><button class="icon-btn" type="button" data-act="add-lista" aria-label="Adicionar item à lista">${ICON.plus}</button></div>
    </header>
    ${corpo}
    <div class="acoes">
      ${marcados ? `<button class="btn primary" type="button" data-act="guardar">Guardar ${plural(marcados, 'item', 'itens')} na despensa</button>` : ''}
      <button class="btn ghost" type="button" disabled>Ler QR Code da nota · chega na etapa 4</button>
    </div>`;
}

function linhaCompra(i) {
  const info = i.motivo === 'acabou' ? `Acabou em ${fmtData(i.addedAt)}` : 'Adicionado à mão';
  return `
    <div class="row">
      <label class="check">
        <input type="checkbox" data-act="marcar" data-id="${i.id}" ${i.checked ? 'checked' : ''}>
        <span><span class="nome ${i.checked ? 'riscado' : ''}">${esc(i.name)}</span><span class="info">${info}</span></span>
      </label>
      <button type="button" class="x-btn" data-act="tirar-lista" data-id="${i.id}" aria-label="Remover ${esc(i.name)} da lista">${ICON.x}</button>
    </div>`;
}

function telaEmBreve(tab) {
  const t = tab === 'notas'
    ? ['Notas fiscais', 'Leitura do QR Code da NFC-e', 'Na etapa 4 você lê o QR Code da nota e o app dá entrada em todos os itens de uma vez, guardando o preço de cada um.']
    : ['Gastos', 'Gastos por mês e preço por item', 'Na etapa 4, com os dados das notas, esta tela mostra o total por mês, por categoria e a variação de preço de cada produto.'];
  return `<header class="top"><div><h1>${t[0]}</h1><p class="sub">Em construção</p></div></header>
    <div class="em-breve"><h2>${t[1]}</h2><p>${t[2]}</p></div>`;
}

/* ---------- painel inferior ---------- */
let aoFecharSheet = null;

function abrirSheet(html, aoFechar) {
  $('#sheet').innerHTML = html;
  $('#sheet-bd').hidden = false;
  document.body.classList.add('no-scroll');
  aoFecharSheet = aoFechar || null;
  const vazioInput = [...$('#sheet').querySelectorAll('input[type="text"]')].find((i) => !i.value);
  if (vazioInput) setTimeout(() => vazioInput.focus(), 60);
}
function fecharSheet(resultado) {
  $('#sheet-bd').hidden = true;
  $('#sheet').innerHTML = '';
  if ($('#scanner').hidden) document.body.classList.remove('no-scroll');
  const fn = aoFecharSheet;
  aoFecharSheet = null;
  if (fn) fn(resultado);
}

function radiosCategoria(sel) {
  return `<div class="cats">${CATEGORIAS.map((c) => `
    <label class="cat-radio"><input type="radio" name="cat" value="${esc(c)}" ${c === sel ? 'checked' : ''}><span>${esc(c)}</span></label>`).join('')}</div>`;
}

// Cadastro / edição de produto
function abrirProduto({ id = null, barcode = null, name = '', category = 'Mercearia', qty = 1, titulo, aviso, aoConcluir } = {}) {
  const p = id ? porId(id) : null;
  if (p) ({ barcode, name, category, qty } = p);
  const tit = titulo || (p ? 'Editar produto' : (barcode ? 'Novo produto' : 'Produto sem código'));
  abrirSheet(`
    <form id="form-produto" data-id="${p ? p.id : ''}" data-barcode="${esc(barcode || '')}" novalidate>
      <div style="display:flex;flex-direction:column;gap:18px">
        <h2>${esc(tit)}</h2>
        ${aviso ? `<div class="aviso">${ICON.alert}<span>${esc(aviso)}</span></div>` : ''}
        ${barcode ? `<div class="campo"><span style="font-size:13px;font-weight:600;color:var(--muted)">Código</span><span class="codigo">${esc(barcode)}</span></div>` : ''}
        <div class="campo">
          <label for="f-nome">Nome do produto</label>
          <input id="f-nome" type="text" value="${esc(name)}" placeholder="Ex.: Arroz Camil T1 5 kg" autocomplete="off" enterkeyhint="done" required>
        </div>
        <fieldset class="campo"><legend>Categoria</legend>${radiosCategoria(category)}</fieldset>
        <div class="qtd-box">
          <label for="f-qtd">${p ? 'Quantidade na despensa' : 'Quantidade comprada'}</label>
          <div class="stepper">
            <button type="button" data-act="f-menos" aria-label="Diminuir">−</button>
            <input id="f-qtd" type="number" inputmode="numeric" min="0" max="999" value="${Number(qty) || 0}">
            <button type="button" data-act="f-mais" aria-label="Aumentar">+</button>
          </div>
        </div>
        <p class="nota-local">Com quantidade 0, o produto fica cadastrado e vai para a lista de compras.</p>
        <div class="sheet-acoes">
          <button class="btn primary" type="submit">${p ? 'Salvar alterações' : 'Salvar na despensa'}</button>
          <button class="btn ghost" type="button" data-act="fechar-sheet">Cancelar</button>
          ${p ? '<button class="btn danger" type="button" data-act="excluir-produto">Excluir produto</button>' : ''}
        </div>
      </div>
    </form>`, aoConcluir);
}

function salvarProduto(form) {
  const nome = $('#f-nome', form).value.trim().replace(/\s+/g, ' ');
  if (!nome) { $('#f-nome', form).focus(); toast('Digite o nome do produto.'); return; }
  const cat = (form.querySelector('input[name="cat"]:checked') || {}).value || 'Outros';
  const qtd = Math.max(0, Math.min(999, parseInt($('#f-qtd', form).value, 10) || 0));
  const id = form.dataset.id;
  const barcode = form.dataset.barcode || null;
  const snap = foto();
  let p = id ? porId(id) : null;

  if (!p && barcode && porCodigo(barcode)) p = porCodigo(barcode); // evita duplicar o mesmo código
  if (p) {
    Object.assign(p, { name: nome, category: cat, qty: qtd, updatedAt: agoraISO() });
    state.list.forEach((i) => { if (i.productId === p.id) { i.name = nome; i.category = cat; } });
  } else {
    p = { id: uid(), barcode, name: nome, category: cat, qty: qtd, createdAt: agoraISO(), updatedAt: agoraISO() };
    state.products.push(p);
    // se havia um item manual com o mesmo nome na lista, liga ao produto
    state.list.forEach((i) => { if (!i.productId && norm(i.name) === norm(nome)) i.productId = p.id; });
  }
  if (p.qty === 0) porNaLista(p, 'acabou'); else tirarDaLista(p);
  salvar();
  fecharSheet({ produto: p, snap });
  render();
}

// Item manual na lista de compras
function abrirItemLista() {
  abrirSheet(`
    <form id="form-lista" novalidate>
      <div style="display:flex;flex-direction:column;gap:18px">
        <h2>Adicionar à lista</h2>
        <div class="campo">
          <label for="l-nome">Item</label>
          <input id="l-nome" type="text" list="l-sugestoes" placeholder="Ex.: Creme dental" autocomplete="off" enterkeyhint="done">
          <datalist id="l-sugestoes">${state.products.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
        </div>
        <fieldset class="campo"><legend>Categoria</legend>${radiosCategoria('Mercearia')}</fieldset>
        <div class="sheet-acoes">
          <button class="btn primary" type="submit">Adicionar</button>
          <button class="btn ghost" type="button" data-act="fechar-sheet">Cancelar</button>
        </div>
      </div>
    </form>`);
}

function salvarItemLista(form) {
  const nome = $('#l-nome', form).value.trim().replace(/\s+/g, ' ');
  if (!nome) { $('#l-nome', form).focus(); return; }
  const existente = state.products.find((p) => norm(p.name) === norm(nome));
  if (existente) {
    if (state.list.some((i) => i.productId === existente.id)) { toast('Esse item já está na lista.'); return; }
    state.list.push({ id: uid(), productId: existente.id, name: existente.name, category: existente.category, checked: false, addedAt: agoraISO(), motivo: 'manual' });
  } else {
    const cat = (form.querySelector('input[name="cat"]:checked') || {}).value || 'Outros';
    state.list.push({ id: uid(), productId: null, name: nome, category: cat, checked: false, addedAt: agoraISO(), motivo: 'manual' });
  }
  salvar();
  fecharSheet();
  render();
}

function guardarMarcados() {
  const marcados = state.list.filter((i) => i.checked);
  if (!marcados.length) return;
  const snap = foto();
  for (const i of marcados) {
    let p = i.productId ? porId(i.productId) : state.products.find((x) => norm(x.name) === norm(i.name));
    if (!p) {
      p = { id: uid(), barcode: null, name: i.name, category: i.category, qty: 0, createdAt: agoraISO(), updatedAt: agoraISO() };
      state.products.push(p);
    }
    darEntrada(p, 1);
  }
  state.list = state.list.filter((i) => !i.checked);
  salvar();
  render();
  toast(`${plural(marcados.length, 'item guardado', 'itens guardados')} (+1 cada). Ajuste a quantidade na despensa se precisar.`, { acao: 'Desfazer', fn: () => voltarPara(snap) });
}

// Backup
function abrirConfig() {
  abrirSheet(`
    <div style="display:flex;flex-direction:column;gap:16px">
      <h2>Backup</h2>
      <p class="nota-local">Por enquanto os dados ficam só neste aparelho. A sincronização entre os celulares chega na etapa 3. Até lá, faça um backup de vez em quando.</p>
      <div class="sheet-acoes">
        <button class="btn dark" type="button" data-act="exportar">Exportar backup (.json)</button>
        <label class="btn ghost" for="importar" style="cursor:pointer">Importar backup</label>
        <input id="importar" type="file" accept="application/json,.json" class="sr">
        <button class="btn danger" type="button" data-act="apagar-tudo">Apagar todos os dados</button>
        <button class="btn ghost" type="button" data-act="fechar-sheet">Fechar</button>
      </div>
      <p class="nota-local">${plural(state.products.length, 'produto cadastrado', 'produtos cadastrados')} · ${plural(state.list.length, 'item', 'itens')} na lista.</p>
    </div>`);
}

async function exportar() {
  const nome = `despensa-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const arquivo = new File([blob], nome, { type: 'application/json' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
      await navigator.share({ files: [arquivo], title: 'Backup da despensa' });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function importar(file) {
  try {
    const dados = JSON.parse(await file.text());
    if (!dados || !Array.isArray(dados.products)) throw new Error('formato');
    if (!confirm(`Substituir os dados atuais por este backup (${plural(dados.products.length, 'produto', 'produtos')})?`)) return;
    state = { v: 1, products: dados.products, list: Array.isArray(dados.list) ? dados.list : [] };
    salvar();
    fecharSheet();
    render();
    toast('Backup importado.');
  } catch {
    toast('Arquivo inválido. Use um backup exportado por este app.');
  }
}

/* ---------- aviso rápido ---------- */
let toastTimer = null;
function toast(msg, { acao, fn } = {}) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${acao ? `<button type="button" id="toast-acao">${esc(acao)}</button>` : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  if (acao) $('#toast-acao').onclick = () => { t.hidden = true; fn(); };
  toastTimer = setTimeout(() => { t.hidden = true; }, acao ? 6000 : 3000);
}

/* ---------- leitor de código de barras ---------- */
const scan = {
  stream: null, detector: null, timer: null, ocupado: false, pausado: false,
  ultimo: '', ultimoEm: 0, audio: null,
  modo: localStorage.getItem(KEY_MODO) === 'saida' ? 'saida' : 'entrada',
};
const quadro = document.createElement('canvas');
const ctxQuadro = quadro.getContext('2d', { willReadFrequently: true });

async function obterDetector() {
  if (scan.detector) return scan.detector;
  const formatos = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];
  if ('BarcodeDetector' in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (sup.includes('ean_13')) {
        scan.detector = new window.BarcodeDetector({ formats: formatos.filter((f) => sup.includes(f)) });
        return scan.detector;
      }
    } catch { /* usa o leitor embutido */ }
  }
  const api = window.BarcodeDetectionAPI;
  if (!api) throw new Error('leitor-indisponivel');
  api.setZXingModuleOverrides({
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL(`vendor/${path}`, location.href).href : prefix + path),
  });
  scan.detector = new api.BarcodeDetector({ formats: formatos });
  return scan.detector;
}

function atualizarModo() {
  const s = $('#scanner');
  s.classList.toggle('modo-entrada', scan.modo === 'entrada');
  s.classList.toggle('modo-saida', scan.modo === 'saida');
  s.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === scan.modo)));
}

async function abrirLeitor() {
  $('#scanner').hidden = false;
  document.body.classList.add('no-scroll');
  atualizarModo();
  cartaoInicial();
  try {
    scan.audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (scan.audio.state === 'suspended') scan.audio.resume();
  } catch { /* sem som */ }

  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    cartaoErro('A câmera só funciona com o app aberto em um endereço https://. Você ainda pode digitar o código.');
    return;
  }
  try {
    scan.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    const v = $('#video');
    v.srcObject = scan.stream;
    await v.play();
    await obterDetector();
    scan.pausado = false;
    lacoLeitura();
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) {
      cartaoErro('Permita o uso da câmera. No iPhone: Ajustes › Safari › Câmera › Permitir. Se o app estiver instalado na tela inicial, feche e abra de novo depois de permitir.');
    } else if (e && e.name === 'NotFoundError') {
      cartaoErro('Nenhuma câmera encontrada neste aparelho.');
    } else {
      cartaoErro('Não consegui iniciar o leitor. Feche e tente de novo, ou digite o código.');
    }
  }
}

function fecharLeitor() {
  clearTimeout(scan.timer);
  scan.timer = null;
  scan.stream?.getTracks().forEach((t) => t.stop());
  scan.stream = null;
  $('#video').srcObject = null;
  $('#scanner').hidden = true;
  document.body.classList.remove('no-scroll');
  render();
}

async function lacoLeitura() {
  if (!scan.stream) return;
  const v = $('#video');
  if (!scan.pausado && !scan.ocupado && v.readyState >= 2 && v.videoWidth) {
    scan.ocupado = true;
    try {
      // lê só o centro da imagem (onde fica a moldura): mais rápido e com menos falsos positivos
      const w = v.videoWidth, h = v.videoHeight;
      const cw = Math.round(w * 0.85), ch = Math.round(h * 0.5);
      quadro.width = cw; quadro.height = ch;
      ctxQuadro.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
      const res = await scan.detector.detect(quadro);
      if (res.length && !scan.pausado) aoLerCodigo(res[0].rawValue);
    } catch (e) { console.warn('leitura', e); }
    scan.ocupado = false;
  }
  scan.timer = setTimeout(lacoLeitura, 120);
}

function aoLerCodigo(code) {
  const t = Date.now();
  if (code === scan.ultimo && t - scan.ultimoEm < 2500) { scan.ultimoEm = t; return; } // ignora o mesmo produto parado na frente da câmera
  scan.ultimo = code;
  scan.ultimoEm = t;
  bip();
  processarCodigo(code);
}

function bip() {
  try {
    const a = scan.audio;
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.frequency.value = scan.modo === 'entrada' ? 1250 : 880;
    g.gain.setValueAtTime(0.15, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + 0.13);
  } catch { /* sem som */ }
  if (navigator.vibrate) navigator.vibrate(60);
}

function processarCodigo(code) {
  code = String(code || '').replace(/\s/g, '');
  if (!code) return;
  const p = porCodigo(code);
  if (scan.modo === 'entrada') {
    if (p) {
      const snap = foto();
      darEntrada(p, 1);
      salvar();
      cartaoResultado({ tipo: 'ok', titulo: 'Entrada registrada  +1', nome: p.name, qtd: p.qty, snap });
    } else {
      cadastrarPeloLeitor(code, 1);
    }
  } else if (p) {
    const snap = foto();
    const antes = p.qty;
    darSaida(p);
    salvar();
    cartaoResultado({
      tipo: 'out',
      titulo: antes === 0 ? 'Já estava zerado' : 'Saída registrada  −1',
      nome: p.name, qtd: p.qty, snap: antes === 0 ? null : snap,
      nota: p.qty === 0 ? 'Acabou: foi para a lista de compras.' : '',
    });
  } else {
    cartaoDesconhecido(code);
  }
}

async function cadastrarPeloLeitor(code, qtd) {
  scan.pausado = true;
  cartaoBuscando(code);
  const info = await buscarNaBase(code);
  abrirProduto({
    barcode: code,
    name: info?.name || '',
    category: info?.category || 'Mercearia',
    qty: qtd,
    titulo: info ? 'Confirme o produto' : 'Produto não encontrado',
    aviso: info
      ? 'Encontrei este nome na base pública. Ajuste se quiser; o app guarda para as próximas leituras.'
      : 'Esse código não está na base pública. Cadastre uma vez e o app reconhece nas próximas leituras.',
    aoConcluir: (r) => {
      if (r && r.produto) {
        cartaoResultado({
          tipo: r.produto.qty > 0 ? 'ok' : 'out',
          titulo: 'Produto cadastrado', nome: r.produto.name, qtd: r.produto.qty, snap: r.snap,
          nota: r.produto.qty === 0 ? 'Foi para a lista de compras.' : '',
        });
      } else {
        cartaoInicial();
      }
      scan.ultimo = code;
      scan.ultimoEm = Date.now();
      scan.pausado = false;
    },
  });
}

// Busca o nome em bases públicas e gratuitas (Open Food/Beauty/Products Facts)
async function buscarNaBase(code) {
  const fontes = [
    ['https://world.openfoodfacts.org', null],
    ['https://world.openbeautyfacts.org', 'Higiene'],
    ['https://world.openproductsfacts.org', 'Outros'],
  ];
  const campos = 'product_name,product_name_pt,generic_name,brands,quantity,categories_tags';
  const consulta = async ([base, catPadrao]) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=${campos}`, { signal: ctrl.signal });
      if (!r.ok) return null;
      const j = await r.json();
      if (j.status !== 1 || !j.product) return null;
      const pr = j.product;
      let nome = (pr.product_name_pt || pr.product_name || pr.generic_name || '').trim();
      if (!nome) return null;
      const marca = (pr.brands || '').split(',')[0].trim();
      if (marca && !norm(nome).includes(norm(marca))) nome += ` ${marca}`;
      const q = (pr.quantity || '').trim();
      if (q && !norm(nome).includes(norm(q))) nome += ` ${q}`;
      return { name: nome.replace(/\s+/g, ' '), category: catPadrao || categoriaDaBase(pr.categories_tags || []) };
    } catch { return null; } finally { clearTimeout(t); }
  };
  const res = await Promise.all(fontes.map(consulta));
  return res.find(Boolean) || null;
}

function categoriaDaBase(tags) {
  const tem = (...lista) => lista.some((t) => tags.includes(t));
  if (tem('en:frozen-foods')) return 'Congelados';
  if (tem('en:beverages', 'en:milks', 'en:waters', 'en:sodas', 'en:juices', 'en:alcoholic-beverages')) return 'Bebidas';
  if (tem('en:meats', 'en:cheeses', 'en:hams', 'en:sausages', 'en:cold-cuts', 'en:poultries')) return 'Carnes/Frios';
  if (tem('en:fresh-fruits', 'en:fresh-vegetables', 'en:fresh-plant-based-foods')) return 'Hortifrúti';
  return 'Mercearia';
}

function digitarCodigo() {
  const pausadoAntes = scan.pausado;
  scan.pausado = true;
  const c = prompt('Digite os números do código de barras:');
  scan.pausado = pausadoAntes;
  if (c === null) return;
  const code = c.replace(/\D/g, '');
  if (code.length < 6) { toast('Código inválido.'); return; }
  scan.ultimo = code;
  scan.ultimoEm = Date.now();
  processarCodigo(code);
}

/* cartões do leitor */
function cartaoInicial() {
  $('#scan-card').innerHTML = `
    <p class="res-nota">${scan.modo === 'entrada'
      ? '<strong>Comprei:</strong> cada leitura soma 1 unidade. Produto novo? O app pede o nome uma única vez.'
      : '<strong>Acabou:</strong> cada leitura tira 1 unidade. Ao chegar a zero, vai para a lista de compras.'}</p>
    <button class="btn ghost" type="button" data-act="digitar" style="min-height:48px">Digitar código</button>`;
}
function cartaoBuscando(code) {
  $('#scan-card').innerHTML = `
    <div class="res-head"><span class="res-ico neutro">${ICON.loading}</span>
      <span><span class="res-tit">Buscando produto…</span><span class="res-nome codigo">${esc(code)}</span></span></div>`;
}
function cartaoResultado({ tipo, titulo, nome, qtd, snap, nota }) {
  $('#scan-card').innerHTML = `
    <div class="res-head">
      <span class="res-ico ${tipo}">${tipo === 'ok' ? ICON.check : ICON.minus}</span>
      <span><span class="res-tit ${tipo}">${esc(titulo)}</span><span class="res-nome">${esc(nome)}</span></span>
    </div>
    <div class="res-qtd"><span>Na despensa agora</span><strong>${plural(qtd, 'unidade', 'unidades')}</strong></div>
    ${nota ? `<p class="res-nota">${esc(nota)}</p>` : ''}
    <div class="duo">
      <button class="btn ghost" type="button" data-act="desfazer" ${snap ? '' : 'disabled'}>Desfazer</button>
      <button class="btn dark" type="button" data-act="digitar">Digitar código</button>
    </div>`;
  ultimoSnap = snap || null;
}
function cartaoDesconhecido(code) {
  $('#scan-card').innerHTML = `
    <div class="res-head">
      <span class="res-ico neutro">${ICON.alert}</span>
      <span><span class="res-tit">Código não cadastrado</span><span class="res-nome codigo">${esc(code)}</span></span>
    </div>
    <p class="res-nota">Esse produto ainda não está na despensa. Quer cadastrar e já colocar na lista de compras?</p>
    <div class="duo">
      <button class="btn ghost" type="button" data-act="cartao-inicial">Ignorar</button>
      <button class="btn dark" type="button" data-act="cadastrar-zerado" data-code="${esc(code)}">Cadastrar</button>
    </div>`;
}
function cartaoErro(msg) {
  $('#scan-card').innerHTML = `
    <div class="res-head"><span class="res-ico out">${ICON.alert}</span><span><span class="res-tit out">Câmera indisponível</span></span></div>
    <p class="res-nota">${esc(msg)}</p>
    <button class="btn dark" type="button" data-act="digitar" style="min-height:48px">Digitar código</button>`;
}
let ultimoSnap = null;

/* ---------- eventos ---------- */
document.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab;
    render();
    window.scrollTo(0, 0);
    return;
  }
  const chip = e.target.closest('[data-cat]');
  if (chip) { ui.cat = chip.dataset.cat; render(); return; }

  const modo = e.target.closest('[data-mode]');
  if (modo) {
    scan.modo = modo.dataset.mode;
    localStorage.setItem(KEY_MODO, scan.modo);
    atualizarModo();
    cartaoInicial();
    return;
  }

  if (e.target === $('#sheet-bd')) { fecharSheet(); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.dataset.id;
  switch (el.dataset.act) {
    case 'ler': abrirLeitor(); break;
    case 'fechar-leitor': fecharLeitor(); break;
    case 'digitar': digitarCodigo(); break;
    case 'cartao-inicial': cartaoInicial(); break;
    case 'desfazer':
      if (ultimoSnap) { voltarPara(ultimoSnap); ultimoSnap = null; cartaoInicial(); toast('Leitura desfeita.'); }
      break;
    case 'cadastrar-zerado': cadastrarPeloLeitor(el.dataset.code, 0); break;
    case 'mais': { const p = porId(id); if (p) { darEntrada(p, 1); salvar(); render(); } break; }
    case 'menos': {
      const p = porId(id);
      if (p) {
        const snap = foto();
        darSaida(p); salvar(); render();
        if (p.qty === 0) toast(`${p.name} acabou e foi para a lista.`, { acao: 'Desfazer', fn: () => voltarPara(snap) });
      }
      break;
    }
    case 'editar': abrirProduto({ id }); break;
    case 'novo': abrirProduto({ qty: 1 }); break;
    case 'config': abrirConfig(); break;
    case 'exportar': exportar(); break;
    case 'apagar-tudo':
      if (confirm('Apagar todos os produtos e a lista de compras deste aparelho? Isso não pode ser desfeito (a não ser que você tenha um backup).')) {
        state = { v: 1, products: [], list: [] };
        salvar(); fecharSheet(); render(); toast('Dados apagados.');
      }
      break;
    case 'fechar-sheet': fecharSheet(); break;
    case 'f-menos': case 'f-mais': {
      const inp = $('#f-qtd');
      const n = (parseInt(inp.value, 10) || 0) + (el.dataset.act === 'f-mais' ? 1 : -1);
      inp.value = Math.max(0, Math.min(999, n));
      break;
    }
    case 'excluir-produto': {
      const pid = $('#form-produto').dataset.id;
      const p = porId(pid);
      if (p && confirm(`Excluir "${p.name}" da despensa?`)) {
        const snap = foto();
        state.products = state.products.filter((x) => x.id !== pid);
        state.list = state.list.filter((i) => i.productId !== pid);
        salvar(); fecharSheet(); render();
        toast('Produto excluído.', { acao: 'Desfazer', fn: () => voltarPara(snap) });
      }
      break;
    }
    case 'add-lista': abrirItemLista(); break;
    case 'tirar-lista': {
      const snap = foto();
      state.list = state.list.filter((i) => i.id !== id);
      salvar(); render();
      toast('Item removido da lista.', { acao: 'Desfazer', fn: () => voltarPara(snap) });
      break;
    }
    case 'guardar': guardarMarcados(); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-act="marcar"]')) {
    const i = state.list.find((x) => x.id === e.target.dataset.id);
    if (i) { i.checked = e.target.checked; salvar(); render(); }
  } else if (e.target.id === 'importar' && e.target.files[0]) {
    importar(e.target.files[0]);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'busca') {
    ui.busca = e.target.value;
    $('#lista-despensa').innerHTML = listaDespensa();
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'form-produto') salvarProduto(e.target);
  else if (e.target.id === 'form-lista') salvarItemLista(e.target);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet-bd').hidden) fecharSheet();
});

// Para a câmera se o app for para segundo plano (economiza bateria e libera a câmera)
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scan.stream) fecharLeitor();
});

/* ---------- início ---------- */
render();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
// Pede ao navegador para não apagar os dados locais por falta de espaço
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Exposto só para testes
window.__despensa = { processarCodigo, get state() { return state; }, scan };
