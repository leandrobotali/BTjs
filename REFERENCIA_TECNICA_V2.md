# Referencia Técnica: Bot de Trading v2.0

## 📋 Documento de Referencia para Análisis de Operaciones

Este documento explica **todas las modificaciones** implementadas en esta versión del bot, para servir como contexto al analizar las operaciones ejecutadas.

---

## 🏗️ Arquitectura del Sistema

### Flujo de Decisión (Orden de Ejecución)

```
1. FILTRO DE SEGURIDAD
   └─ Mercados Peligrosos → Si detecta: ABORT

2. ANÁLISIS DE CONTEXTO
   ├─ Tendencia General
   ├─ Niveles S/R (con fuerza)
   └─ Patrones de Velas

3. ANÁLISIS LMTA (3 FASES)
   ├─ Fase 1: Primeros 30s
   ├─ Fase 2: Medio (30-45s)
   └─ Fase 3: Últimos 15s (CRÍTICO)

4. DETECCIÓN AVANZADA
   ├─ Clasificación de Latigazo
   ├─ Aprovechamiento
   └─ Estancamiento vs Debilidad

5. JERARQUÍA DE DECISIÓN
   ├─ Regla 1: Latigazo de Desesperación en Nivel (90%)
   ├─ Regla 2: Agotamiento tras Progreso (75%)
   ├─ Regla 3: Aprovechamiento (80%)
   └─ Regla 4: Continuidad de Fuerza (75%)

6. VALIDACIÓN FINAL
   ├─ Tendencia (+10%)
   ├─ Patrones (-40% si contradice)
   └─ Secuencias (+10% / -20%)
```

---

## 📊 Datos Guardados en Cada Operación

### Estructura del JSON

```javascript
{
  // Resultado de la operación
  "result": "WIN" | "LOSS",
  "profit": 1.85,
  "direction": "CALL" | "PUT",
  "timestamp": "2024-02-09T04:30:00.000Z",
  
  // Decisión del bot
  "reason": "Agotamiento en nivel clave",
  "confidence": 95,
  
  // Análisis completo (texto)
  "analysis": "╔═══════════...",
  
  // Datos crudos
  "ticks": [1.181050, 1.181048, ...], // 60 ticks
  "candles": [...], // Últimas 20 velas
  
  // Indicadores calculados
  "indicators": {
    "trend": "ALCISTA" | "BAJISTA" | "LATERAL",
    "levels": [...],
    "levelCheck": {...},
    "patterns": [...],
    "whiplash": {...},
    "phases": {...},
    "exploitation": "COMPRADORES" | "VENDEDORES" | "NONE"
  }
}
```

### Detalle de `indicators.levels`

```javascript
[
  {
    "price": 1.180950,
    "type": "SUPPORT" | "RESISTANCE" | "FIBO_50" | "FIBO_61.8" | "FIBO_38.2" | "ROUND_NUMBER",
    "quality": "WEAK" | "MEDIUM" | "STRONG",
    "touches": 5 // Cuántas veces fue tocado
  }
]
```

### Detalle de `indicators.whiplash`

```javascript
{
  "type": "NONE" | "FUERZA" | "DESESPERACION",
  "direction": "NONE" | "ALCISTA" | "BAJISTA",
  "move": -0.000070, // Movimiento en pips
  "velocity": 0.000005 // pips/tick
}
```

### Detalle de `indicators.phases`

```javascript
{
  "phase1": {
    "dominantGroup": "COMPRADORES" | "VENDEDORES",
    "netMovement": 0.000050,
    "velocity": 0.000002, // pips/tick
    "maxStagnation": 2,
    "irregularMovements": 1,
    "hadProgress": true,
    "isWeak": false,
    "ticks": 30
  },
  "phase2": { /* misma estructura */ },
  "phase3": { /* misma estructura */ }
}
```

### Detalle de `candles` (Últimas 20 velas)

```javascript
[
  {
    "id": 1707451200,
    "from": 1707451200,
    "to": 1707451260,
    "open": 1.181050,
    "close": 1.180980,
    "min": 1.180950,
    "max": 1.181100,
    "volume": 1234
  }
]
```

