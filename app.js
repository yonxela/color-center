// Configuración de Supabase
const SUPABASE_URL = 'https://oqlonlkudzvzpakswmjv.supabase.co';
const SUPABASE_KEY = 'sb_publishable_2MsTrkgtzcD6WAS9g44Dtg_EIKEeWUa';
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Estado y persistencia
const STORAGE_KEY = 'colorCenter_v1';
let storedTechs = JSON.parse(localStorage.getItem(STORAGE_KEY + '_techs'));
if (Array.isArray(storedTechs)) {
    let newTechs = {};
    storedTechs.forEach(t => newTechs[t] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 });
    storedTechs = newTechs;
} else if (!storedTechs) {
    storedTechs = { 'TÉCNICO 1': { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 } };
}

const state = {
    orders: JSON.parse(localStorage.getItem(STORAGE_KEY)) || [],
    technicians: storedTechs,
    goals: JSON.parse(localStorage.getItem(STORAGE_KEY + '_goals')) || { vehiculos: 0, piezas: 0 },
    adminPassword: localStorage.getItem(STORAGE_KEY + '_pwd') || '0502',
    currentView: 'home',
    isSyncing: false
};

const formatMoney = (amount) => 'Q ' + parseFloat(amount).toFixed(2);
const getMonthYear = (dateStr) => {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const saveState = async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
    localStorage.setItem(STORAGE_KEY + '_techs', JSON.stringify(state.technicians));
    localStorage.setItem(STORAGE_KEY + '_goals', JSON.stringify(state.goals));
    localStorage.setItem(STORAGE_KEY + '_pwd', state.adminPassword);

    if (supabase) {
        try {
            await supabase.from('color_center_data').upsert([
                { id: 1, section: 'all_data', content: { 
                    orders: state.orders, 
                    techs: state.technicians, 
                    goals: state.goals, 
                    password: state.adminPassword 
                }}
            ]);
        } catch (e) {
            console.error("Error al sincronizar con Supabase:", e);
        }
    }
};

const loadFromSupabase = async () => {
    if (!supabase) return;
    try {
        const { data, error } = await supabase
            .from('color_center_data')
            .select('content')
            .eq('id', 1)
            .single();

        if (data && data.content) {
            state.orders = data.content.orders || [];
            state.technicians = data.content.techs || {};
            state.goals = data.content.goals || { vehiculos: 0, piezas: 0 };
            state.adminPassword = data.content.password || '0502';
            
            // Actualizar localStorage también
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.orders));
            localStorage.setItem(STORAGE_KEY + '_techs', JSON.stringify(state.technicians));
            localStorage.setItem(STORAGE_KEY + '_goals', JSON.stringify(state.goals));
            localStorage.setItem(STORAGE_KEY + '_pwd', state.adminPassword);
        }
    } catch (e) {
        console.error("Error al cargar de Supabase:", e);
    }
};
const generateId = () => Math.random().toString(36).substr(2, 9);

// Router
const app = {
    navigate: (viewId) => {
        document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.add('active');

        const btn = document.querySelector(`.nav-btn[onclick="app.navigate('${viewId}')"]`);
        if (btn) btn.classList.add('active');

        state.currentView = viewId;

        if (viewId === 'control') {
            control.init();
        } else if (viewId === 'dashboard') {
            dashboard.init();
        } else if (viewId === 'config') {
            config.init();
        }
    }
};

