const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'

export function resolveMediaUrl(path) {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('data:')) return path
  if (path.startsWith('/')) return `${API_BASE}${path}`
  return path
}

export function parseImagesJson(images) {
  if (!images) return []
  if (Array.isArray(images)) return images
  try {
    const parsed = JSON.parse(images)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const DEFAULT_AVATAR =
  'https://cube.elemecdn.com/3/7c/3ea6beec64369c2642b92c6726f1epng.png'

export function formatAvatar(avatar) {
  return resolveMediaUrl(avatar) || DEFAULT_AVATAR
}
