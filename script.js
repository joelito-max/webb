
const numBusesInput = document.getElementById('num-buses');
const ybusInput = document.getElementById('ybus-input');
const busDataTableBody = document.querySelector('#bus-data-table tbody');
const numIterInput = document.getElementById('num-iter');
// REMOVED: const toleranceInput = document.getElementById('tolerance');
const runButton = document.getElementById('run-button');
const outputDiv = document.getElementById('output');
const resultsTableBody = document.querySelector('#results-table tbody');
const convergenceInfo = document.getElementById('convergence-info');
const errorLog = document.getElementById('error-log');

// --- Default Values ---
const defaultBusData = [
    { type: 'Slack', v_mag: 1.0, v_phase: 0, p_gen: 0, q_gen: 0, p_load: 0, q_load: 0 },
    { type: 'PQ', v_mag: 1.0, v_phase: 0, p_gen: 0, q_gen: 0, p_load: 0.5, q_load: 0.2 },
    { type: 'PV', v_mag: 1.02, v_phase: 0, p_gen: 0.8, q_gen: 0, p_load: 0, q_load: 0 },
];

// --- Utility Functions ---

function degToRad(degrees) {
    return degrees * (Math.PI / 180);
}

function radToDeg(radians) {
    return radians * (180 / Math.PI);
}

function parseComplex(str) {
    if (!str || typeof str !== 'string') return math.complex(0, 0);
    str = str.trim().toLowerCase().replace(/\s+/g, '');

    if (str === 'j' || str === 'i') return math.complex(0, 1);
    if (str === '-j' || str === '-i') return math.complex(0, -1);

    str = str.replace(/([\d.-]+)e([+-]?\d+)/g, (match, coeff, exp) => {
        return parseFloat(coeff) * Math.pow(10, parseInt(exp));
     });

    const polarMatch = str.match(/^([\d.-]+)<([\d.-]+)$/);
    if (polarMatch) {
        const mag = parseFloat(polarMatch[1]);
        const angleDeg = parseFloat(polarMatch[2]);
        if (!isNaN(mag) && !isNaN(angleDeg)) {
            const angleRad = degToRad(angleDeg);
            return math.complex({ r: mag, phi: angleRad });
        } else {
             console.warn(`No se pudo parsear formato polar: "${str}".`);
        }
    }

    try {
        const complexVal = math.complex(str);
        if (!isNaN(complexVal.re) && !isNaN(complexVal.im)) {
             return complexVal;
        }
    } catch (e) {
        console.warn(`Error al parsear valor complejo: "${str}". ${e.message}`);
    }

    const parts = str.split(',');
    if (parts.length === 2) {
        const real = parseFloat(parts[0]);
        const imag = parseFloat(parts[1]);
        if (!isNaN(real) && !isNaN(imag)) {
            return math.complex(real, imag);
        }
    }

    const realOnly = parseFloat(str);
    if (!isNaN(realOnly) && !str.includes('j') && !str.includes('i') && !str.includes(',') && !str.includes('<')) {
        return math.complex(realOnly, 0);
    }

    console.warn(`No se pudo parsear el número complejo: "${str}". Usando 0+0j.`);
    return math.complex(0, 0);
}

function displayError(message) {
    errorLog.textContent = message;
    const resultsPlaceholder = document.querySelector('#output p');
    if (resultsPlaceholder) resultsPlaceholder.textContent = 'Los resultados aparecerán aquí después de ejecutar la simulación.';
    resultsTableBody.innerHTML = '';
    convergenceInfo.textContent = '';
}

function clearError() {
     errorLog.textContent = '';
}

// --- Input Generation ---

function generateBusTableRows() {
    const numBuses = parseInt(numBusesInput.value) || 0;
    busDataTableBody.innerHTML = '';

    for (let i = 0; i < numBuses; i++) {
        const row = busDataTableBody.insertRow();
        const defaultData = defaultBusData[i] || defaultBusData[1] || { type: 'PQ', v_mag: 1.0, v_phase: 0, p_gen: 0, q_gen: 0, p_load: 0, q_load: 0 };

        row.innerHTML = `
            <td>${i + 1}</td>
            <td>
                <select class="bus-type">
                    <option value="Slack" ${defaultData.type === 'Slack' ? 'selected' : ''}>Slack</option>
                    <option value="PV" ${defaultData.type === 'PV' ? 'selected' : ''}>PV</option>
                    <option value="PQ" ${defaultData.type === 'PQ' ? 'selected' : ''}>PQ</option>
                </select>
            </td>
            <td><input type="number" class="v-mag" step="0.01" value="${defaultData.v_mag}"></td>
            <td><input type="number" class="v-phase" step="any" value="${defaultData.v_phase}"></td>
            <td><input type="number" class="p-gen" step="any" value="${defaultData.p_gen}"></td>
            <td><input type="number" class="q-gen" step="any" value="${defaultData.q_gen}"></td>
             <td><input type="number" class="p-load" step="any" value="${defaultData.p_load}"></td>
            <td><input type="number" class="q-load" step="any" value="${defaultData.q_load}"></td>
        `;
    }
}