// Modulo Control Mensual
const control = {
    init: () => {
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

        const filterMonth = document.getElementById('filter-month');
        let months = new Set();
        months.add(currentMonth);
        state.orders.forEach(o => months.add(getMonthYear(o.fecha)));

        filterMonth.innerHTML = Array.from(months)
            .sort().reverse()
            .map(m => `<option value="${m}" ${m === currentMonth ? 'selected' : ''}>${m}</option>`)
            .join('');

        const filterTech = document.getElementById('filter-tech');
        if (filterTech) {
            let techHtml = '<option value="all">Todos los Técnicos</option>';
            Object.keys(state.technicians).sort().forEach(t => {
                techHtml += `<option value="${t}">${t}</option>`;
            });
            filterTech.innerHTML = techHtml;
        }

        control.renderOrders();
    },

    showNewOrderModal: () => {
        document.getElementById('ot-form').reset();
        document.getElementById('ot-fecha').valueAsDate = new Date();
        document.getElementById('pieces-container').innerHTML = '';
        control.addPiece(); // Add one piece by default
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
                // Usando window.XLSX para asegurar que carga del CDN
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
                    alert("No se encontraron números de orden válidos en el archivo Excel.\nAsegúrese de que el archivo tenga una columna llamada '#Orden'.");
                    event.target.value = '';
                    return;
                }

                if (!confirm(`Se encontraron ${spreadsheetOrders.size} órdenes pendientes en el Excel.\n\nEl sistema tachará y marcará como "Operadas" a TODAS las órdenes registradas que NO se encuentren en el listado, y dejará como "Pendientes" a las que sí aparezcan.\n\n¿Desea continuar?`)) {
                    event.target.value = '';
                    return;
                }

                let marcadasOperadas = 0;
                let dejadasPendientes = 0;

                state.orders.forEach(o => {
                    const otNum = extractNumber(o.ot);
                    if (otNum !== null) {
                        if (spreadsheetOrders.has(otNum)) {
                            // Está en el excel -> dejar pendiente (no operada)
                            if (o.operada) {
                                o.operada = false;
                                dejadasPendientes++;
                            }
                        } else {
                            // No está en el excel -> tachar, marcar como operada
                            if (!o.operada) {
                                o.operada = true;
                                marcadasOperadas++;
                            }
                        }
                    }
                });

                saveState();
                alert(`Rectificación completada con éxito.\n- Marcadas como OPERADAS (NO están en excel): ${marcadasOperadas}\n- Restauradas a PENDIENTES (Sí están en Excel): ${dejadasPendientes}`);
                control.renderOrders();

            } catch (err) {
                console.error(err);
                alert("Ocurrió un error al procesar el archivo Excel: " + err.message);
            }
            event.target.value = ''; // Reset file input
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

        // Apply tech filter if needed
        if (filterTech !== 'all') {
            filtered = filtered.map(o => {
                const newPiezas = o.piezas.map(p => {
                    const filteredManos = p.manosDeObra.filter(m => m.tecnico === filterTech);
                    return { ...p, manosDeObra: filteredManos };
                }).filter(p => p.manosDeObra.length > 0); // Keep pieces that have work by this tech

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
                tbodyGeneral.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-secondary);padding:30px;">No hay órdenes registradas en este periodo</td></tr>';
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
                tr.style.transition = 'all 0.3s ease';
                if (o.operada) {
                    tr.style.opacity = '0.5';
                    tr.style.textDecoration = 'line-through';
                    tr.style.backgroundColor = 'rgba(0,0,0,0.2)';
                }
                tr.innerHTML = `
                    <td><i class="far fa-calendar-alt text-secondary"></i> ${o.fecha}</td>
                    <td><span class="badge">${o.ot}</span></td>
                    <td>${o.vehiculoColor || '-'}</td>
                    <td><i class="fas fa-car text-secondary"></i> ${o.placa.toUpperCase()}</td>
                    <td style="color:#4cd964; font-weight:600;">${formatMoney(totalCliente)}</td>
                    <td style="color:var(--accent); font-weight:600;">${formatMoney(totalComisiones)}</td>
                    <td style="text-align:center;">
                        <input type="checkbox" style="transform: scale(1.3); cursor: pointer;" ${o.operada ? 'checked' : ''} onchange="control.toggleOperada('${o.id}', this)" title="Marcar como operada">
                    </td>
                    <td>
                        <button class="btn-icon text-danger" title="Eliminar" onclick="control.deleteOrder('${o.id}')">
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

            if (filtered.length === 0) {
                tbodyDetallada.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:30px;">No hay órdenes registradas en este periodo</td></tr>';
                return;
            }

            let sumEnderezado = 0;
            let sumPreparado = 0;
            let sumPulido = 0;
            let sumPintura = 0;
            let sumExtra = 0;
            let sumGranTotal = 0;

            filtered.forEach(o => {
                let hasDetails = false;

                const otRow = document.createElement('tr');
                otRow.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                otRow.style.borderTop = '2px solid rgba(255,255,255,0.1)';
                otRow.innerHTML = `
                    <td colspan="6" style="padding: 12px 15px;">
                        <span class="badge" style="background:var(--accent); color:#000; margin-right:10px;">${o.ot}</span>
                        <strong style="color:var(--text);"><i class="far fa-calendar-alt" style="color:var(--text-secondary)"></i> ${o.fecha}</strong>
                        <span style="margin: 0 10px; color:var(--text-secondary);">|</span>
                        <span style="color:var(--text-secondary);"><i class="fas fa-car"></i> ${o.vehiculoColor || '-'} (${o.placa.toUpperCase()})</span>
                    </td>
                `;
                tbodyDetallada.appendChild(otRow);

                o.piezas.forEach(p => {
                    hasDetails = true;

                    const tasksByType = { enderezado: [], preparado: [], pulido: [], pintura: [], extra: [] };
                    p.manosDeObra.forEach(m => {
                        const t = m.tipo.toLowerCase();
                        if (tasksByType[t]) {
                            tasksByType[t].push(m);
                        }
                        const val = m.monto;
                        sumGranTotal += val;
                        if (t === 'enderezado') sumEnderezado += val;
                        else if (t === 'preparado') sumPreparado += val;
                        else if (t === 'pulido') sumPulido += val;
                        else if (t === 'pintura') sumPintura += val;
                        else if (t === 'extra') sumExtra += val;
                    });

                    const renderCell = (tasks) => {
                        if (tasks.length === 0) return `<td style="color:rgba(255,255,255,0.2); text-align:center; vertical-align:middle; border-right: 1px solid rgba(255,255,255,0.05);">-</td>`;

                        let html = `<td style="vertical-align:top; border-right: 1px solid rgba(255,255,255,0.05); padding: 5px;">`;
                        tasks.forEach(m => {
                            let blockDesc = m.desc ? `<br><small style="color:var(--text-secondary); max-width:100px; display:inline-block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${m.desc}">(${m.desc})</small>` : '';
                            html += `
                            <div style="background:rgba(0,0,0,0.3); border-radius:4px; padding:6px; margin-bottom:4px; font-size:11px; border-left:3px solid var(--accent); line-height: 1.4;">
                                <strong>Cant: ${m.cantidad || 1}</strong>
                                <br><i class="fas fa-user-circle text-secondary"></i> <span style="font-weight:600; text-transform:uppercase;">${m.tecnico}</span>
                                <br><span style="color:var(--accent); font-weight:600;">${formatMoney(m.monto)}</span>
                                ${blockDesc}
                            </div>`;
                        });
                        html += `</td>`;
                        return html;
                    };

                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    tr.innerHTML = `
                        <td style="font-weight:bold; vertical-align:middle; border-right: 1px solid rgba(255,255,255,0.05); max-width: 150px; text-transform:uppercase;">${p.nombre || 'Sin nombre'}</td>
                        ${renderCell(tasksByType.enderezado)}
                        ${renderCell(tasksByType.preparado)}
                        ${renderCell(tasksByType.pulido)}
                        ${renderCell(tasksByType.pintura)}
                        ${renderCell(tasksByType.extra)}
                    `;
                    tbodyDetallada.appendChild(tr);
                });

                if (!hasDetails) {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td colspan="6" style="color:var(--text-secondary); text-align:center;">Sin piezas registradas</td>
                    `;
                    tbodyDetallada.appendChild(tr);
                }
            });

            // Fila de Subtotales
            const trSubtotales = document.createElement('tr');
            trSubtotales.style.backgroundColor = 'rgba(255,255,255,0.08)';
            trSubtotales.style.borderTop = '2px solid var(--text-secondary)';
            trSubtotales.innerHTML = `
                <td style="font-weight:900; font-size:14px; text-transform:uppercase; text-align:right; border-right: 1px solid rgba(255,255,255,0.05); color:var(--text-secondary);">Sub-totales:</td>
                <td style="font-weight:bold; color:#e6edf3;">${formatMoney(sumEnderezado)}</td>
                <td style="font-weight:bold; color:#e6edf3;">${formatMoney(sumPreparado)}</td>
                <td style="font-weight:bold; color:#e6edf3;">${formatMoney(sumPulido)}</td>
                <td style="font-weight:bold; color:#e6edf3;">${formatMoney(sumPintura)}</td>
                <td style="font-weight:bold; color:#e6edf3;">${formatMoney(sumExtra)}</td>
            `;
            tbodyDetallada.appendChild(trSubtotales);

            // Fila de Gran Total
            const trGranTotal = document.createElement('tr');
            trGranTotal.style.backgroundColor = 'rgba(35, 134, 54, 0.15)';
            trGranTotal.innerHTML = `
                <td colspan="5" style="text-align:right; font-weight:900; font-size:18px; text-transform:uppercase; color:var(--text-primary); padding:20px;">Gran Total a Pagar:</td>
                <td style="font-size:22px; font-weight:900; color:#4cd964; padding:20px;">${formatMoney(sumGranTotal)}</td>
            `;
            tbodyDetallada.appendChild(trGranTotal);
        }
    }
};

