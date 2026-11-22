// Despensa — etapa 3: login e despensa compartilhada pela casa (Firebase).
// Sem firebase-config.js preenchido, funciona em modo local (só neste aparelho).

import { firebaseConfig as configArquivo, proxyNotas } from './firebase-config.js';
import { LocalStore, CloudStore, KEY_LOCAL, uid, norm } from './store.js';
import { lerLinkNota, buscarPaginaNota, interpretarNota, vincularItens, nomeBonito, eanValido } from './nota.js';

const CATEGORIAS = ['Mercearia', 'Bebidas', 'Limpeza', 'Higiene', 'Hortifrúti', 'Carnes/Frios', 'Congelados', 'Outros'];
const KEY_MODO = 'despensa.modo';
const URL_APP = 'https://patrickamsoares.github.io/despensa/';

// Testes locais com o emulador do Firebase: http://localhost:PORTA/?emulador
const EMULADOR = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulador');
const firebaseConfig = configArquivo || (EMULADOR ? { apiKey: 'demo-key', authDomain: 'localhost', projectId: 'demo-despensa', appId: 'demo' } : null);

const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  gear: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  alert: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  loading: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9"/></svg>',
  logo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6v12M7.5 6v12M11 6v12M14 6v12M17.5 6v12M20 6v12"/></svg>',
};

/* ---------- utilidades ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtData = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const qtdDe = (p) => Math.max(0, Number(p.qty) || 0);

/* ---------- estado ---------- */
let store = null;           // LocalStore ou CloudStore
const nuvem = { fb: null, auth: null, db: null, user: null };
const ui = { tela: 'carregando', tab: 'despensa', busca: '', cat: 'Todas', modoLogin: 'entrar', ocupado: false, mes: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })() };

const S = () => (store ? store.state : { products: [], list: [], purchases: [] });

function usarStore(novo) {
  if (store) store.parar();
  store = novo;
  if (store) store.aoMudar(() => render());
}