**¿Por qué 20 velas?**
- Fibonacci usa últimas **100 velas** (guardadas internamente)
- Niveles S/R escanean con ventana de **10 velas** hacia atrás
- Tendencia analiza últimas **20 velas**
- Patrones buscan en últimas **10 velas**

**Conclusión:** 20 velas son suficientes para reproducir el análisis de contexto.

---

## 🔍 Sistemas Implementados

### 1. Mercados Peligrosos

**Archivo:** `indicators/dangerous-markets.js`

**Detección:**

#### Micro-Rangos
```javascript
// Busca 4+ velas consecutivas que:
// - Alternan color (R-G-R-G)
// - Se superponen (overlap)
// - Son muy pequeñas (ratio < 0.3)
```

#### Bajo Volumen
```javascript
// Compara:
// - Últimas 10 velas (recientes)
// - Anteriores 20 velas (históricas)
// Si recientes < 50% del tamaño histórico → Bajo volumen
```

#### Alta Volatilidad
```javascript
// Detecta:
// - Gaps: Saltos entre velas > 0.0002
// - Mechas gigantes: Mecha > 60% del tamaño total
```

**En el análisis:** Si detecta peligro, verás en `analysis`:
```
❌ MERCADO PELIGROSO: LOW_VOLUME
   Ratio de tamaño: 0.42 (Umbral: 0.5)
[DECISION] NO OPERAR - Condiciones inseguras
```

---

### 2. Secuencias de Velas

**Archivo:** `indicators/sequences.js`

**Detección:**
```javascript
// Busca patrones repetitivos:
// [R G] [R G] [R G] → Predice siguiente
// [R R G] [R R G] [R R] → Predice G

// Mínimo 2 repeticiones
// Máximo 6 velas por patrón
```

**En el análisis:** Verás en `analysis`:
```
Secuencia: R-R-G → Predicción: CALL
✓ Secuencia apoya decisión → +10% confianza
```

---

### 3. Niveles con Fuerza

**Archivo:** `indicators/levels.js`

**Cálculo de Fuerza:**
```javascript
// Cuenta cuántas velas tocaron el nivel
for (const candle of candles) {
  if (Math.abs(candle.max - level.price) <= 0.000050 ||
      Math.abs(candle.min - level.price) <= 0.000050) {
    touches++
  }
}

// Clasificación:
// touches >= 4 → STRONG
// touches >= 2 → MEDIUM
// touches < 2 → WEAK (descartado)
```

**Clustering:**
```javascript
// Niveles a menos de 10 pips (0.000100) se agrupan
// Ejemplo:
// 1.18105, 1.18103, 1.18100 → 1.18103 (promedio, 3 toques)
```

**En el análisis:** Verás en `analysis`:
```
Niveles Detectados: 3
  1. SUPPORT @ 1.180950 (STRONG, 5 toques)
  2. RESISTANCE @ 1.181200 (MEDIUM, 2 toques)
  3. FIBO_50 @ 1.181075 (MEDIUM, 3 toques)
```

---

### 4. Análisis LMTA (3 Fases)

**Archivo:** `strategy/strategy-core.js`

#### División de Fases
```javascript
// Asumiendo 60 ticks (1 tick/segundo)
Fase 1: ticks[0:30]   // Primeros 30s
Fase 2: ticks[30:45]  // Medio (15 ticks)
Fase 3: ticks[45:60]  // Últimos 15s (CRÍTICO)
```

#### Métricas Calculadas por Fase

**Velocidad (Inclinación):**
```javascript
velocity = Math.abs(netMovement) / timeSpan
// Ejemplo: 0.000060 pips en 30 ticks = 0.000002 pips/tick
```

**Irregularidad:**
```javascript
// Cuenta movimientos donde:
// curr > prev * 2 (salto más del doble)
// Ejemplo: 0.000001 → 0.000003 (3x) → Irregular
```

**Progreso:**
```javascript
// Verifica si hizo nuevos máximos/mínimos
// Alcista: ¿Hizo nuevos máximos?
// Bajista: ¿Hizo nuevos mínimos?
```

**Estancamiento:**
```javascript
// Cuenta ticks consecutivos con movimiento < 0.000010
```

