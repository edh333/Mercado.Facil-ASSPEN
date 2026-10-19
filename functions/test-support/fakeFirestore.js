// Firestore EM MEMÓRIA para os testes de integração das Cloud Functions.
//
// Por que existe: o emulador oficial do Firestore é um JAR Java — este ambiente
// não tem Java. Em vez de mockar função por função (o que não exercita a
// transação de verdade), implementamos aqui o SUBCONJUNTO da API que os fluxos
// de dinheiro usam, com a mesma semântica relevante:
//   - set() substitui o doc; set({merge}) e update() mesclam;
//   - FieldValue.increment/arrayUnion/arrayRemove/delete resolvem contra o valor
//     ATUAL do campo (inclusive num set() sem merge — como o Firestore real);
//   - runTransaction aplica as escritas na ordem (sem concorrência nos testes),
//     e erros (HttpsError) atravessam a transação intactos;
//   - snapshots expõem .exists/.data()/.id/.ref; queries .empty/.docs.
//
// NÃO é um Firestore completo: só o necessário para testar venda, estorno,
// devolução por alvará e sessão de caixa. Qualquer recurso não usado por esses
// fluxos foi deliberadamente omitido.

const OMIT = Symbol("omit");

class FakeTimestamp {
  constructor(seconds, nanoseconds = 0) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6));
  }
  toMillis() {
    return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6);
  }
  valueOf() {
    return this.toMillis();
  }
  static now() {
    const ms = Date.now();
    return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
  static fromDate(d) {
    const ms = d.getTime();
    return new FakeTimestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6);
  }
}

function isSentinel(v) {
  return v !== null && typeof v === "object" && typeof v.__fv === "string";
}

function clone(v) {
  if (v === null || typeof v !== "object") return v;
  if (v instanceof FakeTimestamp) return v;
  if (Array.isArray(v)) return v.map(clone);
  const out = {};
  for (const k of Object.keys(v)) out[k] = clone(v[k]);
  return out;
}

function eqValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function resolveSentinel(s, current) {
  switch (s.__fv) {
    case "increment":
      return (typeof current === "number" ? current : 0) + Number(s.n);
    case "arrayUnion": {
      const base = Array.isArray(current) ? current.slice() : [];
      for (const val of s.values) {
        if (!base.some((x) => eqValue(x, val))) base.push(clone(val));
      }
      return base;
    }
    case "arrayRemove": {
      const base = Array.isArray(current) ? current : [];
      return base.filter((x) => !s.values.some((val) => eqValue(x, val)));
    }
    case "delete":
      return OMIT;
    case "serverTimestamp":
      return FakeTimestamp.now();
    default:
      return current;
  }
}

function matches(doc, filter) {
  const v = doc ? doc[filter.f] : undefined;
  switch (filter.op) {
    case "==": return eqValue(v, filter.v);
    case "!=": return !eqValue(v, filter.v);
    case ">": return v > filter.v;
    case ">=": return v >= filter.v;
    case "<": return v < filter.v;
    case "<=": return v <= filter.v;
    case "array-contains":
      return Array.isArray(v) && v.some((x) => eqValue(x, filter.v));
    case "in":
      return Array.isArray(filter.v) && filter.v.some((x) => eqValue(x, v));
    default:
      throw new Error(`Operador não suportado no fake: ${filter.op}`);
  }
}

class DocSnapshot {
  constructor(ref, data) {
    this.ref = ref;
    this.id = ref.id;
    this._data = data;
  }
  get exists() {
    return this._data !== undefined;
  }
  data() {
    return this._data === undefined ? undefined : clone(this._data);
  }
  get(field) {
    return this._data === undefined ? undefined : clone(this._data[field]);
  }
}

class QuerySnapshot {
  constructor(docs) {
    this.docs = docs;
    this.size = docs.length;
  }
  get empty() {
    return this.docs.length === 0;
  }
  forEach(cb) {
    this.docs.forEach(cb);
  }
}

class DocRef {
  constructor(db, coll, id) {
    this.db = db;
    this.coll = coll;
    this.id = id;
  }
  get path() {
    return `${this.coll}/${this.id}`;
  }
  _raw() {
    return this.db._readRaw(this.coll, this.id);
  }
  async get() {
    const d = this._raw();
    return new DocSnapshot(this, d);
  }
  async set(data, opts = {}) {
    this.db._applySet(this, data, opts || {});
  }
  async update(data) {
    this.db._applyUpdate(this, data);
  }
  async delete() {
    const m = this.db._store.get(this.coll);
    if (m) m.delete(this.id);
  }
}

class Query {
  constructor(db, coll, filters = [], limitN = null, order = null) {
    this.db = db;
    this.coll = coll;
    this.filters = filters;
    this.limitN = limitN;
    this.order = order;
  }
  where(field, op, value) {
    return new Query(this.db, this.coll, [...this.filters, { f: field, op, v: value }], this.limitN, this.order);
  }
  limit(n) {
    return new Query(this.db, this.coll, this.filters, n, this.order);
  }
  orderBy(field, dir = "asc") {
    return new Query(this.db, this.coll, this.filters, this.limitN, { f: field, dir });
  }
  async get() {
    const m = this.db._store.get(this.coll) || new Map();
    let docs = [...m.entries()].map(
      ([id, data]) => new DocSnapshot(new DocRef(this.db, this.coll, id), data)
    );
    for (const flt of this.filters) docs = docs.filter((d) => matches(d._data, flt));
    if (this.order) {
      const { f, dir } = this.order;
      docs.sort((a, b) => {
        const av = a._data?.[f];
        const bv = b._data?.[f];
        if (av === bv) return 0;
        const r = av > bv ? 1 : -1;
        return dir === "desc" ? -r : r;
      });
    }
    if (this.limitN !== null && this.limitN !== undefined) docs = docs.slice(0, this.limitN);
    return new QuerySnapshot(docs);
  }
}

