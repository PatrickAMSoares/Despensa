// Camada de dados da despensa.
// Toda alteração vira uma lista de "mudanças" aplicada primeiro na memória (tela responde na hora)
// e depois gravada: no aparelho (LocalStore) ou no Firestore (CloudStore, compartilhado pela casa).
//
// Mudança: { col: 'products'|'list', id, op: 'set'|'inc'|'delete', data }
//   set    → grava o documento inteiro (data sem o id)
//   inc    → soma valores numéricos (data.qty) — usa increment() na nuvem, então duas pessoas
//            lendo o mesmo produto ao mesmo tempo não se atropelam
//   delete → remove

export const KEY_LOCAL = 'despensa.v1';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
export const agoraISO = () => new Date().toISOString();
export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const semId = ({ id, ...resto }) => resto;
const copia = (o) => JSON.parse(JSON.stringify(o));

class BaseStore {
  constructor() {
    this.state = { products: [], list: [] };
    this.ouvintes = new Set();
  }
  aoMudar(fn) { this.ouvintes.add(fn); return () => this.ouvintes.delete(fn); }
  avisar() { this.ouvintes.forEach((fn) => fn(this.state)); }

  porId(id) { return this.state.products.find((p) => p.id === id); }
  porCodigo(code) { return this.state.products.find((p) => p.barcode === code); }
  foto() { return copia(this.state); }

  aplicarNaMemoria(mudancas) {
    for (const m of mudancas) {
      const arr = this.state[m.col];
      const i = arr.findIndex((x) => x.id === m.id);
      if (m.op === 'delete') { if (i >= 0) arr.splice(i, 1); }
      else if (m.op === 'set') { const d = { id: m.id, ...copia(m.data) }; if (i >= 0) arr[i] = d; else arr.push(d); }
      else if (m.op === 'inc' && i >= 0) {
        for (const [k, v] of Object.entries(m.data)) {
          if (typeof v === 'number') arr[i][k] = (Number(arr[i][k]) || 0) + v; else arr[i][k] = v;
        }
      }
    }
  }

  async commit(mudancas) {
    if (!mudancas.length) return;
    this.aplicarNaMemoria(mudancas);
    this.avisar();
    await this.gravar(mudancas);
  }

  /* ---------- regras da despensa ---------- */
  itemDaLista(p, motivo) {
    return { col: 'list', id: uid(), op: 'set', data: { productId: p.id, name: p.name, category: p.category, checked: false, addedAt: agoraISO(), motivo } };
  }
  tirarDaListaMud(pid) {
    return this.state.list.filter((i) => i.productId === pid).map((i) => ({ col: 'list', id: i.id, op: 'delete' }));
  }

  entrada(p, n = 1) {
    const mud = [{ col: 'products', id: p.id, op: 'inc', data: { qty: n, updatedAt: agoraISO() } }, ...this.tirarDaListaMud(p.id)];
    const qty = (p.qty || 0) + n;
    this.commit(mud);
    return { qty };
  }

  saida(p) {
    const antes = Math.max(0, p.qty || 0);
    const mud = [];
    if (antes > 0) mud.push({ col: 'products', id: p.id, op: 'inc', data: { qty: -1, updatedAt: agoraISO() } });
    const qty = Math.max(0, antes - 1);
    const foiParaLista = qty === 0 && !this.state.list.some((i) => i.productId === p.id);
    if (foiParaLista) mud.push(this.itemDaLista(p, 'acabou'));
    this.commit(mud);
    return { antes, qty, foiParaLista };
  }

