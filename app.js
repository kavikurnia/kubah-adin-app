// ============================================================
// Admin Dashboard — Prototipe Interaktif
// ============================================================
// Struktur:
//   1. Data layer   — abstraksi Firebase Firestore ATAU mode demo
//                      (localStorage) di balik fungsi yang sama,
//                      supaya kode rendering di bawah tidak perlu
//                      tahu sedang jalan di mode mana.
//   2. State        — cache lokal dari orders & products.
//   3. Render       — fungsi-fungsi yang menggambar ulang UI dari state.
//   4. Interaksi    — event listener, modal, form.
// ============================================================

const STATUS_META = {
  menunggu_pembayaran: { label: "Menunggu Pembayaran" },
  perlu_verifikasi: { label: "Perlu Verifikasi" },
  diproses: { label: "Diproses" },
  dikirim: { label: "Dikirim" },
  selesai: { label: "Selesai" },
  dibatalkan: { label: "Dibatalkan" },
};
const STATUS_ORDER = ["menunggu_pembayaran", "perlu_verifikasi", "diproses", "dikirim", "selesai", "dibatalkan"];

const state = {
  view: "dashboard",
  orders: [],
  products: [],
  orderTab: "semua",
  orderSearch: "",
  productSearch: "",
  variantRows: [],
  openOrderId: null,
  mode: "demo", // "demo" | "firebase"
};

const els = {};

// ============================================================
// 1. DATA LAYER
// ============================================================

const LOCAL_KEY_ORDERS = "atelier_demo_orders";
const LOCAL_KEY_PRODUCTS = "atelier_demo_products";

let fb = null; // { db, addDoc, updateDoc, collection, doc, onSnapshot, serverTimestamp, query, orderBy, deleteDoc }

async function initDataLayer() {
  const cfg = window.FIREBASE_CONFIG || {};
  const isPlaceholder = !cfg.apiKey || cfg.apiKey === "YOUR_API_KEY";

  if (isPlaceholder) {
    state.mode = "demo";
    setConnectionBadge("demo", "Mode demo (localStorage)");
    loadDemoData();
    return;
  }

  try {
    const [{ initializeApp }, firestore] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js"),
    ]);
    const app = initializeApp(cfg);
    const db = firestore.getFirestore(app);
    fb = { db, ...firestore };
    state.mode = "firebase";
    setConnectionBadge("connected", "Terhubung ke Firebase");
    subscribeFirestore();
  } catch (err) {
    console.warn("Gagal konek Firebase, memakai mode demo.", err);
    state.mode = "demo";
    setConnectionBadge("demo", "Mode demo (Firebase gagal konek)");
    loadDemoData();
  }
}

function setConnectionBadge(kind, label) {
  els.connBadge.className = "conn-badge" + (kind === "connected" ? " is-connected" : kind === "demo" ? " is-demo" : "");
  els.connLabel.textContent = label;
}

