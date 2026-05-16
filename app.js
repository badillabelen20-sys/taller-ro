// CONFIGURACIÓN SUPABASE REAL DE RO
const SUPABASE_URL = 'https://bcsmkbtvmabmcuzeehad.supabase.co';
const SUPABASE_KEY = 'sb_publishable_n6gpg6LRXdKHERrCGMjllw_bKM9vECK';

let client = null;
let inventory = { turbos: [], lubricentro: [] };
let sales = [];
let currentUser = null;
const DEBIT_PERCENT = 1.06;
const CREDIT_PERCENT = 1.096;
let wegaData = [];
let currentSelection = { oil: null, air: null, fuel: null, cabin: null };

// 1. SEGURIDAD INMEDIATA: Evitar que el formulario reinicie la página
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!client) { alert("Conectando..."); return; }
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            try {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) alert("Error: " + error.message);
                else {
                    currentUser = data.user;
                    document.getElementById('login-screen').classList.add('hidden');
                    await loadFromCloud();
                }
            } catch (err) { alert("Error de conexión"); }
        };
    }
});

async function init() {
    setupTabs();
    setupSearch();
    setupModal();
    setupPOS();
    setupImport();
    setupBudget();
    setupWegaManualImport();
    loadWegaExcel();
    loadFromLocal();
    renderAll();
    
    try {
        if (typeof supabase !== 'undefined') {
            client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
            const { data } = await client.auth.getSession();
            if (data?.session) {
                currentUser = data.session.user;
                document.getElementById('login-screen').classList.add('hidden');
                await loadFromCloud();
            }
        }
    } catch (e) { console.warn("Init error:", e); }
}

async function loadFromCloud() {
    if (!client) return;
    try {
        const { data: inv } = await client.from('datos_taller_ro').select('*').limit(10000);
        const { data: sls } = await client.from('ventas_taller_ro').select('*').limit(10000);
        if (inv) {
            inventory.turbos = inv.filter(i => i.category === 'turbos');
            inventory.lubricentro = inv.filter(i => i.category === 'lubricentro');
            sales = sls || [];
            renderAll();
        }
    } catch (e) { console.error(e); }
}

async function syncWithCloud(manual = false) {
    if (!client || !currentUser) return;
    try {
        const all = [...inventory.turbos.map(i=>({...i, category:'turbos'})), ...inventory.lubricentro.map(i=>({...i, category:'lubricentro'}))];
        await client.from('datos_taller_ro').delete().neq('category', 'vehicle_config');
        if (all.length > 0) {
            for (let i = 0; i < all.length; i += 500) await client.from('datos_taller_ro').insert(all.slice(i, i + 500));
        }
        if (sales.length > 0) {
            const syncSales = sales.map(s => ({ item_id: s.item_id || s.id, name: s.name, category: s.category, price: s.price, date: s.date }));
            await client.from('ventas_taller_ro').upsert(syncSales);
        }
        if (manual) alert("✅ Nube sincronizada");
    } catch (e) { console.error(e); }
}

async function saveData() {
    localStorage.setItem('taller_inventory', JSON.stringify(inventory));
    localStorage.setItem('taller_sales', JSON.stringify(sales));
    await syncWithCloud();
}

function loadFromLocal() {
    const inv = localStorage.getItem('taller_inventory');
    const sls = localStorage.getItem('taller_sales');
    if (inv) inventory = JSON.parse(inv);
    if (sls) sales = JSON.parse(sls);
}

function renderAll() { renderTurbos(); renderLubricentro(); renderSales(); updateOilSelect(); }

