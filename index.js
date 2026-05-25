const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const net = require('net');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const dns = require('dns');

// Preferir IPv4 para evitar errores "fetch failed" en entornos sin IPv6
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Función para auto-corregir el formato de cookies Netscape (convierte espacios a tabuladores si es necesario)
function formatNetscapeCookies(rawCookies) {
  if (!rawCookies) return '';
  const lines = rawCookies.split(/\r?\n/);
  const formattedLines = lines.map(line => {
    if (line.trim().startsWith('#') || line.trim() === '') {
      return line;
    }
    if (line.includes('\t')) {
      return line;
    }
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 7) {
      const domain = parts[0];
      const flag = parts[1];
      const path = parts[2];
      const secure = parts[3];
      const expiration = parts[4];
      const name = parts[5];
      const value = parts.slice(6).join(' ');
      return `${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`;
    }
    return line;
  });
  return formattedLines.join('\n');
}

// Escribir las cookies de YouTube si están definidas en las variables de entorno
const cookiesPath = path.join(__dirname, 'cookies.txt');
if (process.env.YOUTUBE_COOKIES) {
  try {
    const formattedCookies = formatNetscapeCookies(process.env.YOUTUBE_COOKIES);
    fs.writeFileSync(cookiesPath, formattedCookies, 'utf8');
    console.log('✅ Cookies de YouTube cargadas y auto-formateadas exitosamente desde las variables de entorno.');
  } catch (e) {
    console.error('❌ Error al guardar las cookies de YouTube:', e);
  }
}



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

const COBALT_INSTANCES = [
  'https://cobalt.perennialte.ch',
  'https://cobalt.potatofactory.uk',
  'https://cobalt.colinbox.cc',
  'https://cobalt.0x3.ch',
  'https://cobalt.synced.cloud',
  'https://api.cobalt.tools',
  'https://cobalt.sh',
  'https://cobalt.su'
];

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.tokhmi.xyz',
  'https://api.piped.yt',
  'https://piped-api.lunar.icu',
  'https://pipedapi.col1a.me',
  'https://pipedapi.reallyawesomedomain.xyz'
];

const INVIDIOUS_INSTANCES = [
  'https://yewtu.be',
  'https://invidious.projectsegfau.lt',
  'https://invidious.privacydev.net',
  'https://inv.tux.im',
  'https://invidious.no-logs.com'
];

function extractVideoId(url) {
  const regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[7].length === 11) ? match[7] : null;
}

async function getAlternativeStream(videoUrl) {
  const videoId = extractVideoId(videoUrl);
  if (!videoId) {
    throw new Error('No se pudo extraer el ID del video de la URL proporcionada.');
  }

  let lastError = null;

  // --- CAPA 1: RED DE COBALT ALTERNATIVO (LA MÁS FIABLE PARA DOWNLOAD/STREAM) ---
  for (const instance of COBALT_INSTANCES) {
    try {
      console.log(`Intentando Cobalt API en ${instance}...`);
      const response = await fetch(instance, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        },
        body: JSON.stringify({
          url: videoUrl,
          downloadMode: 'audio',
          audioFormat: 'best'
        }),
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'tunnel' || data.status === 'redirect') {
          const streamUrl = data.url;
          if (streamUrl) {
            console.log(`✅ Éxito con Cobalt: ${instance}`);
            return {
              streamUrl: streamUrl,
              title: 'Audio de YouTube',
              artist: 'Artista de YouTube',
              duration: 0,
              thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
              provider: `cobalt_alt_${instance.replace('https://', '')}`
            };
          }
        }
      }
    } catch (e) {
      console.warn(`Cobalt ${instance} falló: ${e.message}`);
      lastError = e;
    }
  }

  // --- CAPA 2: RED DE PIPED ---
  for (const instance of PIPED_INSTANCES) {
    try {
      console.log(`Intentando Piped API en ${instance}...`);
      const response = await fetch(`${instance}/streams/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        if (data.audioStreams && data.audioStreams.length > 0) {
          const sortedAudio = data.audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
          const bestAudio = sortedAudio.find(s => s.format === 'M4A' || s.codec === 'mp4a') || sortedAudio[0];
          console.log(`✅ Stream de audio extraído con éxito vía Piped (${instance})`);
          return {
            streamUrl: bestAudio.url,
            title: data.title || 'Audio de YouTube',
            artist: data.uploader || 'Artista de YouTube',
            duration: data.duration || 0,
            thumbnail: data.thumbnailUrl || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            provider: 'piped_fallback'
          };
        }
      }
    } catch (e) {
      console.warn(`Piped ${instance} falló: ${e.message}`);
      lastError = e;
    }
  }

  // --- CAPA 3: RED DE INVIDIOUS ---
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      console.log(`Intentando Invidious API en ${instance}...`);
      const response = await fetch(`${instance}/api/v1/videos/${videoId}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(12000)
      });

      if (response.ok) {
        const data = await response.json();
        const adaptiveFormats = data.adaptiveFormats || [];
        const audioFormats = adaptiveFormats.filter(f => f.type && f.type.startsWith('audio/'));
        
        if (audioFormats.length > 0) {
          const sortedAudio = audioFormats.sort((a, b) => (parseInt(b.bitrate) || 0) - (parseInt(a.bitrate) || 0));
          const bestAudio = sortedAudio.find(f => f.type.includes('mp4') || f.container === 'm4a') || sortedAudio[0];
          
          console.log(`✅ Stream de audio extraído con éxito vía Invidious (${instance})`);
          
          let thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
          if (data.videoThumbnails && data.videoThumbnails.length > 0) {
            const highThumb = data.videoThumbnails.find(t => t.quality === 'high' || t.quality === 'medium');
            thumbnail = highThumb ? highThumb.url : data.videoThumbnails[0].url;
            if (thumbnail.startsWith('/')) {
              thumbnail = `${instance}${thumbnail}`;
            }
          }

          return {
            streamUrl: bestAudio.url,
            title: data.title || 'Audio de YouTube',
            artist: data.author || 'Artista de YouTube',
            duration: data.lengthSeconds || 0,
            thumbnail: thumbnail,
            provider: 'invidious_fallback'
          };
        }
      }
    } catch (e) {
      console.warn(`Invidious ${instance} falló: ${e.message}`);
      lastError = e;
    }
  }

  throw new Error(`Todos los proxies fallaron. Último error: ${lastError ? lastError.message : 'Desconocido'}`);
}