// --- Data Parsing ---

function parseInputs() {
    clearError();
    const numBuses = parseInt(numBusesInput.value);
    if (isNaN(numBuses) || numBuses <= 0) {
        throw new Error("Número de barras inválido.");
    }

    const ybusRows = ybusInput.value.trim().split('\n');
    if (ybusRows.length !== numBuses) {
        throw new Error(`La entrada Ybus tiene ${ybusRows.length} filas, pero se esperaban ${numBuses}.`);
    }
    const Ybus = ybusRows.map((rowStr, rowIndex) => {
        const rowElements = rowStr.split(',').map(s => s.trim()).filter(s => s !== '');
         if (rowElements.length !== numBuses) {
             throw new Error(`La fila ${rowIndex + 1} de Ybus tiene ${rowElements.length} elementos, pero se esperaban ${numBuses}.`);
         }
        return rowElements.map((valStr, colIndex) => {
             try {
                 return parseComplex(valStr);
             } catch (e) {
                 throw new Error(`Error al parsear elemento Ybus en [${rowIndex+1}, ${colIndex+1}]: ${valStr}. ${e.message}`);
             }
         });
    });

    const busDataRows = busDataTableBody.querySelectorAll('tr');
    if (busDataRows.length !== numBuses) {
        throw new Error(`La tabla de datos de barras tiene ${busDataRows.length} filas, pero se esperaban ${numBuses}.`);
    }

    let slackBusIndex = -1;
    let slackBusCount = 0;
    const busData = [];
    const V_initial = [];

    busDataRows.forEach((row, i) => {
        const type = row.querySelector('.bus-type').value;
        const v_mag = parseFloat(row.querySelector('.v-mag').value);
        const v_phase_deg = parseFloat(row.querySelector('.v-phase').value);
        const p_gen = parseFloat(row.querySelector('.p-gen').value);
        const q_gen = parseFloat(row.querySelector('.q-gen').value);
        const p_load = parseFloat(row.querySelector('.p-load').value);
        const q_load = parseFloat(row.querySelector('.q-load').value);

        if (isNaN(v_mag) || isNaN(v_phase_deg) || isNaN(p_gen) || isNaN(q_gen) || isNaN(p_load) || isNaN(q_load)) {
             throw new Error(`Entrada numérica inválida para la barra ${i + 1}. Por favor, revise todos los valores.`);
        }

        const P_spec = p_gen - p_load;
        const Q_spec = q_gen - q_load;

        if (type === 'Slack') {
            slackBusIndex = i;
            slackBusCount++;
        }

        const v_phase_rad = degToRad(v_phase_deg);
        const initialVoltage = math.complex({ r: v_mag, phi: v_phase_rad });
        V_initial.push(initialVoltage);

        busData.push({
            index: i,
            type: type,
            P_spec: P_spec,
            Q_spec: Q_spec,
            V_target_mag: v_mag,
        });
    });

    if (slackBusCount !== 1) {
        throw new Error(`Se esperaba exactamente una barra Slack, pero se encontraron ${slackBusCount}.`);
    }
    if (slackBusIndex === -1) {
         throw new Error("No se definió una barra Slack.");
    }

    const numIterations = parseInt(numIterInput.value);
    // REMOVED: const tolerance = parseFloat(toleranceInput.value);
     if (isNaN(numIterations) || numIterations <= 0) {
         throw new Error("Número de iteraciones inválido.");
     }
     // REMOVED: Tolerance validation
     /*
     if (isNaN(tolerance) || tolerance < 0) {
          throw new Error("Tolerancia de convergencia inválida.");
     }
     */

    return { numBuses, Ybus, busData, V_initial, slackBusIndex, numIterations /* REMOVED: , tolerance */ };
}

// --- Gauss-Seidel Algorithm ---

