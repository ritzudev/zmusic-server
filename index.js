require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Helper para encontrar el ejecutable de yt-dlp en el sistema
function getExecutablePath() {
  const isWindows = process.platform === 'win32';
  
  // 1. Comprobar si existe localmente en el directorio de la app (útil para desarrollo en Windows)
  const localWinPath = path.join(__dirname, 'yt-dlp.exe');
  const localLinuxPath = path.join(__dirname, 'yt-dlp');
  
  if (isWindows && fs.existsSync(localWinPath)) {
    return localWinPath;
  }
  if (!isWindows && fs.existsSync(localLinuxPath)) {
    return localLinuxPath;
  }
  
  // 2. Por defecto buscar en el PATH del sistema
  return isWindows ? 'yt-dlp.exe' : 'yt-dlp';
}

// Endpoint de Salud
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: process.platform,
    ytDlpPath: getExecutablePath()
  });
});

// Endpoint principal: Extraer enlace directo del stream de audio
app.get('/stream', (req, res) => {
  const videoUrl = req.query.url;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'Falta el parámetro obligatorio "url"' });
  }

  // Sanitizar URL y verificar estructura básica de enlace
  if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'La URL proporcionada no es válida' });
  }

  const ytDlp = getExecutablePath();
  
  // Parámetros para obtener sólo la URL directa (-g) del mejor audio disponible en M4A o mejor calidad
  const args = [
    '-g',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    videoUrl
  ];

  console.log(`Ejecutando: ${ytDlp} ${args.join(' ')}`);

  execFile(ytDlp, args, { timeout: 20000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error ejecutando yt-dlp: ${error.message}`);
      console.error(`stderr: ${stderr}`);
      return res.status(500).json({
        error: 'No se pudo extraer el flujo de audio de YouTube.',
        details: stderr.trim() || error.message
      });
    }

    const streamUrl = stdout.trim();
    if (!streamUrl) {
      return res.status(500).json({ error: 'yt-dlp no devolvió ninguna URL de flujo.' });
    }

    res.json({
      status: 'success',
      url: streamUrl
    });
  });
});

// Endpoint avanzado: Obtener metadatos completos y el stream en una sola llamada
app.get('/info', (req, res) => {
  const videoUrl = req.query.url;
  
  if (!videoUrl) {
    return res.status(400).json({ error: 'Falta el parámetro obligatorio "url"' });
  }

  if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'La URL proporcionada no es válida' });
  }

  const ytDlp = getExecutablePath();
  
  // Parámetros para volcar la metadata como JSON (-J)
  const args = [
    '--dump-json',
    videoUrl
  ];

  console.log(`Ejecutando metadatos: ${ytDlp} ${args.join(' ')}`);

  execFile(ytDlp, args, { maxBuffer: 10 * 1024 * 1024, timeout: 20000 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error ejecutando yt-dlp metadata: ${error.message}`);
      return res.status(500).json({
        error: 'No se pudo obtener la información del video.',
        details: stderr.trim() || error.message
      });
    }

    try {
      const metadata = JSON.parse(stdout);
      
      // Buscar el mejor stream de audio
      const audioFormats = metadata.formats.filter(f => f.vcodec === 'none' && f.acodec !== 'none');
      let bestAudioFormat = audioFormats.find(f => f.ext === 'm4a') || audioFormats[0] || metadata;

      // Si no hay formato exclusivo de audio, tomar la mejor opción
      const streamUrl = bestAudioFormat.url;

      res.json({
        status: 'success',
        id: metadata.id,
        title: metadata.title,
        artist: metadata.uploader || metadata.channel || 'Artista desconocido',
        duration: metadata.duration, // en segundos
        thumbnail: metadata.thumbnail,
        streamUrl: streamUrl
      });
    } catch (parseError) {
      console.error('Error parseando JSON de yt-dlp:', parseError);
      res.status(500).json({ error: 'Error al procesar la respuesta del extractor.' });
    }
  });
});

// Iniciar el Servidor
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`  ZMUSIC SERVER - ACTIVO`);
  console.log(`  Corriendo en: http://localhost:${PORT}`);
  console.log(`  Plataforma: ${process.platform}`);
  console.log(`  Extractor: ${getExecutablePath()}`);
  console.log(`==================================================`);
});
