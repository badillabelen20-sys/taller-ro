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
            const syncSales = sales.map(s => ({ 
                item_id: s.item_id || s.id, 
                name: s.name, 
                category: s.category, 
                price: s.price, 
                date: s.date 
            }));
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
    sales.sort((a,b) => new Date(b.date) - new Date(a.date)).forEach(s => {
        const tr = document.createElement('tr');
        const d = new Date(s.date).toLocaleString('es-AR', { dateStyle:'short', timeStyle:'short' });
        const currentId = s.item_id || s.id;
        tr.innerHTML = `<td>${d}</td><td><strong>${s.name}</strong></td><td>$${s.price.toFixed(2)}</td><td><button style="color:red; border:none; background:none; cursor:pointer;" onclick="deleteSale('${currentId}', '${s.date}')">Anular</button></td>`;
        if (s.category === 'turbos') { totT += s.price; tT.appendChild(tr); }
        else { totL += s.price; tL.appendChild(tr); }
    });
    document.getElementById('total-sales-turbos').innerText = `$${totT.toFixed(2)}`;
    document.getElementById('total-sales-lubricentro').innerText = `$${totL.toFixed(2)}`;
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

async function handleImport(event, category) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
            let col = category === 'turbos' ? { id:1, name:2, vehicle:3, stock:6, price:7 } : { id:1, name:2, price:3, stock:6 };
            const items = [];
            for (let i = 1; i < json.length; i++) {
                const r = json[i]; if (!r[col.id]) continue;
                items.push({ id: r[col.id].toString(), name: (r[col.name]||'S/N').toString(), vehicle: col.vehicle ? (r[col.vehicle]||'').toString() : '', price: parseFloat(r[col.price])||0, stock: parseInt(r[col.stock])||0, category });
            }
            inventory[category] = items; await saveData(); renderAll(); alert("Éxito");
        } catch (err) { alert("Error"); }
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
    item.stock--; sales.push({ id: item.id, item_id: item.id, name: item.name, category: cat, price, date: new Date().toISOString() });
    await saveData(); renderAll(); document.getElementById('pos-selected-info').innerHTML = '<div class="status-badge">✅ Vendido</div>';
}

async function deleteSale(id, date) {
    if (!confirm("¿Seguro que deseas anular esta venta? El stock volverá a sumarse.")) return;
    const idx = sales.findIndex(s => (s.id === id || s.item_id === id) && s.date === date);
    if (idx > -1) {
        const s = sales[idx];
        const actualId = s.id || s.item_id;
        const item = inventory[s.category].find(i => i.id === actualId);
        if (item) {
            item.stock++;
        }
        if (client) {
            await client.from('ventas_taller_ro').delete().eq('item_id', actualId).eq('date', date);
        }
        sales.splice(idx, 1);
        await saveData();
        renderAll();
    } else {
        alert("No se pudo encontrar la venta para anular.");
    }
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
        if (!res.ok) throw new Error("No se encontró el archivo");
        const data = await res.arrayBuffer();
        processWegaData(data);
        status.innerText = "✅ Lista Lista"; status.style.background = "#dcfce7";
    } catch (e) { 
        status.innerText = "⚠️ Subir Excel"; 
        status.style.background = "#fef3c7";
    }
}

function setupWegaManualImport() {
    const input = document.getElementById('import-wega-manual');
    if (input) {
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    processWegaData(event.target.result);
                    alert("✅ Lista de filtros actualizada correctamente (" + wegaData.length + " filtros cargados)");
                    document.getElementById('wega-status').innerText = "✅ Lista Lista";
                    document.getElementById('wega-status').style.background = "#dcfce7";
                } catch (err) {
                    alert("Error al procesar el Excel. Revisa que tenga las columnas Filtros, Codigo, Descripcion, Precio.");
                }
            };
            reader.readAsArrayBuffer(file);
        };
    }
}

function processWegaData(data) {
    const wb = XLSX.read(data);
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    
    let startIndex = 0;
    for(let i=0; i<raw.length; i++) {
        if (raw[i][1] && raw[i][2]) { startIndex = i; break; }
    }

    wegaData = raw.slice(startIndex).map(row => {
        let price = parseFloat(row[3]) || 0;
        if (price > 0 && price < 1000) price = price * 1000;
        
        return {
            category: (row[0] || '').toString().toUpperCase(),
            code: (row[1] || '').toString().toUpperCase(),
            desc: (row[2] || '').toString(),
            price: price
        };
    }).filter(item => item.code && item.desc);
}

function updateOilSelect() {
    const select = document.getElementById('budget-oil-select');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Seleccionar Aceite --</option>';
    
    if (inventory.lubricentro.length === 0) {
        select.innerHTML = '<option value="">⚠️ No hay aceites en Inventario</option>';
        return;
    }

    inventory.lubricentro.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.innerText = `${item.name} ($${item.price}/L)`;
        if (item.id === currentVal) option.selected = true;
        select.appendChild(option);
    });
}

