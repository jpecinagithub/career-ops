# Modo: auto-pipeline — Pipeline Completo Automático

Cuando el usuario pega un JD (texto o URL) sin sub-comando explícito, ejecutar TODO el pipeline en secuencia:

## Paso 0 — Extraer JD

Si el input es una **URL** (no texto de JD pegado), seguir esta estrategia para extraer el contenido:

**Orden de prioridad:**

1. **Playwright (preferido):** La mayoría de portales de empleo (Lever, Ashby, Greenhouse, Workday) son SPAs. Usar `browser_navigate` + `browser_snapshot` para renderizar y leer el JD.
2. **WebFetch (fallback):** Para páginas estáticas (ZipRecruiter, WeLoveProduct, company career pages).
3. **WebSearch (último recurso):** Buscar título del rol + empresa en portales secundarios que indexan el JD en HTML estático.

**Si ningún método funciona:** Pedir al candidato que pegue el JD manualmente o comparta un screenshot.

**Si el input es texto de JD** (no URL): usar directamente, sin necesidad de fetch.

## Paso 1 — Evaluación A-F
Ejecutar exactamente igual que el modo `oferta` (leer `modes/oferta.md` para todos los bloques A-F).

## Paso 2 — Guardar Report .md
Guardar la evaluación completa en `reports/{###}-{company-slug}-{YYYY-MM-DD}.md` (ver formato en `modes/oferta.md`).

## Paso 3 — Generar PDF
Ejecutar el pipeline completo de `pdf` (leer `modes/pdf.md`).

## Paso 4 — Borradores de respuestas para formulario (solo si score >= 4.5)

Si el score final es >= 4.5, generar borrador de respuestas para el formulario de aplicación:

1. **Extraer preguntas del formulario**: Usar Playwright para navegar al formulario y hacer snapshot. Si no se pueden extraer, usar las preguntas genéricas.
2. **Generar respuestas** siguiendo el tono (ver abajo).
3. **Guardar en el report** como sección `## G) Borradores de respuestas para formulario`.

### Preguntas genéricas (usar si no se pueden extraer del formulario)

- ¿Por qué te interesa este rol?
- ¿Por qué quieres trabajar en [Empresa]?
- Cuéntanos sobre un proyecto o logro relevante
- ¿Qué te hace un buen candidato para este puesto?
- ¿Cómo te enteraste de esta oferta?

### Tono para respuestas en formulario

**Posición: "Yo te elijo a ti."** El candidato tiene opciones y está eligiendo esta empresa por razones concretas.

**Reglas de tono:**
- **Confiado sin arrogancia**: Referenciar logros concretos, no aspiraciones.
- **Selectivo sin soberbia**: Mostrar que hay criterios, no desesperación.
- **Específico y concreto**: Siempre referenciar algo REAL del JD o de la empresa, y algo REAL de la experiencia del candidato.
- **Directo, sin fluff**: 2-4 frases por respuesta. Sin "Soy apasionado de..." ni "Me encantaría la oportunidad de..."
- **El hook es la prueba, no la afirmación**: En vez de "Soy bueno en X", decir "Construí X que logró Y."

**Framework por pregunta:**
- **¿Por qué este rol?** → "Tu [cosa específica] conecta directamente con [lo que hice]."
- **¿Por qué esta empresa?** → Mencionar algo concreto. "He seguido [producto/empresa] desde [contexto]."
- **Experiencia relevante** → Un proof point cuantificado. "Lideré [X] que logró [métrica]."
- **¿Por qué eres buen fit?** → "Estoy en la intersección de [A] y [B], que es exactamente donde vive este rol."
- **¿Cómo te enteraste?** → Honesto: "Lo encontré en [portal/scan], lo evalué contra mis criterios y puntuó alto."

**Idioma de las respuestas**: Seguir el idioma del formulario (si el formulario es en inglés, responder en inglés; si es en español, en español).

## Paso 5 — Actualizar Tracker
Registrar en `data/applications.md` con todas las columnas incluyendo Report y PDF en ✅.

**Si algún paso falla**, continuar con los siguientes y marcar el paso fallido como pendiente en el tracker.
