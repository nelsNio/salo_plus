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
        // Rojo: vencido o vence en 1 mes o menos
        return 'background-color: #ffebee; color: #c62828; font-weight: bold;';
    } else if (diffDays <= 90) {
        // Amarillo: vence en los siguientes 3 meses
        return 'background-color: #fff8e1; color: #f57f17; font-weight: bold;';
    } else {
        // Verde: más de 3 meses
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
        console.log('📡 Fetching empaques for product:', productoId);
        const res = await fetch(`/productos/${productoId}/empaques`);
        const productoEmpaques = await res.json();
        console.log('📦 Received empaques data:', productoEmpaques);
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
            
            // Crear descripción clara con precio
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
        const cantidadInput = document.querySelector('input[name="cantidad"]'); // Reutilizar input existente
        const opt = prodSelect ? prodSelect.options[prodSelect.selectedIndex] : null;
        const precioUnit = opt ? Number(opt.getAttribute('data-precio')||'0') : 0;
        const stockUnidades = (() => {
            const selId = prodSelect ? prodSelect.value : '';
            const prod = selId && window.__productosById ? window.__productosById[selId] : null;
            return prod ? Number(prod.cantidad||0) : 0;
        })();
        
        const emOpt = sel ? sel.options[sel.selectedIndex] : null;
        if (!emOpt || !emOpt.value) {
            // Sin empaque seleccionado - venta por unidad
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
        
        // Obtener cantidad del campo unificado (ahora representa cantidad de empaques)
        const cantEmpaques = Number(cantidadInput.value || 1);
        const precioTotal = cantEmpaques * precioPorEmpaque;
        
        // Actualizar UI con información del empaque
        if (precioEmp) precioEmp.textContent = `Precio por empaque: $ ${precioPorEmpaque.toFixed(2)} | Total: $ ${precioTotal.toFixed(2)}`;
        if (stockEmp) stockEmp.textContent = `Disponibles: ${disponibles} empaques (${stockUnidades} unidades)`;
        
        console.log(`💊 Empaque calculado: ${cantEmpaques} empaques × $${precioPorEmpaque.toFixed(2)} = $${precioTotal.toFixed(2)} | Factor: ${factor}`);
        
        // El campo cantidad ahora representa directamente la cantidad de empaques
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
        const res = await fetch('/productos');
        const productos = await res.json();
        window.__productosById = Object.create(null);
        productos.forEach(p => {
            window.__productosById[p.ID] = p;
            const precio = Number(p.precio_unitario || 0);
            // Mostrar solo el nombre del producto, sin presentación específica
            const nombreLimpio = p.nombre.split(' x ')[0] || p.nombre; // Quitar "x 30 TAB" etc.
            select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${nombreLimpio}</option>`;
        });
        // Mostrar precio inicial si hay selección
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
          <tr>
            <td>${it.nombre ?? ''}</td>
            <td>${it.cantidad}</td>
            <td>${formatMoney(it.precio_unitario)}</td>
            <td>${formatMoney(it.cantidad * it.precio_unitario)}</td>
          </tr>`).join('');
        const total = items.reduce((a, b) => a + (b.cantidad * b.precio_unitario), 0);
        const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>Comprobante de venta (Carrito)</title>
${buildReceiptStyles()}
</head>
<body class="pos80">
  ${buildReceiptHeader('Comprobante de venta (Carrito)', fecha)}
  <div class="small" style="text-align:right;margin-top:4px">Folio: ${folio}</div>
  <div class="small" style="margin-top:4px">Pago: ${tipoPago || 'efectivo'}</div>
  <table>
    <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="tot">TOTAL: $ ${formatMoney(total)}</div>
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
    // Si viene solo fecha (YYYY-MM-DD), agregar hora actual local
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const now = new Date();
        const [y, m, d] = value.split('-').map(Number);
        const dt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
        return dt.toISOString();
    }
    // Si ya viene con tiempo o es parseable, devolver ISO
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
    const logoHtml = businessInfo.logo ? `<div style="margin-bottom:6px"><img src="/images/${businessInfo.logo}" alt="logo" style="max-height:100px"/></div>` : '';
    return `
  <div style="text-align:center">
    ${logoHtml}
    <div style="font-size:18px;font-weight:bold">${businessInfo.nombre}</div>
    <div style="font-size:12px;color:#555">${businessInfo.nit}</div>
    <div style="font-size:12px;color:#555">${businessInfo.direccion} - ${businessInfo.telefono}</div>
    <div style="margin-top:6px;font-size:14px">${title}</div>
    <div class="small">Fecha: ${fecha}</div>
  </div>`;
}

function buildReceiptStyles() {
    return `
<style>
  body { font-family: Arial, sans-serif; padding: 16px; }
  h2 { margin: 0 0 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  td, th { border: 1px solid #ccc; padding: 8px; }
  .tot { text-align: right; font-weight: bold; }
  .small { color: #555; font-size: 12px; }
  @media print { button { display: none; } }
  /* Print page sizes */
  @page { size: A5 portrait; margin: 8mm; }
  /* Compact POS 80mm width */
  body.pos80 { width: 80mm; margin: 0 auto; padding: 8px; }
  @media print { body.pos80 { margin: 0; } }
  /* Optional A6 helper */
  body.a6 { width: 105mm; margin: 0 auto; }
</style>`;
}

// Impresión de venta
function openPrintWindow(venta) {
    try {
        const w = window.open('', '_blank');
        if (!w) { showToast('Bloqueado por el navegador: habilita ventanas emergentes para imprimir', 'error'); return; }
        const fecha = formatDateTimeLocal(venta.fecha);
        const folio = (venta && typeof venta.folio !== 'undefined' && venta.folio !== null) ? `V-${venta.folio}` : `V-${Date.now()}`;
        // Preparar items desde el nuevo modelo (venta.items)
        const items = Array.isArray(venta.items) && venta.items.length > 0
            ? venta.items
            : (venta.producto ? [{ producto: venta.producto, cantidad: venta.cantidad, precio_unitario: venta.precio_unitario, total: venta.total }] : []);
        const computedTotal = (venta.total != null)
            ? Number(venta.total)
            : items.reduce((acc, it) => acc + Number((it.cantidad||0) * (it.precio_unitario||0)), 0);
        const rows = items.map(it => `
          <tr>
            <td>${it.producto?.nombre ?? ''}</td>
            <td>${it.cantidad ?? ''}</td>
            <td>${formatMoney(it.precio_unitario ?? 0)}</td>
            <td>${formatMoney((it.cantidad||0) * (it.precio_unitario||0))}</td>
          </tr>
        `).join('');
        const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="script-src 'none'">
<title>Comprobante de venta</title>
${buildReceiptStyles()}
</head>
<body class="pos80">
  ${buildReceiptHeader('Comprobante de venta', fecha)}
  <div class="small" style="text-align:right;margin-top:4px">Folio: ${folio}</div>
  <div class="small" style="margin-top:4px">Pago: ${venta.tipo_pago || 'efectivo'}</div>
  <table>
    <thead><tr><th>Producto</th><th>Cantidad</th><th>Precio unitario</th><th>Total</th></tr></thead>
    <tbody>
      ${rows || ''}
    </tbody>
  </table>
  <div class="tot">TOTAL: $ ${formatMoney(computedTotal)}</div>
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
    // Popular select y mostrar precio al seleccionar
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
            // Cargar empaques para el producto seleccionado
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
            // Normalizar fecha a ISO
            let fecha = formVals.fecha;
            if (!fecha || fecha.trim() === '') {
                fecha = new Date().toISOString();
            } else {
                const iso = isoFromDateInput(fecha);
                if (iso) fecha = iso; else fecha = undefined;
            }
            if (!(producto_id > 0)) { showToast('Seleccione un producto', 'error'); return; }
            // Si hay empaque seleccionado, usamos /ventas/lote con empaque_id y cantidad_empaques
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
        // bind deletes
        tbody.querySelectorAll('button[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                const i = parseInt(btn.getAttribute('data-del'));
                if (!isNaN(i)) {
                    carrito.splice(i, 1);
                    renderCarrito();
                }
            });
        });
        // bind print per item
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
            // Precio se toma del producto seleccionado (backend es fuente de verdad)
            const selectedOption = select ? select.options[select.selectedIndex] : null;
            const precio = selectedOption ? parseFloat(selectedOption.getAttribute('data-precio') || '0') : 0;
            if (!select || !select.value) { showToast('Seleccione un producto', 'error'); return; }
            // Revisar si hay empaque
            const emSel = document.getElementById('empaqueSeleccionado');
            const empaque_id = emSel && emSel.value ? parseInt(emSel.value) : 0;
            const emOpt = emSel && emSel.options ? emSel.options[emSel.selectedIndex] : null;
            const factor = emOpt ? parseInt(emOpt.getAttribute('data-factor') || '0') : 0;
            const ov = emOpt ? emOpt.getAttribute('data-override') : null;
            const unitEff = (ov && ov !== '') ? Number(ov) : precio;
            // Usar el campo unificado - cuando hay empaque, representa cantidad de empaques
            const cantidadEmpaques = empaque_id > 0 ? cantidadUnidades : 0;
            let cantidadFinal = cantidadUnidades;
            let etiqueta = '';
            let cantidadParaTabla, precioUnitarioParaTabla, cantidadTotalUnidades;
            
            if (empaque_id > 0) {
                if (!(cantidadEmpaques > 0) || !(factor > 0)) { showToast('Complete empaque y cantidad', 'error'); return; }
                
                // Para la tabla: mostrar cantidad de empaques y precio por empaque
                cantidadParaTabla = cantidadEmpaques; // Cantidad de empaques
                precioUnitarioParaTabla = unitEff * factor; // Precio por empaque
                cantidadTotalUnidades = cantidadEmpaques * factor; // Total unidades para backend
                etiqueta = ` (${emOpt.textContent})`;
                
                console.log(`🛒 Empaque: ${cantidadEmpaques} empaques × $${precioUnitarioParaTabla} = $${(cantidadParaTabla * precioUnitarioParaTabla).toFixed(2)} | Total unidades: ${cantidadTotalUnidades}`);
            } else {
                // Venta por unidades individuales
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
                cantidad: cantidadParaTabla, // Cantidad para mostrar en tabla (empaques o unidades)
                precio_unitario: precioUnitarioParaTabla, // Precio para mostrar en tabla (por empaque o por unidad)
                cantidad_total_unidades: cantidadTotalUnidades, // Total unidades para backend
                empaque_id: empaque_id || null,
                factor: factor || 1, // Factor de conversión para logs
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
            // fecha desde el input o ahora (si solo hay fecha, agrega hora actual)
            const fechaInp = document.querySelector('#formVenta [name="fecha"]');
            let fechaISO = new Date().toISOString();
            if (fechaInp && fechaInp.value) {
                const iso = isoFromDateInput(fechaInp.value);
                if (iso) fechaISO = iso;
            }
            try {
                // snapshot antes de confirmar
                const itemsSnapshot = carrito.map(x => ({...x}));
                const resp = await fetch('/ventas/lote', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  fecha: fechaISO,
                  tipo_pago: (document.getElementById('tipoPago')?.value)||'efectivo',
                  items: carrito.map((it) => {
                    // Usar cantidad_total_unidades que ya está calculada correctamente
                    const cantidadUnidades = it.cantidad_total_unidades || it.cantidad;
                    
                    if (it.empaque_id) {
                      console.log(`📦 Venta por empaque: ${it.cantidad} empaques (factor: ${it.factor}) = ${cantidadUnidades} unidades`);
                    } else {
                      console.log(`📦 Venta por unidades: ${cantidadUnidades} unidades`);
                    }
                    
                    return {
                      producto_id: it.producto_id,
                      cantidad: cantidadUnidades
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
                await cargarProductos();
                await cargarVentas();
                // imprimir recibo consolidado con folio real del lote
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
        buscarProductoVenta.addEventListener("input", async e => {
            let q = e.target.value;
            if (q.length < 2) return;
            let res = await fetch(`/buscar?q=${encodeURIComponent(q)}`);
            let productos = await res.json();
            let select = document.getElementById("productoSeleccionado");
            if (!select) return;
            select.innerHTML = '<option value="">Seleccione un producto</option>';
            window.__productosById = Object.create(null);
            productos.forEach(p => {
                window.__productosById[p.ID] = p;
                const precio = Number(p.precio_unitario || 0);
                // Mostrar solo el nombre limpio del producto
                select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${p.nombre}</option>`;
            });
            // Selecciona automáticamente el primer producto si existe
            if (productos.length > 0) {
                select.value = productos[0].ID;
                // Cargar empaques para el producto seleccionado automáticamente
                await loadEmpaquesForProduct(productos[0].ID);
                console.log(`🔍 Auto-selected product: ${productos[0].nombre} (ID: ${productos[0].ID})`);
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
            // Fechas por defecto si están vacías
            const pad = n => String(n).padStart(2, '0');
            const now = new Date();
            const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            if (!datos.fecha_ingreso || datos.fecha_ingreso.trim() === "") datos.fecha_ingreso = today;
            if (!datos.fecha_venc || datos.fecha_venc.trim() === "") datos.fecha_venc = today;
            
            try {
                // Preparar datos con empaques seleccionados
                const datosCompletos = {
                    ...datos,
                    empaques_seleccionados: empaquesSeleccionados.map(emp => ({ ID: emp.ID }))
                };
                
                // Crear producto con empaques asociados
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
                window.__prodPage = 1; // resetear a la primera página en nueva búsqueda
                cargarProductos(q);
            }, 300);
        });
    }

    // 🗓️ Filtros de historial: poner fechas por defecto (hoy) si están vacías al enviar
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
                                <td>${Number(totalItem).toFixed(2)}</td>
                            </tr>`;
                        }).join('');
                        const itemsTable = `<table style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr>
                                    <th style="text-align:left;">Producto</th>
                                    <th style="text-align:left;">Cantidad</th>
                                    <th style="text-align:left;">Precio unitario</th>
                                    <th style="text-align:left;">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsRows || '<tr><td colspan="4">Sin items</td></tr>'}
                            </tbody>
                        </table>`;
                        const jsonPretty = (() => { try { return JSON.stringify(v, null, 2); } catch { return ''; } })();
                        tbody.innerHTML += `<tr>
                            <td>${v.ID ?? ''}</td>
                            <td>${formatDateTimeLocal(v.fecha)}</td>
                            <td>${v.tipo_pago ?? ''}</td>
                            <td>${v.folio ?? ''}</td>
                            <td>${totalVenta.toFixed(2)}</td>
                            <td>${itemsTable}</td>
                            <td><button data-print="${idx}">Imprimir</button></td>
                           </tr>`;
                    });
                    // Activar impresión por fila usando el arreglo completo de ventas
                    attachVentaPrintButtons(tbody, (data.ventas || []));
                }
                showToast('Historial actualizado', 'success');
            } catch (err) {
                showToast('No se pudo cargar el historial', 'error');
            }
        });
    });

    // ================== Configuración de empaques en formulario de productos ==================
    // Cargar empaques disponibles al cargar la página
    cargarEmpaquesDisponibles();
    
    // Event listener para agregar empaque existente
    const btnAgregarEmpaqueExistente = document.getElementById('agregarEmpaqueExistente');
    if (btnAgregarEmpaqueExistente) {
        btnAgregarEmpaqueExistente.addEventListener('click', agregarEmpaqueExistente);
    }

    // Cargas iniciales seguras
    cargarProductos();
    cargarVentas();
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
    if (!tbody) return; // Evitar errores si no existe la tabla en esta página
    // Configuración de paginado (server-side preferido)
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
    // Mapa de productos por ID para cálculo de stock de empaques
    window.__productosById = window.__productosById || Object.create(null);
    for (const p of pageData) {
        if (p && (p.ID || p.id)) {
            const id = p.ID || p.id;
            window.__productosById[id] = p;
        }
    }
    pageData.forEach(p => {
        // Formatear empaques para mostrar con información detallada
        let empaquesTexto = '-';
        if (p.producto_empaques && Array.isArray(p.producto_empaques) && p.producto_empaques.length > 0) {
            const empaquesInfo = p.producto_empaques.map(pe => {
                const empaque = pe.empaque || pe.Empaque;
                if (!empaque) return null;
                
                const tipo = empaque.tipo || empaque.Tipo;
                const factor = empaque.factor_conversion || empaque.FactorConversion;
                const descripcion = empaque.descripcion || empaque.Descripcion;
                
                // Calcular precio por empaque
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

    // Inline edit genérico para todas las celdas
    tbody.querySelectorAll('span.editable-cell').forEach(span => {
        span.style.cursor = 'pointer';
        span.title = 'Click para editar';
        span.addEventListener('mouseenter', () => { const icon = span.querySelector('.edit-icon'); if (icon) icon.style.opacity = '1'; });
        span.addEventListener('mouseleave', () => { const icon = span.querySelector('.edit-icon'); if (icon) icon.style.opacity = '0'; });
        span.addEventListener('click', () => {
            if (span.querySelector('input')) return; // ya en edición
            const row = span.closest('tr');
            const id = row?.getAttribute('data-id');
            const field = span.getAttribute('data-field');
            const type = span.getAttribute('data-type') || 'text';
            const step = span.getAttribute('data-step') || undefined;
            const originalText = span.textContent || '';
            // Compute original parsed value for change detection
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
                    parsed = newValRaw; // YYYY-MM-DD
                } else {
                    parsed = newValRaw; // texto
                }

                // If value didn't change, just restore without PUT
                let changed = true;
                if (type === 'number' || type === 'int') {
                    changed = Number(parsed) !== Number(originalParsed);
                } else {
                    changed = String(parsed || '').trim() !== String(originalParsed || '').trim();
                }
                if (!changed) { span.textContent = originalText; return; }

                try {
                    const respGet = await fetch('/productos');
                    const productos = await respGet.json();
                    const prod = (productos || []).find(x => String(x.ID) === String(id));
                    if (!prod) { showToast('Producto no encontrado', 'error'); span.textContent = originalText; return; }
                    // Asignar campo
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
                    // Renderizar valor
                    if (field === 'precio_unitario') span.textContent = formatMoney(parsed);
                    else span.textContent = (type === 'int') ? String(parsed) : (parsed || '');
                    showToast('Actualizado', 'success');
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
    if (!tbody) return; // Evitar errores si no existe la tabla
    tbody.innerHTML = "";
    ventas.forEach((v, idx) => {
        const totalVenta = Number(v.total || 0);
        const itemsRows = (v.items || []).map(it => {
            const totalItem = (it.cantidad || 0) * (it.precio_unitario || 0);
            return `<tr>
                <td>${it.producto?.nombre ?? ''}</td>
                <td>${it.cantidad ?? ''}</td>
                <td>${it.precio_unitario != null ? Number(it.precio_unitario).toFixed(2) : ''}</td>
                <td>${Number(totalItem).toFixed(2)}</td>
            </tr>`;
        }).join('');
        const itemsTable = `<table style="width:100%; border-collapse:collapse;">
            <thead>
                <tr>
                    <th style="text-align:left;">Producto</th>
                    <th style="text-align:left;">Cantidad</th>
                    <th style="text-align:left;">Precio unitario</th>
                    <th style="text-align:left;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${itemsRows || '<tr><td colspan="4">Sin items</td></tr>'}
            </tbody>
        </table>`;
        tbody.innerHTML += `<tr>
            <td>${v.ID ?? ''}</td>
            <td>${formatDateTimeLocal(v.fecha)}</td>
            <td>${v.tipo_pago ?? ''}</td>
            <td>${v.folio ?? ''}</td>
            <td>${totalVenta.toFixed(2)}</td>
            <td>${itemsTable}</td>
            <td><button data-print="${idx}">Imprimir</button></td>
        </tr>`;
    });
    attachVentaPrintButtons(tbody, ventas);
}

// ================== Funciones para gestión de empaques en formulario de productos ==================

// Variables globales para empaques
let empaquesSeleccionados = [];
let empaquesDisponibles = [];

// Función para cargar empaques disponibles
async function cargarEmpaquesDisponibles() {
    try {
        const response = await fetch('/empaques?disponibles=true');
        const empaques = await response.json();
        empaquesDisponibles = empaques;
        
        const select = document.getElementById('empaquesDisponibles');
        if (!select) {
            // El elemento no existe en esta página, salir silenciosamente
            return;
        }
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

// Función para agregar empaque existente
function agregarEmpaqueExistente() {
    const select = document.getElementById('empaquesDisponibles');
    const selectedOption = select.options[select.selectedIndex];
    
    if (!selectedOption.value) {
        alert('Por favor selecciona un empaque');
        return;
    }
    
    const empaqueData = JSON.parse(selectedOption.dataset.empaque);
    
    // Verificar si ya está seleccionado
    if (empaquesSeleccionados.find(e => e.ID === empaqueData.ID)) {
        alert('Este empaque ya está seleccionado');
        return;
    }
    
    empaquesSeleccionados.push(empaqueData);
    actualizarListaEmpaquesSeleccionados();
    
    // Resetear select
    select.selectedIndex = 0;
}

// Función para actualizar la lista de empaques seleccionados
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

// Función para eliminar empaque seleccionado
function eliminarEmpaqueSeleccionado(empaqueId) {
    empaquesSeleccionados = empaquesSeleccionados.filter(e => e.ID !== empaqueId);
    actualizarListaEmpaquesSeleccionados();
}

// Recopilar datos de empaques seleccionados
function recopilarEmpaques() {
    return empaquesSeleccionados.map(empaque => ({
        ID: empaque.ID,
        tipo: empaque.tipo,
        factor_conversion: empaque.factor_conversion,
        codigo_barras: empaque.codigo_barras,
        precio_unit_override: empaque.precio_unit_override
    }));
}

// Limpiar formulario de empaques
function limpiarEmpaques() {
    empaquesSeleccionados = [];
    actualizarListaEmpaquesSeleccionados();
    
    const select = document.getElementById('empaquesDisponibles');
    if (select) {
        select.selectedIndex = 0;
    }
}

// ===== GESTIÓN DE EMPAQUES DE PRODUCTO =====

// Abrir modal para gestionar empaques de un producto específico
async function abrirModalEmpaqueProducto(productoId) {
    try {
        // Obtener datos del producto
        const response = await fetch(`/productos/${productoId}`);
        if (!response.ok) {
            throw new Error('Error al cargar producto');
        }
        const producto = await response.json();
        
        // Llenar información del producto en el modal
        document.getElementById('productoIdModal').value = productoId;
        document.getElementById('nombreProductoModal').textContent = producto.nombre;
        document.getElementById('labProductoModal').textContent = `Lab: ${producto.laboratorio}`;
        
        // Cargar empaques genéricos disponibles
        await cargarEmpaquesGenericos();
        
        // Cargar empaques asociados al producto
        await cargarEmpaquesProducto(productoId);
        
        // Configurar event listeners del modal
        configurarModalEmpaqueProducto();
        
        // Mostrar modal
        document.getElementById('modalEmpaqueProducto').style.display = 'block';
        
    } catch (error) {
        console.error('Error abriendo modal:', error);
        alert('Error al cargar los datos del producto');
    }
}

// Cargar empaques genéricos disponibles para el selector
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

// Cargar empaques asociados a un producto específico
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

// Asociar empaque genérico a producto
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al asociar empaque');
        }
        
        // Limpiar formulario
        event.target.reset();
        document.getElementById('empaqueGenerico').selectedIndex = 0;
        
        // Recargar lista de empaques del producto
        await cargarEmpaquesProducto(productoId);
        
        // Recargar tabla principal de productos para mostrar cambios
        cargarProductos();
        
        alert('Empaque asociado exitosamente');
        
    } catch (error) {
        console.error('Error asociando empaque:', error);
        alert(error.message);
    }
}

// Desasociar empaque de producto
async function desasociarEmpaque(productoEmpaqueId) {
    if (!confirm('¿Está seguro de que desea quitar este empaque del producto?')) {
        return;
    }
    
    try {
        const response = await fetch(`/producto-empaques/${productoEmpaqueId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al desasociar empaque');
        }
        
        const productoId = document.getElementById('productoIdModal').value;
        
        // Recargar lista de empaques del producto
        await cargarEmpaquesProducto(productoId);
        
        // Recargar tabla principal de productos
        cargarProductos();
        
        alert('Empaque desasociado exitosamente');
        
    } catch (error) {
        console.error('Error desasociando empaque:', error);
        alert(error.message);
    }
}

// Cerrar modal de gestión de empaques
function cerrarModalEmpaqueProducto() {
    document.getElementById('modalEmpaqueProducto').style.display = 'none';
}

// Configurar modal de empaques de producto
function configurarModalEmpaqueProducto() {
    const modal = document.getElementById('modalEmpaqueProducto');
    const closeBtn = modal?.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', cerrarModalEmpaqueProducto);
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            cerrarModalEmpaqueProducto();
        }
    });
    
    // Event listener para el formulario de asociar empaque
    const formAsociar = document.getElementById('formAsociarEmpaque');
    if (formAsociar) {
        formAsociar.addEventListener('submit', asociarEmpaque);
    }
}
