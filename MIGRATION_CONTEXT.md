# CONTEXTO DE MIGRACIÓN - BTjs (Estrategia LMTA Optimizada)

Este documento contiene toda la información necesaria para migrar y ejecutar el bot en un nuevo entorno (VM).
**Última Actualización:** 05/02/2026 - Win Rate Optimizado: ~58.6%

## 1. Resumen de la Estrategia (LMTA - Optimized)
El bot opera en opciones binarias (1 min) analizando la micro-estructura de ticks y la "Fuerza Natural" del precio.

### Filtros Clave Implementados:
1.  **Estancamiento Robusto:** Solo opera reversión si el estancamiento es fuerte (> **10 ticks**) y ocurre en un **Nivel Clave**.
2.  **Alineación de Tendencia:** Las operaciones por "Fuerza Natural" (impulso) solo se toman si van a favor de la tendencia general (Trend Following).
3.  **Protección Anti-Ruptura (Latigazos):** Si el precio da un latigazo final hacia un nivel, verifica que no haya roto el nivel al cierre antes de operar en contra.
4.  **Filtro de Ruido:** Ignora velas con movimiento total < 20 ticks.

---

## 2. Archivos Críticos (Copiar y Pegar)

### A. `config.js` (Configuración Optimizada)
```javascript
require('dotenv').config();

module.exports = {
	// Configuración de Estrategia LMTA
	strategy: {
		minTicks: 55, // Mínimo de ticks para analizar
		whiplashWindow: 15, // Últimos N ticks para detectar latigazo
        stagnation: {
			maxTicks: 10, // Ticks consecutivos para considerar estancamiento (Subido de 8 a 10 para filtrar ruido)
			priceThreshold: 0.000010 // Variación máxima de precio para estancamiento
		},
		levels: {
			proximity: 0.000050, // Umbral para considerar "toque" de nivel
			roundNumbers: [0, 500] // Terminaciones para números redondos (000, 500)
		},
		naturality: {
			ratioThreshold: 2.0 // Ratio para considerar movimiento irregular (> 2x)
		}
	},

	username: process.env.USERIQ,
	passwd: process.env.PASSWD,

	inversion: process.env.INVERSION,
	candleSize: process.env.CANDSIZE,
	cantCandles: process.env.CANTCANDLES,
	optionType: process.env.OPTIONTYPE,
	accountType: process.env.ACCOUNTTYPE,
	activePrincipal: process.env.ACTIVEPRINCIPAL,
	activeSecondary: process.env.ACTIVESECONDARY,
	duracion_op: process.env.DURACION_OP,

	WEBSOCKET: {
		GATEWAY: {
			protocol: "wss",
			host: "iqoption.com",
			port: 443,
			path: "echo/websocket"
		}
	},
	API: {
		URL: {
			default: "iqoption.com",
			auth: "auth.iqoption.com",
			billing: "billing.iqoption.com"
		}
	}
}
```

### B. `strategy/strategy-core.js` (Lógica Principal - Fragmento de Decisión)
*Asegúrate de reemplazar la función `analyzeStrategy` o el bloque de decisión con este código optimizado:*

