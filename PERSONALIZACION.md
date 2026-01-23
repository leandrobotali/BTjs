# 🎨 GUÍA DE PERSONALIZACIÓN - ESTRATEGIA LMTA

## 📝 Cómo Modificar la Estrategia

Esta guía te muestra cómo ajustar la estrategia LMTA según tus necesidades.

---

## 1️⃣ CAMBIAR CONFIANZA MÍNIMA

**Archivo:** `strategy/lmta-strategy.js`
**Línea:** 60

```javascript
const MIN_CONFIDENCE = 70 // Cambiar este valor

// Ejemplos:
const MIN_CONFIDENCE = 75 // Más conservador (menos operaciones)
const MIN_CONFIDENCE = 65 // Más agresivo (más operaciones)
const MIN_CONFIDENCE = 80 // Muy conservador (solo señales muy fuertes)
```

**Impacto:**
- ⬆️ Mayor valor = Menos operaciones, mayor precisión
- ⬇️ Menor valor = Más operaciones, menor precisión

---

## 2️⃣ AJUSTAR PARÁMETROS LMTA

**Archivo:** `strategy/lmta-core.js`
**Líneas:** 2-12

```javascript
const CONFIG = {
	TICK_SIZE: 60,              // Ticks por vela (NO CAMBIAR)
	WHIPLASH_WINDOW: 15,        // Últimos N ticks para detectar latigazos
	STAGNATION_THRESHOLD: 0.000010,  // Umbral de estancamiento
	STAGNATION_MIN_TICKS: 4,    // Mínimo de ticks estancados
	LEVEL_PROXIMITY: 0.000050,  // Proximidad a niveles (5 pips)
	CV_THRESHOLD: 0.2,          // Umbral de simetría
	WHIPLASH_MULTIPLIER: 3,     // Multiplicador para detectar latigazos
	IMMEDIATE_RESPONSE_WINDOW: 5,  // Ventana de respuesta inmediata
	HISTORY_SIZE: 120           // Velas históricas a analizar
}
```

### Ejemplos de ajustes:

#### Detectar latigazos más fácilmente:
```javascript
WHIPLASH_WINDOW: 10,        // Ventana más corta
WHIPLASH_MULTIPLIER: 2.5,   // Multiplicador más bajo
```

#### Ser más estricto con la simetría:
```javascript
CV_THRESHOLD: 0.15,  // Más bajo = más estricto
```

#### Analizar más historia:
```javascript
HISTORY_SIZE: 200,  // Más velas = mejor contexto
```

#### Ajustar proximidad a niveles:
```javascript
LEVEL_PROXIMITY: 0.000030,  // 3 pips (más estricto)
LEVEL_PROXIMITY: 0.000100,  // 10 pips (más flexible)
```

---

## 3️⃣ MODIFICAR JERARQUÍA DE DECISIÓN

**Archivo:** `strategy/lmta-core.js`
**Función:** `predictNextCandle()`
**Líneas:** 150-200

### Estructura actual:
```javascript
// 1. Agotamiento en nivel (85% confianza)
if (whiplash && nearSupport && whiplash.direction === 'DOWN') {
	direction = 'UP'
	confidence = 85
	reason = 'Agotamiento bajista en soporte...'
	pattern = 'DESPERATION_AT_LEVEL'
}

// 2. Aprovechamiento (80% confianza)
else if (buyerStrength && sellerStrength) {
	if (buyerStrength.isSymmetric && sellerStrength.isStagnated) {
		direction = 'UP'
		confidence = 80
		reason = 'Compradores con fuerza natural...'
	}
}

// 3. Fuerza confirmada (70% confianza)
else if (buyerStrength && buyerStrength.isSymmetric) {
	direction = 'UP'
	confidence = 70
	reason = 'Fuerza compradora confirmada...'
}
```

### Ejemplo: Agregar nueva regla

```javascript
// Agregar ANTES de las reglas existentes:

// Nueva regla: Ruptura de resistencia con volumen
if (nearResistance && buyerStrength && buyerStrength.isSymmetric) {
	const hasVolume = currentCandle.volume > avgVolume * 1.5
	if (hasVolume) {
		direction = 'UP'
		confidence = 90
		reason = 'Ruptura de resistencia con alto volumen y fuerza natural'
		pattern = 'BREAKOUT_WITH_VOLUME'
	}
}
```

---

## 4️⃣ AGREGAR FILTROS ADICIONALES

**Archivo:** `strategy/lmta-strategy.js`
**Función:** `analyzeStrategy()`

### Ejemplo: Filtrar por hora del día

