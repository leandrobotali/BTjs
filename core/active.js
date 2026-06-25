
const config = require('../config.js');

let activeSchedule = [];

/**
 * Carga y normaliza el schedule activo.
 * - Garantiza objetos { start:number, end:number }
 * - Ordena por start asc
 */
async function loadActiveSchedule(API) {
	try {
		const active = await API.getActiveList(`front.${config.activePrincipal}`);

		if (active && Array.isArray(active.schedule)) {
			// Normalizar a objetos y asegurar números
			const normalized = active.schedule
				.map(pair => {
					// Acepta tanto [start, end] como {start, end}
					const start = Number(Array.isArray(pair) ? pair[0] : pair.start);
					const end = Number(Array.isArray(pair) ? pair[1] : pair.end);
					return { start, end };
				})
				// Filtrar entradas inválidas
				.filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end));

			if (normalized.length === 0) {
				console.log(`[ACTIVE] ADVERTENCIA: schedule vacío para ${config.activePrincipal}`);
				throw new Error('Schedule vacío para el activo');
			}

			// Ordenar por start asc
			normalized.sort((a, b) => a.start - b.start);

			activeSchedule = normalized;

			console.log(`[ACTIVE] Schedule cargado (${activeSchedule.length} rangos)`);
			return active;
		} else {
			console.log(`[ACTIVE] ADVERTENCIA: No se encontró schedule para ${config.activePrincipal}`);
			throw new Error('No se encontró schedule para el activo');
		}
	} catch (err) {
		// Asegurar que sea Error para conservar message
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`Error cargando schedule del activo: ${message}`);
	}
}

function getActiveSchedule() {
	return activeSchedule;
}

/**
 * Verifica si hay un rango activo que contenga "now".
 * - Si el último rango ya terminó, intenta recargar una sola vez.
 * - Devuelve true si now está dentro de un rango, false en caso contrario.
 */
async function isActiveOpen(API, timestamp = null) {
	const now = timestamp ?? Math.floor(Date.now() / 1000);

	// Cargar si no hay schedule
	if (!Array.isArray(activeSchedule) || activeSchedule.length === 0) {
		await loadActiveSchedule(API);
	}

	// Si aún no hay datos, cortar
	if (!Array.isArray(activeSchedule) || activeSchedule.length === 0) {
		return false;
	}

	// Si el último rango ya terminó, recargar UNA vez y re-evaluar
	let { end: lastEnd } = activeSchedule[activeSchedule.length - 1];
	if (lastEnd < now) {
		await loadActiveSchedule(API);

		// Si después de recargar, sigue sin rangos, cortar
		if (!Array.isArray(activeSchedule) || activeSchedule.length === 0) {
			return false;
		}
	}

	// Buscar si now cae dentro de algún rango
	for (const { start, end } of activeSchedule) {
		if (now >= start && now <= end) return true;
		// Optimización: si está ordenado y now < start, ya no hay más candidatos
		if (now < start) return false;
	}

	return false;
}

/**
 * Retorna el próximo evento relevante (Apertura o Cierre)
 */
async function getNextMarketEvent(API) {
	const now = Math.floor(Date.now() / 1000);

	// Asegurar schedule cargado
	if (!activeSchedule.length) {
		try {
			await loadActiveSchedule(API);
		} catch (err) {
			return null;
		}
	}

	// 1. ¿Estamos en un intervalo ahora?
	for (const { start, end } of activeSchedule) {
		if (now >= start && now <= end) {
			return { type: 'CLOSE', time: end, delay: end - now };
		}
	}

	// 2. Si no, buscar el próximo que empiece después de ahora
	const futureIntervals = activeSchedule.filter(it => it.start > now);
	if (futureIntervals.length > 0) {
		const next = futureIntervals[0];
		return { type: 'OPEN', time: next.start, delay: next.start - now };
	}

	// 3. Si no hay futuros cargados, recargar y reintentar
	try {
		await loadActiveSchedule(API);
		const freshIntervals = activeSchedule.filter(it => it.start > now);
		if (freshIntervals.length > 0) {
			const next = freshIntervals[0];
			return { type: 'OPEN', time: next.start, delay: next.start - now };
		}
	} catch (err) { }

	return null; // No hay información
}

/**
 * Chequeo previo a una operación.
 */
async function checkActiveBeforeOperation(API) {
	const now = Math.floor(Date.now() / 1000);
	return await isActiveOpen(API, now);
}

module.exports = {
	loadActiveSchedule,
	getActiveSchedule,
	isActiveOpen,
	getNextMarketEvent,
	checkActiveBeforeOperation,
};