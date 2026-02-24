// 1. Estado y persistencia con manejo de errores robusto
const STORAGE_KEY = 'colorCenter_v1';
var state = {
    orders: [],
    technicians: { 'TÉCNICO 1': { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 } },
    goals: { vehiculos: 0, piezas: 0 },
    adminPassword: '0502',
    currentView: 'home',
    isSyncing: false
};

try {
    var sOrders = localStorage.getItem(STORAGE_KEY);
    if (sOrders) state.orders = JSON.parse(sOrders);

    var sTechs = localStorage.getItem(STORAGE_KEY + '_techs');
    if (sTechs) {
        var parsedTechs = JSON.parse(sTechs);
        if (Array.isArray(parsedTechs)) {
            var newTechs = {};
            parsedTechs.forEach(function (t) { newTechs[t] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 }; });
            state.technicians = newTechs;
        } else {
            state.technicians = parsedTechs;
        }
    }

    var sGoals = localStorage.getItem(STORAGE_KEY + '_goals');
    if (sGoals) state.goals = JSON.parse(sGoals);

    var sPwd = localStorage.getItem(STORAGE_KEY + '_pwd');
    if (sPwd) state.adminPassword = sPwd;
} catch (e) {
    console.error("Error al cargar localStorage:", e);
}

// 2. Configuración de Supabase
const SUPABASE_URL = 'https://oqlonlkudzvzpakswmjv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MsTrkgtzcD6WAS9g44Dtg_EIKEeWUa';
var supabase = (typeof window !== 'undefined' && window.supabase) ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
if (!supabase) console.warn("Supabase no detectado en el primer intento.");

