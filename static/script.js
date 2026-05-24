// ── Caché de productos para la pantalla de ventas (evita una API call por keystroke) ──
const _PROD_CACHE_TTL = 3 * 60 * 1000; // 3 minutos
let _prodCache = null;
let _prodCacheTs = 0;

async function getProductosCached(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _prodCache && (now - _prodCacheTs) < _PROD_CACHE_TTL) {
        return _prodCache;
    }
    // ?lite=true: sin Preload de empaques, solo campos de búsqueda → respuesta ~10x más liviana
    const res = await fetch('/productos?lite=true');
    const data = await res.json();
    const lista = Array.isArray(data) ? data : (data.items || []);
    _prodCache = lista;
    _prodCacheTs = now;
    window.__productosById = Object.create(null);
    lista.forEach(p => { window.__productosById[p.ID] = p; });
    return lista;
}

function invalidarCacheProductos() {
    _prodCache = null;
    _prodCacheTs = 0;
}

// ── Caché de empaques por producto (evita recargar al seleccionar el mismo producto) ──
const _EMP_CACHE_TTL = 5 * 60 * 1000; // 5 minutos
const _empCache = Object.create(null); // { [productoId]: { data, ts } }

async function getEmpaquesCached(productoId, forceRefresh = false) {
    const now = Date.now();
    const hit = _empCache[productoId];
    if (!forceRefresh && hit && (now - hit.ts) < _EMP_CACHE_TTL) {
        return hit.data;
    }
    const res = await fetch(`/productos/${productoId}/empaques`);
    const data = await res.json();
    _empCache[productoId] = { data, ts: now };
    return data;
}

function invalidarCacheEmpaques(productoId) {
    if (productoId != null) {
        delete _empCache[productoId];
    } else {
        // invalida todo (ej: al actualizar un empaque genérico)
        Object.keys(_empCache).forEach(k => delete _empCache[k]);
    }
}

// Configuración del negocio (edita estos valores)
const businessInfo = {
  nombre: 'Droguería Salo Plus',
  nit: 'NIT 1.049.647.310-5',
  direccion: 'Cra 9 # 24-70 Las Nieves, Tunja - Boyacá',
  telefono: '+57 321 934 9781',
  // Opcional: nombre de archivo del logo dentro de /images (por ejemplo 'logo.png')
  logo: 'logo.jpg'
};

// Función para determinar color según fecha de vencimiento
function getExpirationColor(fechaVenc) {
    if (!fechaVenc || fechaVenc.trim() === '') return '';

    const today = new Date();
    const expDate = new Date(fechaVenc);
    const diffTime = expDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
        return 'background-color: #ffebee; color: #c62828; font-weight: bold;';
    } else if (diffDays <= 90) {
        return 'background-color: #fff8e1; color: #f57f17; font-weight: bold;';
    } else {
        return 'background-color: #e8f5e8; color: #2e7d32;';
    }
}

// Utilidad simple para notificaciones
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    el.addEventListener('click', () => el.remove());
    container.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

// ================== Empaques (ventas) ==================
async function loadEmpaquesForProduct(productoId) {
    console.log('🔍 loadEmpaquesForProduct called with productoId:', productoId);
    const controls = document.getElementById('empaqueControls');
    const sel = document.getElementById('empaqueSeleccionado');
    const cantidadInput = document.querySelector('input[name="cantidad"]'); // Campo unificado
    const precioEmp = document.getElementById('precioPorEmpaque');
    const stockEmp = document.getElementById('stockEmpaques');
    if (!sel || !controls || !cantidadInput) {
        console.log('❌ Elements not found - sel:', !!sel, 'controls:', !!controls, 'cantidadInput:', !!cantidadInput);
        return;
    }
    if (!productoId) {
        console.log('❌ No productoId provided, hiding controls');
        controls.style.display = 'none';
        return;
    }
    try {
        const productoEmpaques = await getEmpaquesCached(productoId);
        window.__empaquesByProd = window.__empaquesByProd || Object.create(null);
        window.__empaquesByProd[productoId] = Array.isArray(productoEmpaques) ? productoEmpaques : [];
        // Obtener precio base del producto
        const prodSelect = document.getElementById('productoSeleccionado');
        const opt = prodSelect ? prodSelect.options[prodSelect.selectedIndex] : null;
        const precioBase = opt ? Number(opt.getAttribute('data-precio') || '0') : 0;

        // Render opciones
        sel.innerHTML = '';
        console.log('🔄 Processing', window.__empaquesByProd[productoId].length, 'empaques');

        // Ordenar empaques por factor de conversión (menor a mayor)
        const empaquesOrdenados = [...window.__empaquesByProd[productoId]].sort((a, b) => {
            const factorA = Number((a.empaque || a.Empaque)?.factor_conversion || 0);
            const factorB = Number((b.empaque || b.Empaque)?.factor_conversion || 0);
            return factorA - factorB;
        });

        for (const pe of empaquesOrdenados) {
            console.log('📋 Processing ProductoEmpaque:', pe);
            const empaque = pe.empaque || pe.Empaque;
            console.log('📦 Empaque data:', empaque);
            if (!empaque) {
                console.log('❌ Skipping - no empaque data');
                continue;
            }

            const factor = Number(empaque.factor_conversion || empaque.FactorConversion || 0);
            const ov = pe.precio_override ?? pe.PrecioOverride;
            const hasOv = ov != null && ov !== '';
            const empaqueId = pe.empaque_id || pe.EmpaqueID;
            const precioEfectivo = hasOv ? Number(ov) : precioBase;
            const precioTotal = precioEfectivo * factor;

            const descripcion = empaque.descripcion || `${empaque.tipo} x${factor}`;
            const precioTexto = `$${precioTotal.toLocaleString()}`;

            console.log('✅ Adding option:', empaque.tipo, 'factor:', factor, 'precio:', precioTotal);
            sel.innerHTML += `<option value="${empaqueId}" data-factor="${factor}" data-override="${hasOv ? Number(ov) : ''}" data-pe-id="${pe.ID}">${descripcion} - ${precioTexto}</option>`;
        }

        // Siempre mostrar controles si hay empaques disponibles
        const shouldShow = sel.options.length > 0;
        controls.style.display = shouldShow ? 'flex' : 'none';

        // Seleccionar automáticamente la primera opción (unidad mínima)
        if (shouldShow && sel.options.length > 0) {
            sel.selectedIndex = 0;
        }
        console.log('👁️ Controls display:', shouldShow ? 'SHOWING' : 'HIDING', '- Options count:', sel.options.length);
        // Reset and compute
        cantidadInput.value = '1';
        cantidadInput.placeholder = shouldShow ? 'Cantidad (empaques)' : 'Cantidad (unidades)';
        computeEmpaqueUI();
        sel.onchange = computeEmpaqueUI;
        cantidadInput.oninput = computeEmpaqueUI;
    } catch (e) {
        controls.style.display = 'none';
    }
    function computeEmpaqueUI() {
        const prodSelect = document.getElementById('productoSeleccionado');
        const cantidadInput = document.querySelector('input[name="cantidad"]');
        const opt = prodSelect ? prodSelect.options[prodSelect.selectedIndex] : null;
        const precioUnit = opt ? Number(opt.getAttribute('data-precio')||'0') : 0;
        const stockUnidades = (() => {
            const selId = prodSelect ? prodSelect.value : '';
            const prod = selId && window.__productosById ? window.__productosById[selId] : null;
            return prod ? Number(prod.cantidad||0) : 0;
        })();

        const emOpt = sel ? sel.options[sel.selectedIndex] : null;
        if (!emOpt || !emOpt.value) {
            if (precioEmp) precioEmp.textContent = `Precio unitario: $ ${precioUnit.toFixed(2)}`;
            if (stockEmp) stockEmp.textContent = `Stock: ${stockUnidades} unidades`;
            if (cantidadInput) cantidadInput.placeholder = "Cantidad (unidades)";
            return;
        }

        const factor = Number(emOpt.getAttribute('data-factor')||'0');
        const override = emOpt.getAttribute('data-override');
        const unitEff = (override && override !== '') ? Number(override) : precioUnit;
        const precioPorEmpaque = unitEff * factor;
        const disponibles = factor > 0 ? Math.floor(stockUnidades / factor) : 0;

        const cantEmpaques = Number(cantidadInput.value || 1);
        const precioTotal = cantEmpaques * precioPorEmpaque;

        if (precioEmp) precioEmp.textContent = `Precio por empaque: $ ${precioPorEmpaque.toFixed(2)} | Total: $ ${precioTotal.toFixed(2)}`;
        if (stockEmp) stockEmp.textContent = `Disponibles: ${disponibles} empaques (${stockUnidades} unidades)`;

        console.log(`💊 Empaque calculado: ${cantEmpaques} empaques × $${precioPorEmpaque.toFixed(2)} = $${precioTotal.toFixed(2)} | Factor: ${factor}`);

        cantidadInput.placeholder = `Cantidad de empaques (factor: ${factor})`;
        cantidadInput.title = `Cada empaque contiene ${factor} unidades`;
    }
}

