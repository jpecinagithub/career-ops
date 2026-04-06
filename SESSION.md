# Career-Ops - Estado del Proyecto

## Novedades de la Sesión Actual

### Backend API Standalone con Qwen LLM

Se ha creado un backend completo que permite usar Career-Ops sin depender de Claude Code.

### Arquitectura

```
┌─────────────────────┐
│   Frontend React    │  ← Pendiente (Fase 2)
│   (Vite + UI)       │
└────────┬────────────┘
         │ HTTP/REST
┌────────▼────────────┐
│   Node.js Backend   │  ✅ Completado
│   Express + SQLite  │
└────────┬────────────┘
         │ OpenAI SDK
┌────────▼────────────┐
│  Qwen 3.6 Plus Free │  ⚠️ API key con error 401
│  (DashScope)        │
└─────────────────────┘
```

### Archivos Creados

#### Server (`server/`)

| Archivo | Función |
|--------|---------|
| `server/package.json` | Dependencias |
| `server/src/index.js` | Servidor Express |
| `server/src/db/index.js` | SQLite (sql.js) |
| `server/src/services/llm.js` | Wrapper Qwen |
| `server/src/services/evaluator.js` | Evaluación ofertas |
| `server/src/routes/api.js` | Endpoints REST |

#### Configuración

| Archivo | Función |
|---------|---------|
| `.env` | QWEN_API_KEY configurada |

### APIs Disponibles

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/health` | Health check |
| `POST` | `/api/evaluate` | Evaluar oferta con Qwen |
| `POST` | `/api/evaluate/stream` | Evaluación streaming |
| `GET` | `/api/applications` | Listar aplicaciones |
| `GET` | `/api/applications/:id` | Ver aplicación |
| `PATCH` | `/api/applications/:id` | Actualizar aplicación |
| `GET` | `/api/stats` | Estadísticas |

### Cómo iniciar el servidor

```bash
cd server
node src/index.js
# API disponible en http://localhost:3001
```

### Pendiente

1. **Qwen API Key error 401** - Verificar que la key en `.env` sea correcta
2. **Frontend React** - Fase 2: Crear UI con Vite + React
3. **Deploy Ubuntu** - Fase 4: Subir a Oracle Cloud

### Siguiente paso recomendado

1. Verificar API key de Qwen en DashScope
2. Probar endpoint `/api/evaluate`
3. Implementar Frontend React (Fase 2)

---

## Estado Original del Proyecto (sin cambios)

El resto del proyecto original de Career-Ops sigue intacto:
- `cv.md` - CV del candidato
- `config/profile.yml` - Perfil
- `modes/*.md` - Prompts para Claude
- `data/applications.md` - Tracker original
- `portals.yml` - Configuración de portales
- `templates/` - Templates HTML/PDF