// Endpoint de Salud
app.get('/health', async (req, res) => {
  const isTorRunning = await new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(9050, '127.0.0.1');
  });

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    platform: process.platform,
    ytDlpPath: getExecutablePath(),
    isTorRunning: isTorRunning
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
  const isLinux = process.platform === 'linux';
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);
  
  // Parámetros optimizados para evadir bloqueos de VPS/DataCenters
  const args = [
    '-g',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--socket-timeout', '30',
    '--retries', '3',
    '--no-playlist'
  ];

  // Si NO tenemos cookies, forzamos los clientes móviles para evadir los bloqueos básicos de bot.
  // Si SÍ tenemos cookies, permitimos los clientes oficiales por defecto (web, tv, etc.) para que se aplique la sesión.
  if (!hasCookies) {
    args.push('--extractor-args', 'youtube:player_client=ios,android');
  }

  // Si estamos en producción (Linux/Render), usamos el proxy Tor local (el cual está limitado a nodos de salida en las Américas en torrc para proteger las cookies de bloqueos geográficos).
  if (isLinux) {
    args.push('--proxy', 'socks5://127.0.0.1:9050');
  }

  // Agregar cookies si existen
  if (hasCookies) {
    args.push('--cookies', cookiesPath);
  }

  args.push(videoUrl);

  console.log(`Ejecutando: ${ytDlp} ${args.join(' ')}`);

  execFile(ytDlp, args, { timeout: 60000 }, async (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ [yt-dlp Failure Details - /stream]`);
      console.error(`Exit Code: ${error.code}`);
      console.error(`stdout: ${stdout.trim()}`);
      console.error(`stderr: ${stderr.trim()}`);
      
      console.warn(`⚠️ [yt-dlp] Falló la extracción directa en el servidor. Intentando fallback automático a proxies alternativos...`);
      try {
        const alternativeData = await getAlternativeStream(videoUrl);
        return res.json({
          status: 'success',
          url: alternativeData.streamUrl,
          provider: alternativeData.provider
        });
      } catch (pipedError) {
        console.error(`❌ [Fallback Proxies] También falló: ${pipedError.message}`);
        return res.status(500).json({
          error: 'No se pudo extraer el flujo de audio de YouTube (fallaron tanto yt-dlp como los proxies de Piped/Invidious).',
          details: `Error yt-dlp: ${stderr.trim() || error.message} | Error Proxies: ${pipedError.message}`
        });
      }
    }

    const streamUrl = stdout.trim();
    if (!streamUrl) {
      return res.status(500).json({ error: 'yt-dlp no devolvió ninguna URL de flujo.' });
    }

    res.json({
      status: 'success',
      url: streamUrl,
      provider: 'yt-dlp'
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
  const isLinux = process.platform === 'linux';
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);

  // Parámetros optimizados para evadir bloqueos de VPS/DataCenters
  const args = [
    '--dump-json',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--socket-timeout', '30',
    '--retries', '3',
    '--no-playlist'
  ];

  // Si NO tenemos cookies, forzamos los clientes móviles para evadir los bloqueos básicos de bot.
  // Si SÍ tenemos cookies, permitimos los clientes oficiales por defecto (web, tv, etc.) para que se aplique la sesión.
  if (!hasCookies) {
    args.push('--extractor-args', 'youtube:player_client=ios,android');
  }

  // Si estamos en producción (Linux/Render), usamos el proxy Tor local (el cual está limitado a nodos de salida en las Américas en torrc para proteger las cookies de bloqueos geográficos).
  if (isLinux) {
    args.push('--proxy', 'socks5://127.0.0.1:9050');
  }

  // Agregar cookies si existen
  if (hasCookies) {
    args.push('--cookies', cookiesPath);
  }

  args.push(videoUrl);

  console.log(`Ejecutando metadatos: ${ytDlp} ${args.join(' ')}`);

  execFile(ytDlp, args, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, async (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ [yt-dlp Failure Details - /info]`);
      console.error(`Exit Code: ${error.code}`);
      console.error(`stdout: ${stdout.trim()}`);
      console.error(`stderr: ${stderr.trim()}`);
      
      console.warn(`⚠️ [yt-dlp] Falló la extracción de metadatos. Intentando fallback automático a proxies alternativos...`);
      try {
        const alternativeData = await getAlternativeStream(videoUrl);
        return res.json({
          status: 'success',
          id: extractVideoId(videoUrl) || 'desconocido',
          title: alternativeData.title,
          artist: alternativeData.artist,
          duration: alternativeData.duration,
          thumbnail: alternativeData.thumbnail,
          streamUrl: alternativeData.streamUrl,
          provider: alternativeData.provider
        });
      } catch (pipedError) {
        console.error(`❌ [Fallback Proxies Info] También falló: ${pipedError.message}`);
        return res.status(500).json({
          error: 'No se pudieron obtener los metadatos del video.',
          details: `Error yt-dlp: ${stderr.trim() || error.message} | Error Proxies: ${pipedError.message}`
        });
      }
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
        streamUrl: streamUrl,
        provider: 'yt-dlp'
      });
    } catch (parseError) {
      console.error('Error parseando JSON de yt-dlp:', parseError);
      res.status(500).json({ error: 'Error al procesar la respuesta del extractor.' });
    }
  });
});

