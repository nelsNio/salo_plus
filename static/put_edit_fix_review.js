/*
 * REVIEW ONLY — proposed fix for inline product editing.
 *
 * Problem:
 * getProductosCached() calls /productos?lite=true. The lite response does
 * not include lote, fecha_ingreso, fecha_venc, registro_invima or observacion.
 * Sending that incomplete object to PUT causes those fields to be overwritten
 * with Go zero values.
 *
 * Proposed replacement inside commit(), replacing the current block:
 *
 *   const todosCached = await getProductosCached();
 *   const prod = todosCached.find(...);
 *   ...
 *
 * with the following code:
 */

async function getCompleteProductForPut(id) {
    const resp = await fetch(`/productos/${id}`);

    if (!resp.ok) {
        const error = await resp.json().catch(() => ({}));
        throw new Error(error.error || 'No se pudo obtener el producto');
    }

    const product = await resp.json();

    if (!product) {
        throw new Error('Producto no encontrado');
    }

    return product;
}

/*
 * Example usage inside commit():
 *
 * const prod = await getCompleteProductForPut(id);
 * prod[field] = parsed;
 *
 * const resp = await fetch(`/productos/${id}`, {
 *     method: 'PUT',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify(prod)
 * });
 *
 * The rest of the existing commit() logic can remain unchanged.
 */