function subscribeFirestore() {
  const { collection, onSnapshot, query, orderBy } = fb;
  onSnapshot(query(collection(fb.db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    state.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (snap.empty) seedFirestore();
    renderAll();
  });
  onSnapshot(query(collection(fb.db, "products"), orderBy("createdAt", "desc")), (snap) => {
    state.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAll();
  });
}

async function seedFirestore() {
  const { addDoc, collection, serverTimestamp } = fb;
  const { orders, products } = buildSeedData();
  for (const o of orders) {
    await addDoc(collection(fb.db, "orders"), { ...o, createdAt: serverTimestamp() });
  }
  for (const p of products) {
    await addDoc(collection(fb.db, "products"), { ...p, createdAt: serverTimestamp() });
  }
}

function loadDemoData() {
  let orders = JSON.parse(localStorage.getItem(LOCAL_KEY_ORDERS) || "null");
  let products = JSON.parse(localStorage.getItem(LOCAL_KEY_PRODUCTS) || "null");
  if (!orders || !products) {
    const seed = buildSeedData();
    orders = seed.orders.map((o, i) => ({ ...o, id: "demo-order-" + i, createdAt: o.createdAt }));
    products = seed.products.map((p, i) => ({ ...p, id: "demo-product-" + i, createdAt: p.createdAt }));
    saveDemoData(orders, products);
  }
  state.orders = orders;
  state.products = products;
}

function saveDemoData(orders = state.orders, products = state.products) {
  localStorage.setItem(LOCAL_KEY_ORDERS, JSON.stringify(orders));
  localStorage.setItem(LOCAL_KEY_PRODUCTS, JSON.stringify(products));
}

/** Update satu order (status + field lain) — dipakai untuk semua aksi alur kerja. */
async function updateOrder(orderId, patch, historyLabel) {
  if (state.mode === "firebase") {
    const { doc, updateDoc, serverTimestamp } = fb;
    const order = state.orders.find((o) => o.id === orderId);
    const history = [...(order.statusHistory || []), { status: historyLabel || patch.status, at: new Date().toISOString() }];
    await updateDoc(doc(fb.db, "orders", orderId), { ...patch, statusHistory: history });
  } else {
    const order = state.orders.find((o) => o.id === orderId);
    Object.assign(order, patch);
    order.statusHistory = [...(order.statusHistory || []), { status: historyLabel || patch.status, at: new Date().toISOString() }];
    saveDemoData();
    renderAll();
  }
}

/** Tambah produk baru. */
async function addProduct(product) {
  if (state.mode === "firebase") {
    const { addDoc, collection, serverTimestamp } = fb;
    await addDoc(collection(fb.db, "products"), { ...product, createdAt: serverTimestamp() });
  } else {
    const newProduct = { ...product, id: "demo-product-" + Date.now(), createdAt: new Date().toISOString() };
    state.products.unshift(newProduct);
    saveDemoData();
    renderAll();
  }
}

async function deleteProduct(productId) {
  if (state.mode === "firebase") {
    const { doc, deleteDoc } = fb;
    await deleteDoc(doc(fb.db, "products", productId));
  } else {
    state.products = state.products.filter((p) => p.id !== productId);
    saveDemoData();
    renderAll();
  }
}

// ------------------------------------------------------------
// Seed data — dipakai untuk mode demo maupun pengisian awal Firestore
// ------------------------------------------------------------
function buildSeedData() {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();
  const orders = [
    { invoiceNo: "INV-1042", customerName: "Budi Santoso", phone: "0812-3456-7890", address: "Jl. Melati No. 12, Surabaya", items: [{ productName: "Kemeja Flanel", variant: "M / Hitam", qty: 1, price: 235000 }], shippingCost: 15000, total: 250000, status: "perlu_verifikasi", courier: "", trackingNumber: "", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(0) }], createdAt: daysAgo(0) },
    { invoiceNo: "INV-1041", customerName: "Sari Wulandari", phone: "0813-2222-1111", address: "Jl. Anggrek No. 5, Malang", items: [{ productName: "Blouse Katun", variant: "S / Putih", qty: 2, price: 90000 }], shippingCost: 12000, total: 192000, status: "diproses", courier: "", trackingNumber: "", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(1) }, { status: "perlu_verifikasi", at: daysAgo(1) }, { status: "diproses", at: daysAgo(0) }], createdAt: daysAgo(1) },
    { invoiceNo: "INV-1040", customerName: "Andi Prasetyo", phone: "0821-9999-0000", address: "Jl. Kenanga No. 8, Sidoarjo", items: [{ productName: "Celana Chino", variant: "32 / Krem", qty: 1, price: 175000 }, { productName: "Kaos Polos", variant: "L / Putih", qty: 2, price: 85000 }], shippingCost: 18000, total: 363000, status: "dikirim", courier: "JNE", trackingNumber: "JNE0293841923", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(3) }, { status: "perlu_verifikasi", at: daysAgo(3) }, { status: "diproses", at: daysAgo(2) }, { status: "dikirim", at: daysAgo(1) }], createdAt: daysAgo(3) },
    { invoiceNo: "INV-1039", customerName: "Rina Amelia", phone: "0856-1111-2222", address: "Jl. Dahlia No. 21, Gresik", items: [{ productName: "Dress Linen", variant: "M / Sage", qty: 1, price: 310000 }], shippingCost: 15000, total: 325000, status: "selesai", courier: "SiCepat", trackingNumber: "SCP1187234", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(6) }, { status: "perlu_verifikasi", at: daysAgo(6) }, { status: "diproses", at: daysAgo(5) }, { status: "dikirim", at: daysAgo(4) }, { status: "selesai", at: daysAgo(2) }], createdAt: daysAgo(6) },
    { invoiceNo: "INV-1038", customerName: "Fajar Nugroho", phone: "0877-3333-4444", address: "Jl. Mawar No. 3, Sidoarjo", items: [{ productName: "Jaket Denim", variant: "L / Biru", qty: 1, price: 420000 }], shippingCost: 20000, total: 440000, status: "menunggu_pembayaran", courier: "", trackingNumber: "", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(0) }], createdAt: daysAgo(0) },
    { invoiceNo: "INV-1037", customerName: "Dewi Lestari", phone: "0898-5555-6666", address: "Jl. Kamboja No. 9, Surabaya", items: [{ productName: "Blouse Katun", variant: "M / Dusty Pink", qty: 1, price: 95000 }], shippingCost: 12000, total: 107000, status: "dibatalkan", courier: "", trackingNumber: "", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(4) }, { status: "dibatalkan", at: daysAgo(3) }], createdAt: daysAgo(4) },
    { invoiceNo: "INV-1036", customerName: "Yoga Pratama", phone: "0819-7777-8888", address: "Jl. Teratai No. 14, Malang", items: [{ productName: "Kemeja Flanel", variant: "L / Merah", qty: 1, price: 235000 }], shippingCost: 15000, total: 250000, status: "selesai", courier: "JNE", trackingNumber: "JNE0281123456", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(8) }, { status: "perlu_verifikasi", at: daysAgo(8) }, { status: "diproses", at: daysAgo(7) }, { status: "dikirim", at: daysAgo(6) }, { status: "selesai", at: daysAgo(4) }], createdAt: daysAgo(8) },
    { invoiceNo: "INV-1035", customerName: "Putri Handayani", phone: "0838-4444-3333", address: "Jl. Cempaka No. 17, Sidoarjo", items: [{ productName: "Celana Chino", variant: "30 / Hitam", qty: 1, price: 175000 }], shippingCost: 15000, total: 190000, status: "perlu_verifikasi", courier: "", trackingNumber: "", statusHistory: [{ status: "menunggu_pembayaran", at: daysAgo(1) }], createdAt: daysAgo(1) },
  ];

  const products = [
    { name: "Kemeja Flanel", category: "Atasan", description: "Kemeja flanel lengan panjang, bahan katun tebal.", price: 235000, weight: 300, sku: "KMJ-FLN", status: "aktif", photoUrl: "https://picsum.photos/seed/kmjfln/120", variants: [{ name: "M - Hitam", sku: "KMJ-FLN-M-HTM", price: 235000, stock: 8 }, { name: "L - Hitam", sku: "KMJ-FLN-L-HTM", price: 235000, stock: 3 }, { name: "L - Merah", sku: "KMJ-FLN-L-MRH", price: 245000, stock: 2 }], totalStock: 13, createdAt: daysAgo(20) },
    { name: "Blouse Katun", category: "Atasan", description: "Blouse katun ringan untuk sehari-hari.", price: 90000, weight: 150, sku: "BLS-KTN", status: "aktif", photoUrl: "https://picsum.photos/seed/blsktn/120", variants: [{ name: "S - Putih", sku: "BLS-KTN-S-PTH", price: 90000, stock: 12 }, { name: "M - Dusty Pink", sku: "BLS-KTN-M-DPK", price: 95000, stock: 4 }], totalStock: 16, createdAt: daysAgo(18) },
    { name: "Celana Chino", category: "Bawahan", description: "Celana chino slim fit, bahan twill.", price: 175000, weight: 350, sku: "CLN-CHN", status: "aktif", photoUrl: "", variants: [{ name: "30 - Hitam", sku: "CLN-CHN-30-HTM", price: 175000, stock: 1 }, { name: "32 - Krem", sku: "CLN-CHN-32-KRM", price: 175000, stock: 6 }], totalStock: 7, createdAt: daysAgo(15) },
    { name: "Dress Linen", category: "Dress", description: "Dress linen midi, cocok untuk acara santai.", price: 310000, weight: 280, sku: "DRS-LNN", status: "aktif", photoUrl: "https://picsum.photos/seed/drslnn/120", variants: [{ name: "M - Sage", sku: "DRS-LNN-M-SAG", price: 310000, stock: 2 }], totalStock: 2, createdAt: daysAgo(10) },
    { name: "Jaket Denim", category: "Outer", description: "Jaket denim washed, unisex.", price: 420000, weight: 500, sku: "JKT-DNM", status: "aktif", photoUrl: "", variants: [{ name: "L - Biru", sku: "JKT-DNM-L-BIR", price: 420000, stock: 5 }], totalStock: 5, createdAt: daysAgo(9) },
    { name: "Kaos Polos", category: "Atasan", description: "Kaos polos cotton combed 24s.", price: 85000, weight: 140, sku: "KOS-PLS", status: "draft", photoUrl: "", variants: [{ name: "L - Putih", sku: "KOS-PLS-L-PTH", price: 85000, stock: 20 }], totalStock: 20, createdAt: daysAgo(5) },
  ];

  return { orders, products };
}