```javascript
function analyzeStrategy(candles) {
	// ... código existente ...
	
	// AGREGAR FILTRO DE HORARIO
	const now = new Date()
	const hour = now.getHours()
	
	// No operar entre 22:00 y 02:00 (baja liquidez)
	if (hour >= 22 || hour <= 2) {
		return {
			shouldOperate: false,
			direction: null,
			reason: 'Fuera de horario de operación (baja liquidez)',
			analysis: null
		}
	}
	
	// ... resto del código ...
}
```

### Ejemplo: Filtrar por volatilidad

```javascript
function analyzeStrategy(candles) {
	// ... código existente ...
	
	// AGREGAR FILTRO DE VOLATILIDAD
	const lastCandles = candles.slice(-10)
	const avgRange = lastCandles.reduce((sum, c) => 
		sum + (c.max - c.min), 0) / lastCandles.length
	
	const currentRange = candles[candles.length - 1].max - 
						 candles[candles.length - 1].min
	
	// No operar si volatilidad es muy baja
	if (currentRange < avgRange * 0.5) {
		return {
			shouldOperate: false,
			direction: null,
			reason: 'Volatilidad muy baja, esperando movimiento',
			analysis: null
		}
	}
	
	// ... resto del código ...
}
```

---

## 5️⃣ USAR INDICADORES TRADICIONALES

**Archivo:** `strategy/lmta-strategy.js`

### Ejemplo: Combinar LMTA con RSI

```javascript
const { calculateRSI } = require('../indicators/rsi.js')

function analyzeStrategy(candles) {
	// ... código LMTA existente ...
	
	const prediction = predictNextCandle({
		currentCandle,
		previousCandles
	})
	
	// AGREGAR FILTRO RSI
	const rsi = calculateRSI(candles, 14)
	
	if (prediction.direction === 'UP' && rsi > 70) {
		return {
			shouldOperate: false,
			direction: null,
			reason: `LMTA indica UP pero RSI sobrecomprado (${rsi.toFixed(2)})`,
			analysis: prediction
		}
	}
	
	if (prediction.direction === 'DOWN' && rsi < 30) {
		return {
			shouldOperate: false,
			direction: null,
			reason: `LMTA indica DOWN pero RSI sobrevendido (${rsi.toFixed(2)})`,
			analysis: prediction
		}
	}
	
	// ... resto del código ...
}
```

### Ejemplo: Combinar con Medias Móviles

```javascript
const { calculateSMA } = require('../indicators/moving-averages.js')

function analyzeStrategy(candles) {
	// ... código existente ...
	
	// AGREGAR FILTRO DE TENDENCIA
	const sma50 = calculateSMA(candles, 50)
	const sma200 = calculateSMA(candles, 200)
	const currentPrice = candles[candles.length - 1].close
	
	// Solo operar a favor de la tendencia principal
	if (prediction.direction === 'UP') {
		if (currentPrice < sma200) {
			return {
				shouldOperate: false,
				direction: null,
				reason: 'LMTA indica UP pero precio bajo SMA200 (tendencia bajista)',
				analysis: prediction
			}
		}
	}
	
	// ... resto del código ...
}
```

---

## 6️⃣ AJUSTAR NIVELES DE CONFIANZA

**Archivo:** `strategy/lmta-core.js`
**Función:** `predictNextCandle()`

### Modificar confianza base:

```javascript
// Cambiar estos valores según tu experiencia:

// Agotamiento en nivel
confidence = 85  // Cambiar a 90 si es muy confiable

// Aprovechamiento
confidence = 80  // Cambiar a 85 si funciona bien

// Fuerza confirmada
confidence = 70  // Cambiar a 75 para ser más conservador
```

### Ajustar bonificaciones:

```javascript
// Bonificación por número redondo
if (direction !== 'NEUTRAL' && atRoundNumber) {
	confidence += 5  // Cambiar a 10 si es muy importante
}

// Bonificación por tendencia
if (direction !== 'NEUTRAL' && trend.direction !== 'LATERAL') {
	confidence += 5  // Cambiar a 10 o 3 según importancia
}
```

---

## 7️⃣ PERSONALIZAR REPORTES

**Archivo:** `strategy/lmta-strategy.js`
**Función:** `getDetailedReport()`

### Agregar información adicional:

