// Configuración del negocio (edita estos valores)
const businessInfo = {
  nombre: 'Droguería Salo Plus',
  nit: 'NIT 1.049.647.310-5',
  direccion: 'Calle 8 # 6 - 61 Local 1, Belén - Boyacá',
  telefono: '+57 321 934 9781',
  // Opcional: nombre de archivo del logo dentro de /images (por ejemplo 'logo.png')
  logo: 'logo.jpg'
};

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

// Rellenar el select de productos en Admin Ventas (top-level)
async function populateProductoSelect() {
    const select = document.getElementById('productoSeleccionado');
    if (!select) return;
    try {
        const res = await fetch('/productos');
        const productos = await res.json();
        select.innerHTML = '<option value="">Seleccione un producto</option>';
        // Índice rápido por ID para consultar precio al vuelo
        window.__productosById = Object.create(null);
        (productos || []).forEach(p => {
            window.__productosById[p.ID] = p;
            const precio = Number(p.precio_unitario || 0);
            select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${p.nombre} (${p.lote}) - $ ${precio.toFixed(2)} - Stock: ${p.cantidad}</option>`;
        });
        // Mostrar precio inicial si hay selección
        const spanPrecio = document.getElementById('precioSeleccionado');
        if (spanPrecio) {
            const sel = select.value;
            const item = sel && window.__productosById ? window.__productosById[sel] : null;
            const precio = item ? Number(item.precio_unitario || 0) : 0;
            spanPrecio.textContent = `Precio: $ ${precio.toFixed(2)}`;
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
            const opt = selectProd.options[selectProd.selectedIndex];
            const precio = opt ? parseFloat(opt.getAttribute('data-precio') || '0') : 0;
            if (spanPrecio) spanPrecio.textContent = `Precio: $ ${Number(precio).toFixed(2)}`;
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
            if (!(cantidad > 0)) { showToast('Ingrese cantidad válida', 'error'); return; }
            const payload = {
                tipo_pago,
                ...(fecha ? { fecha } : {}),
                items: [ { producto_id, cantidad } ]
            };
            try {
                const resp = await fetch('/ventas', {
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
            const cantidad = parseInt((document.querySelector('#formVenta [name="cantidad"]').value || '0'));
            // Precio se toma del producto seleccionado (backend es fuente de verdad)
            const selectedOption = select ? select.options[select.selectedIndex] : null;
            const precio = selectedOption ? parseFloat(selectedOption.getAttribute('data-precio') || '0') : 0;
            if (!select || !select.value) { showToast('Seleccione un producto', 'error'); return; }
            if (!(cantidad > 0)) { showToast('Ingrese cantidad válida', 'error'); return; }
            if (!(precio >= 0)) { showToast('Precio inválido', 'error'); return; }
            const option = select.options[select.selectedIndex];
            const nombre = option ? option.textContent : '';
            carrito.push({ producto_id: parseInt(select.value), cantidad, precio_unitario: precio, nombre });
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
                  items: carrito.map((it) => ({
                    producto_id: it.producto_id,
                    cantidad: it.cantidad
                  }))
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
                select.innerHTML += `<option value="${p.ID}" data-precio="${precio}">${p.nombre} (${p.lote}) - $ ${precio.toFixed(2)} - Stock: ${p.cantidad}</option>`;
            });
            // Selecciona automáticamente el primer producto si existe
            if (productos.length > 0) {
                select.value = productos[0].ID; // corregido: usar ID consistente
                const spanPrecio = document.getElementById('precioSeleccionado');
                if (spanPrecio) spanPrecio.textContent = `Precio: $ ${Number(productos[0].precio_unitario||0).toFixed(2)}`;
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
            // Fechas por defecto hoy si vacías (formato YYYY-MM-DD)
            const pad = n => String(n).padStart(2, '0');
            const now = new Date();
            const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
            if (!datos.fecha_ingreso || datos.fecha_ingreso.trim() === "") datos.fecha_ingreso = today;
            if (!datos.fecha_venc || datos.fecha_venc.trim() === "") datos.fecha_venc = today;
            await fetch("/productos", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(datos)
            });
            e.target.reset();
            cargarProductos();
        });
    }

    // 🔎 Búsqueda en listado de productos (tabla principal)
    const busqueda = document.getElementById("busqueda");
    if (busqueda) {
        busqueda.addEventListener("input", e => {
            cargarProductos(e.target.value);
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

    // Cargas iniciales seguras
    cargarProductos();
    cargarVentas();
});

// 📌 Cargar productos al inicio
async function cargarProductos(q = "") {
    const url = q ? `/buscar?q=${encodeURIComponent(q)}` : "/productos";
    const res = await fetch(url);
    const data = await res.json();
    const tbody = document.getElementById("tablaProductos");
    if (!tbody) return; // Evitar errores si no existe la tabla en esta página
    tbody.innerHTML = "";
    (data || []).forEach(p => {
        tbody.innerHTML += `<tr data-id="${p.ID}">
            <td>${p.fecha_ingreso}</td>
            <td>${p.nombre}</td>
            <td>${p.laboratorio}</td>
            <td>${p.presentacion}</td>
            <td>${formatMoney(p.precio_unitario)}</td>
            <td>${p.cantidad}</td>
            <td>${p.lote}</td>
            <td>${p.codigo_barras}</td>
            <td>${p.registro_invima}</td>
            <td>${p.fecha_venc}</td>
            <td>${p.observacion}</td>
            <td><button type="button" class="btn-edit-precio" data-id="${p.ID}" data-precio="${p.precio_unitario}">Editar precio</button></td>
        </tr>`;
    });
    // Bind editar precio
    tbody.querySelectorAll('button.btn-edit-precio').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const current = parseFloat(btn.getAttribute('data-precio') || '0');
            const nuevo = prompt('Nuevo precio unitario:', isNaN(current) ? '' : current.toString());
            if (nuevo == null) return; // cancel
            const precio = parseFloat(nuevo);
            if (isNaN(precio) || precio < 0) { showToast('Precio inválido', 'error'); return; }
            try {
                // Obtener producto actual para no pisar campos
                const respGet = await fetch(`/productos`);
                const productos = await respGet.json();
                const prod = (productos || []).find(x => String(x.ID) === String(id));
                if (!prod) { showToast('Producto no encontrado', 'error'); return; }
                prod.precio_unitario = precio;
                const resp = await fetch(`/productos/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(prod)
                });
                if (!resp.ok) {
                    const e = await resp.json().catch(() => ({}));
                    throw new Error(e.error || 'No se pudo actualizar');
                }
                showToast('Precio actualizado', 'success');
                cargarProductos(q);
                // Refrescar select de ventas si existe
                if (typeof populateProductoSelect === 'function') { populateProductoSelect(); }
            } catch (e) {
                console.error(e);
                showToast(e.message || 'Error al actualizar precio', 'error');
            }
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
