# 🔄 DIAGRAMA DE FLUJO - BOT LMTA

## 📊 FLUJO COMPLETO DEL BOT

```
┌─────────────────────────────────────────────────────────────────┐
│                         INICIO DEL BOT                          │
│                         (main.js)                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONECTAR CON BROKER                          │
│                    (broker/index.js)                            │
│  • Login con credenciales                                       │
│  • Establecer WebSocket                                         │
│  • Time sync                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INICIALIZAR BOT                              │
│                    (index.js)                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  CARGAR SCHEDULE         │  │  CARGAR VELAS            │
│  (core/active.js)        │  │  (core/candles.js)       │
│  • getActiveList()       │  │  • getCandles(120)       │
│  • Extraer intervalos    │  │  • Guardar en buffer     │
│  • Guardar en memoria    │  │  • Agregar direction     │
└──────────┬───────────────┘  └──────────┬───────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│              SUSCRIBIRSE A GENERACIÓN DE VELAS                  │
│              API.onCandleGenerate()                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BOT INICIALIZADO                             │
│                    Esperando velas...                           │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    POR CADA VELA CERRADA
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                    NUEVA VELA RECIBIDA                          │
│                    (callback en index.js)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ MUTEX CALLBACK │
                    │   ¿Ocupado?    │
                    └────┬──────┬────┘
                         │      │
                    NO   │      │   SÍ
                         │      │
                         ▼      └──────> DESCARTAR VELA
                    ┌────────────────┐
                    │  LOCK MUTEX    │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ ¿phase = 'C'?  │
                    └────┬──────┬────┘
                         │      │
                    SÍ   │      │   NO
                         │      │
                         ▼      └──────> UNLOCK & RETURN
┌─────────────────────────────────────────────────────────────────┐
│                  VERIFICAR REPORTE HORARIO                      │
│                  (reports/manager.js)                           │
│  • ¿Cambió la hora?                                             │
│  • Guardar reporte.txt                                          │
│  • Limpiar buffer                                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  AGREGAR VELA AL BUFFER                         │
│                  (core/candles.js)                              │
│  • Verificar si es nueva (por ID)                               │
│  • Agregar al array                                             │
│  • Eliminar la más vieja                                        │
│  • Mantener 120 velas                                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  ¿OPERANDO?    │
                    │ (mutex locked) │
                    └────┬──────┬────┘
                         │      │
                    NO   │      │   SÍ
                         │      │
                         ▼      └──────> UNLOCK & RETURN
┌─────────────────────────────────────────────────────────────────┐
│                  ANALIZAR ESTRATEGIA LMTA                       │
│                  (strategy/lmta-strategy.js)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  CONVERTIR A TICKS       │  │  PREPARAR INPUT          │
│  • Interpolar 60 ticks   │  │  • currentCandle         │
│  • Simular movimiento    │  │  • previousCandles       │
└──────────┬───────────────┘  └──────────┬───────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PREDICCIÓN LMTA                                │
│                  (strategy/lmta-core.js)                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  DETECTAR GRUPOS         │  │  ANALIZAR CONTEXTO       │
│  • Compradores           │  │  • Tendencia             │
│  • Vendedores            │  │  • Niveles               │
│  • Estancamiento         │  │  • Números redondos      │
└──────────┬───────────────┘  └──────────┬───────────────┘
           │                              │
           └──────────────┬───────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ANALIZAR FUERZA                                │
│  • Naturalidad (CV < 0.2)                                       │
│  • Irregularidad                                                │
│  • Latigazos (3x promedio)                                      │
│  • Aprovechamiento                                              │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  JERARQUÍA DE DECISIÓN                          │
│  1. Agotamiento en nivel (85%)                                  │
│  2. Aprovechamiento (80%)                                       │
│  3. Fuerza confirmada (70%)                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  RESULTADO PREDICCIÓN                           │
│  • direction: UP/DOWN/NEUTRAL/WAITING                           │
│  • confidence: 0-100                                            │
│  • reason: explicación detallada                                │
│  • analysis: datos completos                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GENERAR REPORTE DETALLADO                      │
│                  (strategy/lmta-strategy.js)                    │
│  • Decisión y confianza                                         │
│  • Análisis de grupos                                           │
│  • Latigazos detectados                                         │
│  • Contexto de mercado                                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ MOSTRAR EN     │
                    │   CONSOLA      │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ ¿DEBE OPERAR?  │
                    │ (confidence≥70)│
                    └────┬──────┬────┘
                         │      │
                    SÍ   │      │   NO
                         │      │
                         ▼      └──────> UNLOCK & RETURN
┌─────────────────────────────────────────────────────────────────┐
│                  EJECUTAR OPERACIÓN                             │
│                  (operations/trade.js)                          │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ MUTEX OPERATION│
                    │   ¿Ocupado?    │
                    └────┬──────┬────┘
                         │      │
                    NO   │      │   SÍ
                         │      │
                         ▼      └──────> RETURN (descartada)
                    ┌────────────────┐
                    │  LOCK MUTEX    │
                    └────────┬───────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  VALIDAR ACTIVO ABIERTO                         │
│                  (core/active.js)                               │
│  • Verificar timestamp actual                                   │
│  • Buscar en schedule                                           │
│  • Recargar si es necesario                                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
               ABIERTO           CERRADO
                    │                 │
                    ▼                 ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│  EJECUTAR TRADE          │  │  CANCELAR OPERACIÓN      │
│  • API.trade()           │  │  • UNLOCK MUTEX          │
│  • Esperar cierre        │  │  • RETURN                │
│  • Obtener resultado     │  └──────────────────────────┘
└──────────┬───────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  RESULTADO OPERACIÓN                            │
│  • WIN / LOSS                                                   │
│  • Ganancia / Pérdida                                           │
│  • Timestamp                                                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GUARDAR EN MEMORIA                             │
│                  (reports/manager.js)                           │
│  • Agregar a operationsBuffer                                   │
│  • Incluir análisis detallado                                   │
│  • Timestamp formateado                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ UNLOCK MUTEX   │
                    │   OPERATION    │
                    └────────┬───────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ UNLOCK MUTEX   │
                    │   CALLBACK     │
                    └────────┬───────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ESPERAR SIGUIENTE VELA                         │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    CADA HORA (AUTOMÁTICO)
═══════════════════════════════════════════════════════════════════

┌─────────────────────────────────────────────────────────────────┐
│                  VERIFICAR HORA ACTUAL                          │
│                  (reports/manager.js)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────┴────────┐
                    │                 │
              CAMBIÓ HORA        NO CAMBIÓ
                    │                 │
                    ▼                 └──────> RETURN
┌─────────────────────────────────────────────────────────────────┐
│                  GENERAR REPORTE HORARIO                        │
│  • Resumen (operaciones, win rate, ganancia)                    │
│  • Detalle de cada operación                                    │
│  • Análisis LMTA completo                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  GUARDAR EN reporte.txt                         │
│                  (BOT-2026-enero/reporte.txt)                   │
│  • Append al archivo existente                                  │
│  • Formato DD/MM/AAAA HH:MM:SS                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  LIMPIAR BUFFER                                 │
│                  operationsBuffer = []                          │
└─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════
                    COMPONENTES CLAVE
═══════════════════════════════════════════════════════════════════

┌──────────────────────────────────────────────────────────────────┐
│                         MUTEX SYSTEM                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CALLBACK MUTEX (core/mutex.js)                               │
│     • Evita procesamiento concurrente de velas                   │
│     • Descarta nuevas velas si está ocupado                      │
│                                                                  │
│  2. OPERATION MUTEX (operations/trade.js)                        │
│     • Solo 1 operación a la vez                                  │
│     • Bloquea nueva estrategia mientras opera                    │
│                                                                  │
│  3. CANDLE MUTEX (core/candles.js)                               │
│     • Protege buffer de velas                                    │
│     • Evita condiciones de carrera                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                      BUFFER DE VELAS                             │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Array en memoria (core/candles.js)                              │
│  • Tamaño: 120 velas                                             │
│  • Actualización: automática                                     │
│  • Eliminación: FIFO (First In, First Out)                       │
│                                                                  │
│  Estructura de cada vela:                                        │
│  {                                                               │
│    id, from, to, open, close, min, max, volume,                  │
│    direction: 'ALCISTA' | 'BAJISTA' | 'NONE'                     │
│  }                                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    VALIDACIÓN DE ACTIVO                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Schedule en memoria (core/active.js)                            │
│  • Carga al iniciar                                              │
│  • Array de intervalos [start, end]                              │
│  • Validación antes de operar                                    │
│  • Recarga automática si es necesario                            │
│                                                                  │
│  Verificación:                                                   │
│  timestamp >= start && timestamp <= end                          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                    ESTRATEGIA LMTA                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Análisis (strategy/lmta-core.js):                               │
│  1. Detectar grupos (compradores/vendedores)                     │
│  2. Analizar fuerza (CV, pendiente, simetría)                    │
│  3. Detectar latigazos (3x promedio)                             │
│  4. Evaluar contexto (niveles, tendencia)                        │
│  5. Aplicar jerarquía de decisión                                │
│  6. Calcular confianza (70-95%)                                  │
│                                                                  │
│  Jerarquía:                                                      │
│  1. Agotamiento en nivel (85%)                                   │
│  2. Aprovechamiento (80%)                                        │
│  3. Fuerza confirmada (70%)                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 📊 RESUMEN DE FLUJO

1. **Inicio** → Conectar → Cargar schedule → Cargar velas → Suscribirse
2. **Por cada vela** → Mutex → Agregar buffer → Analizar LMTA → Operar (si corresponde)
3. **Cada hora** → Generar reporte → Guardar archivo → Limpiar memoria

## 🔒 PUNTOS DE SEGURIDAD

- ✅ Mutex en callback (evita sobrecarga)
- ✅ Mutex en operaciones (solo 1 a la vez)
- ✅ Validación de activo (verifica schedule)
- ✅ Buffer limitado (120 velas máximo)
- ✅ Procesamiento asíncrono (no bloquea)

## 📝 PUNTOS DE DECISIÓN

1. **¿Mutex ocupado?** → Descartar vela
2. **¿Vela cerrada?** → Procesar, sino ignorar
3. **¿Operando?** → Esperar, no analizar
4. **¿Confianza ≥ 70%?** → Operar, sino esperar
5. **¿Activo abierto?** → Ejecutar, sino cancelar

---

**Este es el flujo completo del bot LMTA** 🚀
