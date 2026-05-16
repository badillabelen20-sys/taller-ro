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

const DEFAULT_VEHICLES = {
    "fiorino_14": { name: "Fiat Fiorino 1.4 Fire Evo", oil_type: "5W30", oil_liters: 2.9, filters: ["WEO-0003", "FAP-9054", "FCI-1660", "AKX-1445"] },
    "hilux_24": { name: "Toyota Hilux 2.4/2.8 (2016+)", oil_type: "5W30", oil_liters: 7.5, filters: ["WEO-0014", "JFA-0213", "FCD-2173", "AKX-1965"] }
};

let VEHICLE_DB = { ...DEFAULT_VEHICLES };
let editingIndex = null;

async function init() {
    setupTabs();
    setupAuth();
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
                await loadCustomVehicles();
            }
        }
    } catch (e) { console.warn("Init error:", e); }
}

function setupAuth() {
    const form = document.getElementById('login-form');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            const { data, error } = await client.auth.signInWithPassword({ email, password });
            if (error) alert("Error: " + error.message);
            else { currentUser = data.user; document.getElementById('login-screen').classList.add('hidden'); await loadFromCloud(); await loadCustomVehicles(); }
        } catch (err) { alert("Error: " + err.message); }
    };
    document.getElementById('logout-btn').onclick = async () => { if (client) await client.auth.signOut(); location.reload(); };
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
    sales.splice(index, 1); await saveData(); renderAll(); alert("Anulada");
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
    if (clean.includes(',') && clean.includes('.')) {
        clean = clean.replace(/\./g, '').replace(',', '.');
    } else if (clean.includes(',')) {
        clean = clean.replace(',', '.');
    }
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
            
            // BUSCADOR AUTOMÁTICO DE COLUMNAS
            const headers = json[0].map(h => (h || '').toString().toLowerCase());
            let col = {
                type: headers.indexOf('tipo'),
                id: headers.indexOf('id de articulo') !== -1 ? headers.indexOf('id de articulo') : headers.indexOf('código'),
                name: headers.indexOf('nombre del articulo') !== -1 ? headers.indexOf('nombre del articulo') : headers.indexOf('modelo'),
                price: headers.indexOf('precio'),
                stock: headers.indexOf('stock actual'),
                vehicle: headers.indexOf('vehículo')
            };

            // Ajustes si no encuentra alguna (basado en tus capturas)
            if (col.type === -1) col.type = 0;
            if (col.id === -1) col.id = 1;
            if (col.name === -1) col.name = 2;
            if (col.price === -1) col.price = 4;
            if (col.stock === -1) col.stock = 7;
            if (category === 'turbos' && col.stock === 7) col.stock = 6; // Ajuste para Turbos

            const items = [];
            for (let i = 1; i < json.length; i++) {
                const r = json[i]; 
                if (!r[col.name] && !r[col.id]) continue;
                
                const itemName = (r[col.name] || 'S/N').toString();
                items.push({ 
                    id: (r[col.id] || itemName).toString(), // Si el ID está vacío, usa el nombre como ID
                    type: (r[col.type] || '').toString(),
                    name: itemName, 
                    vehicle: col.vehicle !== -1 ? (r[col.vehicle] || '').toString() : '', 
                    price: parseMoney(r[col.price]), 
                    stock: parseInt(r[col.stock]) || 0, 
                    category 
                });
            }
            inventory[category] = items; 
            await saveData(); 
            renderAll(); 
            alert("✅ Importación Inteligente Exitosa (" + items.length + " productos)");
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
                const div = document.createElement('div'); div.className = 'suggestion-item'; div.innerText = r.item.name;
                div.onclick = () => {
                    const p = r.item; const c = p.price; const d = c * DEBIT_PERCENT; const cr = c * CREDIT_PERCENT;
                    document.getElementById('pos-selected-info').innerHTML = `<div class="pos-card"><strong>${p.name}</strong><div class="pos-prices"><div class="price-tag cash"><span>Efectivo</span><span>$${c.toFixed(2)}</span><button onclick="completeSale('${r.cat}', ${r.index}, ${c}, 'Efectivo')">Vender</button></div><div class="price-tag debit"><span>Débito</span><span>$${d.toFixed(2)}</span><button onclick="completeSale('${r.cat}', ${r.index}, ${d}, 'Débito')">Vender</button></div><div class="price-tag credit"><span>Crédito</span><span>$${cr.toFixed(2)}</span><button onclick="completeSale('${r.cat}', ${r.index}, ${cr}, 'Crédito')">Vender</button></div></div></div>`;
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
        status.innerText = "✅ Lista Lista"; status.style.background = "#dcfce7";
    } catch (e) { status.innerText = "⚠️ Subir Excel"; status.style.background = "#fef3c7"; }
}

function setupWegaManualImport() {
    const input = document.getElementById('import-wega-manual');
    if (input) {
        input.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try { processWegaData(event.target.result); alert("✅ Filtros cargados"); document.getElementById('wega-status').innerText = "✅ Lista Lista"; } catch (err) { alert("Error"); }
            };
            reader.readAsArrayBuffer(file);
        };
    }
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
    if (inventory.lubricentro.length === 0) return;
    inventory.lubricentro.forEach(item => {
        const option = document.createElement('option'); option.value = item.id; option.innerText = `${item.name} ($${item.price}/L)`; select.appendChild(option);
    });
}

function setupBudget() {
    const btn = document.getElementById('btn-search-budget');
    if (!btn) return;
    btn.onclick = () => {
        const q = document.getElementById('budget-search').value.toLowerCase().trim();
        if (q.length < 3) return alert("Escriba marca y modelo");
        currentSelection = { oil: null, air: null, fuel: null, cabin: null };
        document.querySelectorAll('.config-item strong').forEach(el => el.innerText = '-');
        searchInWega(q);
    };
}

init();
