const PWD_STORAGE_KEY = 'alina_valencia_dir_pwd'
const AUTH_SESSION_KEY = 'alina_valencia_dir_auth'
export const DEFAULT_PASSWORD = '9025'

/**
 * Obtiene la contraseña activa (configurada en localStorage, .env o por defecto)
 */
export function getActivePassword() {
  const custom = localStorage.getItem(PWD_STORAGE_KEY)
  if (custom && custom.trim()) {
    return custom.trim()
  }
  if (import.meta.env?.VITE_PRIVATE_PASSWORD) {
    return import.meta.env.VITE_PRIVATE_PASSWORD.trim()
  }
  return DEFAULT_PASSWORD
}

/**
 * Permite al usuario cambiar su contraseña personalizada
 */
export function updatePassword(newPassword) {
  if (!newPassword || newPassword.trim().length < 3) {
    return { success: false, error: 'La contraseña debe tener al menos 3 caracteres.' }
  }
  localStorage.setItem(PWD_STORAGE_KEY, newPassword.trim())
  return { success: true }
}

/**
 * Restablece la contraseña por defecto
 */
export function resetPasswordToDefault() {
  localStorage.removeItem(PWD_STORAGE_KEY)
}

/**
 * Valida la contraseña introducida por el usuario
 */
export function verifyPassword(inputPassword) {
  if (!inputPassword) return false
  const active = getActivePassword()
  return inputPassword.trim() === active
}

/**
 * Comprueba si la sesión actual está autorizada para ver el directorio
 */
export function isSessionAuthorized() {
  return sessionStorage.getItem(AUTH_SESSION_KEY) === 'true'
}

/**
 * Autoriza el acceso para la sesión de visualización
 */
export function authorizeSession() {
  sessionStorage.setItem(AUTH_SESSION_KEY, 'true')
}

/**
 * Cierra/bloquea la sesión de acceso para forzar la contraseña la próxima vez
 */
export function lockSession() {
  sessionStorage.removeItem(AUTH_SESSION_KEY)
}