function runGaussSeidel() {
    let inputs;
    try {
        inputs = parseInputs();
         const resultsPlaceholder = document.querySelector('#output p');
        if (resultsPlaceholder && resultsPlaceholder.textContent.startsWith('Los resultados aparecerán')) {
             resultsPlaceholder.textContent = '';
        }
        clearError();
    } catch (error) {
        displayError(`Error de Entrada: ${error.message}`);
        return;
    }

    const { numBuses, Ybus, busData, V_initial, slackBusIndex, numIterations /* REMOVED: , tolerance */ } = inputs;

    let V = [...V_initial];
    let iteration = 0;
    // REMOVED: let converged = false;
    let maxDeltaV = Infinity;


    console.log("Iniciando Gauss-Seidel...");
    console.log("V Inicial:", V.map(v => ({mag: v.toPolar().r.toFixed(5), deg: radToDeg(v.toPolar().phi).toFixed(5)})));
    console.log("Datos de Barras:", busData);
    // Modified loop condition: Removed convergence check
    while (iteration < numIterations) {
        maxDeltaV = 0;
        const V_prev_iter = V.map(v => v.clone());

        for (let k = 0; k < numBuses; k++) {
            if (k === slackBusIndex) {
                V[k] = V_initial[k];
                continue;
            }

            const bus = busData[k];
            const Vk_old_iter = V_prev_iter[k];

            let sum = math.complex(0, 0);
            for (let j = 0; j < numBuses; j++) {
                if (k !== j) {
                    // Use the most recent voltage available (V[j])
                    sum = math.add(sum, math.multiply(Ybus[k][j], V[j]));
                 }
             }

             let Vk_new;

             if (math.equal(Ybus[k][k], 0) || math.abs(Ybus[k][k]) < 1e-12) {
                  console.error(`Error: Ybus[${k+1}][${k+1}] es cero o near zero. Cannot perform division.`);
                  displayError(`Error: Ybus[${k+1}][${k+1}] es cero o cercano a cero (${Ybus[k][k]}). No se puede dividir.`);
                  return;
             }

             if (bus.type === 'PQ') {
                const Pk = bus.P_spec;
                const Qk = bus.Q_spec;
            
                // --- 1er pase usando V_prev_iter[k] ---
                let Ik = math.divide(
                    math.complex(Pk, -Qk),
                    math.conj(V_prev_iter[k])
                );
                let numerator = math.subtract(Ik, sum);
                const Vk_temp = math.divide(numerator, Ybus[k][k]);
            
                // guardar temporal para el 2º pase
                V[k] = Vk_temp;
            
                // --- 2º pase usando Vk_temp ---
                Ik = math.divide(
                    math.complex(Pk, -Qk),
                    math.conj(V[k])
                );
                numerator = math.subtract(Ik, sum);
                Vk_new = math.divide(numerator, Ybus[k][k]);
            
                // resultado final
                V[k] = Vk_new;
            }
            
            

              else if (bus.type === 'PV') {
                 // Calculate Qk based on the current voltage V[k] (from previous iteration for PV)
                 // Qk_calc = -Im( conj(Vk_old_iter) * (Ykk*Vk_old_iter + sum_over_j_not_k(Ykj*Vj)) )
                 // Note: The sum here should ideally use V[j] from the current iteration for j < k,
                 // but the standard PV correction often uses V_old for the Q calculation term.
                 // Let's stick to the sum calculated earlier which uses V[j] (current iteration for j<k, old for j>k)
                 const currentTermForQ = math.add(math.multiply(Ybus[k][k], Vk_old_iter), sum);
                 const qkTerm = math.multiply(math.conj(Vk_old_iter), currentTermForQ);
                 const Qk_calc = -qkTerm.im; // Calculated reactive power

                 // Calculate the voltage magnitude based on PQ equation using calculated Qk
                 // Vk_intermediate = [ (Pk - jQk_calc) / conj(Vk_old_iter) - sum ] / Ykk
                 const conjVk = math.conj(Vk_old_iter);
                 let Vk_intermediate;
                  if (math.abs(conjVk) < 1e-9) {
                      console.warn(`Voltaje cercano a cero para barra PV ${k+1} (iter ${iteration+1}), cálculo podría ser inestable. Estimando con V_target_mag@0deg.`);
                      Vk_intermediate = math.complex({ r: bus.V_target_mag, phi: 0 });
                 } else {
                     const pqTerm = math.divide(math.complex(bus.P_spec, -Qk_calc), conjVk);
                     const numerator = math.subtract(pqTerm, sum);
                     Vk_intermediate = math.divide(numerator, Ybus[k][k]);
                 }

                 // Update voltage magnitude to the specified target, keep the calculated angle
                 const angle_new = Vk_intermediate.toPolar().phi;
                 Vk_new = math.complex({ r: bus.V_target_mag, phi: angle_new });

             } else {
                 console.error(`Tipo de barra desconocido \'${bus.type}\' para la barra ${k+1}.`);
                 displayError(`Tipo de barra desconocido \'${bus.type}\' para la barra ${k+1}.`);
                 return;
             }

             if (!Vk_new || !math.isComplex(Vk_new) || isNaN(Vk_new.re) || isNaN(Vk_new.im) || !isFinite(Vk_new.re) || !isFinite(Vk_new.im)) {
                console.error(`Error: Cálculo resultó en NaN o Infinito para la barra ${k+1} en la iteración ${iteration+1}. Verifique las entradas (especialmente Ybus y cargas/generación). Vk_new: ${Vk_new}`);
                displayError(`Error: Cálculo resultó en NaN o Infinito para la barra ${k+1} (iter ${iteration+1}). Verifique las entradas (especialmente Ybus y cargas/generación).`);
                return;
             }

            const deltaV = math.abs(math.subtract(Vk_new, V_prev_iter[k]));
            if (deltaV > maxDeltaV) {
                 maxDeltaV = deltaV;
             }

            V[k] = Vk_new;

        }

        iteration++;
        console.log(`Iteración ${iteration}, Máx |ΔV| = ${maxDeltaV.toFixed(8)}`);

        // REMOVED: Convergence check based on tolerance
        /*
        if (!isNaN(maxDeltaV) && isFinite(maxDeltaV) && maxDeltaV < tolerance) {
            converged = true;
        } else if (isNaN(maxDeltaV) || !isFinite(maxDeltaV)) {
            console.error(`Error: maxDeltaV es ${maxDeltaV}. Deteniendo iteración.`);
            displayError(`Error: El cambio máximo de voltaje es ${maxDeltaV}. Deteniendo iteración. Verifique las entradas.`);
            return;
        }
        */
         if (isNaN(maxDeltaV) || !isFinite(maxDeltaV)) {
            console.error(`Error: maxDeltaV es ${maxDeltaV}. Deteniendo iteración.`);
            displayError(`Error: El cambio máximo de voltaje es ${maxDeltaV}. Deteniendo iteración. Verifique las entradas.`);
            return;
        }


    }

    resultsTableBody.innerHTML = '';
    V.forEach((voltage, index) => {
        const polar = voltage.toPolar();
        let mag = polar.r;
        let phase = radToDeg(polar.phi);

        let magStr, phaseStr;

        if (isNaN(mag) || !isFinite(mag)) {
            magStr = String(mag);
        } else {
            magStr = mag.toFixed(5);
        }

         if (isNaN(phase) || !isFinite(phase)) {
            phaseStr = String(phase);
        } else {
            while (phase <= -180) phase += 360;
            while (phase > 180) phase -= 360;
            phaseStr = phase.toFixed(5);
        }

        const row = resultsTableBody.insertRow();
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${magStr}</td>
            <td>${phaseStr}</td>
        `;
    });

    // Modified convergence message
    if (iteration >= numIterations) {
        convergenceInfo.textContent = `Simulación completada después de ${iteration} iteraciones. Máx |ΔV| final = ${maxDeltaV.toExponential(4)}.`;
         console.log("Simulación completada (límite de iteraciones alcanzado).");
    } else {
         // This case should ideally not be reached if maxDeltaV is finite, but kept for safety
         convergenceInfo.textContent = `Cálculo detenido debido a un error.`;
    }
     console.log("Final V:", V.map(v => {
         const p = v.toPolar();
         return {mag: isNaN(p.r)?'NaN':p.r.toFixed(5), deg: isNaN(p.phi)?'NaN':radToDeg(p.phi).toFixed(5)};
        }));

}

// --- Event Listeners ---
// Modified event listener for table generation (assuming you added a button for it)
// If you want the table to generate automatically when the number changes, keep the 'change' listener
// If you added a button with id 'generate-table-button', use that instead:
document.getElementById('generate-table-button').addEventListener('click', generateBusTableRows);
numBusesInput.addEventListener('change', generateBusTableRows); // Keeping the change listener for now

runButton.addEventListener('click', runGaussSeidel);

// --- Initial Setup ---
generateBusTableRows();