```javascript
function getDetailedReport(decision) {
	// ... código existente ...
	
	// AGREGAR SECCIÓN PERSONALIZADA
	if (decision.analysis) {
		report += `\n--- INFORMACIÓN ADICIONAL ---\n`
		
		// Agregar RSI si lo calculaste
		if (rsi) {
			report += `RSI(14): ${rsi.toFixed(2)}\n`
		}
		
		// Agregar medias móviles
		if (sma50 && sma200) {
			report += `SMA(50): ${sma50.toFixed(6)}\n`
			report += `SMA(200): ${sma200.toFixed(6)}\n`
			report += `Cruce: ${sma50 > sma200 ? 'Alcista' : 'Bajista'}\n`
		}
		
		// Agregar volatilidad
		const volatility = calculateVolatility(candles)
		report += `Volatilidad: ${volatility.toFixed(6)}\n`
	}
	
	// ... resto del código ...
}
```

---

## 8️⃣ CREAR ESTRATEGIA HÍBRIDA

**Archivo:** `strategy/hybrid-strategy.js` (nuevo)

```javascript
const { analyzeStrategy: analyzeLMTA } = require('./lmta-strategy.js')
const { calculateRSI } = require('../indicators/rsi.js')
const { detectTrend } = require('../indicators/trend.js')

function analyzeHybridStrategy(candles) {
	// 1. Análisis LMTA
	const lmtaDecision = analyzeLMTA(candles)
	
	// 2. Análisis tradicional
	const rsi = calculateRSI(candles, 14)
	const trend = detectTrend(candles, 20)
	
	// 3. Combinar señales
	let finalDecision = { ...lmtaDecision }
	
	// Si LMTA dice operar, verificar indicadores
	if (lmtaDecision.shouldOperate) {
		// Filtro RSI
		if (lmtaDecision.direction === 'CALL' && rsi > 70) {
			finalDecision.shouldOperate = false
			finalDecision.reason = 'LMTA: CALL, pero RSI sobrecomprado'
		}
		
		// Filtro tendencia
		if (lmtaDecision.direction === 'CALL' && trend.direction === 'BAJISTA') {
			finalDecision.analysis.confidence -= 10
			finalDecision.reason += ' (Contra tendencia bajista)'
		}
	}
	
	return finalDecision
}

module.exports = { analyzeHybridStrategy }
```

Luego en `index.js`:
```javascript
// Cambiar:
const { analyzeStrategy } = require('./strategy/lmta-strategy.js')

// Por:
const { analyzeHybridStrategy: analyzeStrategy } = require('./strategy/hybrid-strategy.js')
```

---

## 9️⃣ GESTIÓN DE RIESGO

**Archivo:** `operations/trade.js`

### Ejemplo: Martingala

```javascript
let lastResult = null
let consecutiveLosses = 0

async function executeOperation(API, active, direction, reason, analysis) {
	// ... código existente ...
	
	// AJUSTAR INVERSIÓN SEGÚN RESULTADOS
	let amount = parseFloat(config.inversion)
	
	if (lastResult === 'LOSS') {
		consecutiveLosses++
		amount = amount * Math.pow(2, consecutiveLosses) // Duplicar
	} else {
		consecutiveLosses = 0
	}
	
	// Límite de seguridad
	if (amount > parseFloat(config.inversion) * 8) {
		amount = parseFloat(config.inversion)
		consecutiveLosses = 0
	}
	
	const order = await API.trade({
		active,
		action: direction,
		amount: amount,  // Usar amount ajustado
		type: config.optionType,
		duration: config.duracion_op
	})
	
	// ... resto del código ...
	
	lastResult = result
	
	// ... resto del código ...
}
```

---

## 🎯 EJEMPLOS PRÁCTICOS

### Estrategia Conservadora:
```javascript
// lmta-strategy.js
const MIN_CONFIDENCE = 80

// lmta-core.js
CV_THRESHOLD: 0.15,
WHIPLASH_MULTIPLIER: 3.5,
```

### Estrategia Agresiva:
```javascript
// lmta-strategy.js
const MIN_CONFIDENCE = 65

// lmta-core.js
CV_THRESHOLD: 0.25,
WHIPLASH_MULTIPLIER: 2.5,
```

### Estrategia Solo Niveles:
```javascript
// En predictNextCandle(), comentar reglas 2 y 3
// Dejar solo agotamiento en nivel
```

---

## 📊 TESTING

Después de modificar, siempre:

1. **Verificar sintaxis:**
```bash
node verify.js
```

2. **Probar en PRACTICE:**
```javascript
// .env
ACCOUNTTYPE=PRACTICE
```

3. **Revisar reportes:**
```bash
# Después de 1 hora
cat ../reporte.txt
```

4. **Ajustar según resultados**

---

## ⚠️ IMPORTANTE

- Siempre hacer backup antes de modificar
- Probar en cuenta PRACTICE primero
- Revisar reportes para optimizar
- No modificar múltiples parámetros a la vez
- Documentar los cambios realizados

---

**¡Personaliza la estrategia según tu estilo de trading! 🎯**