**Debilidad:**
```javascript
isWeak = irregularMovements > 2 || velocity < 0.000003
```

**En el análisis:** Verás en `analysis`:
```
📊 FASE 3 (Últimos 15s - CRÍTICO):
   Dominio: VENDEDORES
   Movimiento: -0.000005 pips
   Velocidad: 0.000000 pips/tick
   Irregularidades: 0
   Estancamiento Max: 12 ticks
   Tuvo Progreso: SÍ
   Estado: ⚠️ DÉBIL
```

---

### 5. Clasificación de Latigazo

**Condiciones:**
```javascript
// Latigazo detectado si:
Math.abs(phase3.netMovement) > 0.000150 &&
phase3.velocity > 0.000010
```

**Clasificación:**
```javascript
// DESESPERACIÓN si:
phase2.isWeak || phase2.maxStagnation >= 5

// FUERZA si:
// No hubo debilidad previa
```

**En el análisis:** Verás en `analysis`:
```
⚡ LATIGAZO DE DESESPERACIÓN detectado (ALCISTA)
   Movimiento: 0.000180 pips en 15 ticks
   Velocidad: 0.000012 pips/tick
   Contexto: Fase previa mostró debilidad/estancamiento
```

---

### 6. Detección de Aprovechamiento

**Condiciones:**
```javascript
// Aprovechamiento si:
phase1.dominantGroup !== phase2.dominantGroup &&
phase1.isWeak &&
phase2.velocity > phase1.velocity
```

**En el análisis:** Verás en `analysis`:
```
✓ VENDEDORES APROVECHARON la debilidad de COMPRADORES
   Velocidad Fase 1: 0.000002 pips/tick
   Velocidad Fase 2: 0.000008 pips/tick
   Ratio: 4.0x más rápido
```

---

### 7. Jerarquía de Decisión

**Orden de Prioridad:**

#### Regla 1: Latigazo de Desesperación en Nivel (90%)
```javascript
if (whiplashType === 'DESESPERACION' && levelCheck.isAtLevel) {
  if (whiplashDirection === 'ALCISTA' && levelCheck.level.type === 'RESISTANCE') {
    decision = 'PUT'
    confidence = 90
    if (levelCheck.level.quality === 'STRONG') confidence += 5
  }
}
```

#### Regla 2: Agotamiento tras Progreso (75%)
```javascript
if (phase3.maxStagnation >= 8 && phase3.hadProgress) {
  if (levelCheck.isAtLevel || phase3.maxStagnation >= 12) {
    decision = 'PUT' // o 'CALL' según grupo
    confidence = 75
    if (levelCheck.level.quality === 'STRONG') confidence += 10
  }
}
```

#### Regla 3: Aprovechamiento (80%)
```javascript
if (exploitation !== 'NONE') {
  decision = exploitation === 'COMPRADORES' ? 'CALL' : 'PUT'
  confidence = 80
}
```

#### Regla 4: Continuidad de Fuerza (75%)
```javascript
if (phase1.dominantGroup === phase2.dominantGroup &&
    phase2.dominantGroup === phase3.dominantGroup &&
    !phase1.isWeak && !phase2.isWeak && !phase3.isWeak &&
    !levelCheck.isAtLevel) {
  decision = phase3.dominantGroup === 'COMPRADORES' ? 'CALL' : 'PUT'
  confidence = 75
}
```

---

### 8. Ajustes de Confianza

**Tendencia (+10%):**
```javascript
if ((decision === 'CALL' && trend === 'ALCISTA') ||
    (decision === 'PUT' && trend === 'BAJISTA')) {
  confidence += 10
}
```

**Patrones (-40%):**
```javascript
if (pattern.prediction !== decision) {
  confidence -= 40
  if (confidence < 60) decision = 'WAIT'
}
```

**Secuencias (+10% / -20%):**
```javascript
if (sequence.nextPrediction === decision) {
  confidence += 10
} else if (sequence.nextPrediction !== 'NEUTRAL') {
  confidence -= 20
  if (confidence < 60) decision = 'WAIT'
}
```

---

## 🔧 Configuración Relevante

### config.js - Parámetros Clave

