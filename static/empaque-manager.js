// Gestión de Empaques Genéricos
let empaques = [];

// Utilidad para mostrar notificaciones
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        padding: 12px 20px;
        margin: 5px 0;
        border-radius: 4px;
        cursor: pointer;
    `;
    toast.textContent = message;
    toast.addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Configurar tipo personalizado
function configurarTipoPersonalizado() {
    const selectTipo = document.getElementById('tipoEmpaque');
    const inputPersonalizado = document.getElementById('tipoPersonalizado');
    
    if (!selectTipo || !inputPersonalizado) return;
    
    selectTipo.addEventListener('change', (e) => {
        if (e.target.value === 'otro') {
            inputPersonalizado.style.display = 'inline-block';
            inputPersonalizado.required = true;
        } else {
            inputPersonalizado.style.display = 'none';
            inputPersonalizado.required = false;
            inputPersonalizado.value = '';
        }
    });
}

// Registrar nuevo empaque genérico
async function registrarEmpaque(event) {
    event.preventDefault();
    
    const formData = new FormData(event.target);
    
    let tipo = formData.get('tipo');
    if (tipo === 'Otro') {
        tipo = formData.get('tipo_personalizado');
        if (!tipo) {
            showToast('Debe especificar el tipo personalizado', 'error');
            return;
        }
    }
    
    const data = {
        tipo: tipo,
        factor_conversion: parseInt(formData.get('factor_conversion')),
        descripcion: formData.get('descripcion')
    };
    
    if (!data.tipo || !data.factor_conversion || !data.descripcion) {
        showToast('Complete todos los campos requeridos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/empaques', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al registrar empaque');
        }
        
        showToast('Empaque genérico registrado exitosamente', 'success');
        event.target.reset();
        cargarEmpaques();
    } catch (error) {
        console.error('Error registrando empaque:', error);
        showToast(error.message, 'error');
    }
}

// Cargar lista de empaques
async function cargarEmpaques() {
    try {
        const response = await fetch('/empaques');
        empaques = await response.json();
        renderizarEmpaques();
    } catch (error) {
        console.error('Error cargando empaques:', error);
        showToast('Error cargando empaques', 'error');
    }
}

// Renderizar tabla de empaques genéricos
function renderizarEmpaques() {
    const tbody = document.getElementById('tablaEmpaquesBody');
    if (!tbody) return;
    
    const busqueda = document.getElementById('buscarEmpaques')?.value.toLowerCase() || '';
    const filtroTipo = document.getElementById('filtroTipo')?.value || '';
    
    let empaquesFiltrados = empaques.filter(empaque => {
        const matchBusqueda = !busqueda || 
            empaque.tipo?.toLowerCase().includes(busqueda) ||
            empaque.descripcion?.toLowerCase().includes(busqueda);
        
        const matchTipo = !filtroTipo || empaque.tipo === filtroTipo;
        
        return matchBusqueda && matchTipo;
    });
    
    tbody.innerHTML = '';
    
    empaquesFiltrados.forEach(empaque => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${empaque.ID}</td>
            <td>${empaque.tipo}</td>
            <td>${empaque.factor_conversion}</td>
            <td>${empaque.descripcion || '-'}</td>
            <td>
                <button onclick="editarEmpaque(${empaque.ID})" class="btn-edit">Editar</button>
                <button onclick="eliminarEmpaque(${empaque.ID})" class="btn-delete">Eliminar</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Configurar filtros
function configurarFiltros() {
    const buscarInput = document.getElementById('buscarEmpaques');
    const filtroTipo = document.getElementById('filtroTipo');
    
    [buscarInput, filtroTipo].forEach(element => {
        if (element) {
            element.addEventListener('input', renderizarEmpaques);
            element.addEventListener('change', renderizarEmpaques);
        }
    });
}

// Editar empaque genérico
async function editarEmpaque(id) {
    try {
        const response = await fetch(`/empaques/${id}`);
        const empaque = await response.json();
        
        document.getElementById('editEmpaqueId').value = empaque.ID;
        document.getElementById('editTipoEmpaque').value = empaque.tipo;
        document.getElementById('editFactorConversion').value = empaque.factor_conversion;
        document.getElementById('editDescripcionEmpaque').value = empaque.descripcion || '';
        
        document.getElementById('modalEditarEmpaque').style.display = 'block';
    } catch (error) {
        console.error('Error cargando empaque:', error);
        showToast('Error cargando empaque', 'error');
    }
}

// Actualizar empaque genérico
async function actualizarEmpaque(event) {
    event.preventDefault();
    
    const id = document.getElementById('editEmpaqueId').value;
    const formData = new FormData(event.target);
    
    const data = {
        tipo: formData.get('tipo'),
        factor_conversion: parseInt(formData.get('factor_conversion')),
        descripcion: formData.get('descripcion')
    };
    
    try {
        const response = await fetch(`/empaques/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al actualizar empaque');
        }
        
        showToast('Empaque genérico actualizado exitosamente', 'success');
        cerrarModal();
        cargarEmpaques();
    } catch (error) {
        console.error('Error actualizando empaque:', error);
        showToast(error.message, 'error');
    }
}

// Eliminar empaque
async function eliminarEmpaque(id) {
    if (!confirm('¿Está seguro de que desea eliminar este empaque?')) {
        return;
    }
    
    try {
        const response = await fetch(`/empaques/${id}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al eliminar empaque');
        }
        
        showToast('Empaque eliminado exitosamente', 'success');
        cargarEmpaques();
    } catch (error) {
        console.error('Error eliminando empaque:', error);
        showToast(error.message, 'error');
    }
}

// Cerrar modal
function cerrarModal() {
    document.getElementById('modalEditarEmpaque').style.display = 'none';
}

// Configurar modal
function configurarModal() {
    const modal = document.getElementById('modalEditarEmpaque');
    const closeBtn = modal?.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', cerrarModal);
    }
    
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            cerrarModal();
        }
    });
}

// Inicializar página
document.addEventListener('DOMContentLoaded', async () => {
    await cargarEmpaques();
    
    configurarTipoPersonalizado();
    configurarFiltros();
    configurarModal();
    
    // Event listeners
    const formEmpaque = document.getElementById('formEmpaque');
    if (formEmpaque) {
        formEmpaque.addEventListener('submit', registrarEmpaque);
    }
    
    const formEditarEmpaque = document.getElementById('formEditarEmpaque');
    if (formEditarEmpaque) {
        formEditarEmpaque.addEventListener('submit', actualizarEmpaque);
    }
});