  salvarProduto({ id, barcode, name, category, qty }) {
    let p = id ? this.porId(id) : null;
    if (!p && barcode) p = this.porCodigo(barcode); // não duplica o mesmo código
    const agora = agoraISO();
    const mud = [];
    let final;
    if (p) {
      final = { ...semId(p), name, category, qty, updatedAt: agora };
      mud.push({ col: 'products', id: p.id, op: 'set', data: final });
      final.id = p.id;
      this.state.list.filter((i) => i.productId === p.id).forEach((i) => mud.push({ col: 'list', id: i.id, op: 'set', data: { ...semId(i), name, category } }));
    } else {
      final = { id: uid(), barcode: barcode || null, name, category, qty, createdAt: agora, updatedAt: agora };
      mud.push({ col: 'products', id: final.id, op: 'set', data: semId(final) });
      // item escrito à mão na lista com o mesmo nome passa a apontar para o produto
      this.state.list.filter((i) => !i.productId && norm(i.name) === norm(name))
        .forEach((i) => mud.push({ col: 'list', id: i.id, op: 'set', data: { ...semId(i), productId: final.id } }));
    }
    if (qty === 0) {
      if (!this.state.list.some((i) => i.productId === final.id) && !mud.some((m) => m.col === 'list' && m.data && m.data.productId === final.id)) mud.push(this.itemDaLista(final, 'acabou'));
    } else {
      mud.push(...this.tirarDaListaMud(final.id));
    }
    this.commit(mud);
    return final;
  }

  excluirProduto(id) {
    this.commit([{ col: 'products', id, op: 'delete' }, ...this.tirarDaListaMud(id)]);
  }

  adicionarNaLista({ name, category }) {
    const existente = this.state.products.find((p) => norm(p.name) === norm(name));
    if (existente) {
      if (this.state.list.some((i) => i.productId === existente.id)) return { duplicado: true };
      this.commit([this.itemDaLista(existente, 'manual')]);
    } else {
      this.commit([{ col: 'list', id: uid(), op: 'set', data: { productId: null, name, category, checked: false, addedAt: agoraISO(), motivo: 'manual' } }]);
    }
    return { ok: true };
  }

  marcarItem(id, checked) {
    const i = this.state.list.find((x) => x.id === id);
    if (i) this.commit([{ col: 'list', id, op: 'set', data: { ...semId(i), checked } }]);
  }

  tirarItem(id) { this.commit([{ col: 'list', id, op: 'delete' }]); }

  guardarMarcados() {
    const marcados = this.state.list.filter((i) => i.checked);
    const mud = [];
    const agora = agoraISO();
    for (const i of marcados) {
      let p = i.productId ? this.porId(i.productId) : this.state.products.find((x) => norm(x.name) === norm(i.name));
      if (p) mud.push({ col: 'products', id: p.id, op: 'inc', data: { qty: 1, updatedAt: agora } });
      else {
        const novo = { barcode: null, name: i.name, category: i.category, qty: 1, createdAt: agora, updatedAt: agora };
        mud.push({ col: 'products', id: uid(), op: 'set', data: novo });
      }
      if (p) this.state.list.filter((x) => x.productId === p.id && x.id !== i.id).forEach((x) => mud.push({ col: 'list', id: x.id, op: 'delete' }));
      mud.push({ col: 'list', id: i.id, op: 'delete' });
    }
    this.commit(mud);
    return marcados.length;
  }

  // Volta ao estado de uma foto anterior (usado pelo "Desfazer"): grava só o que mudou.
  restaurar(antes) {
    const mud = [];
    for (const col of ['products', 'list']) {
      const ant = new Map(antes[col].map((x) => [x.id, x]));
      const atual = new Map(this.state[col].map((x) => [x.id, x]));
      for (const [id, x] of ant) if (JSON.stringify(x) !== JSON.stringify(atual.get(id))) mud.push({ col, id, op: 'set', data: semId(x) });
      for (const id of atual.keys()) if (!ant.has(id)) mud.push({ col, id, op: 'delete' });
    }
    this.commit(mud);
  }

  substituirTudo(dados) {
    const mud = [];
    for (const col of ['products', 'list']) {
      this.state[col].forEach((x) => mud.push({ col, id: x.id, op: 'delete' }));
      (dados[col] || []).forEach((x) => mud.push({ col, id: x.id || uid(), op: 'set', data: semId(x) }));
    }
    return this.commit(mud);
  }