/* ---------- interface ---------- */
function render() {
  document.body.classList.toggle('sem-abas', ui.tela !== 'app');
  document.querySelectorAll('.tab').forEach((b) => {
    const on = b.dataset.tab === ui.tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  const pend = S().list.filter((i) => !i.checked).length;
  const badge = $('#badge-compras');
  badge.hidden = pend === 0;
  badge.textContent = pend > 99 ? '99+' : String(pend);

  const v = $('#view');
  if (ui.tela === 'login') { if (!$('#form-login')) v.innerHTML = telaLogin(); return; }
  if (ui.tela === 'casa') { if (!$('#tela-casa')) v.innerHTML = telaCasa(); return; }
  if (ui.tela === 'carregando') { v.innerHTML = '<div class="vazio" style="margin-top:80px"><strong>Carregando…</strong></div>'; return; }

  // Enquanto a pessoa digita na busca, atualiza só a lista (não fecha o teclado)
  if (ui.tab === 'despensa' && document.activeElement && document.activeElement.id === 'busca') {
    $('#lista-despensa').innerHTML = listaDespensa();
    return;
  }
  if (ui.tab === 'despensa') v.innerHTML = telaDespensa();
  else if (ui.tab === 'compras') v.innerHTML = telaCompras();
  else if (ui.tab === 'notas') v.innerHTML = telaNotas();
  else v.innerHTML = telaGastos();
}

function agrupar(itens) {
  const g = {};
  for (const it of itens) (g[it.category] ||= []).push(it);
  const ordem = [...CATEGORIAS.filter((c) => g[c]), ...Object.keys(g).filter((c) => !CATEGORIAS.includes(c))];
  return ordem.map((c) => ({ cat: c, itens: g[c].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')) }));
}
const vazio = (tit, txt) => `<div class="vazio"><strong>${esc(tit)}</strong><p>${esc(txt)}</p></div>`;

function bannerErro() {
  if (!store || !store.erro) return '';
  const negado = String(store.erro.code || '').includes('permission');
  return `<div class="aviso" style="margin:0 20px 12px">${ICON.alert}<span>${negado
    ? 'Sem permissão para acessar a despensa da casa. Saia e entre de novo, ou peça um novo convite.'
    : 'Problema ao sincronizar. As alterações ficam guardadas e são enviadas quando a conexão voltar.'}</span></div>`;
}

function subtituloCasa() {
  if (!store || store.modo !== 'nuvem') return '';
  const n = store.casa?.members?.length || 1;
  return n > 1 ? ` · compartilhada com ${plural(n - 1, 'pessoa', 'pessoas')}` : ' · só você por enquanto';
}

/* Login */
function telaLogin() {
  const criar = ui.modoLogin === 'criar';
  return `
    <div class="auth">
      <div class="auth-logo">${ICON.logo}</div>
      <h1>Despensa</h1>
      <p class="sub">${criar ? 'Crie sua conta para compartilhar a despensa da casa.' : 'Entre para ver a despensa da casa.'}</p>
      <form id="form-login" class="auth-form" novalidate>
        <div class="campo">
          <label for="l-email">E-mail</label>
          <input id="l-email" type="email" inputmode="email" autocomplete="email" autocapitalize="off" required>
        </div>
        <div class="campo">
          <label for="l-senha">Senha${criar ? ' (mínimo 6 caracteres)' : ''}</label>
          <input id="l-senha" type="password" autocomplete="${criar ? 'new-password' : 'current-password'}" minlength="6" required>
        </div>
        <p class="erro" id="login-erro" role="alert"></p>
        <button class="btn primary" type="submit">${criar ? 'Criar conta' : 'Entrar'}</button>
      </form>
      <div class="auth-links">
        <button type="button" class="link" data-act="alternar-login">${criar ? 'Já tenho conta: entrar' : 'Não tenho conta: criar agora'}</button>
        ${criar ? '' : '<button type="button" class="link" data-act="esqueci-senha">Esqueci minha senha</button>'}
      </div>
    </div>`;
}

/* Criar ou entrar numa casa */
function telaCasa() {
  return `
    <div class="auth" id="tela-casa">
      <h1>Sua casa</h1>
      <p class="sub">Conectado como ${esc(nuvem.user?.email || '')}</p>
      <div class="card-op">
        <h2>Primeira pessoa da casa?</h2>
        <p>Crie a despensa e depois envie o código de convite para quem mora com você.</p>
        <button class="btn primary" type="button" data-act="criar-casa">Criar a despensa da casa</button>
      </div>
      <form id="form-convite" class="card-op" novalidate>
        <h2>Recebeu um convite?</h2>
        <div class="campo">
          <label for="c-codigo">Código de convite</label>
          <input id="c-codigo" type="text" autocomplete="off" autocapitalize="characters" maxlength="6" placeholder="Ex.: K7QP2M" style="text-transform:uppercase;letter-spacing:3px;font-weight:700">
        </div>
        <p class="erro" id="convite-erro" role="alert"></p>
        <button class="btn dark" type="submit">Entrar na despensa</button>
      </form>
      <button type="button" class="link" data-act="sair">Sair da conta</button>
    </div>`;
}

/* Despensa */
function telaDespensa() {
  const prods = S().products;
  const estoque = prods.filter((p) => qtdDe(p) > 0);
  const unidades = estoque.reduce((s, p) => s + qtdDe(p), 0);
  const cats = ['Todas', ...CATEGORIAS.filter((c) => estoque.some((p) => p.category === c))];
  if (!cats.includes(ui.cat)) ui.cat = 'Todas';
  return `
    <header class="top">
      <div><h1>Despensa</h1><p class="sub">${plural(estoque.length, 'produto', 'produtos')} · ${plural(unidades, 'unidade', 'unidades')}${subtituloCasa()}</p></div>
      <div class="top-actions">
        <button class="icon-btn" type="button" data-act="novo" aria-label="Adicionar produto sem código">${ICON.plus}</button>
        <button class="icon-btn" type="button" data-act="config" aria-label="Conta, convite e backup">${ICON.gear}</button>
      </div>
    </header>
    ${bannerErro()}
    <div class="pad">
      <label for="busca" class="sr">Buscar produto</label>
      <div class="search">${ICON.search}<input id="busca" type="search" placeholder="Buscar produto" value="${esc(ui.busca)}" autocomplete="off" enterkeyhint="search"></div>
    </div>
    <div class="chips">${cats.map((c) => `<button type="button" class="chip ${c === ui.cat ? 'on' : ''}" data-cat="${esc(c)}" aria-pressed="${c === ui.cat}">${esc(c)}</button>`).join('')}</div>
    <div id="lista-despensa" class="lista">${listaDespensa()}</div>`;
}

function listaDespensa() {
  const prods = S().products;
  if (!prods.some((p) => qtdDe(p) > 0)) {
    return vazio('Sua despensa está vazia', 'Toque no botão verde e leia o código de barras dos produtos que você comprou. Itens sem código (frutas, carne, granel) entram pelo botão +.');
  }
  const q = norm(ui.busca);
  const itens = prods.filter((p) => qtdDe(p) > 0 && (ui.cat === 'Todas' || p.category === ui.cat) && (!q || norm(p.name).includes(q)));
  if (!itens.length) return vazio('Nada encontrado', 'Tente outro nome ou outra categoria.');
  return agrupar(itens).map((g) => `
    <section class="grupo">
      <h2>${esc(g.cat)} · ${g.itens.length}</h2>
      <div class="card">${g.itens.map(linhaProduto).join('')}</div>
    </section>`).join('');
}

function linhaProduto(p) {
  const q = qtdDe(p);
  const tags = (q === 1 ? '<span class="tag warn">Última unidade</span>' : '') + (!p.barcode ? '<span class="tag">Sem código</span>' : '');
  return `
    <div class="row">
      <button type="button" class="row-main" data-act="editar" data-id="${p.id}">
        <span class="nome">${esc(p.name)}</span>
        <span class="tags">${tags}</span>
      </button>
      <div class="stepper">
        <button type="button" data-act="menos" data-id="${p.id}" aria-label="Tirar uma unidade de ${esc(p.name)}">−</button>
        <span class="qtd" aria-label="${q} unidades">${q}</span>
        <button type="button" data-act="mais" data-id="${p.id}" aria-label="Somar uma unidade de ${esc(p.name)}">+</button>
      </div>
    </div>`;
}

/* Compras */
function telaCompras() {
  const itens = S().list.map((i) => {
    const p = i.productId ? store.porId(i.productId) : null;
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
    ${bannerErro()}
    ${corpo}
    <div class="acoes">
      ${marcados ? `<button class="btn primary" type="button" data-act="guardar">Guardar ${plural(marcados, 'item', 'itens')} na despensa</button>` : ''}
      <button class="btn dark" type="button" data-act="ler-nota">Ler QR Code da nota fiscal</button>
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

/* ---------- notas fiscais ---------- */
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDataLonga = (iso) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const mesDe = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

function telaNotas() {
  const compras = [...S().purchases].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const ativo = !!proxyNotas;
  const lista = compras.length
    ? `<div class="lista"><div class="card">${compras.map((c) => `
        <button type="button" class="row row-compra" data-act="ver-compra" data-id="${esc(c.id)}">
          <span class="row-main" style="pointer-events:none">
            <span class="nome">${esc(c.store?.name || 'Compra')}</span>
            <span class="info">${fmtDataLonga(c.date)} · ${c.items?.length ? plural(c.items.length, 'item', 'itens') : 'só o total'}</span>
          </span>
          <strong class="valor">${brl(c.total)}</strong>
        </button>`).join('')}</div></div>`
    : vazio('Nenhuma nota ainda', 'Depois de uma compra, leia o QR Code da nota fiscal: o app dá entrada nos produtos e guarda o preço de cada um.');
  return `
    <header class="top"><div><h1>Notas</h1><p class="sub">${plural(compras.length, 'compra registrada', 'compras registradas')}</p></div></header>
    <div class="acoes" style="padding-top:0;padding-bottom:16px">
      ${ativo
        ? `<button class="btn primary" type="button" data-act="ler-nota">Ler QR Code da nota fiscal</button>
           <button class="btn ghost" type="button" data-act="colar-link">Colar link da nota</button>`
        : '<div class="aviso">' + ICON.alert + '<span>A leitura de notas ainda não foi ativada (falta publicar a função de consulta à Fazenda).</span></div>'}
    </div>
    ${lista}`;
}

function telaGastos() {
  const compras = S().purchases;
  const [ano, mes] = ui.mes.split('-').map(Number);
  const doMes = compras.filter((c) => mesDe(c.date) === ui.mes);
  const total = doMes.reduce((s, c) => s + (Number(c.total) || 0), 0);
  const mesAnt = mesDe(new Date(ano, mes - 2, 15).toISOString());
  const totalAnt = compras.filter((c) => mesDe(c.date) === mesAnt).reduce((s, c) => s + (Number(c.total) || 0), 0);
  const variacao = totalAnt > 0 ? ((total - totalAnt) / totalAnt) * 100 : null;

  // últimos 6 meses
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(ano, mes - 1 - i, 15);
    const chave = mesDe(d.toISOString());
    meses.push({ chave, nome: NOMES_MES[d.getMonth()], valor: compras.filter((c) => mesDe(c.date) === chave).reduce((s, c) => s + (Number(c.total) || 0), 0) });
  }
  const max = Math.max(...meses.map((m) => m.valor), 1);

  // por categoria
  const cats = {};
  for (const c of doMes) {
    if (!c.items?.length) { cats['Sem detalhe'] = (cats['Sem detalhe'] || 0) + (Number(c.total) || 0); continue; }
    for (const it of c.items) {
      const cat = (it.productId && store.porId(it.productId)?.category) || it.category || 'Outros';
      cats[cat] = (cats[cat] || 0) + (Number(it.total) || 0);
    }
  }
  const listaCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(...listaCats.map((c) => c[1]), 1);

  // variação de preço por produto (último preço x anterior)
  const historico = {};
  for (const c of [...compras].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    for (const it of c.items || []) {
      if (!it.productId || !(it.unitPrice > 0)) continue;
      (historico[it.productId] ||= []).push({ preco: it.unitPrice, data: c.date });
    }
  }
  const variacoes = Object.entries(historico)
    .map(([pid, h]) => {
      const ult = h[h.length - 1];
      const ant = [...h].reverse().find((x) => x.data !== ult.data); // compra anterior (outra nota)
      if (!ant) return null;
      return { nome: store.porId(pid)?.name || 'Produto', ult, ant, pct: ((ult.preco - ant.preco) / ant.preco) * 100 };
    })
    .filter((x) => x && Math.abs(x.pct) >= 0.5)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
    .slice(0, 8);

  const nomeMes = new Date(ano, mes - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const nomeMesCap = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);
  return `
    <header class="top">
      <div><h1>Gastos</h1></div>
      <div class="mes-nav">
        <button class="icon-btn" type="button" data-act="mes-ant" aria-label="Mês anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <span class="mes-nome">${esc(nomeMesCap)}</span>
        <button class="icon-btn" type="button" data-act="mes-prox" aria-label="Próximo mês"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
    </header>
    <div class="lista">
      <section class="card bloco">
        <div class="total-linha">
          <div><span class="info">Total no mês · ${plural(doMes.length, 'compra', 'compras')}</span><strong class="total-mes">${brl(total)}</strong></div>
          ${variacao === null ? '' : `<span class="tag ${variacao > 0 ? 'warn' : 'bom'}">${variacao > 0 ? '+' : ''}${variacao.toFixed(0)}% vs ${NOMES_MES[(mes + 10) % 12]}.</span>`}
        </div>
        <div class="barras" role="img" aria-label="Gasto nos últimos 6 meses">
          ${meses.map((m) => `
            <div class="barra-col" title="${esc(brl(m.valor))}">
              <div class="barra ${m.chave === ui.mes ? 'atual' : ''}" style="height:${Math.max(3, Math.round((m.valor / max) * 96))}px"></div>
              <span>${m.nome}</span>
            </div>`).join('')}
        </div>
      </section>
      ${doMes.length ? `
      <section class="card bloco">
        <h2 class="bloco-tit">Por categoria</h2>
        ${listaCats.map(([nome, v]) => `
          <div class="cat-linha">
            <div class="cat-topo"><span>${esc(nome)}</span><strong>${brl(v)}</strong></div>
            <div class="cat-trilho"><div style="width:${Math.round((v / maxCat) * 100)}%"></div></div>
          </div>`).join('')}
      </section>` : vazio('Sem compras neste mês', 'Leia o QR Code das notas fiscais para ver os gastos aqui.')}
      ${variacoes.length ? `
      <section class="card bloco">
        <h2 class="bloco-tit">Preço por item</h2>
        ${variacoes.map((x) => `
          <div class="preco-linha">
            <span><span class="nome">${esc(x.nome)}</span><span class="info">Era ${brl(x.ant.preco)} em ${fmtData(x.ant.data)}</span></span>
            <span class="preco-dir"><strong>${brl(x.ult.preco)}</strong><span class="${x.pct > 0 ? 'sobe' : 'desce'}">${x.pct > 0 ? '+' : ''}${x.pct.toFixed(1).replace('.', ',')}%</span></span>
          </div>`).join('')}
      </section>` : ''}
    </div>`;
}

function colarLinkNota() {
  const t = prompt('Cole o link da nota fiscal (o endereço que abre ao ler o QR Code com a câmera do iPhone):');
  if (t) processarQRNota(t.trim());
}

let conferencia = null; // { compra, vinculos }

async function processarQRNota(texto) {
  const info = lerLinkNota(texto);
  if (!info) {
    if (!$('#scanner').hidden) {
      $('#scan-card').innerHTML = `<div class="res-head"><span class="res-ico out">${ICON.alert}</span><span><span class="res-tit out">Não é uma nota fiscal</span><span class="res-nome" style="font-size:14px">Esse QR Code não tem o link da Fazenda. Procure o QR Code no rodapé da nota.</span></span></div>`;
    } else toast('Esse link não é de uma nota fiscal (NFC-e).');
    return;
  }
  if (!$('#scanner').hidden) fecharLeitor();
  const existente = S().purchases.find((c) => c.id === info.chave);
  if (existente) { toast(`Essa nota já foi registrada (${fmtDataLonga(existente.date)}).`); abrirCompra(existente.id); return; }
  if (!proxyNotas) { toast('A leitura de notas ainda não foi ativada.'); return; }

  abrirSheet(`<div class="carregando-nota"><span class="res-ico neutro">${ICON.loading}</span><h2>Consultando a nota na Fazenda…</h2><p class="nota-local">Pode levar alguns segundos.</p></div>`);
  let compra;
  try {
    const html = await buscarPaginaNota(proxyNotas, info.url);
    compra = interpretarNota(html, info);
  } catch (e) {
    fecharSheet();
    abrirSheet(falhaNota(info, e.amigavel ? e.message : 'Não consegui ler a página da nota.'));
    return;
  }
  if (!compra.items.length) {
    fecharSheet();
    abrirSheet(falhaNota(info, 'A Fazenda respondeu, mas não consegui identificar os itens desta nota.', compra));
    conferencia = { compra, vinculos: [] };
    return;
  }
  fecharSheet();
  abrirConferencia(compra);
}

function falhaNota(info, msg, compra) {
  return `
    <div style="display:flex;flex-direction:column;gap:16px">
      <h2>Não deu certo</h2>
      <div class="aviso">${ICON.alert}<span>${esc(msg)}</span></div>
      <p class="nota-local">O formato da página da Fazenda pode ter mudado. Copie o link e envie para ajustarmos a leitura.</p>
      <div class="sheet-acoes">
        ${compra && compra.totalEncontrado ? `<button class="btn primary" type="button" data-act="so-total">Registrar só o total (${brl(compra.total)})</button>` : ''}
        <button class="btn ghost" type="button" data-act="copiar-link" data-link="${esc(info.url)}">Copiar link da nota</button>
        <a class="btn ghost" href="${esc(info.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir a nota na Fazenda</a>
        <button class="btn ghost" type="button" data-act="fechar-sheet">Fechar</button>
      </div>
    </div>`;
}

function salvarSoTotal() {
  if (!conferencia) return;
  store.registrarCompra({ ...conferencia.compra, items: [] }, []);
  conferencia = null;
  fecharSheet();
  ui.tab = 'notas';
  render();
  toast('Compra registrada (só o total).');
}

function abrirConferencia(compra) {
  const prods = [...S().products].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
  const vinculos = vincularItens(compra.items, prods);
  conferencia = { compra, vinculos };
  const n = { certo: 0, sugestao: 0, novo: 0 };
  vinculos.forEach((v) => { n[v.status]++; });
  const opcoes = (v, it) => `
    <option value="novo" ${v.status === 'novo' ? 'selected' : ''}>＋ Novo produto: ${esc(nomeBonito(it.desc))}</option>
    <option value="ignorar">Não guardar na despensa</option>
    <optgroup label="Produtos da despensa">
      ${prods.map((p) => `<option value="p:${p.id}" ${v.productId === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
    </optgroup>`;
  const ROTULO = { certo: 'reconhecido', sugestao: 'confira', novo: 'novo' };
  abrirSheet(`
    <div class="conf">
      <div class="conf-topo">
        <div><strong>${esc(compra.store.name)}</strong><span>${fmtDataLonga(compra.date)} · NFC-e</span></div>
        <strong class="conf-total">${brl(compra.total)}</strong>
      </div>
      <div class="conf-resumo">
        <span class="pill certo"><b>${n.certo}</b> reconhecidos</span>
        <span class="pill sugestao"><b>${n.sugestao}</b> confira</span>
        <span class="pill novo"><b>${n.novo}</b> novos</span>
      </div>
      <label class="conf-entrada">
        <span><strong>Dar entrada na despensa</strong><span class="info">Soma as quantidades e tira os itens da lista de compras</span></span>
        <input type="checkbox" id="conf-entrada" checked>
      </label>
      <p class="nota-local">Confira os itens em laranja. Em cada item, escolha o produto da despensa, "Novo produto" ou "Não guardar". O app lembra a escolha nas próximas notas.</p>
      <div class="card">
        ${compra.items.map((it, i) => `
          <div class="conf-item ${vinculos[i].status}">
            <div class="conf-linha">
              <span class="conf-desc">${esc(it.desc)}</span>
              <strong>${brl(it.total)}</strong>
            </div>
            <span class="info">${String(it.qty).replace('.', ',')} ${esc(it.unit)} × ${brl(it.unitPrice)} · <span class="st">${ROTULO[vinculos[i].status]}</span></span>
            <label class="sr" for="conf-${i}">Produto para ${esc(it.desc)}</label>
            <select id="conf-${i}" data-i="${i}">${opcoes(vinculos[i], it)}</select>
          </div>`).join('')}
      </div>
      ${Math.abs(compra.items.reduce((s, it) => s + it.total, 0) - compra.total) > 0.05 && compra.totalEncontrado
        ? `<p class="nota-local">Soma dos itens: ${brl(compra.items.reduce((s, it) => s + it.total, 0))} (diferença de descontos ou acréscimos da nota).</p>` : ''}
      <div class="sheet-acoes">
        <button class="btn primary" type="button" data-act="salvar-compra">Salvar compra</button>
        <button class="btn ghost" type="button" data-act="fechar-sheet">Cancelar</button>
      </div>
    </div>`);
}

function salvarConferencia() {
  if (!conferencia) return;
  const { compra } = conferencia;
  const decisoes = compra.items.map((it, i) => {
    const v = $(`#conf-${i}`)?.value || 'ignorar';
    if (v.startsWith('p:')) return { acao: 'produto', productId: v.slice(2) };
    if (v === 'novo') {
      const code = eanValido(it.code) ? it.code : null;
      return { acao: 'novo', novo: { name: nomeBonito(it.desc), category: it.categoryGuess || 'Mercearia', barcode: code && !store.porCodigo(code) ? code : null } };
    }
    return { acao: 'ignorar' };
  });
  const darEntrada = $('#conf-entrada')?.checked !== false;
  const snap = store.foto();
  const r = store.registrarCompra(compra, decisoes, { darEntrada });
  conferencia = null;
  fecharSheet();
  ui.tab = 'notas';
  render();
  toast(`Compra salva: ${plural(r.vinculados, 'item', 'itens')} na despensa.`, { acao: 'Desfazer', fn: () => store.restaurar(snap) });
}

function abrirCompra(id) {
  const c = S().purchases.find((x) => x.id === id);
  if (!c) return;
  abrirSheet(`
    <div class="conf">
      <div class="conf-topo">
        <div><strong>${esc(c.store?.name || 'Compra')}</strong><span>${fmtDataLonga(c.date)}</span></div>
        <strong class="conf-total">${brl(c.total)}</strong>
      </div>
      ${c.items?.length ? `<div class="card">${c.items.map((it) => {
        const p = it.productId ? store.porId(it.productId) : null;
        return `<div class="conf-item">
          <div class="conf-linha"><span class="conf-desc">${esc(p ? p.name : it.desc)}</span><strong>${brl(it.total)}</strong></div>
          <span class="info">${String(it.qty).replace('.', ',')} ${esc(it.unit)} × ${brl(it.unitPrice)}${p ? '' : ' · fora da despensa'}</span>
        </div>`;
      }).join('')}</div>` : '<p class="nota-local">Compra registrada só com o valor total.</p>'}
      <div class="sheet-acoes">
        ${c.url ? `<a class="btn ghost" href="${esc(c.url)}" target="_blank" rel="noopener" style="text-decoration:none">Abrir a nota na Fazenda</a>` : ''}
        <button class="btn danger" type="button" data-act="excluir-compra" data-id="${esc(c.id)}">Excluir compra</button>
        <button class="btn ghost" type="button" data-act="fechar-sheet">Fechar</button>
      </div>
    </div>`);
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

function abrirProduto({ id = null, barcode = null, name = '', category = 'Mercearia', qty = 1, titulo, aviso, aoConcluir } = {}) {
  const p = id ? store.porId(id) : null;
  if (p) ({ barcode, name, category } = p);
  if (p) qty = qtdDe(p);
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
  const snap = store.foto();
  const p = store.salvarProduto({ id: form.dataset.id || null, barcode: form.dataset.barcode || null, name: nome, category: cat, qty: qtd });
  fecharSheet({ produto: p, snap });
  render();
}

function abrirItemLista() {
  abrirSheet(`
    <form id="form-lista" novalidate>
      <div style="display:flex;flex-direction:column;gap:18px">
        <h2>Adicionar à lista</h2>
        <div class="campo">
          <label for="l-nome">Item</label>
          <input id="l-nome" type="text" list="l-sugestoes" placeholder="Ex.: Creme dental" autocomplete="off" enterkeyhint="done">
          <datalist id="l-sugestoes">${S().products.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
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
  const cat = (form.querySelector('input[name="cat"]:checked') || {}).value || 'Outros';
  const r = store.adicionarNaLista({ name: nome, category: cat });
  if (r.duplicado) { toast('Esse item já está na lista.'); return; }
  fecharSheet();
  render();
}

function guardarMarcados() {
  const snap = store.foto();
  const n = store.guardarMarcados();
  if (!n) return;
  toast(`${plural(n, 'item guardado', 'itens guardados')} (+1 cada). Ajuste a quantidade na despensa se precisar.`, { acao: 'Desfazer', fn: () => store.restaurar(snap) });
}

/* Conta, convite e backup */
function abrirConfig() {
  const naNuvem = store.modo === 'nuvem';
  const casa = naNuvem ? store.casa : null;
  const pessoas = casa?.members?.length || 1;
  abrirSheet(`
    <div style="display:flex;flex-direction:column;gap:16px">
      <h2>${naNuvem ? 'Conta e casa' : 'Backup'}</h2>
      ${naNuvem ? `
        <div class="card-op" style="gap:6px">
          <span class="info">Conectado como</span>
          <strong>${esc(nuvem.user?.email || '')}</strong>
          <span class="info">${pessoas > 1 ? `Despensa compartilhada por ${pessoas} pessoas` : 'Só você nesta despensa por enquanto'}</span>
        </div>
        <div class="card-op">
          <span class="info">Código de convite</span>
          <span class="codigo-grande">${esc(casa?.inviteCode || '······')}</span>
          <button class="btn dark" type="button" data-act="compartilhar-convite" ${casa?.inviteCode ? '' : 'disabled'}>Enviar convite</button>
        </div>`
      : `<p class="nota-local">Modo local: os dados ficam só neste aparelho porque o Firebase ainda não foi configurado.</p>`}
      <div class="sheet-acoes">
        <button class="btn ghost" type="button" data-act="exportar">Exportar backup (.json)</button>
        <label class="btn ghost" for="importar" style="cursor:pointer">Importar backup</label>
        <input id="importar" type="file" accept="application/json,.json" class="sr">
        ${naNuvem ? '<button class="btn ghost" type="button" data-act="sair">Sair da conta</button>' : ''}
        <button class="btn danger" type="button" data-act="apagar-tudo">Apagar todos os dados${naNuvem ? ' da casa' : ''}</button>
        <button class="btn ghost" type="button" data-act="fechar-sheet">Fechar</button>
      </div>
      <p class="nota-local">${plural(S().products.length, 'produto cadastrado', 'produtos cadastrados')} · ${plural(S().list.length, 'item', 'itens')} na lista.</p>
    </div>`);
}

async function compartilharConvite() {
  const code = store.casa?.inviteCode;
  if (!code) return;
  const texto = `Entre na nossa despensa:\n1. Abra ${URL_APP} no Safari\n2. Crie sua conta\n3. Use o código de convite: ${code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Convite da Despensa', text: texto }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(texto); toast('Convite copiado. Cole no WhatsApp.'); }
  catch { toast(`Código de convite: ${code}`); }
}

async function exportar() {
  const nome = `despensa-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify({ v: 1, ...S() }, null, 2)], { type: 'application/json' });
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
    if (!confirm(`Substituir os dados atuais${store.modo === 'nuvem' ? ' da casa (para todos)' : ''} por este backup (${plural(dados.products.length, 'produto', 'produtos')})?`)) return;
    await store.substituirTudo(dados);
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
  ultimo: '', ultimoEm: 0, audio: null, ultimoSnap: null, tipo: 'produto', detectorQR: null,
  modo: localStorage.getItem(KEY_MODO) === 'saida' ? 'saida' : 'entrada',
};
const quadro = document.createElement('canvas');
const ctxQuadro = quadro.getContext('2d', { willReadFrequently: true });

async function obterDetector() {
  if (scan.tipo === 'nota') return obterDetectorQR();
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

async function obterDetectorQR() {
  if (scan.detectorQR) return scan.detectorQR;
  if ('BarcodeDetector' in window) {
    try {
      const sup = await window.BarcodeDetector.getSupportedFormats();
      if (sup.includes('qr_code')) { scan.detectorQR = new window.BarcodeDetector({ formats: ['qr_code'] }); return scan.detectorQR; }
    } catch { /* usa o leitor embutido */ }
  }
  const api = window.BarcodeDetectionAPI;
  if (!api) throw new Error('leitor-indisponivel');
  api.setZXingModuleOverrides({
    locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL(`vendor/${path}`, location.href).href : prefix + path),
  });
  scan.detectorQR = new api.BarcodeDetector({ formats: ['qr_code'] });
  return scan.detectorQR;
}

function atualizarModo() {
  const s = $('#scanner');
  s.classList.toggle('modo-entrada', scan.modo === 'entrada');
  s.classList.toggle('modo-saida', scan.modo === 'saida');
  s.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === scan.modo)));
  s.classList.toggle('tipo-nota', scan.tipo === 'nota');
  $('.scan-title', s).textContent = scan.tipo === 'nota' ? 'Ler QR Code da nota' : 'Ler código de barras';
  $('.scan-hint', s).innerHTML = scan.tipo === 'nota'
    ? 'Aponte para o QR Code no rodapé da nota.'
    : 'Aponte para o código de barras.<br>Leitura contínua: vá passando os produtos.';
}

async function abrirLeitor(tipo = 'produto') {
  if (ui.tela !== 'app') return;
  scan.tipo = tipo;
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
      cartaoErro('Permita o uso da câmera. No iPhone: Ajustes › Apps › Safari › Câmera › Permitir. Se o app estiver instalado na tela inicial, feche e abra de novo depois de permitir.');
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
      const w = v.videoWidth, h = v.videoHeight;
      let cw = Math.round(w * 0.85), ch = Math.round(h * 0.5);
      if (scan.tipo === 'nota') { cw = ch = Math.round(Math.min(w, h) * 0.8); } // QR Code: área quadrada maior
      quadro.width = cw; quadro.height = ch;
      ctxQuadro.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
      const res = await (scan.tipo === 'nota' ? scan.detectorQR : scan.detector).detect(quadro);
      if (res.length && !scan.pausado) aoLerCodigo(res[0].rawValue);
    } catch (e) { console.warn('leitura', e); }
    scan.ocupado = false;
  }
  scan.timer = setTimeout(lacoLeitura, 120);
}

function aoLerCodigo(code) {
  const t = Date.now();
  if (code === scan.ultimo && t - scan.ultimoEm < 2500) { scan.ultimoEm = t; return; }
  scan.ultimo = code;
  scan.ultimoEm = t;
  bip();
  if (scan.tipo === 'nota') { processarQRNota(code); return; }
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
  if (!code || !store) return;
  const p = store.porCodigo(code);
  if (scan.modo === 'entrada') {
    if (p) {
      const snap = store.foto();
      const r = store.entrada(p, 1);
      cartaoResultado({ tipo: 'ok', titulo: 'Entrada registrada  +1', nome: p.name, qtd: r.qty, snap });
    } else {
      cadastrarPeloLeitor(code, 1);
    }
  } else if (p) {
    const snap = store.foto();
    const r = store.saida(p);
    cartaoResultado({
      tipo: 'out',
      titulo: r.antes === 0 ? 'Já estava zerado' : 'Saída registrada  −1',
      nome: p.name, qtd: r.qty, snap: r.antes === 0 && !r.foiParaLista ? null : snap,
      nota: r.qty === 0 ? 'Acabou: está na lista de compras.' : '',
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

function cartaoInicial() {
  if (scan.tipo === 'nota') {
    $('#scan-card').innerHTML = `
      <p class="res-nota"><strong>Nota fiscal:</strong> o app consulta a nota na Fazenda e mostra os itens para você conferir antes de salvar.</p>
      <button class="btn ghost" type="button" data-act="colar-link" style="min-height:48px">Colar link da nota</button>`;
    return;
  }
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
  scan.ultimoSnap = snap || null;
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

/* ---------- nuvem: login e casa ---------- */
const ERROS_AUTH = {
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.',
  'auth/missing-password': 'Digite a senha.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail. Use "Já tenho conta: entrar".',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem conexão com a internet.',
  'auth/too-many-requests': 'Muitas tentativas. Espere alguns minutos e tente de novo.',
  'auth/operation-not-allowed': 'Login por e-mail não está ativado no Firebase (Authentication › Método de login).',
};
const msgErro = (e) => ERROS_AUTH[e?.code] || `Não foi possível concluir (${e?.code || e?.message || 'erro'}).`;

async function iniciarNuvem() {
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.initializeAuth(app, { persistence: [fb.indexedDBLocalPersistence, fb.browserLocalPersistence] });
  const db = fb.initializeFirestore(app, { localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  if (EMULADOR) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
  Object.assign(nuvem, { fb, auth, db });

  fb.onAuthStateChanged(auth, async (user) => {
    nuvem.user = user;
    if (!user) { usarStore(null); ui.tela = 'login'; render(); return; }
    ui.tela = 'carregando'; render();
    const chave = `despensa.casa.${user.uid}`;
    let hid = localStorage.getItem(chave);
    try {
      const s = await fb.getDoc(fb.doc(db, 'users', user.uid));
      hid = s.exists() ? s.data().householdId || null : null;
      if (hid) localStorage.setItem(chave, hid); else localStorage.removeItem(chave);
    } catch { /* offline: usa a casa guardada no aparelho */ }
    if (!hid) { usarStore(null); ui.tela = 'casa'; render(); return; }
    abrirCasa(hid);
  });
}

async function abrirCasa(hid) {
  usarStore(new CloudStore(nuvem.fb, nuvem.db, hid));
  ui.tela = 'app';
  render();
  await store.pronto;
  oferecerMigracao(hid);
}

function gerarCodigo() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(6));
  return [...r].map((n) => alfabeto[n % alfabeto.length]).join('');
}

async function criarCasa() {
  const { fb, db, user } = nuvem;
  const hid = uid();
  let code = gerarCodigo();
  await fb.setDoc(fb.doc(db, 'households', hid), { owner: user.uid, members: [user.uid], inviteCode: code, createdAt: fb.serverTimestamp() });
  for (let tentativa = 0; ; tentativa++) {
    try {
      await fb.setDoc(fb.doc(db, 'invites', code), { hid, createdBy: user.uid });
      break;
    } catch (e) {
      if (tentativa >= 3) throw e;
      code = gerarCodigo(); // código já usado por outra casa: gera outro
      await fb.updateDoc(fb.doc(db, 'households', hid), { inviteCode: code });
    }
  }
  await fb.setDoc(fb.doc(db, 'users', user.uid), { householdId: hid, email: user.email });
  localStorage.setItem(`despensa.casa.${user.uid}`, hid);
  return hid;
}

async function entrarComCodigo(code) {
  const { fb, db, user } = nuvem;
  const inv = await fb.getDoc(fb.doc(db, 'invites', code));
  if (!inv.exists()) { const e = new Error('Código não encontrado. Confira as letras e números.'); e.amigavel = true; throw e; }
  const hid = inv.data().hid;
  await fb.updateDoc(fb.doc(db, 'households', hid), { members: fb.arrayUnion(user.uid), lastJoinCode: code });
  await fb.setDoc(fb.doc(db, 'users', user.uid), { householdId: hid, email: user.email });
  localStorage.setItem(`despensa.casa.${user.uid}`, hid);
  return hid;
}

// Dados criados antes do login (modo local) podem ser enviados para a casa uma única vez
function oferecerMigracao(hid) {
  const flag = `despensa.migrado.${hid}`;
  if (localStorage.getItem(flag)) return;
  let local = null;
  try { local = JSON.parse(localStorage.getItem(KEY_LOCAL)); } catch { /* nada */ }
  if (!local || !Array.isArray(local.products) || !local.products.length) { localStorage.setItem(flag, '1'); return; }
  abrirSheet(`
    <div style="display:flex;flex-direction:column;gap:16px">
      <h2>Dados deste aparelho</h2>
      <p class="nota-local" style="font-size:15px;color:var(--text)">Este celular tem ${plural(local.products.length, 'produto', 'produtos')} cadastrados antes do login. Quer enviar para a despensa da casa? Produtos iguais (mesmo código ou nome) têm as quantidades somadas.</p>
      <div class="sheet-acoes">
        <button class="btn primary" type="button" data-act="migrar-sim">Enviar para a casa</button>
        <button class="btn ghost" type="button" data-act="migrar-nao">Agora não</button>
      </div>
    </div>`);
}

async function migrar(sim) {
  const hid = store.hid;
  const raw = localStorage.getItem(KEY_LOCAL);
  if (sim && raw) {
    await store.mesclar(JSON.parse(raw));
    localStorage.setItem('despensa.v1.backup', raw); // cópia de segurança
    localStorage.removeItem(KEY_LOCAL);
    toast('Produtos enviados para a casa.');
  }
  localStorage.setItem(`despensa.migrado.${hid}`, '1');
  fecharSheet();
  render();
}

async function sair() {
  if (!confirm('Sair da conta neste aparelho?')) return;
  fecharSheet();
  usarStore(null);
  await nuvem.fb.signOut(nuvem.auth);
}

/* ---------- eventos ---------- */
document.addEventListener('click', async (e) => {
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
    case 'ler': abrirLeitor('produto'); break;
    case 'ler-nota': abrirLeitor('nota'); break;
    case 'colar-link': if (!$('#scanner').hidden) fecharLeitor(); colarLinkNota(); break;
    case 'ver-compra': abrirCompra(id); break;
    case 'excluir-compra': {
      const c = S().purchases.find((x) => x.id === id);
      if (c && confirm('Excluir esta compra do histórico de gastos? As quantidades da despensa não mudam.')) {
        const snap = store.foto();
        store.excluirCompra(id);
        fecharSheet();
        toast('Compra excluída.', { acao: 'Desfazer', fn: () => store.restaurar(snap) });
      }
      break;
    }
    case 'salvar-compra': salvarConferencia(); break;
    case 'so-total': salvarSoTotal(); break;
    case 'copiar-link': {
      try { await navigator.clipboard.writeText(el.dataset.link); toast('Link copiado.'); } catch { toast(el.dataset.link); }
      break;
    }
    case 'mes-ant': case 'mes-prox': {
      const [a, m] = ui.mes.split('-').map(Number);
      const d = new Date(a, m - 1 + (el.dataset.act === 'mes-prox' ? 1 : -1), 1);
      ui.mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      render();
      break;
    }
    case 'fechar-leitor': fecharLeitor(); break;
    case 'digitar': digitarCodigo(); break;
    case 'cartao-inicial': cartaoInicial(); break;
    case 'desfazer':
      if (scan.ultimoSnap) { store.restaurar(scan.ultimoSnap); scan.ultimoSnap = null; cartaoInicial(); toast('Leitura desfeita.'); }
      break;
    case 'cadastrar-zerado': cadastrarPeloLeitor(el.dataset.code, 0); break;
    case 'mais': { const p = store.porId(id); if (p) store.entrada(p, 1); break; }
    case 'menos': {
      const p = store.porId(id);
      if (p) {
        const snap = store.foto();
        const r = store.saida(p);
        if (r.foiParaLista) toast(`${p.name} acabou e foi para a lista.`, { acao: 'Desfazer', fn: () => store.restaurar(snap) });
      }
      break;
    }
    case 'editar': abrirProduto({ id }); break;
    case 'novo': abrirProduto({ qty: 1 }); break;
    case 'config': abrirConfig(); break;
    case 'exportar': exportar(); break;
    case 'compartilhar-convite': compartilharConvite(); break;
    case 'apagar-tudo':
      if (confirm(store.modo === 'nuvem'
        ? 'Apagar TODOS os produtos e a lista de compras da casa? Isso apaga para todas as pessoas e não pode ser desfeito (a não ser que você tenha um backup).'
        : 'Apagar todos os produtos e a lista de compras deste aparelho? Isso não pode ser desfeito (a não ser que você tenha um backup).')) {
        await store.substituirTudo({ products: [], list: [] });
        fecharSheet(); render(); toast('Dados apagados.');
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
      const p = store.porId(pid);
      if (p && confirm(`Excluir "${p.name}" da despensa?`)) {
        const snap = store.foto();
        store.excluirProduto(pid);
        fecharSheet(); render();
        toast('Produto excluído.', { acao: 'Desfazer', fn: () => store.restaurar(snap) });
      }
      break;
    }
    case 'add-lista': abrirItemLista(); break;
    case 'tirar-lista': {
      const snap = store.foto();
      store.tirarItem(id);
      toast('Item removido da lista.', { acao: 'Desfazer', fn: () => store.restaurar(snap) });
      break;
    }
    case 'guardar': guardarMarcados(); break;

    // conta
    case 'alternar-login':
      ui.modoLogin = ui.modoLogin === 'entrar' ? 'criar' : 'entrar';
      $('#view').innerHTML = telaLogin();
      break;
    case 'esqueci-senha': {
      const email = ($('#l-email')?.value || '').trim();
      if (!email) { $('#login-erro').textContent = 'Digite seu e-mail acima e toque de novo em "Esqueci minha senha".'; break; }
      try { await nuvem.fb.sendPasswordResetEmail(nuvem.auth, email); $('#login-erro').textContent = ''; toast('Enviamos um e-mail para redefinir a senha.'); }
      catch (err) { $('#login-erro').textContent = msgErro(err); }
      break;
    }
    case 'criar-casa': {
      if (ui.ocupado) break;
      ui.ocupado = true; el.disabled = true; el.textContent = 'Criando…';
      try { const hid = await criarCasa(); await abrirCasa(hid); toast('Despensa criada. Envie o convite pela engrenagem.'); }
      catch (err) { console.error(err); toast(`Não foi possível criar (${err.code || err.message}). Verifique a internet.`); el.disabled = false; el.textContent = 'Criar a despensa da casa'; }
      ui.ocupado = false;
      break;
    }
    case 'sair': sair(); break;
    case 'migrar-sim': migrar(true); break;
    case 'migrar-nao': migrar(false); break;
    default: break;
  }
});

document.addEventListener('change', (e) => {
  if (e.target.matches('[data-act="marcar"]')) {
    store.marcarItem(e.target.dataset.id, e.target.checked);
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

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.id === 'form-produto') salvarProduto(f);
  else if (f.id === 'form-lista') salvarItemLista(f);
  else if (f.id === 'form-login') {
    if (ui.ocupado) return;
    const email = $('#l-email').value.trim();
    const senha = $('#l-senha').value;
    const btn = f.querySelector('button[type="submit"]');
    ui.ocupado = true; btn.disabled = true;
    $('#login-erro').textContent = '';
    try {
      if (ui.modoLogin === 'criar') await nuvem.fb.createUserWithEmailAndPassword(nuvem.auth, email, senha);
      else await nuvem.fb.signInWithEmailAndPassword(nuvem.auth, email, senha);
    } catch (err) {
      $('#login-erro').textContent = msgErro(err);
      btn.disabled = false;
    }
    ui.ocupado = false;
  } else if (f.id === 'form-convite') {
    if (ui.ocupado) return;
    const code = $('#c-codigo').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { $('#convite-erro').textContent = 'O código tem 6 letras e números.'; return; }
    const btn = f.querySelector('button[type="submit"]');
    ui.ocupado = true; btn.disabled = true;
    $('#convite-erro').textContent = '';
    try { const hid = await entrarComCodigo(code); await abrirCasa(hid); toast('Pronto! Você está na despensa da casa.'); }
    catch (err) {
      console.error(err);
      $('#convite-erro').textContent = err.amigavel ? err.message : (String(err.code).includes('permission') ? 'Convite inválido para esta casa.' : `Não foi possível entrar (${err.code || err.message}).`);
      btn.disabled = false;
    }
    ui.ocupado = false;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet-bd').hidden) fecharSheet();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && scan.stream) fecharLeitor();
});

/* ---------- início ---------- */
if (firebaseConfig) {
  render();
  iniciarNuvem().catch((e) => {
    console.error(e);
    $('#view').innerHTML = vazio('Não foi possível iniciar', 'Verifique a internet e abra o app de novo.');
  });
} else {
  usarStore(new LocalStore());
  ui.tela = 'app';
  render();
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Exposto só para testes
window.__despensa = { processarCodigo, processarQRNota, abrirConferencia, get state() { return S(); }, get store() { return store; }, scan, nuvem };