function renderTurbos(filter = '') {
    const tbody = document.querySelector('#table-turbos tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    inventory.turbos.forEach((item, index) => {
        if (filter && !item.name.toLowerCase().includes(filter.toLowerCase())) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.type || '-'}</td><td><strong>${item.id}</strong></td><td>${item.name}</td><td>${item.vehicle || '-'}</td><td>$${item.price.toFixed(2)}</td><td class="${item.stock <= 2 ? 'stock-low' : ''}">${item.stock}</td><td><button onclick="changeStock('turbos', ${index}, -1)">-</button><button onclick="changeStock('turbos', ${index}, 1)">+</button><button style="background:#3b82f6; color:white; border-radius:4px; border:none; padding:2px 5px; margin-left:5px;" onclick="openEditModal('turbos', ${index})">✏️</button></td>`;
        tbody.appendChild(tr);
    });
}

function renderLubricentro(filter = '') {
    const tbody = document.querySelector('#table-lubricentro tbody'); if (!tbody) return;
    tbody.innerHTML = '';
    inventory.lubricentro.forEach((item, index) => {
        if (filter && !item.name.toLowerCase().includes(filter.toLowerCase())) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${item.type || '-'}</td><td><strong>${item.id}</strong></td><td>${item.name}</td><td>$${item.price.toFixed(2)}</td><td class="${item.stock <= 5 ? 'stock-low' : ''}">${item.stock}</td><td><button onclick="changeStock('lubricentro', ${index}, -1)">-</button><button onclick="changeStock('lubricentro', ${index}, 1)">+</button><button style="background:#3b82f6; color:white; border-radius:4px; border:none; padding:2px 5px; margin-left:5px;" onclick="openEditModal('lubricentro', ${index})">✏️</button></td>`;
        tbody.appendChild(tr);
    });
}

function renderSales() {
    const tT = document.querySelector('#table-ventas-turbos tbody');
    const tL = document.querySelector('#table-ventas-lubricentro tbody');
    if (!tT || !tL) return;
    tT.innerHTML = ''; tL.innerHTML = '';
    let totT = 0, totL = 0;
    const sortedSales = [...sales].sort((a,b) => new Date(b.date) - new Date(a.date));
    sortedSales.forEach((s) => {
        const tr = document.createElement('tr');
        const d = new Date(s.date).toLocaleString('es-AR', { dateStyle:'short', timeStyle:'short' });
        tr.innerHTML = `<td>${d}</td><td><strong>${s.name}</strong></td><td>$${s.price.toFixed(2)}</td><td><button style="color:red; border:none; background:none; cursor:pointer;" class="btn-anular">Anular</button></td>`;
        tr.querySelector('.btn-anular').onclick = () => anularVentaFinal(sales.indexOf(s));
        if (s.category === 'turbos') { totT += s.price; tT.appendChild(tr); }
        else { totL += s.price; tL.appendChild(tr); }
    });
    document.getElementById('total-sales-turbos').innerText = `$${totT.toFixed(2)}`;
    document.getElementById('total-sales-lubricentro').innerText = `$${totL.toFixed(2)}`;
}

async function anularVentaFinal(index) {
    const s = sales[index]; if (!s) return;
    if (!confirm(`¿ANULAR VENTA DE ${s.name}?`)) return;
    const actualId = s.item_id || s.id;
    const item = inventory[s.category].find(i => i.id === actualId);
    if (item) item.stock++;
    if (client) await client.from('ventas_taller_ro').delete().match({ item_id: actualId, date: s.date });
    sales.splice(index, 1); await saveData(); renderAll();
}

function openEditModal(cat, index) {
    const item = inventory[cat][index]; editingIndex = index;
    document.getElementById('modal-category').value = cat;
    document.getElementById('modal-title').innerText = "Editar Producto";
    document.getElementById('input-type').value = item.type || '';
    document.getElementById('input-code').value = item.id;
    document.getElementById('input-code').disabled = true;
    document.getElementById('input-name').value = item.name;
    document.getElementById('input-vehicle').value = item.vehicle || '';
    document.getElementById('input-price').value = item.price;
    document.getElementById('input-stock').value = item.stock;
    document.getElementById('group-vehicle').style.display = cat === 'turbos' ? 'block' : 'none';
    document.getElementById('add-modal').classList.remove('hidden');
}

function openAddModal(cat) {
    editingIndex = null;
    document.getElementById('modal-category').value = cat;
    document.getElementById('modal-title').innerText = "Agregar Producto";
    document.getElementById('input-code').disabled = false;
    document.getElementById('add-modal').classList.remove('hidden');
}

function closeAddModal() { document.getElementById('add-modal').classList.add('hidden'); }