class CollectionRef extends Query {
  constructor(db, name) {
    super(db, name);
    this.name = name;
  }
  doc(id) {
    return new DocRef(this.db, this.name, id || this.db._autoId());
  }
  async add(data) {
    const ref = this.doc();
    await ref.set(data);
    return ref;
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
  }
  async get(ref) {
    return ref.get();
  }
  set(ref, data, opts) {
    this.db._applySet(ref, data, opts || {});
  }
  update(ref, data) {
    this.db._applyUpdate(ref, data);
  }
  delete(ref) {
    const m = this.db._store.get(ref.coll);
    if (m) m.delete(ref.id);
  }
}

class FakeFirestore {
  constructor() {
    this._store = new Map();
    this._counter = 0;
  }
  _autoId() {
    this._counter += 1;
    return `auto${String(this._counter).padStart(6, "0")}${Math.random().toString(36).slice(2, 6)}`;
  }
  _coll(name) {
    if (!this._store.has(name)) this._store.set(name, new Map());
    return this._store.get(name);
  }
  _readRaw(coll, id) {
    const m = this._store.get(coll);
    return m ? m.get(id) : undefined;
  }
  collection(name) {
    return new CollectionRef(this, name);
  }
  _applySet(ref, data, opts) {
    const existing = ref._raw();
    const base = opts && opts.merge ? clone(existing || {}) : {};
    for (const [k, v] of Object.entries(data)) {
      if (isSentinel(v)) {
        const resolved = resolveSentinel(v, existing ? existing[k] : undefined);
        if (resolved === OMIT) delete base[k];
        else base[k] = resolved;
      } else {
        base[k] = clone(v);
      }
    }
    this._coll(ref.coll).set(ref.id, base);
  }
  _applyUpdate(ref, data) {
    const existing = ref._raw();
    if (existing === undefined) {
      throw new Error(`No document to update: ${ref.path}`);
    }
    const base = clone(existing);
    for (const [k, v] of Object.entries(data)) {
      if (isSentinel(v)) {
        const resolved = resolveSentinel(v, existing[k]);
        if (resolved === OMIT) delete base[k];
        else base[k] = resolved;
      } else {
        base[k] = clone(v);
      }
    }
    this._coll(ref.coll).set(ref.id, base);
  }
  async runTransaction(fn) {
    return fn(new FakeTransaction(this));
  }
  batch() {
    const db = this;
    const ops = [];
    return {
      set(ref, data, opts) { ops.push(() => db._applySet(ref, data, opts || {})); return this; },
      update(ref, data) { ops.push(() => db._applyUpdate(ref, data)); return this; },
      delete(ref) { ops.push(() => ref.delete()); return this; },
      async commit() { for (const op of ops) await op(); },
    };
  }
}

export function createFakeFirestore() {
  const db = new FakeFirestore();

  const FieldValue = {
    increment: (n) => ({ __fv: "increment", n: Number(n) }),
    arrayUnion: (...values) => ({ __fv: "arrayUnion", values }),
    arrayRemove: (...values) => ({ __fv: "arrayRemove", values }),
    delete: () => ({ __fv: "delete" }),
    serverTimestamp: () => ({ __fv: "serverTimestamp" }),
  };

  let authUser = null;
  // Metadados do Storage falso: caminho -> objeto de metadado | null (inexistente).
  let storageFiles = {};
  // Lista de arquivos devolvida por bucket.getFiles() (ex.: listarBackups).
  let storageFileList = [];

  return {
    db,
    FieldValue,
    Timestamp: FakeTimestamp,
    FieldPath: { documentId: () => "__name__" },
    get storageFiles() {
      return storageFiles;
    },
    set storageFiles(v) {
      storageFiles = v || {};
    },
    get storageFileList() {
      return storageFileList;
    },
    set storageFileList(v) {
      storageFileList = v || [];
    },
    setAuthUser(u) {
      authUser = u;
    },
    async authGetUser(uid) {
      return { uid, email: (authUser && authUser.email) || `${uid}@asspen.local` };
    },
    // Semeia o banco: { colecao: { id: dadosDoDoc } }. Substitui TUDO.
    reset(seed = {}) {
      db._store = new Map();
      db._counter = 0;
      authUser = null;
      storageFiles = {};
      storageFileList = [];
      for (const [coll, docs] of Object.entries(seed)) {
        const m = new Map();
        for (const [id, data] of Object.entries(docs)) m.set(id, clone(data));
        db._store.set(coll, m);
      }
    },
    // Leitura crua (cópia) para asserções.
    getDoc(coll, id) {
      const d = db._readRaw(coll, id);
      return d === undefined ? undefined : clone(d);
    },
    allDocs(coll) {
      const m = db._store.get(coll) || new Map();
      return [...m.entries()].map(([id, data]) => ({ id, ...clone(data) }));
    },
    count(coll) {
      const m = db._store.get(coll);
      return m ? m.size : 0;
    },
  };
}