// Endpoint POST / para compatibilidad total como drop-in de la API de Cobalt
app.post('/', async (req, res) => {
  const videoUrl = req.body.url;

  if (!videoUrl) {
    return res.status(400).json({
      status: 'error',
      error: { code: 'error.api.url_missing', text: 'Falta la URL de descarga' }
    });
  }

  console.log(`[Cobalt Compat] Recibida solicitud POST para: ${videoUrl}`);

  const ytDlp = getExecutablePath();
  const isLinux = process.platform === 'linux';
  const cookiesPath = path.join(__dirname, 'cookies.txt');
  const hasCookies = fs.existsSync(cookiesPath);
  
  const args = [
    '-g',
    '-f', 'bestaudio[ext=m4a]/bestaudio/best',
    '--js-runtimes', 'node',
    '--force-ipv4',
    '--socket-timeout', '30',
    '--retries', '3',
    '--no-playlist'
  ];

  // Si NO tenemos cookies, forzamos los clientes móviles para evadir los bloqueos básicos de bot.
  // Si SÍ tenemos cookies, permitimos los clientes oficiales por defecto (web, tv, etc.) para que se aplique la sesión.
  if (!hasCookies) {
    args.push('--extractor-args', 'youtube:player_client=ios,android');
  }

  // Si estamos en producción (Linux/Render), usamos el proxy Tor local (limitado regionalmente en las Américas).
  if (isLinux) {
    args.push('--proxy', 'socks5://127.0.0.1:9050');
  }

  if (hasCookies) {
    args.push('--cookies', cookiesPath);
  }

  args.push(videoUrl);

  execFile(ytDlp, args, { timeout: 60000 }, async (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ [yt-dlp Failure Details - POST /]`);
      console.error(`Exit Code: ${error.code}`);
      console.error(`stdout: ${stdout.trim()}`);
      console.error(`stderr: ${stderr.trim()}`);
      
      console.warn(`[Cobalt Compat] yt-dlp falló. Intentando fallback a proxies...`);
      try {
        const alternativeData = await getAlternativeStream(videoUrl);
        return res.json({
          status: 'tunnel',
          url: alternativeData.streamUrl
        });
      } catch (pipedError) {
        console.error(`[Cobalt Compat Fallback] Falló también: ${pipedError.message}`);
        return res.status(500).json({
          status: 'error',
          error: {
            code: 'error.api.extraction_failed',
            text: `Extracción fallida: ${pipedError.message}`
          }
        });
      }
    }

    const streamUrl = stdout.trim();
    if (!streamUrl) {
      return res.status(500).json({
        status: 'error',
        error: { code: 'error.api.empty_stream', text: 'Flujo de stream vacío' }
      });
    }

    res.json({
      status: 'tunnel',
      url: streamUrl
    });
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