```javascript
strategy: {
  minTicks: 50,
  whiplashWindow: 15, // Últimos 15 ticks
  
  stagnation: {
    priceThreshold: 0.000010, // Movimiento mínimo
    maxTicks: 8 // Ticks consecutivos para considerar estancamiento
  },
  
  naturality: {
    ratioThreshold: 2 // Salto > 2x = irregular
  },
  
  levels: {
    proximity: 0.000050 // 5 pips de tolerancia
  }
}

dangerousMarkets: {
  microRange: {
    enabled: true,
    minOverlaps: 4
  },
  lowVolume: {
    enabled: true,
    sizeRatio: 0.5 // 50% del tamaño histórico
  },
  highVolatility: {
    enabled: true,
    maxGap: 0.000200,
    maxWickRatio: 0.6
  }
}

sequences: {
  enabled: true,
  minRepetitions: 2,
  maxLength: 6
}
```

---

## 📖 Cómo Analizar una Operación

### Paso 1: Leer el `analysis`

Busca las secciones clave:
```
[STEP 1] FILTRO DE SEGURIDAD → ¿Pasó?
[STEP 3] ANÁLISIS LMTA → ¿Qué vio en cada fase?
[STEP 4] DETECCIÓN DE LATIGAZO → ¿Qué tipo?
[STEP 5] APROVECHAMIENTO → ¿Hubo?
[STEP 7] LÓGICA DE DECISIÓN → ¿Qué regla aplicó?
[STEP 8] VALIDACIÓN → ¿Qué ajustes hizo?
```

### Paso 2: Verificar los `indicators`

```javascript
// ¿Los niveles eran correctos?
indicators.levels

// ¿El latigazo fue bien clasificado?
indicators.whiplash

// ¿Las fases mostraban lo que dice el análisis?
indicators.phases.phase3
```

### Paso 3: Reproducir con `ticks` y `candles`

```javascript
// Graficar los ticks para ver visualmente
ticks.forEach((tick, i) => console.log(`${i}: ${tick}`))

// Verificar niveles en las velas
candles.forEach(c => {
  console.log(`${c.id}: ${c.min} - ${c.max}`)
})
```

### Paso 4: Identificar Errores Comunes

**Si perdió:**
- ¿El nivel era realmente fuerte? (verificar `touches`)
- ¿El latigazo fue mal clasificado? (ver `whiplash.type`)
- ¿Hubo aprovechamiento real? (comparar velocidades)
- ¿La tendencia era correcta? (ver últimas 20 velas)

**Si ganó:**
- ¿Qué regla aplicó? (ver `reason`)
- ¿Qué confianza tenía? (ver `confidence`)
- ¿Hubo confirmaciones? (tendencia, secuencias, niveles fuertes)

---

## 🎯 Preguntas Clave para Análisis

1. **¿El mercado era seguro?** → Ver `[STEP 1]`
2. **¿Los niveles eran válidos?** → Ver `indicators.levels` y contar toques manualmente
3. **¿El latigazo fue bien clasificado?** → Ver `phase2` (¿era débil?) y `phase3` (¿movimiento fuerte?)
4. **¿Hubo aprovechamiento real?** → Comparar `phase1.velocity` vs `phase2.velocity`
5. **¿El estancamiento fue tras progreso?** → Ver `phase3.hadProgress`
6. **¿La decisión siguió la jerarquía?** → Ver qué regla aplicó en `[STEP 7]`
7. **¿Los ajustes fueron correctos?** → Ver `[STEP 8]`

---

## 📝 Notas Importantes

- **Umbral de Operación:** Confianza ≥ 60%
- **Prioridad Máxima:** Últimos 15 segundos (Fase 3)
- **Filtro Absoluto:** Mercados peligrosos (veto total)
- **Datos Completos:** Cada operación tiene todo para reproducir el análisis

---

## 🔄 Versión del Bot

**Versión:** 2.0  
**Fecha:** 2024-02-09  
**Cambios Principales:**
- Análisis LMTA en 3 fases
- Clasificación de latigazo (fuerza vs desesperación)
- Detección de aprovechamiento
- Distinción estancamiento vs debilidad
- Niveles con fuerza y clustering
- Logging extremadamente detallado
- Guardado de velas cerradas para contexto