```javascript
	// ... (código previo de análisis de ticks)

	// ==========================================
	// LÓGICA DE DECISIÓN (Jerarquía LMTA)
	// ==========================================

	let decision = 'WAIT'
	let confidence = 0
	let reason = ''

	// FILTRO 0: Volatilidad Mínima
	const totalMove = Math.abs(closePrice - openPrice)
	if (totalMove < 0.000020 && !patterns.length) { 
		logger.add(`[FILTER] Mercado estático (Movimiento: ${totalMove.toFixed(6)}). Ignorando ruido.`)
		return { shouldOperate: false, direction: '', reason: 'Mercado sin volumen (Ruido)', analysis: logger.getReport() }
	}

	// Caso: Latigazo de Desesperación
	if (isWhiplash && levelCheck.isAtLevel) {
		const closeNearExtremes = Math.abs(closePrice - ticks[ticks.length-1]) < 0.000010
		
		if (whiplashDirection === 'ALCISTA' && (levelCheck.level.type === 'RESISTANCE' || levelCheck.level.type === 'ROUND_NUMBER')) {
            // Verificar Breakout
			const isBreakout = closePrice > (levelCheck.level.price + 0.000020)
			
			if (!isBreakout) {
				decision = 'PUT'
				reason = 'Latigazo de desesperación contra resistencia/nivel'
				confidence = 90
			} else {
				logger.add(`[FILTER] Latigazo alcista rompió nivel. Posible ruptura. WAIT.`)
			}
		}
		else if (whiplashDirection === 'BAJISTA' && (levelCheck.level.type === 'SUPPORT' || levelCheck.level.type === 'ROUND_NUMBER')) {
			const isBreakout = closePrice < (levelCheck.level.price - 0.000020)
			
			if (!isBreakout) {
				decision = 'CALL'
				reason = 'Latigazo de desesperación contra soporte/nivel'
				confidence = 90
			} else {
				logger.add(`[FILTER] Latigazo bajista rompió nivel. Posible ruptura. WAIT.`)
			}
		}
	}

	// Caso: Agotamiento / Estancamiento al final
	else if (endAnalysis.maxStagnation >= config.strategy.stagnation.maxTicks) {
		const isExtremeStagnation = endAnalysis.maxStagnation >= 12
		
		if (levelCheck.isAtLevel) {
			if (endAnalysis.dominantGroup === 'COMPRADORES') {
				decision = 'PUT'
				reason = isExtremeStagnation ? 'Estancamiento extremo de compradores en Nivel' : 'Agotamiento en Nivel clave'
				confidence = 80
			} else if (endAnalysis.dominantGroup === 'VENDEDORES') {
				decision = 'CALL'
				reason = isExtremeStagnation ? 'Estancamiento extremo de vendedores en Nivel' : 'Agotamiento en Nivel clave'
				confidence = 80
			}
		} else {
            // Excepción Trend Following
			if (isExtremeStagnation && trend !== 'LATERAL' && trend !== 'NEUTRAL') {
				if (trend === 'ALCISTA' && endAnalysis.dominantGroup === 'VENDEDORES') {
					decision = 'CALL'
					reason = 'Continuidad: Estancamiento de vendedores en tendencia alcista'
					confidence = 70
				}
				else if (trend === 'BAJISTA' && endAnalysis.dominantGroup === 'COMPRADORES') {
					decision = 'PUT'
					reason = 'Continuidad: Estancamiento de compradores en tendencia bajista'
					confidence = 70
				} else {
					logger.add(`[FILTER] Estancamiento en contra de tendencia sin nivel. Ignorar.`)
				}
			} else {
				logger.add(`[FILTER] Estancamiento detectado (${endAnalysis.maxStagnation} ticks) en Tierra de Nadie. Se ignora.`)
			}
		}
	}

	// Caso: Continuidad de Fuerza Natural
	else if (
		startAnalysis.dominantGroup === endAnalysis.dominantGroup &&
		startAnalysis.irregularMovements === 0 &&
		endAnalysis.irregularMovements === 0 &&
		!levelCheck.isAtLevel 
	) {
		const bodySize = Math.abs(closePrice - openPrice)
		if (bodySize > 0.000050) { 
            // NUEVO: Filtro de Alineación con Tendencia
			const isTrendAligned = (startAnalysis.dominantGroup === 'COMPRADORES' && (trend === 'ALCISTA' || trend === 'LATERAL' || trend === 'NEUTRAL')) ||
								   (startAnalysis.dominantGroup === 'VENDEDORES' && (trend === 'BAJISTA' || trend === 'LATERAL' || trend === 'NEUTRAL'))

			if (isTrendAligned) {
				if (startAnalysis.dominantGroup === 'COMPRADORES') {
					decision = 'CALL'
					reason = 'Fuerza natural alcista sostenida sin bloqueos'
					confidence = 85
				} else {
					decision = 'PUT'
					reason = 'Fuerza natural bajista sostenida sin bloqueos'
					confidence = 85
				}
			} else {
				logger.add(`[FILTER] Fuerza natural (${startAnalysis.dominantGroup}) en contra de tendencia general (${trend}). Riesgo alto. WAIT.`)
			}
		} 
	}

	// Desempate con Patrones y Tendencia
	if (decision !== 'WAIT') {
		if ((decision === 'CALL' && trend === 'ALCISTA') || (decision === 'PUT' && trend === 'BAJISTA')) {
			confidence += 10
			logger.add(`[BONUS] A favor de tendencia general (${trend}). +10% confianza.`)
		}

        // VETO DURO POR PATRONES
		const contraryPattern = patterns.find(p => p.prediction !== decision)
		if (contraryPattern) {
			logger.add(`[VETO] Operación CANCELADA. Patrón visual (${contraryPattern.name} -> ${contraryPattern.prediction}) contradice estrategia.`)
			decision = 'WAIT'
			reason = `Cancelado por conflicto con patrón ${contraryPattern.name}`
			confidence = 0
		}
	}
```

## 3. Instalación en Nueva VM

1.  **Copiar Archivos**: Transfiere toda la carpeta `BTjs`.
2.  **Instalar Node.js**: Asegúrate de tener Node v16+ instalado.
3.  **Instalar Dependencias**:
    ```bash
    npm install
    # Dependencias: dotenv, events, fs, md5, request, ws
    ```
4.  **Configurar Variables de Entorno (.env)**:
    Crea un archivo `.env` en la raíz con tus credenciales:
    ```env
    USERIQ=tu_email
    PASSWD=tu_password
    INVERSION=1
    CANDSIZE=60
    ACCOUNTTYPE=PRACTICE
    # ... otras variables
    ```
5.  **Ejecutar**:
    ```bash
    node index.js
    ```