// ============================================================
// 2. HELPERS
// ============================================================
const formatRupiah = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const formatDate = (iso) => {
  if (!iso) return "-";
  const d = iso?.toDate ? iso.toDate() : new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
};
const isToday = (iso) => {
  const d = iso?.toDate ? iso.toDate() : new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
};
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => (els.toast.hidden = true), 2600);
}

// ============================================================
// 3. RENDER
// ============================================================
function renderAll() {
  renderNavBadge();
  if (state.view === "dashboard") renderDashboard();
  if (state.view === "pesanan") renderOrdersView();
  if (state.view === "produk") renderProductsView();
  if (state.openOrderId) renderOrderModalBody(state.openOrderId);
}

function renderNavBadge() {
  const count = state.orders.filter((o) => o.status === "perlu_verifikasi").length;
  els.navBadgePesanan.textContent = count;
  els.navBadgePesanan.style.display = count > 0 ? "inline-block" : "none";
}

function renderDashboard() {
  const orders = state.orders;
  const newToday = orders.filter((o) => isToday(o.createdAt)).length;
  const needVerify = orders.filter((o) => o.status === "perlu_verifikasi").length;
  const revenueToday = orders.filter((o) => isToday(o.createdAt) && o.status !== "dibatalkan").reduce((s, o) => s + o.total, 0);
  const lowStockProducts = state.products.filter((p) => p.totalStock <= 5 && p.status === "aktif");

  els.statNewOrders.textContent = newToday;
  els.statVerify.textContent = needVerify;
  els.statRevenue.textContent = formatRupiah(revenueToday);
  els.statLowstock.textContent = lowStockProducts.length;

  // Perlu aksi segera
  const actions = [];
  if (needVerify > 0) actions.push({ text: `${needVerify} pesanan menunggu verifikasi pembayaran`, goto: () => { state.view = "pesanan"; state.orderTab = "perlu_verifikasi"; navigateTo("pesanan"); } });
  const needShip = orders.filter((o) => o.status === "diproses").length;
  if (needShip > 0) actions.push({ text: `${needShip} pesanan siap dikirim, resi belum diinput`, goto: () => { state.view = "pesanan"; state.orderTab = "diproses"; navigateTo("pesanan"); } });
  if (lowStockProducts.length > 0) actions.push({ text: `${lowStockProducts.length} produk stok tinggal ${Math.min(...lowStockProducts.map((p) => p.totalStock))}–5 unit`, goto: () => navigateTo("produk") });

  els.actionList.innerHTML = "";
  if (actions.length === 0) {
    els.actionList.innerHTML = `<li class="action-empty"><span>Semua pesanan sudah ditangani. Kerja bagus.</span></li>`;
  } else {
    actions.forEach((a) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${a.text}</span>`;
      const btn = document.createElement("button");
      btn.className = "mini-btn";
      btn.textContent = "Lihat";
      btn.addEventListener("click", a.goto);
      li.appendChild(btn);
      els.actionList.appendChild(li);
    });
  }

  // Pesanan terbaru (5)
  const recent = [...orders].sort((a, b) => new Date(b.createdAt?.toDate?.() || b.createdAt) - new Date(a.createdAt?.toDate?.() || a.createdAt)).slice(0, 5);
  renderOrderRows(els.tableRecentOrders.querySelector("tbody"), recent, false);

  renderSalesChart();
}

function renderSalesChart() {
  const days = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const totals = days.map((d) =>
    state.orders
      .filter((o) => o.status !== "dibatalkan")
      .filter((o) => {
        const od = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt);
        return od.toDateString() === d.toDateString();
      })
      .reduce((s, o) => s + o.total, 0)
  );
  const max = Math.max(...totals, 1);
  const w = 320, h = 140, padBottom = 20, barGap = 10;
  const barW = (w - barGap * 6) / 7;
  let svg = "";
  totals.forEach((t, i) => {
    const barH = (t / max) * (h - padBottom - 10);
    const x = i * (barW + barGap);
    const y = h - padBottom - barH;
    svg += `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="2" fill="#7C2D3B" opacity="${0.55 + (i / 6) * 0.45}"></rect>`;
    svg += `<text x="${x + barW / 2}" y="${h - 4}" font-size="9" fill="#6E6754" text-anchor="middle" font-family="Inter, sans-serif">${days[i].toLocaleDateString("id-ID", { weekday: "short" }).slice(0, 2)}</text>`;
  });
  els.salesChart.innerHTML = svg;
}

function renderOrderRows(tbody, orders, withAction) {
  tbody.innerHTML = "";
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty">Tidak ada pesanan.</td></tr>`;
    return;
  }
  orders.forEach((o) => {
    const tr = document.createElement("tr");
    tr.className = "is-clickable";
    tr.innerHTML = `
      <td>${o.invoiceNo}</td>
      <td>${o.customerName}</td>
      <td>${formatRupiah(o.total)}</td>
      <td><span class="tag tag--${o.status}">${STATUS_META[o.status].label}</span></td>
      ${withAction ? `<td></td>` : ""}
    `;
    tr.addEventListener("click", (e) => {
      if (e.target.closest(".mini-btn")) return;
      openOrderModal(o.id);
    });
    if (withAction) {
      const actionTd = tr.querySelector("td:last-child");
      const btn = document.createElement("button");
      btn.className = "mini-btn";
      btn.textContent = actionLabelFor(o.status);
      btn.addEventListener("click", () => openOrderModal(o.id));
      actionTd.appendChild(btn);
    }
    tbody.appendChild(tr);
  });
}

function actionLabelFor(status) {
  if (status === "perlu_verifikasi") return "Verifikasi";
  if (status === "diproses") return "Input resi";
  return "Detail";
}

function renderOrdersView() {
  // tabs
  els.orderTabs.innerHTML = "";
  const tabs = [{ key: "semua", label: "Semua" }, ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS_META[s].label }))];
  tabs.forEach((t) => {
    const count = t.key === "semua" ? state.orders.length : state.orders.filter((o) => o.status === t.key).length;
    const btn = document.createElement("button");
    btn.className = "tab" + (state.orderTab === t.key ? " is-active" : "");
    btn.textContent = `${t.label} (${count})`;
    btn.addEventListener("click", () => { state.orderTab = t.key; renderOrdersView(); });
    els.orderTabs.appendChild(btn);
  });

  const q = state.orderSearch.trim().toLowerCase();
  let filtered = state.orders;
  if (state.orderTab !== "semua") filtered = filtered.filter((o) => o.status === state.orderTab);
  if (q) filtered = filtered.filter((o) => o.invoiceNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q));

  els.orderCount.textContent = `${filtered.length} pesanan`;
  renderOrderRows(els.tableOrders.querySelector("tbody"), filtered, true);
}