function setupBudget() {
    const btnSearch = document.getElementById('btn-search-budget');
    const btnSave = document.getElementById('btn-save-vehicle');
    const btnWA = document.getElementById('btn-whatsapp');
    const laborInput = document.getElementById('budget-labor');

    btnSearch.onclick = () => {
        const query = document.getElementById('budget-search').value.toLowerCase().trim();
        if (query.length < 3) return alert("Escriba marca y modelo (ej: Palio 1.4)");
        
        currentSelection = { oil: null, air: null, fuel: null, cabin: null };
        document.querySelectorAll('.config-item strong').forEach(el => el.innerText = '-');

        searchInWega(query);
    };

    laborInput.oninput = () => calculateBudgetTotal();
    document.getElementById('budget-oil-liters').oninput = () => calculateBudgetTotal();
    document.getElementById('budget-oil-select').onchange = () => {
        const select = document.getElementById('budget-oil-select');
        const oilId = select.value;
        const oilProd = inventory.lubricentro.find(i => i.id === oilId);
        if (oilProd) {
            currentSelection.oil_price_l = oilProd.price;
            currentSelection.oil_name = oilProd.name;
        } else {
            currentSelection.oil_price_l = 0;
            currentSelection.oil_name = null;
        }
        calculateBudgetTotal();
    };
    btnWA.onclick = () => copyBudgetToWhatsApp();
    btnSave.onclick = () => saveCurrentVehicleConfig();
}

function searchInWega(query) {
    const words = query.split(' ').filter(w => w.length > 1);
    const resultsContainer = document.getElementById('wega-results-container');
    const optionsGrid = document.getElementById('wega-options');
    optionsGrid.innerHTML = '';
    
    const categories = {
        oil: { title: "🛢️ Aceite", filters: [] },
        air: { title: "🌬️ Aire", filters: [] },
        fuel: { title: "⛽ Combustible", filters: [] },
        cabin: { title: "🏠 Habitáculo", filters: [] }
    };

    let foundAny = false;
    wegaData.forEach(item => {
        const desc = item.desc.toLowerCase();
        const catName = item.category.toLowerCase();
        const code = item.code;
        
        if (words.every(w => desc.includes(w))) {
            let type = null;
            if (catName.includes('ACEITE') || catName.includes('OIL') || code.startsWith('WEO') || code.startsWith('WO')) type = 'oil';
            else if (catName.includes('AIRE') || catName.includes('AIR') || code.startsWith('FAP') || code.startsWith('WAP')) type = 'air';
            else if (catName.includes('COMBUSTIBLE') || catName.includes('FUEL') || catName.includes('DIESEL') || code.startsWith('FCI') || code.startsWith('FCD') || code.startsWith('FCE')) type = 'fuel';
            else if (catName.includes('HABITACULO') || catName.includes('POLEN') || catName.includes('CABIN') || code.startsWith('AKX')) type = 'cabin';
            
            if (type) {
                categories[type].filters.push({ code, desc: item.desc, price: item.price });
                foundAny = true;
            }
        }
    });

    if (!foundAny) {
        optionsGrid.innerHTML = '<p style="padding:10px; color:red;">No se encontraron filtros para esa búsqueda.</p>';
    } else {
        Object.keys(categories).forEach(type => {
            const cat = categories[type];
            if (cat.filters.length > 0) {
                const header = document.createElement('h5'); header.innerText = cat.title;
                optionsGrid.appendChild(header);
                cat.filters.slice(0, 5).forEach((f, idx) => {
                    const item = document.createElement('div');
                    item.className = 'option-item';
                    item.innerHTML = `<strong>${f.code}</strong><small>${f.desc}</small><div style="color:var(--primary); font-weight:bold;">$${(f.price * 1.6).toFixed(0)}</div>`;
                    item.onclick = () => selectFilter(type, f);
                    optionsGrid.appendChild(item);
                    if (idx === 0) selectFilter(type, f);
                });
            }
        });
    }

    resultsContainer.classList.remove('hidden');
}

function selectFilter(type, filter) {
    currentSelection[type] = filter;
    document.getElementById(`sel-${type}`).innerText = filter.code;
    calculateBudgetTotal();
}

function calculateBudgetTotal() {
    const itemsDiv = document.getElementById('budget-items');
    const totalDiv = document.getElementById('budget-total');
    const resultCard = document.getElementById('budget-result');
    
    itemsDiv.innerHTML = '';
    let total = 0;

    Object.keys(currentSelection).forEach(type => {
        const f = currentSelection[type];
        if (f && type !== 'oil_liters' && type !== 'oil_price_l' && type !== 'oil_name') {
            const price = f.price * 1.6;
            total += price;
            itemsDiv.innerHTML += `<p><span>${type.toUpperCase()} (${f.code})</span> <span>$${price.toFixed(0)}</span></p>`;
        }
    });

    const oilLiters = parseFloat(document.getElementById('budget-oil-liters').value) || 0;
    if (currentSelection.oil_price_l && oilLiters > 0) {
        const cost = currentSelection.oil_price_l * oilLiters;
        total += cost;
        itemsDiv.innerHTML += `<p><span>Aceite (${currentSelection.oil_name} x${oilLiters}L)</span> <span>$${cost.toFixed(0)}</span></p>`;
    }

    const labor = parseFloat(document.getElementById('budget-labor').value) || 0;
    if (labor > 0) {
        total += labor;
        itemsDiv.innerHTML += `<p><span>Mano de Obra</span> <span>$${labor.toFixed(0)}</span></p>`;
    }

    totalDiv.innerHTML = `<h3>Total: $${total.toFixed(0)}</h3>`;
    resultCard.classList.remove('hidden');
}

async function saveCustomVehicles() {
    if (!client) return;
    const { data } = await client.from('datos_taller_ro').select('*').eq('category', 'vehicle_config');
    if (data) data.forEach(row => { const v = JSON.parse(row.vehicle); VEHICLE_DB[v.id || row.id] = v; });
}

init();