// 3. Utilidades básicas
var formatMoney = function (amount) { return 'Q ' + parseFloat(amount).toFixed(2); };
var getMonthYear = function (dateStr) {
    var d = new Date(dateStr);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

var saveState = async function () {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
    localStorage.setItem(STORAGE_KEY + '_techs', JSON.stringify(state.technicians));
    localStorage.setItem(STORAGE_KEY + '_goals', JSON.stringify(state.goals));
    localStorage.setItem(STORAGE_KEY + '_pwd', state.adminPassword);

    if (supabase) {
        try {
            await supabase.from('color_center_data').upsert([
                {
                    id: 1, section: 'all_data', content: {
                        orders: state.orders,
                        techs: state.technicians,
                        goals: state.goals,
                        password: state.adminPassword
                    }
                }
            ]);
        } catch (e) {
            console.error("Error al sincronizar con Supabase:", e);
        }
    }
};

var loadFromSupabase = async function () {
    if (!supabase) return;
    try {
        var result = await supabase.from('color_center_data').select('content').eq('id', 1).single();
        var data = result.data;
        if (data && data.content) {
            state.orders = data.content.orders || [];
            state.technicians = data.content.techs || {};
            state.goals = data.content.goals || { vehiculos: 0, piezas: 0 };
            state.adminPassword = data.content.password || '0502';

            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
            localStorage.setItem(STORAGE_KEY + '_techs', JSON.stringify(state.technicians));
            localStorage.setItem(STORAGE_KEY + '_goals', JSON.stringify(state.goals));
            localStorage.setItem(STORAGE_KEY + '_pwd', state.adminPassword);
        }
    } catch (e) {
        console.error("Error al cargar de Supabase:", e);
    }
};

var generateId = function () { return Math.random().toString(36).substr(2, 9); };

// 4. ROUTER PRINCIPAL (Global)
window.app = {
    navigate: function (viewId) {
        console.log("Navegando a:", viewId);
        document.querySelectorAll('.view').forEach(function (el) { el.classList.remove('active'); });
        document.querySelectorAll('.nav-btn').forEach(function (el) { el.classList.remove('active'); });

        var targetView = document.getElementById('view-' + viewId);
        if (targetView) targetView.classList.add('active');

        var btn = document.querySelector('.nav-btn[onclick*="navigate(\'' + viewId + '\')"]');
        if (btn) btn.classList.add('active');

        state.currentView = viewId;

        if (viewId === 'control' && window.control) {
            window.control.init();
        } else if (viewId === 'dashboard' && window.dashboard) {
            window.dashboard.init();
        } else if (viewId === 'config' && window.config) {
            window.config.init();
        }
    }
};


// 5. MODULO CONTROL (Global)
window.control = {
    init: function () {
        console.log("Iniciando módulo Control...");
        var d = new Date();
        var currentMonth = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

        var filterMonth = document.getElementById('filter-month');
        if (filterMonth) {
            var months = new Set();
            months.add(currentMonth);
            state.orders.forEach(function (o) { months.add(getMonthYear(o.fecha)); });

            filterMonth.innerHTML = Array.from(months)
                .sort().reverse()
                .map(function (m) { return '<option value="' + m + '" ' + (m === currentMonth ? 'selected' : '') + '>' + m + '</option>'; })
                .join('');
        }

        var filterTech = document.getElementById('filter-tech');
        if (filterTech) {
            var techHtml = '<option value="all">Todos los Técnicos</option>';
            Object.keys(state.technicians).sort().forEach(function (t) {
                techHtml += '<option value="' + t + '">' + t + '</option>';
            });
            filterTech.innerHTML = techHtml;
        }

        if (window.control.renderOrders) window.control.renderOrders();
    },
    showNewOrderModal: () => {
        document.getElementById('ot-form').reset();
        document.getElementById('ot-fecha').valueAsDate = new Date();
        document.getElementById('pieces-container').innerHTML = '';
        control.addPiece(); 
        document.getElementById('ot-modal').classList.add('active');
    },
    closeModal: () => {
        document.getElementById('ot-modal').classList.remove('active');
    },
    addPiece: () => {
        const template = document.getElementById('piece-template');
        const container = document.getElementById('pieces-container');
        const clone = template.content.cloneNode(true);
        container.appendChild(clone);
        const newlyAdded = container.lastElementChild;
        control.addLabor(newlyAdded.querySelector('.btn-outline'));
    },
    removePiece: (btn) => {
        btn.closest('.piece-card').remove();
    },
    addLabor: (btn) => {
        const laborsList = btn.closest('.labors-container').querySelector('.labors-list');
        const template = document.getElementById('labor-template');
        const clone = template.content.cloneNode(true);
        const typeSelect = clone.querySelector('.labor-type');
        const extraDesc = clone.querySelector('.extra-desc');
        const techSelect = clone.querySelector('.labor-tech');
        const qtyInput = clone.querySelector('.labor-qty');
        const amountInput = clone.querySelector('.labor-amount');
        const amountDisplay = clone.querySelector('.labor-amount-display');
        control.populateTechSelect(techSelect);
        const updateLaborUI = () => {
            const type = typeSelect.value;
            const tech = techSelect.value;
            const qty = parseFloat(qtyInput.value) || 1;
            let unitValue = 0;
            if (type === 'extra') {
                extraDesc.style.display = 'block';
                extraDesc.required = true;
                amountInput.style.display = 'block';
                amountInput.required = true;
                amountDisplay.style.display = 'block';
                unitValue = parseFloat(amountInput.value) || 0;
                amountDisplay.innerText = formatMoney(unitValue * qty);
            } else {
                extraDesc.style.display = 'none';
                extraDesc.required = false;
                extraDesc.value = '';
                amountInput.style.display = 'none';
                amountInput.required = false;
                amountDisplay.style.display = 'block';
                if (tech && state.technicians[tech] && state.technicians[tech][type] !== undefined) {
                    unitValue = state.technicians[tech][type];
                }
                amountInput.value = unitValue;
                amountDisplay.innerText = formatMoney(unitValue * qty);
            }
        };
        typeSelect.addEventListener('change', updateLaborUI);
        techSelect.addEventListener('change', updateLaborUI);
        qtyInput.addEventListener('input', updateLaborUI);
        amountInput.addEventListener('input', updateLaborUI);
        updateLaborUI();
        laborsList.appendChild(clone);
    },
    populateTechSelect: (selectEl) => {
        let currentValue = selectEl.value;
        let html = '<option value="">Seleccione Técnico...</option>';
        Object.keys(state.technicians).forEach(t => {
            html += `<option value="${t}">${t}</option>`;
        });
        selectEl.innerHTML = html;
        if (currentValue && state.technicians[currentValue]) {
            selectEl.value = currentValue;
        }
    },
    saveOrder: () => {
        const fecha = document.getElementById('ot-fecha').value;
        const ot = document.getElementById('ot-number').value;
        const vehiculoColor = document.getElementById('ot-vehiculo-color').value;
        const placa = document.getElementById('ot-placa').value;
        const piecesElements = document.querySelectorAll('.piece-card');
        const piezas = [];
        piecesElements.forEach(pieceEl => {
            const name = pieceEl.querySelector('.piece-name').value;
            const price = parseFloat(pieceEl.querySelector('.piece-price').value) || 0;
            const laborsElements = pieceEl.querySelectorAll('.labor-row:not(.header-row)');
            const manosDeObra = [];
            laborsElements.forEach(laborEl => {
                const tipo = laborEl.querySelector('.labor-type').value;
                const tech = laborEl.querySelector('.labor-tech').value;
                const qty = parseFloat(laborEl.querySelector('.labor-qty').value) || 1;
                const unitAmount = parseFloat(laborEl.querySelector('.labor-amount').value) || 0;
                let desc = '';
                if (tipo === 'extra') {
                    desc = laborEl.querySelector('.extra-desc').value;
                }
                const totalAmount = unitAmount * qty;
                manosDeObra.push({ tipo, tecnico: tech, cantidad: qty, monto: totalAmount, desc });
            });
            piezas.push({ nombre: name, precioPublico: price, manosDeObra });
        });
        const newOrder = {
            id: generateId(),
            fecha,
            ot,
            vehiculoColor,
            placa,
            piezas
        };
        state.orders.push(newOrder);
        saveState();
        control.closeModal();
        control.renderOrders();
    },
    deleteOrder: (id) => {
        const pwd = prompt('Ingrese la contraseña de seguridad para eliminar:');
        if (pwd === state.adminPassword) {
            if (confirm('¿Está seguro de que desea eliminar permanentemente esta orden?')) {
                state.orders = state.orders.filter(o => o.id !== id);
                saveState();
                control.renderOrders();
            }
        } else if (pwd !== null) {
            alert('Contraseña incorrecta.');
        }
    },
    toggleOperada: (id, el) => {
        const checked = el.checked;
        const msg = checked
            ? '¿Confirmar que la orden ya fue operada en el sistema de facturación y quieres cerrarla?'
            : '¿Desmarcar esta orden como operada? (Volverá a estar pendiente)';
        if (confirm(msg)) {
            const order = state.orders.find(o => o.id === id);
            if (order) {
                order.operada = checked;
                saveState();
                const tr = el.closest('tr');
                if (checked) {
                    tr.style.opacity = '0.5';
                    tr.style.textDecoration = 'line-through';
                    tr.style.backgroundColor = 'rgba(0,0,0,0.2)';
                } else {
                    tr.style.opacity = '1';
                    tr.style.textDecoration = 'none';
                    tr.style.backgroundColor = 'transparent';
                }
            }
        } else {
            el.checked = !checked;
        }
    },
    processRectify: (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = window.XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                const extractNumber = (val) => {
                    const s = String(val).split('.')[0];
                    const matches = s.match(/\d+/g);
                    return matches ? parseInt(matches[matches.length - 1], 10) : null;
                };
                const spreadsheetOrders = new Set();
                rows.forEach(row => {
                    const orderKey = Object.keys(row).find(k => {
                        const kw = String(k).toLowerCase().trim();
                        return (kw === '#orden' || kw === 'orden' || kw === '# orden') ||
                            (kw.includes('orden') && !kw.includes('ver'));
                    });
                    if (orderKey) {
                        const val = row[orderKey];
                        if (val !== undefined && val !== '') {
                            const num = extractNumber(val);
                            if (num !== null) {
                                spreadsheetOrders.add(num);
                            }
                        }
                    }
                });
                if (spreadsheetOrders.size === 0) {
                    alert("No se encontraron números de orden válidos en el archivo Excel.");
                    event.target.value = '';
                    return;
                }
                if (!confirm(`Se encontraron ${spreadsheetOrders.size} órdenes pendientes en el Excel. ¿Desea continuar?`)) {
                    event.target.value = '';
                    return;
                }
                let marcadasOperadas = 0;
                let dejadasPendientes = 0;
                state.orders.forEach(o => {
                    const otNum = extractNumber(o.ot);
                    if (otNum !== null) {
                        if (spreadsheetOrders.has(otNum)) {
                            if (o.operada) {
                                o.operada = false;
                                dejadasPendientes++;
                            }
                        } else {
                            if (!o.operada) {
                                o.operada = true;
                                marcadasOperadas++;
                            }
                        }
                    }
                });
                saveState();
                alert(`Rectificación completada.\n- Marcadas: ${marcadasOperadas}\n- Restauradas: ${dejadasPendientes}`);
                control.renderOrders();
            } catch (err) {
                console.error(err);
                alert("Error al procesar Excel: " + err.message);
            }
            event.target.value = '';
        };
        reader.readAsArrayBuffer(file);
    },
    renderOrders: () => {
        const month = document.getElementById('filter-month').value;
        const fortnight = document.getElementById('filter-fortnight').value;
        const viewType = document.getElementById('filter-view')?.value || 'general';
        const filterTech = document.getElementById('filter-tech')?.value || 'all';
        let filtered = state.orders.filter(o => getMonthYear(o.fecha) === month);
        if (fortnight !== 'both') {
            filtered = filtered.filter(o => {
                const day = parseInt(o.fecha.split('-')[2], 10);
                return fortnight === '1' ? day <= 15 : day > 15;
            });
        }
        if (filterTech !== 'all') {
            filtered = filtered.map(o => {
                const newPiezas = o.piezas.map(p => {
                    const filteredManos = p.manosDeObra.filter(m => m.tecnico === filterTech);
                    return { ...p, manosDeObra: filteredManos };
                }).filter(p => p.manosDeObra.length > 0);
                return { ...o, piezas: newPiezas };
            }).filter(o => o.piezas.length > 0);
        }
        const tableGeneral = document.getElementById('table-general');
        const tableDetallada = document.getElementById('table-detallada');
        const tbodyGeneral = document.getElementById('orders-tbody-general');
        const tbodyDetallada = document.getElementById('orders-tbody-detallada');
        if (viewType === 'general') {
            tableGeneral.style.display = 'table';
            tableDetallada.style.display = 'none';
            tbodyGeneral.innerHTML = '';
            if (filtered.length === 0) {
                tbodyGeneral.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:30px;">No hay órdenes registradas.</td></tr>';
                return;
            }
            filtered.forEach(o => {
                let totalCliente = 0;
                let totalComisiones = 0;
                o.piezas.forEach(p => {
                    totalCliente += p.precioPublico;
                    p.manosDeObra.forEach(m => totalComisiones += m.monto);
                });
                const tr = document.createElement('tr');
                if (o.operada) {
                    tr.style.opacity = '0.5';
                    tr.style.textDecoration = 'line-through';
                    tr.style.backgroundColor = 'rgba(0,0,0,0.2)';
                }
                tr.innerHTML = `
                    <td>${o.fecha}</td>
                    <td><span class="badge">${o.ot}</span></td>
                    <td>${o.vehiculoColor || '-'}</td>
                    <td>${o.placa.toUpperCase()}</td>
                    <td style="color:#4cd964;">${formatMoney(totalCliente)}</td>
                    <td style="color:var(--accent);">${formatMoney(totalComisiones)}</td>
                    <td style="text-align:center;">
                        <input type="checkbox" ${o.operada ? 'checked' : ''} onchange="control.toggleOperada('${o.id}', this)">
                    </td>
                    <td>
                        <button class="btn-icon text-danger" onclick="control.deleteOrder('${o.id}')">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                `;
                tbodyGeneral.appendChild(tr);
            });
        } else {
            tableGeneral.style.display = 'none';
            tableDetallada.style.display = 'table';
            tbodyDetallada.innerHTML = '';
            let sumEnderezado = 0, sumPreparado = 0, sumPulido = 0, sumPintura = 0, sumExtra = 0, sumGranTotal = 0;
            filtered.forEach(o => {
                const otRow = document.createElement('tr');
                otRow.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                otRow.innerHTML = `
                    <td colspan="6" style="padding: 12px 15px;">
                        <span class="badge" style="background:var(--accent); color:#000;">${o.ot}</span>
                        <strong>${o.fecha}</strong> | ${o.vehiculoColor || '-'} (${o.placa.toUpperCase()})
                    </td>
                `;
                tbodyDetallada.appendChild(otRow);
                o.piezas.forEach(p => {
                    const tasksByType = { enderezado: [], preparado: [], pulido: [], pintura: [], extra: [] };
                    p.manosDeObra.forEach(m => {
                        const t = m.tipo.toLowerCase();
                        if (tasksByType[t]) tasksByType[t].push(m);
                        const val = m.monto;
                        sumGranTotal += val;
                        if (t === 'enderezado') sumEnderezado += val;
                        else if (t === 'preparado') sumPreparado += val;
                        else if (t === 'pulido') sumPulido += val;
                        else if (t === 'pintura') sumPintura += val;
                        else if (t === 'extra') sumExtra += val;
                    });
                    const renderCell = (tasks) => {
                        if (tasks.length === 0) return `<td style="text-align:center;">-</td>`;
                        let html = `<td>`;
                        tasks.forEach(m => {
                            html += `<div style="background:rgba(0,0,0,0.3); padding:6px; margin-bottom:4px; font-size:11px; border-left:3px solid var(--accent);">
                                <strong>${m.cantidad}</strong> ${m.tecnico}<br><span style="color:var(--accent);">${formatMoney(m.monto)}</span>
                            </div>`;
                        });
                        return html + `</td>`;
                    };
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="font-weight:bold;">${p.nombre}</td>
                        ${renderCell(tasksByType.enderezado)}
                        ${renderCell(tasksByType.preparado)}
                        ${renderCell(tasksByType.pulido)}
                        ${renderCell(tasksByType.pintura)}
                        ${renderCell(tasksByType.extra)}
                    `;
                    tbodyDetallada.appendChild(tr);
                });
            });
            const trSubtotales = document.createElement('tr');
            trSubtotales.innerHTML = `<td style="text-align:right;">Subtotales:</td>
                <td>${formatMoney(sumEnderezado)}</td><td>${formatMoney(sumPreparado)}</td><td>${formatMoney(sumPulido)}</td><td>${formatMoney(sumPintura)}</td><td>${formatMoney(sumExtra)}</td>`;
            tbodyDetallada.appendChild(trSubtotales);
            const trGranTotal = document.createElement('tr');
            trGranTotal.innerHTML = `<td colspan="5" style="text-align:right; font-weight:900; font-size:18px;">Total:</td>
                <td style="font-size:22px; font-weight:900; color:#4cd964;">${formatMoney(sumGranTotal)}</td>`;
            tbodyDetallada.appendChild(trGranTotal);
        }
    }
};

window.dashboard = {
    init: () => {
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const filterFortnight = document.getElementById('dashboard-fortnight').value;
        let vehiclesCount = 0, piecesCount = 0, totalIncome = 0, totalCommissions = 0;
        const comisionesPorTecnico = {};
        state.orders.forEach(o => {
            if (getMonthYear(o.fecha) !== currentMonth) return;
            vehiclesCount++;
            piecesCount += o.piezas.length;
            o.piezas.forEach(p => {
                totalIncome += p.precioPublico;
                p.manosDeObra.forEach(m => totalCommissions += m.monto);
            });
            const orderDay = parseInt(o.fecha.split('-')[2], 10);
            const isFirstFortnight = orderDay <= 15;
            let include = (filterFortnight === 'both') || (filterFortnight === '1' && isFirstFortnight) || (filterFortnight === '2' && !isFirstFortnight);
            if (include) {
                o.piezas.forEach(p => {
                    p.manosDeObra.forEach(m => {
                        const t = m.tecnico.toUpperCase();
                        if (!comisionesPorTecnico[t]) comisionesPorTecnico[t] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0, extra: 0, total: 0 };
                        if (comisionesPorTecnico[t][m.tipo] !== undefined) comisionesPorTecnico[t][m.tipo] += m.monto;
                        comisionesPorTecnico[t].total += m.monto;
                    });
                });
            }
        });
        document.getElementById('metric-vehiculos').innerText = vehiclesCount;
        document.getElementById('metric-piezas').innerText = piecesCount;
        document.getElementById('metric-ingreso').innerText = formatMoney(totalIncome);
        document.getElementById('metric-comisiones').innerText = formatMoney(totalCommissions);
        const tbody = document.getElementById('commissions-tbody');
        tbody.innerHTML = '';
        Object.keys(comisionesPorTecnico).forEach(t => {
            const d = comisionesPorTecnico[t];
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${t}</td><td>${formatMoney(d.enderezado)}</td><td>${formatMoney(d.preparado)}</td><td>${formatMoney(d.pulido)}</td><td>${formatMoney(d.pintura)}</td><td>${formatMoney(d.extra)}</td><td style="color:var(--accent); font-weight:800;">${formatMoney(d.total)}</td>`;
            tbody.appendChild(tr);
        });
    }
};

window.config = {
    init: () => {
        document.getElementById('config-meta-vehiculos').value = state.goals.vehiculos || 0;
        document.getElementById('config-meta-piezas').value = state.goals.piezas || 0;
        config.renderTable();
    },
    renderTable: () => {
        const tbody = document.getElementById('config-tech-tbody');
        tbody.innerHTML = '';
        Object.keys(state.technicians).forEach(techName => {
            const rates = state.technicians[techName];
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${techName}</td>
                <td><input type="number" class="input-dark config-rate" data-tech="${techName}" data-type="enderezado" value="${rates.enderezado}" onchange="config.updateRate(this)"></td>
                <td><input type="number" class="input-dark config-rate" data-tech="${techName}" data-type="preparado" value="${rates.preparado}" onchange="config.updateRate(this)"></td>
                <td><input type="number" class="input-dark config-rate" data-tech="${techName}" data-type="pulido" value="${rates.pulido}" onchange="config.updateRate(this)"></td>
                <td><input type="number" class="input-dark config-rate" data-tech="${techName}" data-type="pintura" value="${rates.pintura}" onchange="config.updateRate(this)"></td>
                <td><button onclick="config.deleteTech('${techName}')">X</button></td>`;
            tbody.appendChild(tr);
        });
    },
    addTech: () => {
        const name = prompt('Nombre:');
        if (name) {
            const t = name.trim().toUpperCase();
            if (!state.technicians[t]) {
                state.technicians[t] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 };
                saveState(); config.renderTable();
            }
        }
    },
    updateGoal: (type, val) => { state.goals[type] = parseInt(val) || 0; saveState(); },
    updateRate: (input) => {
        const tech = input.getAttribute('data-tech'), type = input.getAttribute('data-type'), val = parseFloat(input.value) || 0;
        state.technicians[tech][type] = val; saveState();
    },
    deleteTech: (name) => {
        if (confirm(`¿Eliminar ${name}?`)) {
            delete state.technicians[name]; saveState(); config.renderTable();
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (supabase) loadFromSupabase().then(() => {
        if (state.currentView === 'control') window.control.init();
        if (state.currentView === 'dashboard') window.dashboard.init();
        if (state.currentView === 'config') window.config.init();
    });
    if (window.app && window.app.navigate) {
        window.app.navigate('home');
    }
});
