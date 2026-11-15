import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

const cloudinaryAssets = JSON.parse(
  readFileSync(new URL('./src/HomePage/cloudinaryAssetManifest.json', import.meta.url), 'utf8'),
)

function cloudinaryBedImageImports() {
  const virtualModulePrefix = '\0cloudinary-bed-image:'

  return {
    name: 'cloudinary-bed-image-imports',
    enforce: 'pre',
    resolveId(source) {
      const normalizedSource = source.replace(/\\/g, '/')
      const assetMarker = '/ALLBEDTYPES/'
      const markerIndex = normalizedSource.lastIndexOf(assetMarker)
      if (markerIndex === -1) return null

      const assetPath = `ALLBEDTYPES/${normalizedSource.slice(markerIndex + assetMarker.length)}`
      if (!cloudinaryAssets[assetPath]) {
        throw new Error(`Missing Cloudinary image URL for ${assetPath}.`)
      }
      return `${virtualModulePrefix}${encodeURIComponent(assetPath)}`
    },
    load(id) {
      if (!id.startsWith(virtualModulePrefix)) return null
      const assetPath = decodeURIComponent(id.slice(virtualModulePrefix.length))
      return `export default ${JSON.stringify(cloudinaryAssets[assetPath])};`
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [cloudinaryBedImageImports(), react(), tailwindcss()],
  optimizeDeps: {
    include: ['cookie', 'leaflet', 'react-dom/client', 'set-cookie-parser'],
    noDiscovery: true,
  },
  server: {
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
})
