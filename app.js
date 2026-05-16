<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>App Oficial - Taller de Turbos y Lubricentro</title>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
    <style>
        :root { --primary: #0f172a; --accent: #0ea5e9; --bg: #f8fafc; --card: #ffffff; --text: #1e293b; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', sans-serif; }
        body { background-color: var(--bg); color: var(--text); padding-bottom: 50px; }
        header { background: var(--primary); color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 10px rgba(0,0,0,0.1); position: sticky; top: 0; z-index: 100; }
        .logo { font-size: 1.5rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }
        
        .tabs { display: flex; background: white; padding: 0.5rem; gap: 10px; overflow-x: auto; sticky; top: 60px; z-index: 99; border-bottom: 1px solid #e2e8f0; }
        .tab-btn { padding: 0.8rem 1.5rem; border: none; background: #f1f5f9; border-radius: 8px; cursor: pointer; font-weight: 600; white-space: nowrap; transition: 0.3s; }
        .tab-btn.active { background: var(--accent); color: white; }

        .container { max-width: 1200px; margin: 2rem auto; padding: 0 1rem; }
        .tab-content { display: none; }
        .tab-content.active { display: block; animation: fadeIn 0.3s; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .card { background: white; border-radius: 12px; padding: 1.5rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); margin-bottom: 2rem; }
        h2 { margin-bottom: 1.5rem; font-size: 1.25rem; display: flex; align-items: center; gap: 10px; }

        .search-box { display: flex; gap: 10px; margin-bottom: 1.5rem; }
        input, select { flex: 1; padding: 0.8rem; border: 1px solid #e2e8f0; border-radius: 8px; outline: none; }
        button { padding: 0.8rem 1.5rem; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; transition: 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary { background: var(--primary); color: white; }
        .btn-accent { background: var(--accent); color: white; }
        .btn-success { background: #22c55e; color: white; }
        button:hover { opacity: 0.9; transform: scale(1.02); }

        table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: 0.9rem; }
        th, td { padding: 1rem; text-align: left; border-bottom: 1px solid #f1f5f9; }
        th { background: #f8fafc; color: #64748b; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
        tr:hover { background: #f1f5f9; }

        .stock-low { color: #ef4444; font-weight: 700; }
        .sync-badge { background: #dcfce7; color: #166534; padding: 4px 12px; border-radius: 99px; font-size: 0.8rem; font-weight: 600; }

        /* Login Screen */
        #login-screen { position: fixed; inset: 0; background: var(--bg); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem; }
        .login-card { background: white; padding: 2.5rem; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }

        /* POS Card */
        .pos-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
        .pos-card { border: 2px solid #e2e8f0; border-radius: 12px; padding: 1rem; }
        .pos-prices { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .price-tag { display: flex; justify-content: space-between; align-items: center; padding: 8px; border-radius: 6px; font-weight: 600; }
        .price-tag.cash { background: #dcfce7; color: #166534; }
        .price-tag.debit { background: #e0f2fe; color: #0369a1; }
        .price-tag.credit { background: #fef3c7; color: #92400e; }

        /* Modal */
        .modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1001; }
        .hidden { display: none !important; }

        /* Presupuesto */
        .budget-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; }
        .option-item { padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; margin-bottom: 8px; transition: 0.2s; }
        .option-item:hover { border-color: var(--accent); background: #f0f9ff; }
        .config-item { background: #f8fafc; padding: 15px; border-radius: 10px; margin-bottom: 10px; display: flex; justify-content: space-between; }
        .total-box { background: var(--primary); color: white; padding: 20px; border-radius: 12px; text-align: center; margin-top: 20px; }
        
        @media (max-width: 768px) { .budget-grid { grid-template-columns: 1fr; } .search-box { flex-direction: column; } }
    </style>
</head>
<body>

    <div id="login-screen">
        <div class="login-card">
            <div style="font-size: 3rem; margin-bottom: 1rem;">💧💨</div>
            <h1 style="margin-bottom: 0.5rem;">Acceso al Taller</h1>
            <p style="color: #64748b; margin-bottom: 2rem;">Ingresa tus credenciales para continuar</p>
            <form id="login-form">
                <input type="email" id="login-email" placeholder="Email" required style="margin-bottom: 1rem; width: 100%;">
                <input type="password" id="login-password" placeholder="Contraseña" required style="margin-bottom: 1.5rem; width: 100%;">
                <button type="submit" class="btn-primary" style="width: 100%; justify-content: center;">Entrar al Sistema</button>
            </form>
        </div>
    </div>

    <header>
        <div class="logo">💧💨 Taller & Lubricentro</div>
        <div style="display: flex; gap: 15px; align-items: center;">
            <button class="btn-success" id="sync-cloud-btn" onclick="syncWithCloud(true)">🔍 Sincronizar Nube</button>
            <button id="logout-btn" style="background: none; color: white; font-size: 1.5rem;">✕</button>
        </div>
    </header>

    <div class="tabs">
        <button class="tab-btn active" data-tab="turbos">Turbos</button>
        <button class="tab-btn" data-tab="lubricentro">Lubricentro</button>
        <button class="tab-btn" data-tab="libro-turbos">Libro Turbos</button>
        <button class="tab-btn" data-tab="libro-lubricentro">Libro Lubricentro</button>
        <button class="tab-btn" data-tab="presupuesto">📋 Presupuesto</button>
    </div>

    <div class="container">
        <!-- Pestaña Turbos -->
        <div id="turbos" class="tab-content active">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2>Inventario de Turbos</h2>
                    <div style="display: flex; gap: 10px;">
                        <label class="btn-tab" style="background:#f1f5f9; padding: 0.8rem; border-radius: 8px; cursor: pointer;">
                            📥 Importar Excel
                            <input type="file" id="import-turbos" hidden accept=".xlsx, .xls">
                        </label>
                        <button class="btn-primary" onclick="openAddModal('turbos')">+ Nuevo Turbo</button>
                    </div>
                </div>
                <input type="text" id="search-turbos" placeholder="Buscar por código, modelo o vehículo..." style="margin-bottom: 1rem; width: 100%;">
                <div style="overflow-x: auto;">
                    <table id="table-turbos">
                        <thead>
                            <tr><th>Tipo</th><th>Código</th><th>Modelo</th><th>Vehículo</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Pestaña Lubricentro -->
        <div id="lubricentro" class="tab-content">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2>Inventario de Lubricentro</h2>
                    <div style="display: flex; gap: 10px;">
                        <label class="btn-tab" style="background:#f1f5f9; padding: 0.8rem; border-radius: 8px; cursor: pointer;">
                            📥 Importar Excel
                            <input type="file" id="import-lubricentro" hidden accept=".xlsx, .xls">
                        </label>
                        <button class="btn-primary" onclick="openAddModal('lubricentro')">+ Nuevo Producto</button>
                    </div>
                </div>
                <div class="card" style="background: #f8fafc; border: 1px dashed #cbd5e1;">
                    <h3>Punto de Venta Rápido</h3>
                    <div class="search-box">
                        <input type="text" id="pos-search" placeholder="Buscar producto para vender (ej. Filtro, T001)...">
                    </div>
                    <div id="pos-suggestions" class="hidden" style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; max-height: 200px; overflow-y: auto; margin-top: -15px; margin-bottom: 15px; position: absolute; width: calc(100% - 3rem); z-index: 10;"></div>
                    <div id="pos-selected-info"></div>
                </div>
                <input type="text" id="search-lubricentro" placeholder="Buscar por código o nombre..." style="margin-bottom: 1rem; width: 100%;">
                <div style="overflow-x: auto;">
                    <table id="table-lubricentro">
                        <thead>
                            <tr><th>Tipo</th><th>Código</th><th>Artículo</th><th>Precio</th><th>Stock</th><th>Acciones</th></tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Libro Diario -->
        <div id="libro-turbos" class="tab-content">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Libro Diario: Turbos</h2>
                    <h3 id="total-sales-turbos" style="color: var(--accent);">$0.00</h3>
                </div>
                <table id="table-ventas-turbos">
                    <thead><tr><th>Fecha y Hora</th><th>Producto</th><th>Precio</th><th>Acciones</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>

        <div id="libro-lubricentro" class="tab-content">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2>Libro Diario: Lubricentro</h2>
                    <h3 id="total-sales-lubricentro" style="color: var(--accent);">$0.00</h3>
                </div>
                <table id="table-ventas-lubricentro">
                    <thead><tr><th>Fecha y Hora</th><th>Producto</th><th>Precio</th><th>Acciones</th></tr></thead>
                    <tbody></tbody>
                </table>
            </div>
        </div>

        <!-- Pestaña Presupuesto -->
        <div id="presupuesto" class="tab-content">
            <div class="card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <h2>📋 Presupuesto Inteligente</h2>
                    <div style="display: flex; gap: 10px;">
                        <label class="btn-tab" style="background:#f1f5f9; padding: 0.8rem; border-radius: 8px; cursor: pointer; font-size: 0.8rem;">
                            📥 Actualizar Filtros
                            <input type="file" id="import-wega-manual" hidden accept=".xlsx, .xls">
                        </label>
                        <span id="wega-status" class="sync-badge">Cargando...</span>
                    </div>
                </div>
                
                <div class="budget-grid">
                    <div>
                        <h4>1. Buscar Vehículo</h4>
                        <div class="search-box">
                            <input type="text" id="budget-search" placeholder="Ej: Palio 1.4, Hilux 2018...">
                            <button class="btn-primary" id="btn-search-budget">🔍 Buscar en Catálogo</button>
                            <!-- BOTÓN NUEVO CATÁLOGO WEB -->
                            <button type="button" onclick="window.open('https://www.wega.com.ar/catalogo', '_blank')" style="background:#64748b; color:white;">🌐 Ver Web Wega</button>
                        </div>
                        <div id="wega-results-container" class="hidden">
                            <h5>Resultados WEGA (Click para seleccionar)</h5>
                            <div id="wega-options" style="max-height: 400px; overflow-y: auto;"></div>
                        </div>
                    </div>
                    <div>
                        <h4>2. Configuración del Servicio</h4>
                        <div id="budget-config">
                            <div class="config-item"><span>🛢️ Aceite:</span> <strong id="sel-oil">-</strong></div>
                            <div class="config-item"><span>🌬️ Aire:</span> <strong id="sel-air">-</strong></div>
                            <div class="config-item"><span>⛽ Combustible:</span> <strong id="sel-fuel">-</strong></div>
                            <div class="config-item"><span>🏠 Habitáculo:</span> <strong id="sel-cabin">-</strong></div>
                        </div>
                        <div style="margin-top: 1.5rem;">
                            <label>Seleccionar Aceite (Inventario)</label>
                            <select id="budget-oil-select" style="width: 100%; margin-bottom: 1rem;"></select>
                            <div style="display: flex; gap: 10px;">
                                <div style="flex:1">
                                    <label>Litros</label>
                                    <input type="number" id="budget-oil-liters" value="4" step="0.1">
                                </div>
                                <div style="flex:1">
                                    <label>Mano de Obra ($)</label>
                                    <input type="number" id="budget-labor" value="0">
                                </div>
                            </div>
                        </div>
                        <div id="budget-result" class="hidden">
                            <div id="budget-items" style="margin-top: 1rem; font-size: 0.9rem; border-top: 1px solid #e2e8f0; padding-top: 1rem;"></div>
                            <div id="budget-total" class="total-box"></div>
                            <button id="btn-whatsapp" class="btn-success" style="width: 100%; justify-content: center; margin-top: 10px;">📱 Enviar por WhatsApp</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Modal Agregar/Editar -->
    <div id="add-modal" class="modal hidden">
        <div class="card" style="width: 100%; max-width: 500px;">
            <h2 id="modal-title">Agregar Producto</h2>
            <form id="add-form">
                <input type="hidden" id="modal-category">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div><label>Tipo</label><input type="text" id="input-type" placeholder="Ej: Aceite, Filtro..."></div>
                    <div><label>Código</label><input type="text" id="input-code" required></div>
                </div>
                <div style="margin-bottom: 1rem;"><label>Nombre / Modelo</label><input type="text" id="input-name" required></div>
                <div id="group-vehicle" style="margin-bottom: 1rem; display: none;"><label>Vehículo</label><input type="text" id="input-vehicle"></div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                    <div><label>Precio</label><input type="number" id="input-price" step="0.01" required></div>
                    <div><label>Stock</label><input type="number" id="input-stock" required></div>
                </div>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button type="button" onclick="closeAddModal()" style="background:#e2e8f0;">Cancelar</button>
                    <button type="submit" class="btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    </div>

    <script src="app.js"></script>
</body>
</html>