// Rellenar el select de productos en Admin Ventas (top-level)
async function populateProductoSelect() {
    const select = document.getElementById('productoSeleccionado');
    if (!select) return;
    select.innerHTML = '<option value="">Seleccione un producto</option>';
    try {
        const productos = await getProductosCached();
        window.__productosById = Object.create(null);
        productos.forEach(p => {
            window.__productosById[p.ID] = p;
            const precio = Number(p.precio_unitario || 0);
            const nombreLimpio = p.nombre.split(' x ')[0] || p.nombre;
            select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${nombreLimpio}</option>`;
        });
        const spanPrecio = document.getElementById('precioSeleccionado');
        const inputPrecio = document.getElementById('precio_unitario_vista');
        if (spanPrecio) {
            const sel = select.value;
            const item = sel && window.__productosById ? window.__productosById[sel] : null;
            const precio = item ? Number(item.precio_unitario || 0) : 0;
            spanPrecio.textContent = `Precio: $ ${precio.toFixed(2)}`;
            if (inputPrecio) inputPrecio.value = precio.toFixed(2);
        }
    } catch {}
}

// Impresión del carrito (top-level)
function openPrintWindowCarrito(items, fechaISO, tipoPago, folioOverride) {
    try {
        const w = window.open('', '_blank');
        if (!w) { showToast('Bloqueado por el navegador: habilita ventanas emergentes para imprimir', 'error'); return; }
        const fecha = formatDateTimeLocal(fechaISO || new Date().toISOString());
        const folio = folioOverride ? String(folioOverride) : `C-${Date.now()}`;
        const rows = items.map(it => `
          <div class="item">
            <div class="item-nombre">${it.nombre ?? ''}</div>
            <div class="item-cant">${it.cantidad} x $${formatMoney(it.precio_unitario)}</div>
            <div class="item-sub">= $${formatMoney(it.cantidad * it.precio_unitario)}</div>
          </div>`).join('');
        const total = items.reduce((a, b) => a + (b.cantidad * b.precio_unitario), 0);
        const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=160"><meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>Comprobante de venta (Carrito)</title>
${buildReceiptStyles()}
</head>
<body>
  ${buildReceiptHeader('Comprobante de venta (Carrito)', fecha)}
  <div class="small" style="margin-top:4px">Folio: ${folio}</div>
  <div class="small" style="margin-top:2px">Pago: ${tipoPago || 'efectivo'}</div>
  <hr class="sep">
  ${rows}
  <div class="tot">TOTAL: $${formatMoney(total)}</div>
  <button onclick="window.print()">Imprimir</button>
</body></html>`;
        w.document.open();
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
    } catch (e) {
        console.error(e);
        showToast('No se pudo abrir la ventana de impresión', 'error');
    }
}

// Fecha helpers (top-level)
function isoFromDateInput(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const now = new Date();
        const [y, m, d] = value.split('-').map(Number);
        const dt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        return dt.toISOString();
    }
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toISOString();
    return null;
}

function formatDateTimeLocal(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
}

function formatMoney(n) {
    const num = Number(n || 0);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildReceiptHeader(title, fecha) {
    const logoHtml = businessInfo.logo
        ? `<div style="margin-bottom:3px"><img src="/images/${businessInfo.logo}" alt="logo" style="max-height:45px;max-width:80%"/></div>`
        : '';
    return `
  <div style="text-align:left;word-break:break-word;overflow-wrap:break-word">
    ${logoHtml}
    <div style="font-size:10px;font-weight:bold;color:#000">${businessInfo.nombre}</div>
    <div style="font-size:8px;color:#000">${businessInfo.nit}</div>
    <div style="font-size:8px;color:#000">${businessInfo.direccion}</div>
    <div style="font-size:8px;color:#000">${businessInfo.telefono}</div>
    <div style="margin-top:3px;font-size:8px;font-weight:bold;color:#000">${title}</div>
    <div style="font-size:8px;color:#000">Fecha: ${fecha}</div>
  </div>`;
}

function buildReceiptStyles() {
    return `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100% !important; max-width: 100% !important; overflow-x: hidden !important; }
  body { font-family: Arial, sans-serif; padding: 2mm; font-size: 8px; color: #000 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .item { border-bottom: 1px dashed #888; padding: 2px 0; word-break: break-word; overflow-wrap: break-word; }
  .item-nombre { font-size: 8px; font-weight: bold; color: #000 !important; }
  .item-cant  { font-size: 8px; color: #000 !important; }
  .item-sub   { font-size: 8px; font-weight: bold; color: #000 !important; }
  .sep { border: none; border-top: 1px solid #000; margin: 3px 0; }
  .tot { font-weight: bold; font-size: 10px; margin-top: 4px; border-top: 2px solid #000; padding-top: 3px; color: #000 !important; }
  .small { font-size: 8px; color: #000 !important; }
  @media print { button { display: none !important; } }
  @page { size: 58mm auto; margin: 0; }
  @media print { body { padding: 2mm !important; } }
</style>`;
}

// Impresión de venta
function openPrintWindow(venta) {
    try {
        const w = window.open('', '_blank');
        if (!w) { showToast('Bloqueado por el navegador: habilita ventanas emergentes para imprimir', 'error'); return; }
        const fecha = formatDateTimeLocal(venta.fecha);
        const folio = (venta && typeof venta.folio !== 'undefined' && venta.folio !== null) ? `V-${venta.folio}` : `V-${Date.now()}`;
        const items = Array.isArray(venta.items) && venta.items.length > 0
            ? venta.items
            : (venta.producto ? [{ producto: venta.producto, cantidad: venta.cantidad, precio_unitario: venta.precio_unitario, total: venta.total }] : []);
        const computedTotal = (venta.total != null)
            ? Number(venta.total)
            : items.reduce((acc, it) => acc + Number((it.cantidad||0) * (it.precio_unitario||0)), 0);
        const rows = items.map(it => `
          <div class="item">
            <div class="item-nombre">${it.producto?.nombre ?? ''}</div>
            <div class="item-cant">${it.cantidad ?? ''} x $${formatMoney(it.precio_unitario ?? 0)}</div>
            <div class="item-sub">= $${formatMoney((it.cantidad||0) * (it.precio_unitario||0))}</div>
          </div>`).join('');
        const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=160"><meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>Comprobante de venta</title>
${buildReceiptStyles()}
</head>
<body>
  ${buildReceiptHeader('Comprobante de venta', fecha)}
  <div class="small" style="margin-top:4px">Folio: ${folio}</div>
  <div class="small" style="margin-top:2px">Pago: ${venta.tipo_pago || 'efectivo'}</div>
  <hr class="sep">
  ${rows || ''}
  <div class="tot">TOTAL: $${formatMoney(computedTotal)}</div>
  <button onclick="window.print()">Imprimir</button>
  <button onclick="window.close()">Cerrar</button>
</body></html>`;
        w.document.write(html);
        w.document.close();
    } catch (e) {
        console.error(e);
        showToast('No se pudo abrir la ventana de impresión', 'error');
    }
}

function attachVentaPrintButtons(container, ventas) {
    if (!container) return;
    container.querySelectorAll('button[data-print]')?.forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-print'));
            if (isNaN(idx) || idx < 0 || idx >= ventas.length) return;
            openPrintWindow(ventas[idx]);
        });
    });
}

document.addEventListener('DOMContentLoaded', function() {
    populateProductoSelect();
    const selectProd = document.getElementById('productoSeleccionado');
    if (selectProd) {
        selectProd.addEventListener('change', () => {
            const spanPrecio = document.getElementById('precioSeleccionado');
            const inputPrecio = document.getElementById('precio_unitario_vista');
            const opt = selectProd.options[selectProd.selectedIndex];
            const precio = opt ? parseFloat(opt.getAttribute('data-precio') || '0') : 0;
            if (spanPrecio) spanPrecio.textContent = `Precio: $ ${Number(precio).toFixed(2)}`;
            if (inputPrecio) inputPrecio.value = Number(precio).toFixed(2);
            const prodId = opt ? opt.value : '';
            loadEmpaquesForProduct(prodId);
        });
    }
    // 📌 Registrar venta (con verificación de existencia)
    const formVenta = document.getElementById('formVenta');
    // Botón imprimir carrito
    const btnImprimirCarrito = document.getElementById('imprimirCarrito');
    // Handler del botón "Vender" (submit del formulario) para venta individual
    if (formVenta) {
        formVenta.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formVals = Object.fromEntries(new FormData(formVenta).entries());
            const producto_id = parseInt(formVals.producto_id);
            const cantidad = parseInt(formVals.cantidad || '0');
            const tipo_pago = (document.getElementById('tipoPago')?.value) || 'efectivo';
            let fecha = formVals.fecha;
            if (!fecha || fecha.trim() === '') {
                fecha = new Date().toISOString();
            } else {
                const iso = isoFromDateInput(fecha);
                if (iso) fecha = iso; else fecha = undefined;
            }
            if (!(producto_id > 0)) { showToast('Seleccione un producto', 'error'); return; }
            const emSel = document.getElementById('empaqueSeleccionado');
            const cantEmp = document.getElementById('cantidadEmpaques');
            const empaque_id = emSel && emSel.value ? parseInt(emSel.value) : 0;
            const cantidad_empaques = cantEmp ? parseInt(cantEmp.value || '0') : 0;
            let url = '/ventas';
            let payload;
            if (empaque_id > 0) {
                if (!(cantidad_empaques > 0)) { showToast('Ingrese cantidad de empaques válida', 'error'); return; }
                url = '/ventas/lote';
                payload = {
                    tipo_pago,
                    ...(fecha ? { fecha } : {}),
                    items: [ { producto_id, empaque_id, cantidad_empaques } ]
                };
            } else {
                if (!(cantidad > 0)) { showToast('Ingrese cantidad válida', 'error'); return; }
                payload = {
                    tipo_pago,
                    ...(fecha ? { fecha } : {}),
                    items: [ { producto_id, cantidad } ]
                };
            }
            try {
                const resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!resp.ok) {
                    const err = await resp.json().catch(()=>({}));
                    throw new Error(err.error || 'No se pudo registrar la venta');
                }
                showToast('Venta registrada con éxito', 'success');
                formVenta.reset();
                invalidarCacheProductos();
                await cargarProductos();
                await cargarVentas();
                if (typeof populateProductoSelect === 'function') populateProductoSelect();
            } catch (err) {
                console.error(err);
                showToast(err.message || 'Error al registrar la venta', 'error');
            }
        });
    }
    if (btnImprimirCarrito) {
        btnImprimirCarrito.addEventListener('click', () => {
            if (carrito.length === 0) { showToast('El carrito está vacío', 'error'); return; }
            const fechaInp = document.querySelector('#formVenta [name="fecha"]');
            let fechaISO = new Date().toISOString();
            if (fechaInp && fechaInp.value) {
                const iso = isoFromDateInput(fechaInp.value);
                if (iso) fechaISO = iso;
            }
            const tipoPago = (document.getElementById('tipoPago')?.value) || 'efectivo';
            openPrintWindowCarrito(carrito, fechaISO, tipoPago);
        });
    }

    // Carrito de venta (venta atómica)
    const carrito = [];

    function renderCarrito() {
        const tbody = document.getElementById('tablaCarritoVenta');
        const totalEl = document.getElementById('totalCarrito');
        if (!tbody || !totalEl) return;
        tbody.innerHTML = '';
        let total = 0;
        carrito.forEach((it, idx) => {
            const subtotal = it.cantidad * it.precio_unitario;
            total += subtotal;
            tbody.innerHTML += `<tr>
                <td>${it.nombre ?? ''}</td>
                <td>${it.cantidad}</td>
                <td>${Number(it.precio_unitario).toFixed(2)}</td>
                <td>${subtotal.toFixed(2)}</td>
                <td>
                  <button type="button" data-del="${idx}">Eliminar</button>
                  <button type="button" data-print-cart-item="${idx}">Imprimir</button>
                </td>
            </tr>`;
        });
        totalEl.textContent = total.toFixed(2);
        tbody.querySelectorAll('button[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.getAttribute('data-del'));
                if (!isNaN(i)) {
                    carrito.splice(i, 1);
                    renderCarrito();
                }
            });
        });
        tbody.querySelectorAll('button[data-print-cart-item]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.getAttribute('data-print-cart-item'));
                if (isNaN(i)) return;
                const fechaInp = document.querySelector('#formVenta [name="fecha"]');
                let fechaISO = new Date().toISOString();
                if (fechaInp && fechaInp.value) {
                    const iso = isoFromDateInput(fechaInp.value);
                    if (iso) fechaISO = iso;
                }
                const tipoPago = (document.getElementById('tipoPago')?.value) || 'efectivo';
                openPrintWindowCarrito([carrito[i]], fechaISO, tipoPago);
            });
        });
    }

    const btnAgregar = document.getElementById('agregarItemVenta');
    if (btnAgregar) {
        btnAgregar.addEventListener('click', () => {
            const select = document.getElementById('productoSeleccionado');
            const cantidadUnidades = parseInt((document.querySelector('#formVenta [name="cantidad"]').value || '0'));
            const selectedOption = select ? select.options[select.selectedIndex] : null;
            const precio = selectedOption ? parseFloat(selectedOption.getAttribute('data-precio') || '0') : 0;
            if (!select || !select.value) { showToast('Seleccione un producto', 'error'); return; }
            const emSel = document.getElementById('empaqueSeleccionado');
            const empaque_id = emSel && emSel.value ? parseInt(emSel.value) : 0;
            const emOpt = emSel && emSel.options ? emSel.options[emSel.selectedIndex] : null;
            const factor = emOpt ? parseInt(emOpt.getAttribute('data-factor') || '0') : 0;
            const ov = emOpt ? emOpt.getAttribute('data-override') : null;
            const unitEff = (ov && ov !== '') ? Number(ov) : precio;
            const cantidadEmpaques = empaque_id > 0 ? cantidadUnidades : 0;
            let etiqueta = '';
            let cantidadParaTabla, precioUnitarioParaTabla, cantidadTotalUnidades;

            if (empaque_id > 0) {
                if (!(cantidadEmpaques > 0) || !(factor > 0)) { showToast('Complete empaque y cantidad', 'error'); return; }
                cantidadParaTabla = cantidadEmpaques;
                precioUnitarioParaTabla = unitEff * factor;
                cantidadTotalUnidades = cantidadEmpaques * factor;
                etiqueta = ` (${emOpt.textContent})`;
                console.log(`🛒 Empaque: ${cantidadEmpaques} empaques × $${precioUnitarioParaTabla} = $${(cantidadParaTabla * precioUnitarioParaTabla).toFixed(2)} | Total unidades: ${cantidadTotalUnidades}`);
            } else {
                cantidadParaTabla = cantidadUnidades;
                precioUnitarioParaTabla = unitEff;
                cantidadTotalUnidades = cantidadUnidades;
                if (!(cantidadParaTabla > 0)) { showToast('Ingrese cantidad válida', 'error'); return; }
            }

            if (!(precio >= 0)) { showToast('Precio inválido', 'error'); return; }
            const option = select.options[select.selectedIndex];
            const nombre = option ? option.textContent : '';

            carrito.push({
                producto_id: parseInt(select.value),
                cantidad: cantidadParaTabla,
                precio_unitario: precioUnitarioParaTabla,
                cantidad_total_unidades: cantidadTotalUnidades,
                empaque_id: empaque_id || null,
                factor: factor || 1,
                nombre: nombre + etiqueta
            });
            renderCarrito();
            showToast('Ítem agregado al carrito', 'success');
        });
    }

    const btnConfirmar = document.getElementById('confirmarVenta');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', async () => {
            if (carrito.length === 0) { showToast('El carrito está vacío', 'error'); return; }
            const fechaInp = document.querySelector('#formVenta [name="fecha"]');
            let fechaISO = new Date().toISOString();
            if (fechaInp && fechaInp.value) {
                const iso = isoFromDateInput(fechaInp.value);
                if (iso) fechaISO = iso;
            }
            try {
                const itemsSnapshot = carrito.map(x => ({...x}));
                const resp = await fetch('/ventas/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fecha: fechaISO,
                  tipo_pago: (document.getElementById('tipoPago')?.value)||'efectivo',
                  items: carrito.map((it) => {
                    const cantidadUnidades = it.cantidad_total_unidades || it.cantidad;
                    if (it.empaque_id) {
                      console.log(`📦 Venta por empaque: ${it.cantidad} empaques (factor: ${it.factor}) = ${cantidadUnidades} unidades`);
                    } else {
                      console.log(`📦 Venta por unidades: ${cantidadUnidades} unidades`);
                    }
                    return {
                      producto_id: it.producto_id,
                      cantidad: cantidadUnidades,
                      descuento: it.descuento || 0,
                      descuento_pct: it.descuentoPct || 0
                    };
                  })
                })
            });
                if (!resp.ok) {
                    const err = await resp.json().catch(() => ({}));
                    throw new Error(err.error || 'Error al confirmar venta');
                }
                const data = await resp.json();
                showToast('Venta confirmada', 'success');
                carrito.length = 0;
                renderCarrito();
                invalidarCacheProductos();
                await cargarProductos();
                await cargarVentas();
                const tipoPago = (document.getElementById('tipoPago')?.value) || 'efectivo';
                openPrintWindowCarrito(itemsSnapshot, fechaISO, tipoPago, data.folio_lote ? `V-${data.folio_lote}` : undefined);
            } catch (e) {
                console.error(e);
                showToast(e.message || 'No se pudo confirmar la venta', 'error');
            }
        });
    }

    // 🔍 Buscar productos mientras se escribe (con verificación de existencia)
    const buscarProductoVenta = document.getElementById("buscarProductoVenta");
    if (buscarProductoVenta) {
        buscarProductoVenta.addEventListener("keydown", function(e) {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        buscarProductoVenta.addEventListener("input", async e => {
            let q = e.target.value.trim();
            if (q.length < 1) return;
            // Filtra desde el caché en memoria — sin API call por keystroke
            const todos = await getProductosCached();
            const ql = q.toLowerCase();
            const productos = todos.filter(p =>
                p.nombre?.toLowerCase().includes(ql) ||
                p.laboratorio?.toLowerCase().includes(ql) ||
                p.codigo_barras?.includes(q)
            );
            let select = document.getElementById("productoSeleccionado");
            if (!select) return;
            select.innerHTML = '<option value="">Seleccione un producto</option>';
            window.__productosById = Object.create(null);
            productos.forEach(p => {
                window.__productosById[p.ID] = p;
                const precio = Number(p.precio_unitario || 0);
                select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${p.nombre}</option>`;
            });
            if (productos.length > 0) {
                select.value = productos[0].ID;
                await loadEmpaquesForProduct(productos[0].ID);
            }
        });
    }

    // 📌 Registrar producto
    const formProducto = document.getElementById("formProducto");
    if (formProducto) {
        formProducto.addEventListener("submit", async e => {
            e.preventDefault();
            let datos = Object.fromEntries(new FormData(e.target).entries());
            datos.cantidad = parseInt(datos.cantidad || "0");
            datos.precio_unitario = parseFloat(datos.precio_unitario || "0");
            if (isNaN(datos.precio_unitario) || datos.precio_unitario < 0) {
                showToast('Precio unitario inválido', 'error');
                return;
            }
            const pad = n => String(n).padStart(2, '0');
            const now = new Date();
            const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            if (!datos.fecha_ingreso || datos.fecha_ingreso.trim() === "") datos.fecha_ingreso = today;
            if (!datos.fecha_venc || datos.fecha_venc.trim() === "") datos.fecha_venc = today;

            try {
                const datosCompletos = {
                    ...datos,
                    empaques_seleccionados: empaquesSeleccionados.map(emp => ({ ID: emp.ID }))
                };

                const respProducto = await fetch("/productos", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(datosCompletos)
                });

                if (!respProducto.ok) {
                    const error = await respProducto.json();
                    throw new Error(error.error || 'Error al crear producto');
                }

                const producto = await respProducto.json();

                if (empaquesSeleccionados.length > 0) {
                    showToast(`Producto creado con ${empaquesSeleccionados.length} empaques asociados`, 'success');
                } else {
                    showToast('Producto creado exitosamente', 'success');
                }

                e.target.reset();
                limpiarEmpaques();
                cargarProductos();
            } catch (error) {
                console.error('Error:', error);
                showToast(error.message || 'Error al crear producto', 'error');
            }
        });
    }

    // 🔎 Búsqueda en listado de productos (tabla principal)
    const busqueda = document.getElementById("busqueda");
    if (busqueda) {
        let t;
        busqueda.addEventListener("input", e => {
            const q = e.target.value;
            if (t) clearTimeout(t);
            t = setTimeout(() => {
                window.__prodPage = 1;
                cargarProductos(q);
            }, 300);
        });
    }

    // 🗓️ Filtros de historial
    document.querySelectorAll('form[action="/historial"]').forEach(form => {
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const pad = n => String(n).padStart(2, '0');
            const now = new Date();
            const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            const desdeInp = form.querySelector('input[name="desde"][type="date"]');
            const hastaInp = form.querySelector('input[name="hasta"][type="date"]');
            const desde = (desdeInp && desdeInp.value) ? desdeInp.value : today;
            const hasta = (hastaInp && hastaInp.value) ? hastaInp.value : today;

            try {
                const res = await fetch(`/ventas?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`);
                const data = await res.json();
                const tbody = document.getElementById('tablaVentasHistorial');
                if (tbody) {
                    tbody.innerHTML = '';
                    (data.ventas || []).forEach((v, idx) => {
                        const totalVenta = Number(v.total || 0);
                        const itemsRows = (v.items || []).map(it => {
                            const totalItem = (it.cantidad || 0) * (it.precio_unitario || 0);
                            return `<tr>
                                <td>${it.producto?.nombre ?? ''}</td>
                                <td>${it.cantidad ?? ''}</td>
                                <td>${it.precio_unitario != null ? Number(it.precio_unitario).toFixed(2) : ''}</td>
                                <td>${it.descuento > 0 ? '- $' + Number(it.descuento).toFixed(2) : '—'}</td>
                                <td>${Number(totalItem).toFixed(2)}</td>
                            </tr>`;
                        }).join('');
                        const itemsTable = `<table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="text-align:left;">Producto</th>
                                    <th style="text-align:left;">Cantidad</th>
                                    <th style="text-align:left;">Precio unitario</th>
                                    <th style="text-align:left;">Descuento</th>
                                    <th style="text-align:left;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsRows || '<tr><td colspan="5">Sin items</td></tr>'}
                            </tbody>
                        </table>`;
                        const jsonPretty = (() => { try { return JSON.stringify(v, null, 2); } catch { return ''; } })();
                        tbody.innerHTML += `<tr>
                            <td>${v.ID ?? ''}</td>
                            <td>${formatDateTimeLocal(v.fecha)}</td>
                            <td>${v.tipo_pago ?? ''}</td>
                            <td>${v.folio ?? ''}</td>
                            <td>${totalVenta.toFixed(2)}</td>
                            <td>${v.total_descuentos > 0 ? '$'+Number(v.total_descuentos).toFixed(2) : '—'}</td>
                            <td>${itemsTable}</td>
                            <td><button data-print="${idx}">Imprimir</button></td>
                           </tr>`;
                    });
                    attachVentaPrintButtons(tbody, (data.ventas || []));
                }
                showToast('Historial actualizado', 'success');
            } catch (err) {
                showToast('No se pudo cargar el historial', 'error');
            }
        });
    });

    cargarEmpaquesDisponibles();

    const btnAgregarEmpaqueExistente = document.getElementById('agregarEmpaqueExistente');
    if (btnAgregarEmpaqueExistente) {
        btnAgregarEmpaqueExistente.addEventListener('click', agregarEmpaqueExistente);
    }

    cargarProductos();
    cargarVentas();

    // Egresos
    const formEgreso = document.getElementById('formEgreso');
    if (formEgreso) {
        formEgreso.addEventListener('submit', e => { e.preventDefault(); registrarEgreso(formEgreso); });
        // default date
        const fi = formEgreso.querySelector('input[name="fecha"]');
        if (fi) { const d=new Date(),p=n=>String(n).padStart(2,'0'); fi.value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
        cargarEgresos();
    }

    const formFiltroEgresos = document.getElementById('formFiltroEgresos');
    if (formFiltroEgresos) {
        formFiltroEgresos.addEventListener('submit', e => {
            e.preventDefault();
            const fd = new FormData(formFiltroEgresos);
            cargarEgresos(fd.get('desde'), fd.get('hasta'));
        });
    }

    // Reportes
    const formReporte = document.getElementById('formReporte');
    if (formReporte) {
        formReporte.addEventListener('submit', e => {
            e.preventDefault();
            const tipo = document.getElementById('tipoReporte')?.value || 'diario';
            const val  = tipo === 'mensual'
                ? document.getElementById('mesReporte')?.value
                : document.getElementById('fechaReporte')?.value;
            if (val) cargarReporte(tipo, val);
        });
        // default load today
        const d=new Date(),p=n=>String(n).padStart(2,'0');
        const today=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
        const fechaEl = document.getElementById('fechaReporte');
        if (fechaEl) { fechaEl.value=today; cargarReporte('diario', today); }
    }

    // Cierre de caja
    const formCierre = document.getElementById('formCierre');
    if (formCierre) {
        formCierre.addEventListener('submit', e => { e.preventDefault(); generarCierre(formCierre); });
        // default dates
        const d=new Date(),p=n=>String(n).padStart(2,'0');
        const today=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
        const fi2 = formCierre.querySelector('input[name="fecha_inicio"]');
        const ff2 = formCierre.querySelector('input[name="fecha_fin"]');
        if (fi2) fi2.value=today;
        if (ff2) ff2.value=today;
        cargarCierres();
    }
});