function setupModal() {
    const form = document.getElementById('add-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const cat = document.getElementById('modal-category').value;
        const item = {
            id: document.getElementById('input-code').value.toUpperCase(),
            type: document.getElementById('input-type').value,
            name: document.getElementById('input-name').value,
            price: parseFloat(document.getElementById('input-price').value),
            stock: parseInt(document.getElementById('input-stock').value),
            vehicle: document.getElementById('input-vehicle').value
        };
        if (editingIndex !== null) inventory[cat][editingIndex] = item; else inventory[cat].push(item);
        await saveData(); renderAll(); closeAddModal();
    };
}

function setupImport() {
    document.getElementById('import-turbos').onchange = (e) => handleImport(e, 'turbos');
    document.getElementById('import-lubricentro').onchange = (e) => handleImport(e, 'lubricentro');
}

function parseMoney(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    let clean = val.toString().replace(/\$/g, '').replace(/\s/g, '');
    if (clean.includes(',') && clean.includes('.')) { clean = clean.replace(/\./g, '').replace(',', '.'); }
    else if (clean.includes(',')) { clean = clean.replace(',', '.'); }
    return parseFloat(clean) || 0;
}

async function handleImport(event, category) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            const heads = json[0].map(h => (h || '').toString().toLowerCase().trim());
            let col = { type: heads.indexOf('tipo'), id: heads.findIndex(h => h.includes('articulo') || h.includes('código')), name: heads.findIndex(h => h.includes('nombre') || h.includes('modelo')), price: heads.indexOf('precio'), stock: heads.findIndex(h => h.includes('stock') && h.includes('actual')), vehicle: heads.indexOf('vehículo') };
            if (col.price === -1) col.price = 4;
            if (col.stock === -1) col.stock = 7;
            if (category === 'turbos' && col.stock === 7) col.stock = 6;
            const items = [];
            for (let i = 1; i < json.length; i++) {
                const r = json[i]; if (!r[col.name] && !r[col.id]) continue;
                const itemName = (r[col.name] || 'S/N').toString();
                items.push({ id: (r[col.id] || itemName).toString(), type: (r[col.type] || '').toString(), name: itemName, vehicle: col.vehicle !== -1 ? (r[col.vehicle] || '').toString() : '', price: parseMoney(r[col.price]), stock: parseInt(r[col.stock]) || 0, category });
            }
            inventory[category] = items; await saveData(); renderAll(); alert("✅ Éxito: " + items.length + " productos.");
        } catch (err) { alert("Error al importar"); }
    };
    reader.readAsArrayBuffer(file);
}

function setupPOS() {
    const input = document.getElementById('pos-search');
    const sugg = document.getElementById('pos-suggestions'); if (!input) return;
    input.oninput = (e) => {
        const q = e.target.value.toLowerCase(); sugg.innerHTML = '';
        if (q.length < 2) return sugg.classList.add('hidden');
        let res = [];
        ['turbos', 'lubricentro'].forEach(cat => inventory[cat].forEach((item, index) => { if (item.name.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)) res.push({ item, cat, index }); }));
        if (res.length > 0) {
            sugg.classList.remove('hidden');
            res.forEach(r => {
                const div = document.createElement('div'); div.className = 'suggestion-item'; div.style.padding="10px"; div.style.cursor="pointer"; div.style.borderBottom="1px solid #eee";
                div.innerHTML = `<strong>${r.item.id}</strong> - ${r.item.name}`;
                div.onclick = () => {
                    const p = r.item; const c = p.price; const d = c * DEBIT_PERCENT; const cr = c * CREDIT_PERCENT;
                    document.getElementById('pos-selected-info').innerHTML = `
                        <div class="card" style="background:#f8fafc; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 12px;">
                            <strong style="font-size:1.1rem; display:block; margin-bottom:1rem;">${p.name}</strong>
                            <div style="display:flex; flex-direction:column; gap:10px;">
                                <div class="price-tag" style="background:#dcfce7; color:#166534; display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:8px; font-weight:bold;">
                                    <span>Efectivo: $${c.toFixed(2)}</span>
                                    <button class="btn-success" style="padding:5px 15px;" onclick="completeSale('${r.cat}', ${r.index}, ${c}, 'Efectivo')">Vender</button>
                                </div>
                                <div class="price-tag" style="background:#e0f2fe; color:#0369a1; display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:8px; font-weight:bold;">
                                    <span>Débito: $${d.toFixed(2)}</span>
                                    <button style="background:#0ea5e9; color:white; padding:5px 15px; border:none; border-radius:6px; cursor:pointer;" onclick="completeSale('${r.cat}', ${r.index}, ${d}, 'Débito')">Vender</button>
                                </div>
                                <div class="price-tag" style="background:#fef3c7; color:#92400e; display:flex; justify-content:space-between; align-items:center; padding:10px; border-radius:8px; font-weight:bold;">
                                    <span>Crédito: $${cr.toFixed(2)}</span>
                                    <button style="background:#f59e0b; color:white; padding:5px 15px; border:none; border-radius:6px; cursor:pointer;" onclick="completeSale('${r.cat}', ${r.index}, ${cr}, 'Crédito')">Vender</button>
                                </div>
                            </div>
                        </div>`;
                    input.value = ''; sugg.classList.add('hidden');
                };
                sugg.appendChild(div);
            });
        }
    };
}

