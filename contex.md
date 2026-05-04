plan implementacion
Replanteo Total: Bot de Micro-Dinámica de Precio
Este plan reemplaza toda la lógica de estrategia del bot por un motor de análisis basado exclusivamente en ticks de precio (sin velas, sin indicadores clásicos, sin S/R históricos). La infraestructura existente (WebSocket, conexión, scheduler, operaciones, money-management) se reutiliza íntegramente.

Qué cambia y qué se mantiene
Módulo	Estado
broker/ (WebSocket, API)	✅ Se mantiene igual
core/scheduler.js
✅ Se mantiene igual
core/candles.js
🔧 Se extiende (ticks con timestamp, ventana de análisis)
operations/trade.js
✅ Se mantiene igual
operations/money-management.js
✅ Se mantiene igual
operations/entry-point.js
✅ Se mantiene igual
reports/manager.js
✅ Se mantiene igual
index.js
🔧 Se modifica el loop principal (análisis tick-by-tick, segundo 1–25)
config.js
🔧 Se reemplaza la sección strategy por parámetros nuevos
strategy/strategy-core.js
❌ Se archiva, se reemplaza por nueva carpeta engine/
indicators/	❌ Se archivan todos (no se usan más)
Propuesta de Nuevos Módulos
engine/ (nuevo directorio — núcleo del sistema)
engine/
  tick-window.js        → Gestión de ventana deslizante de ticks
  features.js           → Cálculo de las 9 features (CI, CET, ED, AFT, PS, VR, FD, IAL, SR)
  interactions.js       → Cross-interactions no lineales (PED, EV, AR, BV)
  gating.js             → Apaga features que mienten en ciertos contextos
  regime.js             → Detecta régimen: NOISE / WAIT / ACTIVE / EXHAUSTION
  scoring.js            → Score direccional UP vs DOWN → decisión
  learner.js            → Ajuste online de pesos w1..wN (autoaprendizaje)
  engine-core.js        → Orquesta todo, expone analyzeCurrentTicks()
Descripción de cada módulo nuevo
tick-window.js
Mantiene una ventana deslizante continua de N ticks, cada uno con { t: timestamp_ms, p: precio }.
Provee: addTick(t, p), getWindow(), getWindowSize().

Crítico: el buffer nunca se limpia al iniciar un minuto nuevo. Es continuo en el tiempo. Solo descarta los ticks más viejos cuando supera el máximo (sliding). Esto garantiza que en el segundo 1 de cualquier minuto, el bot ya tiene decenas de ticks del minuto anterior para analizar estructura.

Tamaño: 300 ticks (default) → equivale a ~3–5 minutos de historia continua a ~1 tick/segundo
Al inicio de minuto nuevo: solo se resetea el flag yaOpere = false, el buffer no se toca
features.js
Recibe la ventana de ticks y calcula:

Feature	Qué mide	Output
CI – Coherencia Interna	1 / (var(Δp) + var(Δt) + ε) normalizado	[0, 1]
CET – Compresión Temporal	tanh((Δt_old - Δt_recent) / scale)	[-1, +1]
ED – Elasticidad Direccional	ED_up/ED_down via tanh(log(ratio))	[-1, +1]
AFT – Asimetría de Fricción Temporal	tanh((T_up - T_down) / scale)	[-1, +1]
PS – Persistencia de Signo	tanh((PS_up - PS_down) / scale)	[-1, +1]
VR – Velocidad de Reversión	tanh(log(VR_down / VR_up + ε))	[-1, +1]
FD – Fatiga Direccional	tanh(slope(magnitudes) / scale)	[-1, +1]
IAL – Índice de Absorción Local	attempts / (net_move + ε) normalizado	[0, 1]
SR – Simetría Rota	`	var(Up) - var(Down)
Devuelve un objeto features con todos los valores.

interactions.js
Calcula combinaciones no lineales:

PED = ED_bias * PS_bias (Presión Efectiva Direccional)
EV = CET * CI (Expansión Válida)
AR = FD * AFT (Agotamiento Real)
BV = IAL * VR (Barrera Viva — para reversiones)
gating.js
Aplica reglas de "apagado" de features:

CI < 0.25 → apaga ED, PS, VR, PED
CET < 0.10 → apaga FD, EV, PED
IAL < threshold → apaga BV
Retorna gatedFeatures (copia con 0s en features apagadas).

regime.js
Detecta el régimen actual con 4 estados:

NOISE → CI < 0.25 && CET < 0.10 → NO-TRADE obligatorio
WAIT → CI > 0.4 && |CET| < 0.05 → Mercado comprimido, esperar
ACTIVE → CI > 0.6 && CET > 0.2 && |PED| > 0.3 → Operar dirección
EXHAUSTION → FD < -0.2 && AFT > 0.2 → Posible reversión
scoring.js
Calcula score direccional ponderado:

Score_UP = w1*ED + w2*PS - w3*AFT - w4*VR + w5*FD + w6*PED + w7*EV
Score_DOWN = -Score_UP
Decide: si |Score_UP| > entry_threshold → dirección con mayor score. Si CI < CI_min o regime == NOISE → NO_TRADE.

learner.js (autoaprendizaje)
Guarda en engine/weights.json los pesos actuales [w1..w7] y estadísticas acumuladas.
Después de cada operación con resultado conocido (win/loss):
Registra el snapshot de features al momento de operar + resultado
Aplica actualización de gradiente simple (Perceptron online):
w_i += learning_rate * resultado * feature_i
resultado = +1 (win) / -1 (loss)
Normaliza los pesos para que no diverjan
Guarda el log de aprendizaje en engine/learning_log.json
Nota: No usa librerías externas. Sólo arrays y aritmética. No requiere DB.

engine-core.js
Orquesta todo:

js
analyzeCurrentTicks(ticks) → { shouldOperate, direction, regime, score, features, reason }
recordResult(features_snapshot, result) // llamado desde trade.js al conocer el resultado
Cambios en módulos existentes
core/candles.js
Extender 
addNewTick()
 para guardar { t: Date.now(), p: price } (actualmente solo guarda price).
Agregar getTicksWithTimestamp() para que el engine acceda a los ticks completos.
index.js
En cada tick (dentro de la vela actual): alimentar la ventana del engine y evaluar si estamos entre segundo 1 y 25.
Si el análisis dice operar: verificar que no haya operación activa, ejecutar inmediatamente (sin esperar nueva vela).
Al iniciar nueva vela: limpiar la ventana de ticks, reset del estado de análisis.
Eliminar toda referencia a analyzeStrategy, getLevels, 
strategy-core.js
.
config.js
Reemplazar sección strategy por:

js
engine: {
  windowSize: 150,       // ticks en ventana de análisis
  entryWindowStart: 1,   // segundo de la vela para empezar a analizar
  entryWindowEnd: 25,    // segundo de la vela hasta donde puede operar
  CI_min: 0.25,          // Coherencia mínima para operar
  CET_min: 0.10,         // Actividad mínima para operar
  entry_threshold: 0.35, // Score mínimo para ejecutar
  learning_rate: 0.01,   // Tasa de aprendizaje del learner
}
Archivos que se archivan (no se eliminan)
Se mueven a una carpeta _archive/ para preservar el trabajo previo:

strategy/strategy-core.js
indicators/ (todos los archivos)
Verificación
Test automático: simulación con ticks sintéticos
Crear test/test_engine.js que:

Genera una secuencia de ticks sintéticos con asimetría direccional conocida (ej: precio cayendo con alta coherencia)
Llama a engine-core.analyzeCurrentTicks(ticks)
Verifica que el resultado sea direction: 'DOWN' y regime !== 'NOISE'
Verifica que las features CI y CET estén por encima de sus umbrales mínimos
Comando:

node test/test_engine.js
Test manual: arrancar el bot en cuenta demo
Configurar 
.env
 con ACCOUNTTYPE=PRACTICE
Ejecutar node main.js
Verificar en consola:
Logs [ENGINE] Régimen: ACTIVE/WAIT/NOISE
Logs [ENGINE] Score UP: X.XX | Score DOWN: X.XX
Que en régimen NOISE no se ejecute ninguna operación
Que en régimen ACTIVE con score alto sí se ejecute
Verificar que engine/weights.json se actualiza después de cada operación con resultado