function renderProductsView() {
  const q = state.productSearch.trim().toLowerCase();
  const filtered = state.products.filter((p) => p.name.toLowerCase().includes(q));
  const tbody = els.tableProducts.querySelector("tbody");
  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="table-empty">Belum ada produk.</td></tr>`;
    return;
  }
  filtered.forEach((p) => {
    const tr = document.createElement("tr");
    const lowStock = p.totalStock <= 5;
    const initials = escapeHtml((p.name || "?").charAt(0).toUpperCase());
    const thumbHtml = `
      <div class="table-thumb-wrap">
        <span class="table-thumb-fallback">${initials}</span>
        ${p.photoUrl ? `<img src="${escapeHtml(p.photoUrl)}" alt="${escapeHtml(p.name)}" class="table-thumb-img" onerror="this.style.display='none'" />` : ""}
      </div>`;
    const variantDetailHtml = (p.variants || [])
      .map((v) => `<div class="variant-mini-row"><strong>${escapeHtml(v.name)}</strong> <span class="text-muted">(${escapeHtml(v.sku || "-")})</span><br/><span class="text-muted">${formatRupiah(v.price ?? p.price)} · stok ${v.stock}</span></div>`)
      .join("");

    tr.innerHTML = `
      <td>${thumbHtml}</td>
      <td><strong>${escapeHtml(p.name)}</strong><br/><span style="color:var(--text-muted);font-size:12px;">${(p.variants || []).length} varian</span></td>
      <td>${escapeHtml(p.sku || "-")}</td>
      <td>${escapeHtml(p.category)}</td>
      <td>${formatRupiah(p.price)}</td>
      <td>${Number(p.weight || 0)} g</td>
      <td>${lowStock ? `<span class="tag tag--dibatalkan">${p.totalStock} unit</span>` : `${p.totalStock} unit`}</td>
      <td class="variant-detail-cell">${variantDetailHtml}</td>
      <td><span class="tag tag--${p.status === "aktif" ? "selesai" : p.status === "draft" ? "menunggu_pembayaran" : "dibatalkan"}">${p.status}</span></td>
      <td></td>
    `;
    const actionTd = tr.querySelector("td:last-child");
    const delBtn = document.createElement("button");
    delBtn.className = "btn btn--danger";
    delBtn.style.padding = "5px 10px";
    delBtn.style.fontSize = "12px";
    delBtn.textContent = "Hapus";
    delBtn.addEventListener("click", async () => {
      if (confirm(`Hapus produk "${p.name}"?`)) {
        await deleteProduct(p.id);
        showToast("Produk dihapus.");
      }
    });
    actionTd.appendChild(delBtn);
    tbody.appendChild(tr);
  });
}

// ------------------------------------------------------------
// Order detail modal
// ------------------------------------------------------------
function openOrderModal(orderId) {
  state.openOrderId = orderId;
  renderOrderModalBody(orderId);
  els.orderModal.hidden = false;
}
function closeModals() {
  els.orderModal.hidden = true;
  els.productModal.hidden = true;
  state.openOrderId = null;
  resetProductForm();
}

function renderOrderModalBody(orderId) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o) return;
  const itemsHtml = o.items.map((it) => `<li><span>${it.productName} — ${it.variant} × ${it.qty}</span><span>${formatRupiah(it.price * it.qty)}</span></li>`).join("");

  let actionHtml = "";
  if (o.status === "perlu_verifikasi") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Verifikasi pembayaran</h3>
        <p style="font-size:13px;color:var(--text-muted);margin:0 0 12px;">Cocokkan nominal transfer (${formatRupiah(o.total)}) dan nama pengirim dengan mutasi rekening toko sebelum menyetujui.</p>
        <div class="od-action-row">
          <button class="btn btn--primary" data-act="verify-ok">Verifikasi valid</button>
          <button class="btn btn--ghost" data-act="verify-reject">Tolak, minta ulang</button>
        </div>
      </div>`;
  } else if (o.status === "diproses") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Input pengiriman</h3>
        <div class="od-action-row">
          <select id="od-courier" class="stock-input" style="width:130px;">
            <option value="JNE">JNE</option>
            <option value="SiCepat">SiCepat</option>
            <option value="J&T">J&T</option>
            <option value="AnterAja">AnterAja</option>
          </select>
          <input id="od-tracking" class="stock-input" style="width:170px;" placeholder="Nomor resi" />
          <button class="btn btn--primary" data-act="ship">Simpan &amp; tandai dikirim</button>
        </div>
      </div>`;
  } else if (o.status === "menunggu_pembayaran") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Menunggu bukti transfer dari pelanggan</h3>
        <div class="od-action-row">
          <button class="btn btn--ghost" data-act="cancel">Batalkan pesanan</button>
        </div>
      </div>`;
  } else if (o.status === "dikirim") {
    actionHtml = `
      <div class="od-action-block">
        <h3>Dalam pengiriman</h3>
        <p style="font-size:13px;margin:0 0 12px;">${o.courier} — ${o.trackingNumber}</p>
        <div class="od-action-row">
          <button class="btn btn--primary" data-act="complete">Tandai selesai</button>
        </div>
      </div>`;
  }
  if (["menunggu_pembayaran", "perlu_verifikasi", "diproses"].includes(o.status)) {
    actionHtml += `<div class="od-action-row" style="margin-top:10px;"><button class="btn btn--ghost" data-act="cancel">Batalkan pesanan</button></div>`;
  }

  const historyHtml = (o.statusHistory || []).map((h) => `<li>${STATUS_META[h.status]?.label || h.status} — ${formatDate(h.at)}</li>`).join("");

  els.orderModalBody.innerHTML = `
    <div class="od-head">
      <div>
        <h2>${o.invoiceNo}</h2>
        <span class="tag tag--${o.status}">${STATUS_META[o.status].label}</span>
      </div>
    </div>
    <div class="od-cols">
      <div class="od-block">
        <h3>Pelanggan</h3>
        <p><strong>${o.customerName}</strong></p>
        <p>${o.phone}</p>
        <p>${o.address}</p>
      </div>
      <div class="od-block">
        <h3>Item pesanan</h3>
        <ul class="od-items">${itemsHtml}</ul>
        <div class="od-total-row"><span>Ongkir</span><span>${formatRupiah(o.shippingCost)}</span></div>
        <div class="od-total-row"><span>Total</span><span>${formatRupiah(o.total)}</span></div>
      </div>
    </div>
    ${actionHtml}
    <div class="od-history">
      <strong>Riwayat status</strong>
      <ul>${historyHtml}</ul>
    </div>
  `;

  els.orderModalBody.querySelectorAll("[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(o, btn.dataset.act));
  });
}

