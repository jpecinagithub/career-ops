# Career-Ops - Estado Actual del Proyecto

## Resumen Ejecutivo

Este proyecto ha evolucionado de un sistema basado en **Claude Code** a una aplicación **standalone** con:
- **Backend**: Node.js + Express + SQLite + Qwen LLM
- **Frontend**: React + Vite + TailwindCSS
- **UI completa**: Dashboard, Evaluador, Aplicaciones, Pipeline, Scanner, Settings

---

## Arquitectura Actual

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (client/)                      │
│  React + Vite + Tailwind + React Query + React Router      │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP :3001
┌─────────────────────────▼───────────────────────────────────┐
│                     Backend (server/)                        │
│  Express + SQLite (sql.js) + Qwen LLM + Playwright          │
│                                                              │
│  /api/evaluate    → Evaluación con Qwen                    │
│  /api/apply       → Auto-apply a ofertas                     │
│  /api/cvgen       → Generación CV + PDF                      │
│  /api/scan        → Scanner de portales                     │
│  /api/pipeline    → Gestión de URLs pendientes              │
└─────────────────────────────────────────────────────────────┘
                          │ OpenAI SDK
┌─────────────────────────▼───────────────────────────────────┐
│                  Qwen 3.6 Plus (DashScope)                  │
│  Endpoint: dashscope-intl.aliyuncs.com                      │
│  API Key: configurada en .env (DASHSCOPE_INTL=true)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Estructura de Archivos

### Backend (`server/`)

| Archivo | Función |
|---------|---------|
| `server/src/index.js` | Servidor Express principal |
| `server/src/db/index.js` | SQLite con sql.js |
| `server/src/services/llm.js` | Wrapper Qwen con soporte streaming |
| `server/src/services/evaluator.js` | Evaluación de ofertas A-F |
| `server/src/services/scanner.js` | Scanner de portales |
| `server/src/services/cvGenerator.js` | Generación CV desde template |
| `server/src/services/applier.js` | Auto-apply a formularios |
| `server/src/services/pdf.js` | Generación PDF con Playwright |
| `server/src/services/importer.js` | Importa datos desde .md legacy |
| `server/src/routes/api.js` | Endpoints core (evaluate, applications, stats) |
| `server/src/routes/scan.js` | Endpoints scanner |
| `server/src/routes/cv.js` | Endpoints CV |
| `server/src/routes/cvgen.js` | Endpoints generación CV/PDF |
| `server/src/routes/apply.js` | Endpoints auto-apply |
| `server/src/routes/pipeline.js` | Endpoints pipeline |
| `server/src/routes/process.js` | Endpoints procesamiento URLs |

### Frontend (`client/`)

| Archivo | Función |
|---------|---------|
| `client/src/App.jsx` | Router principal |
| `client/src/pages/Dashboard.jsx` | Stats y métricas |
| `client/src/pages/Evaluator.jsx` | Evaluar ofertas (streaming) |
| `client/src/pages/Applications.jsx` | Lista aplicaciones con filtros |
| `client/src/pages/ApplicationDetail.jsx` | Detalle + PDF |
| `client/src/pages/Pipeline.jsx` | URLs pendientes |
| `client/src/pages/Scanner.jsx` | Ejecutar scans |
| `client/src/pages/Settings.jsx` | Configuración perfil/portales |
| `client/src/components/Layout.jsx` | Navigation sidebar |
| `client/src/components/StatusBadge.jsx` | Badge estados |
| `client/src/components/ScoreBadge.jsx` | Badge puntuación |
| `client/src/lib/api.js` | API client |
| `client/src/lib/evaluationStore.js` | Zustand store |
| `client/src/store/ui.js` | UI state |

---

## APIs Disponibles

### Core
| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `POST` | `/api/evaluate` | Evaluar oferta con Qwen |
| `POST` | `/api/evaluate/stream` | Evaluación streaming SSE |
| `GET` | `/api/applications` | Lista aplicaciones |
| `GET` | `/api/applications/:id` | Ver aplicación |
| `POST` | `/api/applications` | Crear aplicación |
| `PATCH` | `/api/applications/:id` | Actualizar aplicación |
| `DELETE` | `/api/applications/:id` | Eliminar aplicación |
| `GET` | `/api/stats` | Estadísticas |

### CV & PDF
| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/api/cv` | Obtener CV markdown |
| `GET` | `/api/cv/html` | Obtener CV HTML |
| `POST` | `/api/cvgen/pdf` | Generar PDF desde JD |
| `GET` | `/api/pdf/:id` | Descargar PDF de aplicación |

### Scanner & Pipeline
| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/scan` | Ejecutar scan de portales |
| `GET` | `/api/pipeline` | Ver URLs pendientes |
| `POST` | `/api/pipeline/process` | Procesar URL del pipeline |
| `POST` | `/api/process/scrape` | Scraping de JD desde URL |

### Auto-apply
| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/apply/fill` | Rellenar formulario |
| `POST` | `/api/apply/submit` | Submit aplicación |

---

## Configuración (.env)

```env
QWEN_API_KEY=sk-1a62cdf14c914f8aa99c0e753d87cf58
DASHSCOPE_INTL=true
PORT=3001
NODE_ENV=development
DATABASE_URL=./data/career-ops.db
```

---

## Cómo Iniciar

### Backend
```bash
cd server
node src/index.js
# API: http://localhost:3001
```

### Frontend
```bash
cd client
npm run dev
# UI: http://localhost:5173
```

---

## Datos Migrados

El sistema importa automáticamente desde los archivos legacy:
- `data/applications.md` → Tabla `applications` en SQLite
- `data/pipeline.md` → Tabla `pipeline_urls` en SQLite

---

## Estado de Funcionalidades

| Funcionalidad | Estado |
|---------------|--------|
| Evaluación con Qwen | ✅ Funcionando |
| Streaming de evaluaciones | ✅ SSE |
| Generación CV/PDF | ✅ Playwright |
| Scanner de portales | ✅ Implementado |
| Auto-apply | ✅ Implementado |
| Pipeline URLs | ✅ Gestionado |
| Persistencia SQLite | ✅ sql.js |

---

## Issues Conocidos

1. **Qwen API Key**: Verificar que funcione correctamente
2. **Importación datos**: Requiere reinicio para sync con .md legacy

---

## Para Siguiente Sesión Claude

1. Leer este archivo para entender el estado actual
2. Iniciar servidor: `cd server && node src/index.js`
3. Iniciar frontend: `cd client && npm run dev`
4. Probar endpoint: `curl http://localhost:3001/health`