// 📌 Cargar productos al inicio
async function cargarProductos(q = "") {
    const pageSizeSel = document.getElementById('prodPageSize');
    const pageInfoEl = document.getElementById('prodPageInfo');
    const totalInfoEl = document.getElementById('prodTotalInfo');
    const prevBtn = document.getElementById('prevProdPage');
    const nextBtn = document.getElementById('nextProdPage');

    const size = parseInt(pageSizeSel?.value || '20');
    const curr = window.__prodPage || 1;
    const base = q ? `/buscar?q=${encodeURIComponent(q)}&page=${curr}&size=${size}` : `/productos?page=${curr}&size=${size}`;
    const res = await fetch(base);
    const data = await res.json();
    const tbody = document.getElementById("tablaProductos");
    if (!tbody) return;
    let total = 0, pages = 1, page = curr;
    if (data && Array.isArray(data.items)) {
        total = Number(data.total || 0);
        pages = Math.max(1, Number(data.pages || 1));
        page = Math.min(Math.max(1, Number(data.page || curr)), pages);
    } else if (Array.isArray(data)) {
        total = data.length;
        pages = Math.max(1, Math.ceil(total / Math.max(1, size)));
        page = Math.min(Math.max(1, curr), pages);
    }
    window.__prodPage = page;
    window.__prodLastQ = q;
    if (pageInfoEl) pageInfoEl.textContent = `Página ${page}/${pages}`;
    if (totalInfoEl) totalInfoEl.textContent = `${total} productos`;
    if (prevBtn) {
        prevBtn.disabled = page <= 1;
        prevBtn.onclick = () => { window.__prodPage = Math.max(1, page - 1); cargarProductos(window.__prodLastQ || ""); };
    }
    if (nextBtn) {
        nextBtn.disabled = page >= pages;
        nextBtn.onclick = () => { window.__prodPage = Math.min(pages, page + 1); cargarProductos(window.__prodLastQ || ""); };
    }
    if (pageSizeSel) {
        pageSizeSel.onchange = () => { window.__prodPage = 1; cargarProductos(window.__prodLastQ || ""); };
    }

    tbody.innerHTML = "";
    const pageData = (data && Array.isArray(data.items)) ? data.items : (Array.isArray(data) ? data.slice((page-1)*size, (page-1)*size + size) : []);
    window.__productosById = window.__productosById || Object.create(null);
    for (const p of pageData) {
        if (p && (p.ID || p.id)) {
            const id = p.ID || p.id;
            window.__productosById[id] = p;
        }
    }
    pageData.forEach(p => {
        let empaquesTexto = '-';
        if (p.producto_empaques && Array.isArray(p.producto_empaques) && p.producto_empaques.length > 0) {
            const empaquesInfo = p.producto_empaques.map(pe => {
                const empaque = pe.empaque || pe.Empaque;
                if (!empaque) return null;

                const tipo = empaque.tipo || empaque.Tipo;
                const factor = empaque.factor_conversion || empaque.FactorConversion;
                const descripcion = empaque.descripcion || empaque.Descripcion;

                const precioBase = Number(p.precio_unitario || 0);
                const override = pe.precio_override || pe.PrecioOverride;
                const precioEfectivo = override ? Number(override) : precioBase;
                const precioEmpaque = precioEfectivo * factor;

                return `<div style="margin: 1px 0; padding: 2px 4px; background: #f5f5f5; border-radius: 3px; font-size: 11px;">
                    <strong>${tipo}</strong> x${factor} - $${precioEmpaque.toLocaleString()}
                    ${descripcion ? `<br><em style="color: #666;">${descripcion}</em>` : ''}
                </div>`;
            }).filter(Boolean);

            empaquesTexto = empaquesInfo.length > 0 ? empaquesInfo.join('') : '-';
        }

        tbody.innerHTML += `<tr data-id="${p.ID}">
            <td><span class="editable-cell" data-field="fecha_ingreso" data-type="date">${p.fecha_ingreso || ''}</td>
            <td><span class="editable-cell" data-field="nombre" data-type="text">${p.nombre || ''}</td>
            <td><span class="editable-cell" data-field="laboratorio" data-type="text">${p.laboratorio || ''}</td>
            <td><span class="editable-cell" data-field="presentacion" data-type="text">${p.presentacion || ''}</td>
            <td><span class="editable-cell" data-field="precio_unitario" data-type="number" data-step="0.01">${formatMoney(p.precio_unitario)}</td>
            <td><span class="editable-cell" data-field="cantidad" data-type="int">${Number(p.cantidad || 0)}</td>
            <td><span class="editable-cell" data-field="lote" data-type="text">${p.lote || ''}</td>
            <td><span class="editable-cell" data-field="codigo_barras" data-type="text">${p.codigo_barras || '-'}</td>
            <td><span class="editable-cell" data-field="registro_invima" data-type="text">${p.registro_invima || ''}</td>
            <td><span class="editable-cell" data-field="fecha_venc" data-type="date" style="${getExpirationColor(p.fecha_venc)}" title="Click para editar">${p.fecha_venc || ''}</span></td>
            <td><span class="editable-cell" data-field="observacion" data-type="text">${p.observacion || ''}</td>
            <td style="font-size: 12px; color: #666; max-width: 200px; vertical-align: top;">${empaquesTexto}</td>
            <td>
                <button class="btn-gestionar-empaques" onclick="abrirModalEmpaqueProducto(${p.ID})" title="Gestionar empaques del producto">
                    📦 Empaques
                </button>
            </td>
        </tr>`;
    });

    tbody.querySelectorAll('span.editable-cell').forEach(span => {
        span.style.cursor = 'pointer';
        span.title = 'Click para editar';
        span.addEventListener('mouseenter', () => { const icon = span.querySelector('.edit-icon'); if (icon) icon.style.opacity = '1'; });
        span.addEventListener('mouseleave', () => { const icon = span.querySelector('.edit-icon'); if (icon) icon.style.opacity = '0'; });
        span.addEventListener('click', () => {
            if (span.querySelector('input')) return;
            const row = span.closest('tr');
            const id = row?.getAttribute('data-id');
            const field = span.getAttribute('data-field');
            const type = span.getAttribute('data-type') || 'text';
            const step = span.getAttribute('data-step') || undefined;
            const originalText = span.textContent || '';
            let originalParsed;
            if (type === 'number') originalParsed = parseFloat(originalText.replace(/,/g, '')) || 0;
            else if (type === 'int') originalParsed = parseInt(originalText || '0') || 0;
            else originalParsed = (originalText || '');

            const input = document.createElement('input');
            input.type = (type === 'number' || type === 'int') ? 'number' : (type === 'date' ? 'date' : 'text');
            if (type === 'number') input.step = step || '0.01';
            if (type === 'int') { input.step = '1'; input.min = '0'; }
            input.value = (type === 'number') ? String(parseFloat(originalText.replace(/,/g, '')) || 0) : originalText;
            if (type === 'int') input.value = String(parseInt(originalText || '0'));
            input.style.width = (type === 'text') ? 'auto' : '120px';

            span.textContent = '';
            span.appendChild(input);
            input.focus();
            input.select();

            const commit = async (save) => {
                if (!save) { span.textContent = originalText; return; }
                let newValRaw = input.value;
                let parsed;
                if (type === 'number') {
                    parsed = parseFloat(newValRaw);
                    if (isNaN(parsed) || parsed < 0) { showToast('Valor inválido', 'error'); span.textContent = originalText; return; }
                } else if (type === 'int') {
                    parsed = parseInt(newValRaw || '0');
                    if (isNaN(parsed) || parsed < 0) { showToast('Valor inválido', 'error'); span.textContent = originalText; return; }
                } else if (type === 'date') {
                    parsed = newValRaw;
                } else {
                    parsed = newValRaw;
                }

                let changed = true;
                if (type === 'number' || type === 'int') {
                    changed = Number(parsed) !== Number(originalParsed);
                } else {
                    changed = String(parsed || '').trim() !== String(originalParsed || '').trim();
                }
                if (!changed) { span.textContent = originalText; return; }

                try {
                    const todosCached = await getProductosCached();
                    const prod = todosCached.find(x => String(x.ID) === String(id));
                    if (!prod) { showToast('Producto no encontrado', 'error'); span.textContent = originalText; return; }
                    prod[field] = parsed;
                    const resp = await fetch(`/productos/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(prod)
                    });
                    if (!resp.ok) {
                        const e = await resp.json().catch(()=>({}));
                        throw new Error(e.error || 'No se pudo actualizar');
                    }
                    if (field === 'precio_unitario') span.textContent = formatMoney(parsed);
                    else span.textContent = (type === 'int') ? String(parsed) : (parsed || '');
                    showToast('Actualizado', 'success');
                    invalidarCacheProductos();
                    if (typeof populateProductoSelect === 'function') { populateProductoSelect(); }
                } catch (e) {
                    console.error(e);
                    showToast(e.message || 'Error al actualizar', 'error');
                    span.textContent = originalText;
                }
            };

            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); commit(true); }
                if (ev.key === 'Escape') { ev.preventDefault(); commit(false); }
            });
            input.addEventListener('blur', () => commit(true));
        });
    });
}

// 📌 Cargar ventas
async function cargarVentas() {
    const res = await fetch("/ventas");
    const data = await res.json();
    const ventas = data.ventas || [];
    const totalHoyEl = document.getElementById("totalHoy");
    const totalGeneralEl = document.getElementById("totalGeneral");
    if (totalHoyEl) totalHoyEl.textContent = Number(data.total_hoy || 0).toFixed(2);
    if (totalGeneralEl) totalGeneralEl.textContent = Number(data.total_general || 0).toFixed(2);

    const tbody = document.getElementById("tablaVentas");
    if (!tbody) return;
    tbody.innerHTML = "";
    ventas.forEach((v, idx) => {
        const totalVenta = Number(v.total || 0);
        const itemsRows = (v.items || []).map(it => {
            const totalItem = (it.cantidad || 0) * (it.precio_unitario || 0);
            return `<tr>
                <td>${it.producto?.nombre ?? ''}</td>
                <td>${it.cantidad ?? ''}</td>
                <td>${it.precio_unitario != null ? Number(it.precio_unitario).toFixed(2) : ''}</td>
                <td>${it.descuento > 0 ? '- $' + Number(it.descuento).toFixed(2) : '—'}</td>
                <td>${Number(totalItem).toFixed(2)}</td>
            </tr>`;
        }).join('');
        const itemsTable = `<table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="text-align:left;">Producto</th>
                    <th style="text-align:left;">Cantidad</th>
                    <th style="text-align:left;">Precio unitario</th>
                    <th style="text-align:left;">Descuento</th>
                    <th style="text-align:left;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows || '<tr><td colspan="5">Sin items</td></tr>'}
            </tbody>
        </table>`;
        tbody.innerHTML += `<tr>
            <td>${v.ID ?? ''}</td>
            <td>${formatDateTimeLocal(v.fecha)}</td>
            <td>${v.tipo_pago ?? ''}</td>
            <td>${v.folio ?? ''}</td>
            <td>${totalVenta.toFixed(2)}</td>
            <td>${v.total_descuentos > 0 ? '$'+Number(v.total_descuentos).toFixed(2) : '—'}</td>
            <td>${itemsTable}</td>
            <td><button data-print="${idx}">Imprimir</button></td>
        </tr>`;
    });
    attachVentaPrintButtons(tbody, ventas);
}

// ================== Funciones para gestión de empaques en formulario de productos ==================

let empaquesSeleccionados = [];
let empaquesDisponibles = [];

async function cargarEmpaquesDisponibles() {
    try {
        const response = await fetch('/empaques?disponibles=true');
        const empaques = await response.json();
        empaquesDisponibles = empaques;

        const select = document.getElementById('empaquesDisponibles');
        if (!select) return;
        select.innerHTML = '<option value="">Seleccionar empaque...</option>';

        empaques.forEach(empaque => {
            const option = document.createElement('option');
            option.value = empaque.ID;
            option.textContent = `${empaque.tipo} (x${empaque.factor_conversion})`;
            option.dataset.empaque = JSON.stringify(empaque);
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Error cargando empaques:', error);
        const select = document.getElementById('empaquesDisponibles');
        select.innerHTML = '<option value="">Error cargando empaques</option>';
    }
}

function agregarEmpaqueExistente() {
    const select = document.getElementById('empaquesDisponibles');
    const selectedOption = select.options[select.selectedIndex];

    if (!selectedOption.value) {
        alert('Por favor selecciona un empaque');
        return;
    }

    const empaqueData = JSON.parse(selectedOption.dataset.empaque);

    if (empaquesSeleccionados.find(e => e.ID === empaqueData.ID)) {
        alert('Este empaque ya está seleccionado');
        return;
    }

    empaquesSeleccionados.push(empaqueData);
    actualizarListaEmpaquesSeleccionados();
    select.selectedIndex = 0;
}

function actualizarListaEmpaquesSeleccionados() {
    const lista = document.getElementById('listaEmpaquesSeleccionados');

    if (empaquesSeleccionados.length === 0) {
        lista.innerHTML = '<span class="no-empaques">Sin empaques seleccionados</span>';
        return;
    }

    lista.innerHTML = empaquesSeleccionados.map(empaque => `
        <span class="empaque-item">
            ${empaque.tipo} (x${empaque.factor_conversion})
            <button type="button" onclick="eliminarEmpaqueSeleccionado(${empaque.ID})">×</button>
        </span>
    `).join('');
}

function eliminarEmpaqueSeleccionado(empaqueId) {
    empaquesSeleccionados = empaquesSeleccionados.filter(e => e.ID !== empaqueId);
    actualizarListaEmpaquesSeleccionados();
}

function recopilarEmpaques() {
    return empaquesSeleccionados.map(empaque => ({
        ID: empaque.ID,
        tipo: empaque.tipo,
        factor_conversion: empaque.factor_conversion,
        codigo_barras: empaque.codigo_barras,
        precio_unit_override: empaque.precio_unit_override
    }));
}

function limpiarEmpaques() {
    empaquesSeleccionados = [];
    actualizarListaEmpaquesSeleccionados();

    const select = document.getElementById('empaquesDisponibles');
    if (select) select.selectedIndex = 0;
}

// ===== GESTIÓN DE EMPAQUES DE PRODUCTO =====

async function abrirModalEmpaqueProducto(productoId) {
    try {
        const response = await fetch(`/productos/${productoId}`);
        if (!response.ok) throw new Error('Error al cargar producto');
        const producto = await response.json();

        document.getElementById('productoIdModal').value = productoId;
        document.getElementById('nombreProductoModal').textContent = producto.nombre;
        document.getElementById('labProductoModal').textContent = `Lab: ${producto.laboratorio}`;

        await cargarEmpaquesGenericos();
        await cargarEmpaquesProducto(productoId);
        configurarModalEmpaqueProducto();

        document.getElementById('modalEmpaqueProducto').style.display = 'block';

    } catch (error) {
        console.error('Error abriendo modal:', error);
        alert('Error al cargar los datos del producto');
    }
}

async function cargarEmpaquesGenericos() {
    try {
        const response = await fetch('/empaques');
        const empaques = await response.json();

        const select = document.getElementById('empaqueGenerico');
        select.innerHTML = '<option value="">Seleccionar empaque genérico...</option>';

        empaques.forEach(empaque => {
            const option = document.createElement('option');
            option.value = empaque.ID;
            option.textContent = `${empaque.tipo} (${empaque.factor_conversion}x) - ${empaque.descripcion}`;
            select.appendChild(option);
        });

    } catch (error) {
        console.error('Error cargando empaques genéricos:', error);
    }
}

async function cargarEmpaquesProducto(productoId) {
    try {
        const response = await fetch(`/productos/${productoId}/empaques`);
        const productoEmpaques = await response.json();

        const tbody = document.getElementById('tablaEmpaquesProductoBody');
        tbody.innerHTML = '';

        if (productoEmpaques.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #666;">No hay empaques asociados</td></tr>';
            return;
        }

        productoEmpaques.forEach(pe => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${pe.empaque.tipo}</td>
                <td>${pe.empaque.factor_conversion}</td>
                <td>${pe.empaque.descripcion}</td>
                <td>
                    <button class="btn-remove-empaque" onclick="desasociarEmpaque(${pe.ID})">
                        Quitar
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

    } catch (error) {
        console.error('Error cargando empaques del producto:', error);
    }
}

async function asociarEmpaque(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const productoId = document.getElementById('productoIdModal').value;
    const empaqueId = document.getElementById('empaqueGenerico').value;

    if (!empaqueId) {
        alert('Debe seleccionar un empaque');
        return;
    }

    const data = {
        producto_id: parseInt(productoId),
        empaque_id: parseInt(empaqueId),
        codigo_barras: null,
        precio_override: null
    };

    try {
        const response = await fetch('/producto-empaques', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al asociar empaque');
        }

        event.target.reset();
        document.getElementById('empaqueGenerico').selectedIndex = 0;
        invalidarCacheEmpaques(parseInt(productoId));
        await cargarEmpaquesProducto(productoId);
        cargarProductos();
        alert('Empaque asociado exitosamente');

    } catch (error) {
        console.error('Error asociando empaque:', error);
        alert(error.message);
    }
}

async function desasociarEmpaque(productoEmpaqueId) {
    if (!confirm('¿Está seguro de que desea quitar este empaque del producto?')) return;

    try {
        const response = await fetch(`/producto-empaques/${productoEmpaqueId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al desasociar empaque');
        }

        const productoId = document.getElementById('productoIdModal').value;
        invalidarCacheEmpaques(parseInt(productoId));
        await cargarEmpaquesProducto(productoId);
        cargarProductos();
        alert('Empaque desasociado exitosamente');

    } catch (error) {
        console.error('Error desasociando empaque:', error);
        alert(error.message);
    }
}

function cerrarModalEmpaqueProducto() {
    document.getElementById('modalEmpaqueProducto').style.display = 'none';
}

function configurarModalEmpaqueProducto() {
    const modal = document.getElementById('modalEmpaqueProducto');
    const closeBtn = modal?.querySelector('.close');

    if (closeBtn) {
        closeBtn.addEventListener('click', cerrarModalEmpaqueProducto);
    }

    window.addEventListener('click', (event) => {
        if (event.target === modal) cerrarModalEmpaqueProducto();
    });

    const formAsociar = document.getElementById('formAsociarEmpaque');
    if (formAsociar) {
        formAsociar.addEventListener('submit', asociarEmpaque);
    }
}

// ── Egresos ──
async function cargarEgresos(desde, hasta) {
    let url = '/egresos';
    const params = [];
    if (desde) params.push(`desde=${encodeURIComponent(desde)}`);
    if (hasta) params.push(`hasta=${encodeURIComponent(hasta)}`);
    if (params.length) url += '?' + params.join('&');
    try {
        const res = await fetch(url);
        const data = await res.json();
        const tbody = document.getElementById('tablaEgresos');
        const totalEl = document.getElementById('totalEgresos');
        if (totalEl) totalEl.textContent = Number(data.total || 0).toFixed(2);
        if (!tbody) return;
        tbody.innerHTML = '';
        (data.egresos || []).forEach((e, idx) => {
            const tiposLabel = { gasto_operativo:'Gasto operativo', pago_proveedor:'Pago proveedor', retiro:'Retiro', servicio:'Servicio', otro:'Otro' };
            tbody.innerHTML += `<tr>
                <td>${formatDateTimeLocal(e.fecha)}</td>
                <td>${e.concepto}</td>
                <td>${tiposLabel[e.tipo] || e.tipo}</td>
                <td>${e.tipo_pago}</td>
                <td><strong>$ ${Number(e.monto).toFixed(2)}</strong></td>
                <td><button data-del-egreso="${e.ID}" style="background:#dc2626;padding:3px 8px;font-size:12px;">Eliminar</button></td>
            </tr>`;
        });
        tbody.querySelectorAll('button[data-del-egreso]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('¿Eliminar este egreso?')) return;
                const id = btn.getAttribute('data-del-egreso');
                await fetch(`/egresos/${id}`, { method: 'DELETE' });
                cargarEgresos();
            });
        });
    } catch(e) { console.error(e); }
}

async function registrarEgreso(formEl) {
    const fd = new FormData(formEl);
    const datos = Object.fromEntries(fd.entries());
    datos.monto = parseFloat(datos.monto);
    if (!datos.concepto || !(datos.monto > 0)) { showToast('Concepto y monto son requeridos', 'error'); return; }
    if (!datos.fecha) { const d = new Date(); const p = n=>String(n).padStart(2,'0'); datos.fecha = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
    // convert date to ISO
    const iso = isoFromDateInput(datos.fecha);
    if (iso) datos.fecha = iso;
    try {
        const resp = await fetch('/egresos', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos) });
        if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error||'Error'); }
        showToast('Egreso registrado', 'success');
        formEl.reset();
        // reset date to today
        const fechaInput = formEl.querySelector('input[name="fecha"]');
        if (fechaInput) { const d=new Date(),p=n=>String(n).padStart(2,'0'); fechaInput.value=`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
        cargarEgresos();
    } catch(e) { showToast(e.message||'Error al registrar egreso', 'error'); }
}

// ── Reportes ──
async function cargarReporte(tipo, fechaOMes) {
    const resEl = document.getElementById('reporteResultado');
    if (!resEl) return;
    resEl.innerHTML = '<p style="color:#6b7280">Cargando...</p>';
    const param = tipo === 'mensual' ? `mes=${fechaOMes}` : `fecha=${fechaOMes}`;
    try {
        const res = await fetch(`/api/reportes?tipo=${tipo}&${param}`);
        const d = await res.json();
        const v = d.ventas || {}, eg = d.egresos || {};
        const fmt = n => Number(n||0).toLocaleString('es-CO', {minimumFractionDigits:0});
        resEl.innerHTML = `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:12px">
            <div class="reporte-card"><div class="rc-label">Total ventas</div><div class="rc-val">$ ${fmt(v.total)}</div><div class="rc-sub">${v.cantidad||0} transacciones</div></div>
            <div class="reporte-card rc-desc"><div class="rc-label">Descuentos</div><div class="rc-val">− $ ${fmt(v.descuentos)}</div></div>
            <div class="reporte-card"><div class="rc-label">Efectivo</div><div class="rc-val">$ ${fmt(v.efectivo)}</div></div>
            <div class="reporte-card"><div class="rc-label">Transferencia</div><div class="rc-val">$ ${fmt(v.transferencia)}</div></div>
            <div class="reporte-card rc-eg"><div class="rc-label">Egresos</div><div class="rc-val">$ ${fmt(eg.total)}</div><div class="rc-sub">${eg.cantidad||0} registros</div></div>
            <div class="reporte-card rc-neto"><div class="rc-label">Neto en caja</div><div class="rc-val">$ ${fmt(d.neto_caja)}</div><div class="rc-sub">Efectivo − Egresos</div></div>
          </div>
          ${Object.keys(eg.por_tipo||{}).length ? `<div style="margin-top:12px"><strong>Egresos por tipo:</strong> ${Object.entries(eg.por_tipo).map(([k,v])=>`<span style="margin-right:12px">${k}: <strong>$${fmt(v)}</strong></span>`).join('')}</div>` : ''}`;
    } catch(e) { resEl.innerHTML = '<p style="color:#dc2626">Error cargando reporte</p>'; }
}

// ── Cierre de Caja ──
async function generarCierre(formEl) {
    const fd = new FormData(formEl);
    const datos = Object.fromEntries(fd.entries());
    if (!datos.fecha_inicio || !datos.fecha_fin) { showToast('Seleccioná el período del cierre', 'error'); return; }
    try {
        const resp = await fetch('/cierres', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(datos) });
        if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error||'Error'); }
        const cierre = await resp.json();
        showToast('Cierre generado correctamente', 'success');
        const resEl = document.getElementById('cierreResultado');
        if (resEl) {
            const fmt = n => Number(n||0).toLocaleString('es-CO',{minimumFractionDigits:0});
            resEl.innerHTML = `<div style="background:#f0f7ff;border:1.5px solid #bdd4f5;border-radius:8px;padding:16px;margin-top:10px">
              <strong>Cierre generado — Folio #${cierre.ID}</strong><br>
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-top:10px">
                <div><small>Ventas efectivo</small><br><strong>$ ${fmt(cierre.total_ventas_efectivo)}</strong></div>
                <div><small>Ventas transferencia</small><br><strong>$ ${fmt(cierre.total_ventas_transferencia)}</strong></div>
                <div><small>Descuentos</small><br><strong style="color:#7c3aed">− $ ${fmt(cierre.total_descuentos)}</strong></div>
                <div><small>Egresos efectivo</small><br><strong style="color:#dc2626">− $ ${fmt(cierre.total_egresos_efectivo)}</strong></div>
                <div><small>Egresos transferencia</small><br><strong style="color:#dc2626">− $ ${fmt(cierre.total_egresos_transferencia)}</strong></div>
                <div style="background:#004b99;color:white;padding:8px;border-radius:6px"><small>Neto en caja</small><br><strong>$ ${fmt(cierre.neto_caja)}</strong></div>
              </div>
            </div>`;
        }
        cargarCierres();
    } catch(e) { showToast(e.message||'Error al generar cierre', 'error'); }
}

async function cargarCierres() {
    const tbody = document.getElementById('tablaCierres');
    if (!tbody) return;
    try {
        const res = await fetch('/cierres');
        const cierres = await res.json();
        const fmt = n => Number(n||0).toLocaleString('es-CO',{minimumFractionDigits:0});
        tbody.innerHTML = '';
        (cierres||[]).forEach(c => {
            const fi = new Date(c.fecha_inicio).toLocaleDateString('es-CO');
            const ff = new Date(c.fecha_fin).toLocaleDateString('es-CO');
            tbody.innerHTML += `<tr>
                <td>${formatDateTimeLocal(c.created_at||c.CreatedAt)}</td>
                <td>${fi} → ${ff}</td>
                <td>$ ${fmt(c.total_ventas)}</td>
                <td>$ ${fmt(c.total_egresos)}</td>
                <td><strong>$ ${fmt(c.neto_caja)}</strong></td>
                <td>${c.observacion||'—'}</td>
            </tr>`;
        });
    } catch(e) { console.error(e); }
}
