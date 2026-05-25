# Usar una imagen oficial de Node.js ligera
FROM node:20-slim

# Instalar dependencias del sistema requeridas para yt-dlp, ffmpeg y tor
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    tor \
    && rm -rf /var/lib/apt/lists/*

# Configurar Tor desde cero de forma limpia para evitar bloqueos de permisos de Debian
RUN echo "SocksPort 9050" > /etc/tor/torrc && \
    echo "DataDirectory /tmp/tor-data" >> /etc/tor/torrc && \
    echo "Log notice stdout" >> /etc/tor/torrc





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

# Iniciar Tor en segundo plano como daemon y luego arrancar la aplicación Node.js
CMD tor --runasdaemon 1 && npm start

