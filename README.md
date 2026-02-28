# BOT TRADING LMTA - Arquitectura Modular

## 📁 Estructura del Proyecto

```
BTjs/
├── broker/              # Lógica de WebSocket (NO TOCAR)
│   ├── API/
│   ├── WebSocket/
│   └── index.js
│
├── core/                # Núcleo del bot
│   ├── mutex.js         # Mutex simple para evitar concurrencia
│   ├── active.js        # Gestión de activos y schedule
│   └── candles.js       # Buffer de velas en memoria
│
├── strategy/            # Estrategia LMTA (MODIFICAR AQUÍ)
│   ├── lmta-core.js     # Lógica de predicción LMTA
│   └── lmta-strategy.js # Adaptador y análisis
│
├── operations/          # Ejecución de operaciones
│   └── trade.js         # Operaciones con mutex
│
├── reports/             # Sistema de reportes
│   └── manager.js       # Reportes horarios
│
├── indicators/          # Indicadores técnicos (opcionales)
│   ├── rsi.js
│   ├── moving-averages.js
│   └── trend.js
│
├── bt/                  # Archivos antiguos (BACKUP)
│
├── index.js             # Orquestador principal
├── main.js              # Entry point
├── config.js            # Configuración
└── .env                 # Variables de entorno
```

## 🚀 Cómo Ejecutar

```bash
cd BTjs
node main.js
```

### ⚠️ Inicio en Horario de Mercado Cerrado

Si ejecutas el bot cuando el mercado está cerrado (sábado, domingo, o viernes después de las 16:00):

- ✅ El bot se conecta al broker
- ✅ Configura los crons automáticos
- ⏸️ **Entra en modo DORMIDO** (no carga velas ni se suscribe)
- 🟢 **Lunes 00:00** → Se activa automáticamente

Para verificar el estado actual:
```bash
node test-scheduler.js
```

## ⚙️ Configuración (.env)

```env
USERIQ=tu_email@gmail.com
PASSWD=tu_password
INVERSION=1
CANDSIZE=60
CANTCANDLES=120
OPTIONTYPE=DIGITAL
ACCOUNTTYPE=PRACTICE
ACTIVEPRINCIPAL=EURUSD
DURACION_OP=1
```

## 🔄 Flujo de Ejecución

1. **main.js** → Conecta con broker
2. **index.js** → Inicializa:
   - Carga schedule del activo
   - Carga 120 velas históricas
   - Se suscribe a nuevas velas
3. **Callback por cada vela:**
   - Verifica mutex (descarta si está ocupado)
   - Agrega vela al buffer
   - Actualiza velas de 5seg para LMTA
   - Si NO hay operación en curso:
     - Analiza estrategia LMTA
     - Si debe operar:
       - Verifica activo abierto
       - Ejecuta operación (con mutex)
       - Guarda en memoria
   - Cada hora: guarda reporte.txt

## 🎯 Estrategia LMTA

### Parámetros Clave:
- **Timeframe:** 60 segundos (1 minuto)
- **Historial:** 120 velas
- **Confianza mínima:** 70%
- **Análisis:** Micro-movimientos, aprovechamiento, latigazos

### Decisión:
1. Agotamiento en nivel (85% confianza)
2. Aprovechamiento entre grupos (80%)
3. Fuerza confirmada (70%)

## 📊 Reportes

### Ubicación:
`BOT-2026-enero/reporte.txt`