  // Junta dados de outro aparelho: mesmo código ou mesmo nome soma a quantidade.
  mesclar(dados) {
    const mud = [];
    const mapaIds = {};
    for (const p of dados.products || []) {
      const igual = (p.barcode && this.porCodigo(p.barcode)) || this.state.products.find((x) => norm(x.name) === norm(p.name));
      if (igual) {
        mapaIds[p.id] = igual.id;
        if (p.qty) mud.push({ col: 'products', id: igual.id, op: 'inc', data: { qty: p.qty, updatedAt: agoraISO() } });
      } else {
        const id = uid();
        mapaIds[p.id] = id;
        mud.push({ col: 'products', id, op: 'set', data: semId(p) });
      }
    }
    for (const i of dados.list || []) {
      const pid = i.productId ? mapaIds[i.productId] || null : null;
      if (pid && this.state.list.some((x) => x.productId === pid)) continue;
      mud.push({ col: 'list', id: uid(), op: 'set', data: { ...semId(i), productId: pid } });
    }
    return this.commit(mud);
  }
}

/* ---------- só neste aparelho ---------- */
export class LocalStore extends BaseStore {
  constructor() {
    super();
    this.modo = 'local';
    try {
      const s = JSON.parse(localStorage.getItem(KEY_LOCAL));
      if (s && Array.isArray(s.products)) this.state = { products: s.products, list: Array.isArray(s.list) ? s.list : [] };
    } catch { /* começa vazio */ }
    this.pronto = Promise.resolve();
  }
  async gravar() {
    localStorage.setItem(KEY_LOCAL, JSON.stringify({ v: 1, ...this.state }));
  }
  parar() {}
}

/* ---------- na nuvem, compartilhado pela casa ---------- */
export class CloudStore extends BaseStore {
  constructor(fb, db, hid) {
    super();
    this.modo = 'nuvem';
    this.fb = fb;
    this.db = db;
    this.hid = hid;
    this.casa = null;
    this.carregados = { products: false, list: false };
    let liberar;
    this.pronto = new Promise((r) => { liberar = r; });
    const { collection, onSnapshot, doc } = fb;
    const ouvir = (col) => onSnapshot(collection(db, 'households', hid, col), { includeMetadataChanges: false }, (snap) => {
      this.state[col] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.carregados[col] = true;
      if (this.carregados.products && this.carregados.list) liberar();
      this.avisar();
    }, (err) => { console.error('snapshot', col, err); this.erro = err; liberar(); this.avisar(); });
    this.cancelar = [
      ouvir('products'),
      ouvir('list'),
      onSnapshot(doc(db, 'households', hid), (d) => { this.casa = d.exists() ? d.data() : null; this.avisar(); }, () => {}),
    ];
  }

  async gravar(mudancas) {
    const { doc, writeBatch, increment } = this.fb;
    // lotes de até 450 operações (limite do Firestore é 500)
    for (let i = 0; i < mudancas.length; i += 450) {
      const lote = writeBatch(this.db);
      for (const m of mudancas.slice(i, i + 450)) {
        const ref = doc(this.db, 'households', this.hid, m.col, m.id);
        if (m.op === 'delete') lote.delete(ref);
        else if (m.op === 'set') lote.set(ref, m.data);
        else if (m.op === 'inc') {
          const d = {};
          for (const [k, v] of Object.entries(m.data)) d[k] = typeof v === 'number' ? increment(v) : v;
          lote.update(ref, d);
        }
      }
      // Não espera o servidor: offline, o Firestore guarda e envia quando a internet voltar.
      lote.commit().catch((e) => { console.error('gravar', e); this.erro = e; this.avisar(); });
    }
  }

  parar() { this.cancelar.forEach((fn) => fn()); }
}