async function handleOrderAction(order, act) {
  if (act === "verify-ok") {
    await updateOrder(order.id, { status: "diproses" });
    showToast(`Pembayaran ${order.invoiceNo} diverifikasi.`);
  } else if (act === "verify-reject") {
    await updateOrder(order.id, { status: "menunggu_pembayaran" });
    showToast(`Pelanggan diminta upload ulang bukti transfer.`);
  } else if (act === "ship") {
    const courier = document.getElementById("od-courier").value;
    const tracking = document.getElementById("od-tracking").value.trim();
    if (!tracking) { showToast("Nomor resi wajib diisi."); return; }
    await updateOrder(order.id, { status: "dikirim", courier, trackingNumber: tracking });
    showToast(`${order.invoiceNo} ditandai dikirim.`);
  } else if (act === "complete") {
    await updateOrder(order.id, { status: "selesai" });
    showToast(`${order.invoiceNo} ditandai selesai.`);
  } else if (act === "cancel") {
    if (!confirm(`Batalkan pesanan ${order.invoiceNo}?`)) return;
    await updateOrder(order.id, { status: "dibatalkan" });
    showToast(`${order.invoiceNo} dibatalkan.`);
  }
  renderOrderModalBody(order.id);
}

// ------------------------------------------------------------
// Product form / variant matrix
// ------------------------------------------------------------
function resetProductForm() {
  els.productForm.reset();
  state.variantRows = [];
  renderVariantRowsTable();
}

