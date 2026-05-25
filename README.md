# ZMusic Server 🎵

Este es el backend privado para la aplicación **ZMusic**. Es una API ligera y potente desarrollada en **Node.js** que utiliza **`yt-dlp`** para extraer enlaces de transmisión de audio directos y de alta calidad desde YouTube.

Al utilizar tu propia API privada, **evitas los bloqueos de IP geográficos y la necesidad de usar un VPN en tu dispositivo Android**, ya que tu servidor en la nube se encarga de realizar la extracción de forma directa y segura.

---

## 🚀 Características

*   ⚡ **Extracción Instantánea:** Obtiene la URL del stream de audio en milisegundos sin almacenar archivos locales (ahorro de disco del 100%).
*   📦 **Dockerfile Integrado:** Autoinstala `python3`, `ffmpeg` y la última versión de `yt-dlp` al desplegarlo en la nube con un solo clic.
*   📡 **Endpoints Limpios:**
    *   `GET /health`: Comprobación del estado del servidor.
    *   `GET /stream?url=...`: Devuelve la URL directa del stream de audio (compatible con descargas y reproductores de audio).
    *   `GET /info?url=...`: Devuelve metadatos completos enriquecidos (Título, Artista, Duración, Portada y URL del stream).

---

## 💻 Ejecución Local (Windows)

Para probar este servidor localmente en tu máquina Windows, sigue estos sencillos pasos:

### 1. Requisitos Previos
*   Tener **[Node.js](https://nodejs.org/)** instalado (versión 18 o superior).
*   Tener **`yt-dlp`** instalado en el sistema. Puedes instalarlo rápidamente con PowerShell ejecutando:
    ```powershell
    winget install yt-dlp
    ```
    *Nota alternativa:* También puedes simplemente descargar el archivo ejecutable `yt-dlp.exe` desde su [repositorio oficial](https://github.com/yt-dlp/yt-dlp/releases) y colocarlo directamente en la carpeta raíz de este proyecto (`zmusic-server/`).

### 2. Instalación y Arranque
Abre tu terminal en la carpeta del proyecto y ejecuta:

```bash
# 1. Instalar las dependencias de Node.js
npm install

# 2. Iniciar el servidor en modo desarrollo
npm run dev
```

El servidor estará activo en: `http://localhost:3000`

---

## ☁️ Despliegue en la Nube (Gratis y Permanente)

Puedes desplegar este servidor de forma 100% gratuita utilizando servicios en la nube como **Render.com** o **Koyeb.com**.

### Opción A: Despliegue en Render (Recomendado)
1.  Sube esta carpeta a un repositorio tuyo de **GitHub** (puede ser público o privado).
2.  Crea una cuenta en **[Render.com](https://render.com/)**.
3.  Haz clic en **New +** y selecciona **Web Service**.
4.  Conecta tu cuenta de GitHub y selecciona el repositorio de `zmusic-server`.
5.  En la configuración del servicio, Render detectará el archivo `Dockerfile`. Asegúrate de que:
    *   **Runtime:** `Docker` esté seleccionado.
    *   **Instance Type:** `Free` (Gratuito).
6.  Haz clic en **Deploy Web Service**. Render instalará automáticamente `Node.js`, `Python`, `FFmpeg` y `yt-dlp`.
7.  ¡Listo! Te proporcionará una URL pública (ej. `https://mi-zmusic-api.onrender.com`).

---

## 🔌 Cómo consumirlo en ZMusic (Flutter)

Para utilizar esta API en tu app de Flutter, tienes dos alternativas sumamente sencillas:

### Método 1: Configurar como URL de Cobalt (Sin cambiar código)
Dado que tu servidor devuelve respuestas compatibles con redirecciones, puedes ir al menú de ajustes de tu aplicación de ZMusic y actualizar la dirección de la API de Cobalt introduciendo tu URL pública (ej. `https://mi-zmusic-api.onrender.com`).

### Método 2: Integrarlo Directamente en tu `youtube_provider.dart`
Puedes actualizar el método de descarga de audio en `lib/providers/youtube_provider.dart` para consultar tu servidor.

Ejemplo en Flutter (utilizando `http`):
```dart
final response = await http.get(
  Uri.parse('https://mi-zmusic-api.onrender.com/stream?url=https://www.youtube.com/watch?v=${video.id}')
);

if (response.statusCode == 200) {
  final data = json.decode(response.body);
  final String directAudioUrl = data['url'];
  // Utiliza directAudioUrl para descargar el archivo directamente en Android
}
```

---

## 🛡️ Seguridad e Inyección
El servidor utiliza de manera interna `execFile` con argumentos parametrizados en lugar de `exec` en consola cruda. Esto evita cualquier tipo de ataque por inyección de comandos en las URLs enviadas por los usuarios.