async function completeSale(cat, index, price, method) {
    const item = inventory[cat][index]; if (item.stock <= 0) return alert("Sin stock");
    item.stock--; 
    sales.push({ id: item.id, item_id: item.id, name: `${item.name} (${method})`, category: cat, price, date: new Date().toISOString() });
    await saveData(); renderAll();
}

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active'); document.getElementById(btn.dataset.tab).classList.add('active');
    });
}

function setupSearch() {
    const st = document.getElementById('search-turbos'), sl = document.getElementById('search-lubricentro');
    if (st) st.oninput = (e) => renderTurbos(e.target.value); if (sl) sl.oninput = (e) => renderLubricentro(e.target.value);
}

function changeStock(cat, idx, amt) { if (inventory[cat][idx].stock + amt >= 0) { inventory[cat][idx].stock += amt; saveData(); renderAll(); } }

async function loadWegaExcel() {
    const status = document.getElementById('wega-status'); if (!status) return;
    try {
        const res = await fetch('precios_limpios.xlsx');
        if (!res.ok) throw new Error("No se encontró");
        const data = await res.arrayBuffer(); processWegaData(data);
        status.innerText = "✅ Lista Lista";
    } catch (e) { status.innerText = "⚠️ Subir Excel"; }
}

function setupWegaManualImport() {
    const input = document.getElementById('import-wega-manual');
    if (input) input.onchange = (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => { try { processWegaData(event.target.result); alert("✅ Filtros cargados"); } catch (err) { alert("Error"); } };
        reader.readAsArrayBuffer(file);
    };
}

function processWegaData(data) {
    const wb = XLSX.read(data);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    let start = 0; for(let i=0; i<raw.length; i++) { if (raw[i][1] && raw[i][2]) { start = i; break; } }
    wegaData = raw.slice(start).map(row => {
        let p = parseFloat(row[3]) || 0; if (p > 0 && p < 1000) p = p * 1000;
        return { category: (row[0] || '').toString().toUpperCase(), code: (row[1] || '').toString().toUpperCase(), desc: (row[2] || '').toString(), price: p };
    }).filter(item => item.code && item.desc);
}

function updateOilSelect() {
    const select = document.getElementById('budget-oil-select'); if (!select) return;
    select.innerHTML = '<option value="">-- Seleccionar Aceite --</option>';
    inventory.lubricentro.forEach(item => {
        const option = document.createElement('option'); option.value = item.id; option.innerText = `${item.name} ($${item.price}/L)`; select.appendChild(option);
    });
}

function setupBudget() {
    const btnSearch = document.getElementById('btn-search-budget');
    if (btnSearch) btnSearch.onclick = () => {
        const q = document.getElementById('budget-search').value.toLowerCase().trim();
        if (q.length < 3) return alert("Escriba marca y modelo");
        currentSelection = { oil: null, air: null, fuel: null, cabin: null };
        searchInWega(q);
    };
    document.getElementById('budget-labor').oninput = () => calculateBudgetTotal();
    document.getElementById('budget-oil-liters').oninput = () => calculateBudgetTotal();
    document.getElementById('budget-oil-select').onchange = (e) => {
        const oil = inventory.lubricentro.find(i => i.id === e.target.value);
        if (oil) { currentSelection.oil_price_l = oil.price; currentSelection.oil_name = oil.name; }
        calculateBudgetTotal();
    };
    const wa = document.getElementById('btn-whatsapp');
    if (wa) wa.onclick = () => copyBudgetToWhatsApp();
}