function slug(str) {
  return (str || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3) || "GEN";
}

/** Tambah satu baris varian kosong (atau terisi, jika dipanggil dengan data awal). */
function addVariantRow(initial) {
  state.variantRows.push({ name: "", sku: "", price: null, stock: 0, ...initial });
  renderVariantRowsTable();
}

function removeVariantRow(idx) {
  state.variantRows.splice(idx, 1);
  renderVariantRowsTable();
}

function renderVariantRowsTable() {
  const tbody = els.variantRowsTable.querySelector("tbody");
  tbody.innerHTML = "";
  els.variantEmptyHint.hidden = state.variantRows.length > 0;

  state.variantRows.forEach((row, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><input type="text" class="stock-input" style="width:150px;" placeholder="mis. M - Hitam" value="${escapeHtml(row.name)}" data-field="name" /></td>
      <td><input type="text" class="stock-input" style="width:130px;" placeholder="mis. KMJ-FLN-M-HTM" value="${escapeHtml(row.sku)}" data-field="sku" /></td>
      <td><input type="number" min="0" class="stock-input" style="width:100px;" placeholder="Ikut harga dasar" value="${row.price ?? ""}" data-field="price" /></td>
      <td><input type="number" min="0" class="stock-input" style="width:80px;" value="${row.stock}" data-field="stock" /></td>
      <td><button type="button" class="btn btn--ghost" style="padding:5px 9px;font-size:12px;" aria-label="Hapus varian">&times;</button></td>
    `;
    tr.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", (e) => {
        const field = e.target.dataset.field;
        if (field === "price") row.price = e.target.value === "" ? null : Number(e.target.value);
        else if (field === "stock") row.stock = Number(e.target.value) || 0;
        else row[field] = e.target.value;
      });
    });
    tr.querySelector("button").addEventListener("click", () => removeVariantRow(i));
    tbody.appendChild(tr);
  });
}

// ============================================================
// 4. NAVIGATION & EVENTS
// ============================================================
function navigateTo(view) {
  state.view = view;
  document.querySelectorAll(".view").forEach((v) => (v.hidden = true));
  document.getElementById("view-" + view).hidden = false;
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => btn.classList.toggle("is-active", btn.dataset.view === view));
  renderAll();
}

function bindEvents() {
  document.querySelectorAll(".nav-item[data-view]:not(.is-disabled)").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.view));
  });
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.goto));
  });

  els.orderSearch.addEventListener("input", (e) => { state.orderSearch = e.target.value; renderOrdersView(); });
  els.productSearch.addEventListener("input", (e) => { state.productSearch = e.target.value; renderProductsView(); });

  document.querySelectorAll("[data-close-modal]").forEach((btn) => btn.addEventListener("click", closeModals));
  [els.orderModal, els.productModal].forEach((overlay) => {
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModals(); });
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModals(); });

  els.btnAddProduct.addEventListener("click", () => { resetProductForm(); els.productModal.hidden = false; });

  els.btnAddVariantRow.addEventListener("click", () => addVariantRow());

  els.productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(els.productForm);
    const basePrice = Number(f.get("price")) || 0;

    // Baris kosong (belum diisi nama) diabaikan, bukan dianggap error.
    const variants = state.variantRows
      .filter((r) => r.name.trim() !== "")
      .map((r) => ({
        name: r.name.trim(),
        sku: r.sku.trim(),
        price: r.price === null || r.price === "" ? basePrice : Number(r.price),
        stock: Number(r.stock) || 0,
      }));

    if (variants.length === 0) {
      showToast("Tambahkan minimal 1 varian sebelum menyimpan.");
      return;
    }

    const totalStock = variants.reduce((s, v) => s + v.stock, 0);
    const product = {
      name: f.get("name").trim(),
      category: f.get("category").trim(),
      description: f.get("description").trim(),
      price: basePrice,
      weight: Number(f.get("weight")) || 0,
      sku: f.get("sku").trim() || slug(f.get("name")),
      status: f.get("status"),
      photoUrl: f.get("photoUrl").trim(),
      variants,
      totalStock,
    };
    await addProduct(product);
    closeModals();
    navigateTo("produk");
    showToast(`Produk "${product.name}" tersimpan.`);
  });
}

// ============================================================
// INIT
// ============================================================
function cacheEls() {
  els.connBadge = document.getElementById("conn-badge");
  els.connLabel = document.getElementById("conn-label");
  els.navBadgePesanan = document.getElementById("nav-badge-pesanan");

  els.todayDate = document.getElementById("today-date");
  els.statNewOrders = document.getElementById("stat-new-orders");
  els.statVerify = document.getElementById("stat-verify");
  els.statRevenue = document.getElementById("stat-revenue");
  els.statLowstock = document.getElementById("stat-lowstock");
  els.actionList = document.getElementById("action-list");
  els.salesChart = document.getElementById("sales-chart");
  els.tableRecentOrders = document.getElementById("table-recent-orders");

  els.orderTabs = document.getElementById("order-tabs");
  els.orderSearch = document.getElementById("order-search");
  els.orderCount = document.getElementById("order-count");
  els.tableOrders = document.getElementById("table-orders");

  els.productSearch = document.getElementById("product-search");
  els.tableProducts = document.getElementById("table-products");
  els.btnAddProduct = document.getElementById("btn-add-product");

  els.orderModal = document.getElementById("order-modal");
  els.orderModalBody = document.getElementById("order-modal-body");

  els.productModal = document.getElementById("product-modal");
  els.productForm = document.getElementById("product-form");
  els.variantRowsTable = document.getElementById("variant-rows-table");
  els.btnAddVariantRow = document.getElementById("btn-add-variant-row");
  els.variantEmptyHint = document.getElementById("variant-empty-hint");

  els.toast = document.getElementById("toast");
}

async function init() {
  cacheEls();
  els.todayDate.textContent = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  bindEvents();
  await initDataLayer();
  renderAll();
}

init();