// Modulo Dashboard
const dashboard = {
    init: () => {
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const filterFortnight = document.getElementById('dashboard-fortnight').value;

        let vehiclesCount = 0;
        let piecesCount = 0;
        let totalIncome = 0;
        let totalCommissions = 0;
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

            let includeForCommissions = true;
            if (filterFortnight === '1' && !isFirstFortnight) includeForCommissions = false;
            if (filterFortnight === '2' && isFirstFortnight) includeForCommissions = false;

            if (includeForCommissions) {
                o.piezas.forEach(p => {
                    p.manosDeObra.forEach(m => {
                        const t = m.tecnico.toUpperCase();
                        if (!comisionesPorTecnico[t]) {
                            comisionesPorTecnico[t] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0, extra: 0, total: 0 };
                        }

                        if (comisionesPorTecnico[t][m.tipo] !== undefined) {
                            comisionesPorTecnico[t][m.tipo] += m.monto;
                        }
                        comisionesPorTecnico[t].total += m.monto;
                    });
                });
            }
        });

        const formatMeta = (current, meta) => {
            if (!meta || meta <= 0) return '';
            const percent = Math.min(100, Math.round((current / meta) * 100));
            return `
                <div style="display:flex; justify-content:space-between; margin-bottom: 2px;">
                    <span>Meta: ${meta}</span>
                    <span style="color:${percent >= 100 ? '#3fb950' : 'var(--text-secondary)'}">${percent}%</span>
                </div>
                <div style="background: rgba(255,255,255,0.1); height:4px; border-radius:2px; overflow:hidden;">
                    <div style="background:${percent >= 100 ? '#3fb950' : 'var(--accent)'}; width:${percent}%; height:100%;"></div>
                </div>
            `;
        };

        document.getElementById('metric-vehiculos').innerText = vehiclesCount;
        document.getElementById('meta-vehiculos-display').innerHTML = formatMeta(vehiclesCount, state.goals.vehiculos);

        document.getElementById('metric-piezas').innerText = piecesCount;
        document.getElementById('meta-piezas-display').innerHTML = formatMeta(piecesCount, state.goals.piezas);

        document.getElementById('metric-ingreso').innerText = formatMoney(totalIncome);
        document.getElementById('metric-comisiones').innerText = formatMoney(totalCommissions);

        const tbody = document.getElementById('commissions-tbody');
        tbody.innerHTML = '';

        const tecnicos = Object.keys(comisionesPorTecnico).sort();
        if (tecnicos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-secondary);padding:30px;">No hay comisiones para mostrar en este criterio</td></tr>';
            return;
        }

        tecnicos.forEach(t => {
            const data = comisionesPorTecnico[t];
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight:600;"><i class="fas fa-user-circle" style="color:var(--text-secondary)"></i> ${t}</td>
                <td>${formatMoney(data.enderezado)}</td>
                <td>${formatMoney(data.preparado)}</td>
                <td>${formatMoney(data.pulido)}</td>
                <td>${formatMoney(data.pintura)}</td>
                <td>${formatMoney(data.extra)}</td>
                <td style="color:var(--accent); font-weight:800; font-size:16px;">${formatMoney(data.total)}</td>
            `;
            tbody.appendChild(tr);
        });
    }
}

// Modulo Config
const config = {
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
            tr.innerHTML = `
                <td><strong>${techName}</strong></td>
                <td><input type="number" class="input-dark config-rate" style="width:80px" data-tech="${techName}" data-type="enderezado" value="${rates.enderezado}" onchange="config.updateRate(this)" min="0" step="0.01"></td>
                <td><input type="number" class="input-dark config-rate" style="width:80px" data-tech="${techName}" data-type="preparado" value="${rates.preparado}" onchange="config.updateRate(this)" min="0" step="0.01"></td>
                <td><input type="number" class="input-dark config-rate" style="width:80px" data-tech="${techName}" data-type="pulido" value="${rates.pulido}" onchange="config.updateRate(this)" min="0" step="0.01"></td>
                <td><input type="number" class="input-dark config-rate" style="width:80px" data-tech="${techName}" data-type="pintura" value="${rates.pintura}" onchange="config.updateRate(this)" min="0" step="0.01"></td>
                <td><button class="btn-icon text-danger" onclick="config.deleteTech('${techName}')"><i class="fas fa-trash"></i></button></td>
            `;
            tbody.appendChild(tr);
        });
    },
    addTech: () => {
        const name = prompt('Nombre del nuevo técnico:');
        if (name && name.trim()) {
            const techName = name.trim().toUpperCase();
            if (!state.technicians[techName]) {
                state.technicians[techName] = { enderezado: 0, preparado: 0, pulido: 0, pintura: 0 };
                saveState();
                config.renderTable();
            } else {
                alert('El técnico ya existe.');
            }
        }
    },
    changePassword: () => {
        const current = prompt('Ingrese la contraseña actual:');
        if (current === state.adminPassword) {
            const newPwd = prompt('Ingrese la nueva contraseña:');
            if (newPwd && newPwd.trim()) {
                state.adminPassword = newPwd.trim();
                saveState();
                alert('Contraseña actualizada correctamente.');
            }
        } else if (current !== null) {
            alert('Contraseña actual incorrecta.');
        }
    },
    updateGoal: (type, val) => {
        state.goals[type] = parseInt(val) || 0;
        saveState();
    },
    updateRate: (input) => {
        const tech = input.getAttribute('data-tech');
        const type = input.getAttribute('data-type');
        const val = parseFloat(input.value) || 0;
        state.technicians[tech][type] = val;
        saveState();
    },
    deleteTech: (name) => {
        if (confirm(`¿Eliminar permanentemente al técnico ${name} y toda su configuración?`)) {
            delete state.technicians[name];
            saveState();
            config.renderTable();
        }
    },
    downloadBackup: () => {
        const backupData = {
            version: 1,
            timestamp: new Date().toISOString(),
            orders: state.orders,
            technicians: state.technicians,
            goals: state.goals,
            password: state.adminPassword
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const dateObj = new Date();
        const dateString = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        downloadAnchor.setAttribute("download", `ColorCenter_Backup_${dateString}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    },
    processRestore: (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const contents = e.target.result;
                const backupData = JSON.parse(contents);

                if (!backupData.orders || !backupData.technicians) {
                    alert('El archivo no parece ser un respaldo válido de Color Center.');
                    return;
                }

                if (confirm('⚠️ ADVERTENCIA: Esta acción sobreescribirá todos los datos actuales de esta computadora con los del archivo. ¿Está seguro de continuar?')) {
                    state.orders = backupData.orders;
                    state.technicians = backupData.technicians;
                    if (backupData.goals) state.goals = backupData.goals;
                    if (backupData.password) state.adminPassword = backupData.password;

                    saveState();
                    alert('Restauración completada con éxito. La página se recargará para aplicar los cambios.');
                    window.location.reload();
                }

            } catch (err) {
                console.error(err);
                alert('Ocurrió un error al leer el archivo de respaldo: ' + err.message);
            }
            event.target.value = ''; // Reset file input
        };
        reader.readAsText(file);
    }
};

// Inicialización de Eventos DOM
document.addEventListener('DOMContentLoaded', async () => {
    // Mostrar indicador de carga si fuera necesario
    if (supabase) {
        await loadFromSupabase();
    }
    app.navigate('home');
});