function searchInWega(q) {
    const words = q.split(' ').filter(w => w.length > 1);
    const grid = document.getElementById('wega-options'); grid.innerHTML = '';
    const cats = { oil: { title: "🛢️ Aceite", filters: [] }, air: { title: "🌬️ Aire", filters: [] }, fuel: { title: "⛽ Combustible", filters: [] }, cabin: { title: "🏠 Habitáculo", filters: [] } };
    let any = false;
    wegaData.forEach(item => {
        const d = item.desc.toLowerCase(); const c = item.code; const cat = item.category.toLowerCase();
        if (words.every(w => d.includes(w))) {
            let type = null;
            if (cat.includes('aceite') || c.startsWith('WEO') || c.startsWith('WO')) type = 'oil';
            else if (cat.includes('aire') || c.startsWith('FAP') || c.startsWith('WAP')) type = 'air';
            else if (cat.includes('combustible') || cat.includes('diesel') || c.startsWith('FCI')) type = 'fuel';
            else if (cat.includes('habitaculo') || cat.includes('cabina') || c.startsWith('AKX')) type = 'cabin';
            if (type) { cats[type].filters.push({ code: c, desc: item.desc, price: item.price }); any = true; }
        }
    });
    if (!any) grid.innerHTML = '<p>No se encontraron filtros.</p>';
    else Object.keys(cats).forEach(t => {
        if (cats[t].filters.length > 0) {
            const h = document.createElement('h5'); h.style.marginTop="10px"; h.style.color="var(--accent)"; h.innerText = cats[t].title; grid.appendChild(h);
            cats[t].filters.slice(0, 5).forEach((f, idx) => {
                const div = document.createElement('div'); div.className = 'option-item';
                div.innerHTML = `<strong>${f.code}</strong><small style="display:block; color:#64748b; font-size:0.8rem; margin:4px 0;">${f.desc}</small><div style="font-weight:bold">$${(f.price * 1.6).toFixed(0)}</div>`;
                div.onclick = () => { currentSelection[t] = f; document.getElementById(`sel-${t}`).innerText = f.code; calculateBudgetTotal(); };
                grid.appendChild(div); if (idx === 0) div.click();
            });
        }
    });
    document.getElementById('wega-results-container').classList.remove('hidden');
}

function calculateBudgetTotal() {
    const items = document.getElementById('budget-items'); items.innerHTML = '';
    let tot = 0;
    ['oil', 'air', 'fuel', 'cabin'].forEach(t => { if (currentSelection[t]) { const p = currentSelection[t].price * 1.6; tot += p; items.innerHTML += `<p><span>${t.toUpperCase()}:</span> <strong>$${p.toFixed(0)}</strong></p>`; } });
    const lits = parseFloat(document.getElementById('budget-oil-liters').value) || 0;
    if (currentSelection.oil_price_l && lits > 0) { const c = currentSelection.oil_price_l * lits; tot += c; items.innerHTML += `<p><span>Aceite (${lits}L):</span> <strong>$${c.toFixed(0)}</strong></p>`; }
    const labor = parseFloat(document.getElementById('budget-labor').value) || 0;
    tot += labor;
    document.getElementById('budget-total').innerHTML = `<h3>Total: $${tot.toFixed(0)}</h3>`;
    document.getElementById('budget-result').classList.remove('hidden');
}

function copyBudgetToWhatsApp() {
    const vehicle = document.getElementById('budget-search').value.toUpperCase();
    let text = `*PRESUPUESTO TALLER HR*\n🚗 Vehículo: ${vehicle}\n\n`;
    ['oil', 'air', 'fuel', 'cabin'].forEach(t => { if (currentSelection[t]) text += `✅ ${t.toUpperCase()}: ${currentSelection[t].code}\n`; });
    if (currentSelection.oil_name) text += `✅ Aceite: ${currentSelection.oil_name}\n`;
    text += `\n💰 *${document.getElementById('budget-total').innerText}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`);
}

init();