### Formato:
```
============================================================
REPORTE HORARIO - 15/01/2025 14:00:00
============================================================

RESUMEN:
  Total Operaciones: 5
  Ganadas: 3
  Perdidas: 2
  Win Rate: 60.00%
  Ganancia Total: 2.50

============================================================

OPERACIÓN #1
----------------------------------------------------------------
Fecha/Hora: 15/01/2025 13:15:30
Dirección: CALL
Resultado: WIN
Ganancia: 1.75

============================================================
ANÁLISIS LMTA - 15/01/2025 13:15:30
============================================================

DECISIÓN: OPERAR
DIRECCIÓN: CALL (UP)
CONFIANZA: 85%
RAZÓN: Agotamiento bajista en soporte. Latigazo de desesperación detectado.

PATRÓN DETECTADO: DESPERATION_AT_LEVEL

--- ANÁLISIS DE GRUPOS ---
Compradores:
  Fuerza: NATURAL
  CV: 0.150 (Simétrico)
  Pendiente: 0.000045
  Estancado: No
Vendedores:
  Fuerza: IRREGULAR
  CV: 0.450 (Irregular)
  Pendiente: 0.000020
  Estancado: Sí

--- LATIGAZO DETECTADO ---
Dirección: DOWN
Magnitud: 3.20x

--- CONTEXTO DE MERCADO ---
Tendencia: LATERAL (Fuerza: 45.0%)
Cerca de Soporte: Sí
Cerca de Resistencia: No
Número Redondo: Sí
Precio Actual: 1.234500
Ticks Analizados: 60
Grupos Detectados: 8

============================================================
```

## 🔒 Sistema de Mutex

### Mutex de Callback:
- Descarta nuevos ticks si está procesando uno actual
- Evita sobrecarga del sistema

### Mutex de Operaciones:
- Solo permite 1 operación a la vez
- Descarta señales mientras hay operación abierta
- Se libera al cerrar la operación

## 🛡️ Validación de Activo

### Schedule:
- Se carga al iniciar el bot
- Valida antes de cada operación
- Recarga automáticamente si está fuera de horario

### Verificación:
```javascript
// Verifica si el activo está abierto en este momento
const isOpen = await checkActiveBeforeOperation(API)
```

## 📝 Modificar Estrategia

Para ajustar la estrategia LMTA:

### 1. Cambiar confianza mínima:
`strategy/lmta-strategy.js` línea 60:
```javascript
const MIN_CONFIDENCE = 70 // Cambiar aquí
```

### 2. Ajustar parámetros LMTA:
`strategy/lmta-core.js` líneas 2-12:
```javascript
const CONFIG = {
  TICK_SIZE: 60,
  WHIPLASH_WINDOW: 15,
  STAGNATION_THRESHOLD: 0.000010,
  // ... etc
}
```

### 3. Modificar lógica de decisión:
`strategy/lmta-core.js` función `predictNextCandle()`

## 🐛 Debugging

### Ver velas cargadas:
```javascript
const { getCandles } = require('./core/candles.js')
console.log(getCandles())
```

### Ver operaciones en memoria:
```javascript
const { getOperationsBuffer } = require('./reports/manager.js')
console.log(getOperationsBuffer())
```

### Forzar guardado de reporte:
```javascript
const { saveHourlyReport } = require('./reports/manager.js')
await saveHourlyReport()
```

## ⚠️ Importante

1. **NO modificar** la carpeta `broker/`
2. **Ajustar estrategia** solo en `strategy/`
3. **Los reportes** se guardan automáticamente cada hora
4. **El mutex** evita operaciones concurrentes
5. **Las velas** se mantienen en memoria (últimas 120)

## 🔧 Mantenimiento

### Backup de archivos antiguos:
Los archivos originales están en `bt/` por si necesitas revertir.

### Logs:
Todos los eventos importantes se muestran en consola con prefijos:
- `[INIT]` - Inicialización
- `[CANDLE]` - Nueva vela
- `[STRATEGY]` - Análisis de estrategia
- `[OPERATION]` - Ejecución de operación
- `[REPORTS]` - Sistema de reportes
- `[ACTIVE]` - Validación de activo

## 📞 Soporte

Si necesitas ajustar algo, los archivos clave son:
- `strategy/lmta-strategy.js` - Lógica de decisión
- `strategy/lmta-core.js` - Algoritmo LMTA
- `operations/trade.js` - Ejecución de operaciones
- `reports/manager.js` - Formato de reportes
