# Usar una imagen oficial de Node.js ligera
FROM node:20-slim

# Instalar dependencias del sistema requeridas para yt-dlp y ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Descargar e instalar la versión más reciente de yt-dlp directamente de GitHub
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Crear y establecer el directorio de trabajo de la app
WORKDIR /app

# Copiar archivos de definición de dependencias
COPY package*.json ./

# Instalar dependencias del proyecto en modo producción
RUN npm ci --only=production

# Copiar el código fuente restante de la aplicación
COPY . .

# Variables de entorno por defecto
ENV PORT=3000
ENV NODE_ENV=production

# Exponer el puerto del servidor
EXPOSE 3000

# Comando para iniciar la aplicación
CMD ["npm", "start"]
