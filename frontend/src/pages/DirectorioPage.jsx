import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  isSessionAuthorized,
  lockSession,
  getActivePassword,
  updatePassword,
  resetPasswordToDefault
} from '../utils/security'
import {
  INITIAL_VALENCIA_COMPANIES,
  VALENCIA_ZONES,
  COMPANY_STATUSES
} from '../data/initialValenciaCompanies'

const STORAGE_KEY = 'alina_valencia_companies_v5'

export default function DirectorioPage() {
  const navigate = useNavigate()

  // Seguridad: Verificación estricta en cada entrada
  useEffect(() => {
    if (!isSessionAuthorized()) {
      navigate('/', { replace: true })
    }
  }, [navigate])

  // Carga de datos con persistencia y migración inteligente
  const [companies, setCompanies] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }

      // Migración desde versiones anteriores si existen, preservando empresas del usuario
      const prevSaved =
        localStorage.getItem('alina_valencia_companies_v4') ||
        localStorage.getItem('alina_valencia_companies_v3') ||
        localStorage.getItem('alina_valencia_companies_v2')

      if (prevSaved) {
        const prevList = JSON.parse(prevSaved)
        if (Array.isArray(prevList) && prevList.length > 0) {
          const existingNames = new Set(prevList.map((c) => c.name?.toLowerCase().trim()))
          const newOnes = INITIAL_VALENCIA_COMPANIES.filter(
            (c) => !existingNames.has(c.name?.toLowerCase().trim())
          )
          return [...prevList, ...newOnes]
        }
      }
    } catch (e) {
      console.error('Error cargando empresas:', e)
    }
    return INITIAL_VALENCIA_COMPANIES
  })

  // Guardar en localStorage cada vez que cambien
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(companies))
    } catch (e) {
      console.error('Error guardando en localStorage:', e)
    }
  }, [companies])

  // Filtros y Búsqueda
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedZone, setSelectedZone] = useState('Todas')
  const [selectedStatus, setSelectedStatus] = useState('Todos')
  const [onlyMissingCareers, setOnlyMissingCareers] = useState(false)
  const [onlyMissingEmail, setOnlyMissingEmail] = useState(false)
  const [filterOnlyFavorites, setFilterOnlyFavorites] = useState(false)

  // Modo de visualización: 'list' (tabla) o 'grid' (casillas estilo Drive: 3, 6 o 9 por fila)
  const [viewMode, setViewMode] = useState('list') // 'list' | 'grid'
  const [gridColumns, setGridColumns] = useState(3) // 3 | 6 | 9

  // Estado del menú desplegable de 3 puntitos
  const [activeDropdownId, setActiveDropdownId] = useState(null)

  // Estado de Drag & Drop para mover filas
  const [draggedIndex, setDraggedIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)

  // Cerrar desplegable al hacer clic fuera
  useEffect(() => {
    const handleWindowClick = () => setActiveDropdownId(null)
    window.addEventListener('click', handleWindowClick)
    return () => window.removeEventListener('click', handleWindowClick)
  }, [])

  // Modales
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingCompany, setEditingCompany] = useState(null)
  const [showBulkImportModal, setShowBulkImportModal] = useState(false)
  const [showChangePwdModal, setShowChangePwdModal] = useState(false)

  // Notificaciones temporales (toast)
  const [toastMessage, setToastMessage] = useState('')
  const showToast = (msg) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(''), 3000)
  }

  // Cerrar y bloquear sesión (estricta)
  const handleLockAndExit = () => {
    lockSession()
    navigate('/', { replace: true })
  }

  // Filtrado reactivo
  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      // Filtro de Empresa Soñada / Favorita
      if (filterOnlyFavorites && !c.isFavorite) {
        return false
      }

      // Búsqueda textual
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase()
        const matchName = c.name?.toLowerCase().includes(q)
        const matchAddress = c.address?.toLowerCase().includes(q)
        const matchEmail = c.email?.toLowerCase().includes(q)
        const matchSector = c.sector?.toLowerCase().includes(q)
        const matchNotes = c.notes?.toLowerCase().includes(q)
        if (!matchName && !matchAddress && !matchEmail && !matchSector && !matchNotes) {
          return false
        }
      }

      // Filtro por Zona
      if (selectedZone !== 'Todas' && c.zone !== selectedZone) {
        return false
      }

      // Filtro por Estado
      if (selectedStatus !== 'Todos' && c.status !== selectedStatus) {
        return false
      }

      // Filtros rápidos
      if (onlyMissingCareers && c.careersUrl?.trim()) return false
      if (onlyMissingEmail && c.email?.trim()) return false

      return true
    })
  }, [companies, searchTerm, selectedZone, selectedStatus, onlyMissingCareers, onlyMissingEmail, filterOnlyFavorites])

  // Estadísticas y Métricas
  const stats = useMemo(() => {
    const total = companies.length
    const withCareers = companies.filter((c) => c.careersUrl && c.careersUrl.trim()).length
    const withEmail = companies.filter((c) => c.email && c.email.trim()).length
    const sentOrProcess = companies.filter((c) => ['CV Enviado', 'En proceso', 'Entrevista'].includes(c.status)).length
    const dreamCount = companies.filter((c) => c.isFavorite).length
    return { total, withCareers, withEmail, sentOrProcess, dreamCount }
  }, [companies])

  // Alternar Empresa Soñada / Favorita
  const toggleFavorite = (id) => {
    setCompanies((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const updatedState = !c.isFavorite
          showToast(updatedState ? `⭐ "${c.name}" marcada como Empresa Soñada` : `Quitada de Empresas Soñadas`)
          return { ...c, isFavorite: updatedState }
        }
        return c
      })
    )
  }

  // Actualizar estado rápido desde la tabla
  const handleStatusChange = (id, newStatus) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: newStatus, updatedAt: new Date().toISOString().split('T')[0] } : c))
    )
    showToast(`Estado actualizado a "${newStatus}"`)
  }

  // Eliminar empresa
  const handleDeleteCompany = (id, name) => {
    if (window.confirm(`¿Seguro que deseas eliminar "${name}" del directorio?`)) {
      setCompanies((prev) => prev.filter((c) => c.id !== id))
      setActiveDropdownId(null)
      showToast('Empresa eliminada correctamente')
    }
  }

  // Reordenación: mover arriba o abajo
  const moveCompany = (fromIndex, toIndex) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= companies.length) return
    setCompanies((prev) => {
      const updated = [...prev]
      const [movedItem] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, movedItem)
      return updated
    })
    showToast('Posición en la lista actualizada')
  }

  const handleMoveUp = (id) => {
    const idx = companies.findIndex((c) => c.id === id)
    if (idx > 0) moveCompany(idx, idx - 1)
    setActiveDropdownId(null)
  }

  const handleMoveDown = (id) => {
    const idx = companies.findIndex((c) => c.id === id)
    if (idx < companies.length - 1) moveCompany(idx, idx + 1)
    setActiveDropdownId(null)
  }

  const handleMoveToTop = (id) => {
    const idx = companies.findIndex((c) => c.id === id)
    if (idx > 0) moveCompany(idx, 0)
    setActiveDropdownId(null)
  }

  // Drag & Drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index)
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (dragOverIndex !== index) {
      setDragOverIndex(index)
    }
  }

  const handleDrop = (e, targetIndex) => {
    e.preventDefault()
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      // Calculamos los índices en el array completo companies
      const draggedItem = filteredCompanies[draggedIndex]
      const targetItem = filteredCompanies[targetIndex]
      if (draggedItem && targetItem) {
        const fromIdx = companies.findIndex((c) => c.id === draggedItem.id)
        const toIdx = companies.findIndex((c) => c.id === targetItem.id)
        moveCompany(fromIdx, toIdx)
      }
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  // Guardar empresa (añadir manualmente o editar)
  const handleSaveCompany = (companyData) => {
    if (editingCompany) {
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === editingCompany.id
            ? { ...companyData, id: c.id, updatedAt: new Date().toISOString().split('T')[0] }
            : c
        )
      )
      showToast('Empresa actualizada correctamente')
    } else {
      const newEntry = {
        ...companyData,
        id: 'val-' + Date.now(),
        updatedAt: new Date().toISOString().split('T')[0]
      }
      setCompanies((prev) => [newEntry, ...prev])
      showToast('¡Nueva empresa añadida manualmente con éxito!')
    }
    setShowAddEditModal(false)
    setEditingCompany(null)
  }

  // Importar nombres en lote
  const handleBulkImport = (text, defaultZone, defaultSector) => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)

    if (lines.length === 0) return

    const newEntries = lines.map((name, idx) => ({
      id: 'val-bulk-' + Date.now() + '-' + idx,
      name,
      zone: defaultZone || 'Calle Colón',
      address: defaultZone ? `${defaultZone}, Valencia` : 'Valencia',
      sector: defaultSector || 'Despacho / Empresa',
      careersUrl: '',
      email: '',
      status: 'Pendiente',
      isFavorite: false,
      notes: 'Importado en lote',
      updatedAt: new Date().toISOString().split('T')[0]
    }))

    setCompanies((prev) => [...newEntries, ...prev])
    setShowBulkImportModal(false)
    showToast(`Se han añadido ${newEntries.length} empresas al directorio`)
  }

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = ['Nombre', 'Empresa_Soñada', 'Zona', 'Dirección', 'Sector', 'Careers_URL', 'Email_Talent', 'Estado', 'Notas']
    const rows = companies.map((c) => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.isFavorite ? 'SI' : 'NO'}"`,
      `"${(c.zone || '').replace(/"/g, '""')}"`,
      `"${(c.address || '').replace(/"/g, '""')}"`,
      `"${(c.sector || '').replace(/"/g, '""')}"`,
      `"${(c.careersUrl || '').replace(/"/g, '""')}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.status || '').replace(/"/g, '""')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`
    ])

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Directorio_Empresas_Valencia_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('Directorio exportado en archivo CSV')
  }

  // Restaurar datos por defecto
  const handleResetDefaults = () => {
    if (window.confirm('¿Deseas restaurar la lista base de empresas en Valencia? Se cargarán todas las firmas recopiladas.')) {
      setCompanies(INITIAL_VALENCIA_COMPANIES)
      showToast('Listado restablecido con todas las firmas')
    }
  }

  // Copiar al portapapeles
  const copyToClipboard = (text, label) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      showToast(`¡${label} copiado al portapapeles!`)
    })
  }

  // Búsqueda en Google rápida para Careers
  const searchCareersGoogle = (companyName) => {
    const query = encodeURIComponent(`${companyName} valencia careers empleo trabaja con nosotros talent acquisition`)
    window.open(`https://www.google.com/search?q=${query}`, '_blank')
  }

  // Búsqueda en Google rápida para Email
  const searchEmailGoogle = (companyName) => {
    const query = encodeURIComponent(`"${companyName}" email "talent acquisition" OR "rrhh" OR "seleccion" valencia`)
    window.open(`https://www.google.com/search?q=${query}`, '_blank')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg, #f0f4f8)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: 99999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.35)',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          {toastMessage}
        </div>
      )}

      {/* HEADER SUPERIOR */}
      <header style={{ background: 'var(--blue, #2563eb)', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo y Titular */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              onClick={handleLockAndExit}
              title="Volver al inicio"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Inicio
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 800, fontSize: 17, color: '#ffffff', letterSpacing: '-0.02em' }}>Alina</span>
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16 }}>/</span>
              <span style={{ color: '#ffffff', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
                Directorio Privado Valencia
                <span style={{ fontSize: 13 }}>🔒</span>
              </span>
            </div>
          </div>

          {/* Acciones de Cabecera */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => {
                setEditingCompany(null)
                setShowAddEditModal(true)
              }}
              style={{
                background: '#ffffff',
                color: '#2563eb',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(0,0,0,0.12)'
              }}
              title="Añadir una nueva empresa rellenando los campos"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              + Añadir Empresa
            </button>

            <button
              onClick={() => setShowChangePwdModal(true)}
              style={{
                background: 'rgba(255,255,255,0.15)',
                color: '#ffffff',
                border: 'none',
                padding: '7px 12px',
                borderRadius: '8px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              title="Cambiar contraseña de acceso"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Contraseña
            </button>

            <button
              onClick={handleLockAndExit}
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '7px 14px',
                borderRadius: '8px',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 6px rgba(239, 68, 68, 0.3)'
              }}
              title="Bloquear sesión y volver al inicio"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              Bloquear y Salir
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main style={{ flex: 1, padding: '28px 24px 60px', maxWidth: 1280, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* Banner de Presentación */}
        <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 99, background: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 6 }}>
              <span>📍</span> Valencia Corporativa & Despachos
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.03em', margin: '0 0 4px 0' }}>
              Directorio de Empresas y Despachos Físicos
            </h1>
            <p style={{ fontSize: 14, color: '#64748b', margin: 0, maxWidth: 680 }}>
              Organiza tus candidaturas por zonas neurálgicas: <strong>Calle Colón, Plaza del Ayuntamiento, Alameda y Cortes Valencianas / Palacio de Congresos</strong>. Marca tus <strong>Empresas Soñadas ⭐</strong>, reordena arrastrando y gestiona con el menú desplegable <strong>(⋮)</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setEditingCompany(null)
                setShowAddEditModal(true)
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: '10px',
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)'
              }}
              title="Añadir una empresa manualmente completando los campos"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              ➕ Añadir Mi Empresa Manualmente
            </button>

            <button
              onClick={() => setShowBulkImportModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#1e293b',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
              title="Pega una lista de nombres de empresas de golpe"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              </svg>
              Pegar Lista en Lote
            </button>

            <button
              onClick={handleExportCSV}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#475569',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer'
              }}
              title="Descargar copia de seguridad en Excel/CSV"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Exportar CSV
            </button>

            <button
              onClick={handleResetDefaults}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '10px 12px',
                borderRadius: '10px',
                background: '#ffffff',
                color: '#94a3b8',
                border: '1px solid #e2e8f0',
                fontWeight: 600,
                fontSize: 12,
                cursor: 'pointer'
              }}
              title="Restaurar empresas iniciales recopiladas"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 2v6h6" />
                <path d="M21 12A9 9 0 0 0 6 5.3L3 8" />
                <path d="M21 22v-6h-6" />
                <path d="M3 12a9 9 0 0 0 15 6.7l3-2.7" />
              </svg>
              Restaurar
            </button>
          </div>
        </div>

        {/* Tarjetas de Métricas / KPI */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
          <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Empresas</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>{stats.total}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>en Valencia</span>
            </div>
          </div>

          <div
            onClick={() => setFilterOnlyFavorites(!filterOnlyFavorites)}
            style={{
              background: filterOnlyFavorites ? '#fffbeb' : '#ffffff',
              borderRadius: 14,
              padding: '16px 18px',
              border: filterOnlyFavorites ? '2px solid #f59e0b' : '1px solid #e2e8f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
            title="Clic para ver solo Empresas Soñadas"
          >
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ⭐ Empresas Soñadas
            </p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#b45309' }}>{stats.dreamCount}</span>
              <span style={{ fontSize: 12, color: '#d97706' }}>{filterOnlyFavorites ? '(Filtradas)' : 'favoritas'}</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Con Enlace Careers</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#2563eb' }}>{stats.withCareers}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>({stats.total > 0 ? Math.round((stats.withCareers / stats.total) * 100) : 0}%)</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Con Email Talent</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#10b981' }}>{stats.withEmail}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>({stats.total > 0 ? Math.round((stats.withEmail / stats.total) * 100) : 0}%)</span>
            </div>
          </div>

          <div style={{ background: '#ffffff', borderRadius: 14, padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>CV Enviado / Proceso</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#d97706' }}>{stats.sentOrProcess}</span>
              <span style={{ fontSize: 12, color: '#64748b' }}>contactadas</span>
            </div>
          </div>
        </div>

        {/* BARRA DE FILTROS Y BÚSQUEDA */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            padding: '16px 20px',
            border: '1px solid #e2e8f0',
            marginBottom: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
          {/* Fila 1: Búsqueda y Selectores */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Input de Búsqueda */}
            <div style={{ flex: '1 1 280px', position: 'relative' }}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="2.2"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre, dirección, email, notas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: 13,
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: 13
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Selector de Zona */}
            <div style={{ minWidth: 200, flex: '0 1 auto' }}>
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Todas">📍 Todas las Zonas</option>
                {VALENCIA_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            {/* Selector de Estado */}
            <div style={{ minWidth: 160, flex: '0 1 auto' }}>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 10,
                  border: '1px solid #cbd5e1',
                  background: '#f8fafc',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#334155',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="Todos">🏷️ Todos los Estados</option>
                {COMPANY_STATUSES.map((s) => (
                  <option key={s.label} value={s.label}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Fila 2: Chips de filtro rápido */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingTop: 4, borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filtros rápidos:</span>

            {/* Filtro Empresa Soñada */}
            <button
              type="button"
              onClick={() => setFilterOnlyFavorites(!filterOnlyFavorites)}
              style={{
                padding: '5px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 700,
                border: '1px solid',
                borderColor: filterOnlyFavorites ? '#f59e0b' : '#e2e8f0',
                background: filterOnlyFavorites ? '#fef3c7' : '#ffffff',
                color: filterOnlyFavorites ? '#b45309' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span>⭐</span> Solo Empresas Soñadas ({stats.dreamCount})
            </button>

            <button
              type="button"
              onClick={() => setOnlyMissingCareers(!onlyMissingCareers)}
              style={{
                padding: '5px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid',
                borderColor: onlyMissingCareers ? '#2563eb' : '#e2e8f0',
                background: onlyMissingCareers ? '#eff6ff' : '#ffffff',
                color: onlyMissingCareers ? '#2563eb' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span>🔗</span> Falta Careers URL
            </button>

            <button
              type="button"
              onClick={() => setOnlyMissingEmail(!onlyMissingEmail)}
              style={{
                padding: '5px 12px',
                borderRadius: 99,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid',
                borderColor: onlyMissingEmail ? '#10b981' : '#e2e8f0',
                background: onlyMissingEmail ? '#ecfdf5' : '#ffffff',
                color: onlyMissingEmail ? '#059669' : '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
            >
              <span>✉️</span> Falta Email Talent
            </button>

            {/* Controles de visualización estilo Google Drive: Lista vs Casillas (3 / 6 / 9 por fila) */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Vista:</span>
              <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: 2, borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: viewMode === 'list' ? '#ffffff' : 'transparent',
                    color: viewMode === 'list' ? '#2563eb' : '#64748b',
                    fontWeight: viewMode === 'list' ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                  title="Vista de lista detallada con desplazamiento horizontal"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="8" y1="6" x2="21" y2="6" />
                    <line x1="8" y1="12" x2="21" y2="12" />
                    <line x1="8" y1="18" x2="21" y2="18" />
                    <line x1="3" y1="6" x2="3.01" y2="6" />
                    <line x1="3" y1="12" x2="3.01" y2="12" />
                    <line x1="3" y1="18" x2="3.01" y2="18" />
                  </svg>
                  Lista
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('grid')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: 'none',
                    background: viewMode === 'grid' ? '#ffffff' : 'transparent',
                    color: viewMode === 'grid' ? '#2563eb' : '#64748b',
                    fontWeight: viewMode === 'grid' ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    boxShadow: viewMode === 'grid' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                  title="Vista en casillas compactas (como Google Drive)"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                  </svg>
                  Casillas
                </button>
              </div>

              {/* Si está en modo Casillas / Cuadrícula, permitir elegir 3, 6 o 9 por fila */}
              {viewMode === 'grid' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f8fafc', padding: '2px 6px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                  <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>Por fila:</span>
                  {[3, 6, 9].map((cols) => (
                    <button
                      key={cols}
                      type="button"
                      onClick={() => setGridColumns(cols)}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 5,
                        border: 'none',
                        background: gridColumns === cols ? '#2563eb' : 'transparent',
                        color: gridColumns === cols ? '#ffffff' : '#64748b',
                        fontWeight: 700,
                        fontSize: 11,
                        cursor: 'pointer'
                      }}
                      title={`Mostrar ${cols} casillas por fila`}
                    >
                      {cols}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {(searchTerm || selectedZone !== 'Todas' || selectedStatus !== 'Todos' || onlyMissingCareers || onlyMissingEmail || filterOnlyFavorites) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('')
                  setSelectedZone('Todas')
                  setSelectedStatus('Todos')
                  setOnlyMissingCareers(false)
                  setOnlyMissingEmail(false)
                  setFilterOnlyFavorites(false)
                }}
                style={{
                  padding: '5px 10px',
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 600,
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        {/* TABLA DE EMPRESAS CON DRAG & DROP Y MENÚ 3 PUNTITOS */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: 16,
            border: '1px solid #e2e8f0',
            overflow: 'visible',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
          }}
        >
          {filteredCompanies.length === 0 ? (
            <div style={{ padding: '60px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔍</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>No se encontraron empresas</h3>
              <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px 0' }}>Prueba a modificar los filtros o añade nuevas empresas con el botón superior.</p>
              <button
                onClick={() => {
                  setSearchTerm('')
                  setSelectedZone('Todas')
                  setSelectedStatus('Todos')
                  setOnlyMissingCareers(false)
                  setOnlyMissingEmail(false)
                  setFilterOnlyFavorites(false)
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                Ver todas las empresas
              </button>
            </div>
          ) : viewMode === 'list' ? (
            <div className="directorio-scrollable-container" style={{ overflowX: 'auto', overflowY: 'visible', width: '100%' }}>
              {/* Barra indicadora de scroll para ayudar al usuario a ver que hay más contenido hacia la derecha */}
              <div style={{ padding: '6px 16px', background: '#f8fafc', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: '#64748b' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>↔️</span> Desplaza hacia la derecha para ver contacto, estado, notas y opciones
                </span>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {filteredCompanies.length} empresas mostradas
                </span>
              </div>
              <table style={{ width: '100%', minWidth: 1180, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '14px 14px', fontWeight: 700, width: 60, textAlign: 'center' }}>#</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700, minWidth: 260 }}>Empresa / Despacho</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Zona & Sector</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Apartado Careers</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Talent Acquisition / Email</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Contacto</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Estado</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700 }}>Notas</th>
                    <th style={{ padding: '14px 18px', fontWeight: 700, textAlign: 'right' }}>Opciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCompanies.map((company, index) => {
                    const statusObj = COMPANY_STATUSES.find((s) => s.label === company.status) || COMPANY_STATUSES[0]
                    const isBeingDragged = draggedIndex === index
                    const isDragOver = dragOverIndex === index

                    return (
                      <tr
                        key={company.id}
                        draggable={!activeDropdownId}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        style={{
                          borderBottom: index === filteredCompanies.length - 1 ? 'none' : '1px solid #f1f5f9',
                          borderTop: isDragOver ? '3px solid #2563eb' : 'none',
                          background: isDragOver ? '#eff6ff' : isBeingDragged ? '#f8fafc' : company.isFavorite ? 'rgba(254, 243, 199, 0.25)' : 'transparent',
                          opacity: isBeingDragged ? 0.4 : 1,
                          transition: 'background 0.15s, border-color 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (!isDragOver && !isBeingDragged) e.currentTarget.style.background = company.isFavorite ? 'rgba(254, 243, 199, 0.45)' : '#fafbfc'
                        }}
                        onMouseLeave={(e) => {
                          if (!isDragOver && !isBeingDragged) e.currentTarget.style.background = company.isFavorite ? 'rgba(254, 243, 199, 0.25)' : 'transparent'
                        }}
                      >
                        {/* Enumeración / Prioridad */}
                        <td style={{ padding: '14px 14px', verticalAlign: 'top', textAlign: 'center', width: 60 }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              minWidth: 26,
                              height: 24,
                              padding: '0 6px',
                              borderRadius: 99,
                              background: company.isFavorite ? '#fef3c7' : '#f1f5f9',
                              color: company.isFavorite ? '#b45309' : '#64748b',
                              fontSize: 12,
                              fontWeight: 700
                            }}
                            title={`Prioridad #${index + 1} en tu lista`}
                          >
                            {index + 1}
                          </span>
                        </td>
                        {/* Nombre, Drag Handle, Estrella y Desplegable */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 260, position: 'relative' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            {/* Drag Handle */}
                            <span
                              style={{
                                cursor: 'grab',
                                color: '#94a3b8',
                                fontSize: 15,
                                lineHeight: '18px',
                                userSelect: 'none',
                                padding: '2px 0'
                              }}
                              title="Arrastra para mover la empresa arriba o abajo"
                            >
                              ⠿
                            </span>

                            {/* Estrella de Empresa Soñada (Toggle directo con 1 clic) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(company.id)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: 16,
                                lineHeight: 1
                              }}
                              title={company.isFavorite ? 'Empresa Soñada (clic para desmarcar)' : 'Marcar como Empresa Soñada ⭐'}
                            >
                              {company.isFavorite ? '⭐' : '☆'}
                            </button>

                            {/* Botón de 3 puntitos junto al nombre */}
                            <div style={{ position: 'relative' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setActiveDropdownId(activeDropdownId === company.id ? null : company.id)
                                }}
                                style={{
                                  background: activeDropdownId === company.id ? '#e2e8f0' : '#f1f5f9',
                                  border: 'none',
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#475569',
                                  fontWeight: 900,
                                  fontSize: 14,
                                  lineHeight: 1
                                }}
                                title="Opciones de la empresa"
                              >
                                ⋮
                              </button>

                              {/* MENÚ DESPLEGABLE FLOTANTE */}
                              {activeDropdownId === company.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    top: 26,
                                    left: 0,
                                    zIndex: 9999,
                                    width: 240,
                                    background: '#ffffff',
                                    borderRadius: 12,
                                    boxShadow: '0 12px 30px rgba(0,0,0,0.18), 0 0 1px 1px rgba(0,0,0,0.06)',
                                    border: '1px solid #e2e8f0',
                                    padding: '6px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 2,
                                    animation: 'fadeIn 0.15s ease-out'
                                  }}
                                >
                                  {/* Opción 1: Empresa Soñada */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      toggleFavorite(company.id)
                                      setActiveDropdownId(null)
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: company.isFavorite ? '#fef3c7' : 'transparent',
                                      color: company.isFavorite ? '#b45309' : '#1e293b',
                                      fontSize: 12,
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>{company.isFavorite ? '⭐ Quitar de Soñadas' : '⭐ Marcar Empresa Soñada'}</span>
                                  </button>

                                  {/* Opción 2: Mover arriba */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveUp(company.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e293b',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>⬆️</span> Mover hacia arriba
                                  </button>

                                  {/* Opción 3: Mover abajo */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveDown(company.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e293b',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>⬇️</span> Mover hacia abajo
                                  </button>

                                  {/* Opción 4: Mover arriba del todo */}
                                  <button
                                    type="button"
                                    onClick={() => handleMoveToTop(company.id)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e293b',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>🔝</span> Mover al principio
                                  </button>

                                  {/* Opción 5: Editar */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCompany(company)
                                      setShowAddEditModal(true)
                                      setActiveDropdownId(null)
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e293b',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>✏️</span> Editar datos
                                  </button>

                                  {/* Opción 6: Buscar Careers */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      searchCareersGoogle(company.name)
                                      setActiveDropdownId(null)
                                    }}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#2563eb',
                                      fontSize: 12,
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>🔍</span> Buscar Careers en Google
                                  </button>

                                  <div style={{ height: 1, background: '#e2e8f0', margin: '4px 0' }} />

                                  {/* Opción 7: Eliminar */}
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCompany(company.id, company.name)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 8,
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      border: 'none',
                                      background: '#fef2f2',
                                      color: '#dc2626',
                                      fontSize: 12,
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      textAlign: 'left'
                                    }}
                                  >
                                    <span>🗑️</span> Eliminar empresa
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Nombre y Dirección */}
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{company.name}</span>
                                {company.isFavorite && (
                                  <span
                                    style={{
                                      padding: '1px 6px',
                                      borderRadius: 6,
                                      background: '#fef3c7',
                                      color: '#b45309',
                                      fontSize: 10,
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}
                                  >
                                    <span>⭐</span> Empresa Soñada
                                  </span>
                                )}
                              </div>
                              {company.address && (
                                <div style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  {company.address}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Zona y Sector */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 160 }}>
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '2px 8px',
                              borderRadius: 6,
                              fontSize: 11,
                              fontWeight: 700,
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              marginBottom: 4
                            }}
                          >
                            {company.zone || 'Valencia'}
                          </div>
                          {company.sector && (
                            <div style={{ fontSize: 11, color: '#64748b' }}>{company.sector}</div>
                          )}
                        </td>

                        {/* Apartado Careers */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 190 }}>
                          {company.careersUrl && company.careersUrl.trim() ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <a
                                href={company.careersUrl.startsWith('http') ? company.careersUrl : `https://${company.careersUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  padding: '4px 10px',
                                  borderRadius: 6,
                                  background: '#eff6ff',
                                  color: '#2563eb',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  fontSize: 12
                                }}
                              >
                                <span>Ver Portal</span>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                                  <polyline points="15 3 21 3 21 9" />
                                  <line x1="10" y1="14" x2="21" y2="3" />
                                </svg>
                              </a>

                              <button
                                onClick={() => copyToClipboard(company.careersUrl, 'Enlace Careers')}
                                title="Copiar enlace directo"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 4,
                                  cursor: 'pointer',
                                  color: '#94a3b8'
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => searchCareersGoogle(company.name)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  background: '#f8fafc',
                                  border: '1px dashed #cbd5e1',
                                  color: '#475569',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                                title="Buscar página de empleo en Google en 1 clic"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8" />
                                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Buscar en Google
                              </button>

                              <button
                                onClick={() => {
                                  setEditingCompany(company)
                                  setShowAddEditModal(true)
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#2563eb',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                              >
                                + Añadir
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Email Talent Acquisition */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 200 }}>
                          {company.email && company.email.trim() ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <a
                                href={`mailto:${company.email}`}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: '#0f172a',
                                  textDecoration: 'none',
                                  fontWeight: 600,
                                  fontSize: 12
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2">
                                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                  <polyline points="22,6 12,13 2,6" />
                                </svg>
                                {company.email}
                              </a>

                              <button
                                onClick={() => copyToClipboard(company.email, 'Email')}
                                title="Copiar correo"
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 4,
                                  cursor: 'pointer',
                                  color: '#94a3b8'
                                }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <button
                                onClick={() => searchEmailGoogle(company.name)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '4px 8px',
                                  borderRadius: 6,
                                  background: '#f8fafc',
                                  border: '1px dashed #cbd5e1',
                                  color: '#475569',
                                  fontSize: 11,
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                                title="Buscar correo de talent acquisition o rrhh en Google"
                              >
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="11" cy="11" r="8" />
                                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                </svg>
                                Buscar Email
                              </button>

                              <button
                                onClick={() => {
                                  setEditingCompany(company)
                                  setShowAddEditModal(true)
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#2563eb',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  textDecoration: 'underline'
                                }}
                              >
                                + Añadir
                              </button>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 150 }}>
                          {company.contactUrl && (
                            <a href={company.contactUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>
                              Ver contacto
                            </a>
                          )}
                        </td>

                        {/* Estado */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', minWidth: 140 }}>
                          <select
                            value={company.status || 'Pendiente'}
                            onChange={(e) => handleStatusChange(company.id, e.target.value)}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 99,
                              border: '1px solid #cbd5e1',
                              background: statusObj.bg,
                              color: statusObj.color,
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              outline: 'none'
                            }}
                          >
                            {COMPANY_STATUSES.map((s) => (
                              <option key={s.label} value={s.label}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Notas */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', maxWidth: 220 }}>
                          <div
                            style={{
                              fontSize: 12,
                              color: company.notes ? '#475569' : '#94a3b8',
                              lineHeight: 1.4,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical'
                            }}
                          >
                            {company.notes || 'Sin notas'}
                          </div>
                        </td>

                        {/* Acciones */}
                        <td style={{ padding: '14px 18px', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            {/* Editar */}
                            <button
                              onClick={() => {
                                setEditingCompany(company)
                                setShowAddEditModal(true)
                              }}
                              title="Editar empresa"
                              style={{
                                background: '#f1f5f9',
                                border: 'none',
                                padding: '6px 8px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: '#475569'
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                              </svg>
                            </button>

                            {/* Eliminar directo */}
                            <button
                              onClick={() => handleDeleteCompany(company.id, company.name)}
                              title="Eliminar de mi lista"
                              style={{
                                background: '#fef2f2',
                                border: 'none',
                                padding: '6px 8px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                color: '#dc2626'
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* VISTA EN CASILLAS / DRIVE (3, 6 O 9 POR FILA) */
            <div style={{ padding: '16px' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    gridColumns === 9
                      ? 'repeat(auto-fill, minmax(125px, 1fr))'
                      : gridColumns === 6
                      ? 'repeat(auto-fill, minmax(185px, 1fr))'
                      : 'repeat(auto-fill, minmax(310px, 1fr))',
                  gap: gridColumns === 9 ? 8 : 12
                }}
              >
                {filteredCompanies.map((company, index) => {
                  const statusObj = COMPANY_STATUSES.find((s) => s.label === company.status) || COMPANY_STATUSES[0]
                  const isCompact = gridColumns >= 6
                  const isUltraCompact = gridColumns === 9

                  return (
                    <div
                      key={company.id}
                      draggable={!activeDropdownId}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{
                        background: company.isFavorite ? '#fffdf7' : '#ffffff',
                        border: company.isFavorite ? '1.5px solid #fde68a' : '1px solid #e2e8f0',
                        borderRadius: isUltraCompact ? 8 : 12,
                        padding: isUltraCompact ? '8px' : isCompact ? '12px' : '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: isUltraCompact ? 6 : 10,
                        position: 'relative',
                        transition: 'transform 0.15s, box-shadow 0.15s, border-color 0.15s',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        cursor: 'grab'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-2px)'
                        e.currentTarget.style.boxShadow = '0 6px 14px rgba(0,0,0,0.08)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none'
                        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                      }}
                    >
                      {/* Cabecera de la casilla: # Prioridad, Nombre, Favorito y Opciones */}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: isUltraCompact ? 10 : 11,
                                fontWeight: 800,
                                color: company.isFavorite ? '#b45309' : '#64748b',
                                background: company.isFavorite ? '#fef3c7' : '#f1f5f9',
                                padding: isUltraCompact ? '1px 4px' : '2px 6px',
                                borderRadius: 6
                              }}
                              title={`Prioridad #${index + 1}`}
                            >
                              #{index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleFavorite(company.id)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                                fontSize: isUltraCompact ? 12 : 14,
                                lineHeight: 1
                              }}
                              title={company.isFavorite ? 'Empresa Soñada (quitar)' : 'Marcar Soñada ⭐'}
                            >
                              {company.isFavorite ? '⭐' : '☆'}
                            </button>
                          </div>

                          {/* Menú de opciones ⋮ en la casilla */}
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveDropdownId(activeDropdownId === company.id ? null : company.id)
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: '#94a3b8',
                                fontSize: 13,
                                fontWeight: 900,
                                padding: '0 4px',
                                lineHeight: 1
                              }}
                              title="Opciones"
                            >
                              ⋮
                            </button>

                            {activeDropdownId === company.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  position: 'absolute',
                                  top: 20,
                                  right: 0,
                                  zIndex: 9999,
                                  width: 220,
                                  background: '#ffffff',
                                  borderRadius: 10,
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                                  border: '1px solid #e2e8f0',
                                  padding: '6px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 2
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleFavorite(company.id)
                                    setActiveDropdownId(null)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1e293b',
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                  }}
                                >
                                  <span>{company.isFavorite ? '⭐ Quitar de Soñadas' : '⭐ Marcar Soñada'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCompany(company)
                                    setShowAddEditModal(true)
                                    setActiveDropdownId(null)
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#1e293b',
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                  }}
                                >
                                  <span>✏️</span> Editar datos
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCompany(company.id, company.name)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: 'none',
                                    background: '#fef2f2',
                                    color: '#dc2626',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    textAlign: 'left'
                                  }}
                                >
                                  <span>🗑️</span> Eliminar
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Nombre de la empresa */}
                        <div
                          style={{
                            fontWeight: 700,
                            fontSize: isUltraCompact ? 12 : isCompact ? 13 : 15,
                            color: '#0f172a',
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={company.name}
                        >
                          {company.name}
                        </div>

                        {/* Zona / Ubicación */}
                        <div
                          style={{
                            fontSize: isUltraCompact ? 10 : 11,
                            color: '#64748b',
                            marginTop: 2,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                        >
                          📍 {company.zone || 'Valencia'}
                        </div>
                      </div>

                      {/* Información central (reducida para agilizar la búsqueda rápida) */}
                      {!isUltraCompact && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, color: '#475569' }}>
                          {company.sector && (
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              🏷️ {company.sector}
                            </div>
                          )}
                          {!isCompact && company.address && (
                            <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b' }}>
                              🏢 {company.address}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pie de la casilla: Estado y Accesos Rápidos */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 4,
                          paddingTop: 6,
                          borderTop: '1px solid #f1f5f9',
                          flexWrap: isUltraCompact ? 'wrap' : 'nowrap'
                        }}
                      >
                        {/* Selector de Estado compacto */}
                        <select
                          value={company.status || 'Pendiente'}
                          onChange={(e) => handleStatusChange(company.id, e.target.value)}
                          style={{
                            padding: isUltraCompact ? '2px 4px' : '3px 6px',
                            borderRadius: 6,
                            border: '1px solid #cbd5e1',
                            background: statusObj.bg,
                            color: statusObj.color,
                            fontSize: isUltraCompact ? 9 : 10,
                            fontWeight: 700,
                            cursor: 'pointer',
                            outline: 'none',
                            maxWidth: isUltraCompact ? '100%' : '110px'
                          }}
                        >
                          {COMPANY_STATUSES.map((s) => (
                            <option key={s.label} value={s.label}>
                              {s.label}
                            </option>
                          ))}
                        </select>

                        {/* Enlaces Rápidos (Careers / Email / Contacto) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          {company.careersUrl && (
                            <a
                              href={company.careersUrl.startsWith('http') ? company.careersUrl : `https://${company.careersUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '3px 6px',
                                borderRadius: 4,
                                background: '#eff6ff',
                                color: '#2563eb',
                                textDecoration: 'none',
                                fontSize: isUltraCompact ? 9 : 10,
                                fontWeight: 700
                              }}
                              title="Abrir portal de empleo"
                            >
                              🔗
                            </a>
                          )}
                          {company.email && (
                            <a
                              href={`mailto:${company.email}`}
                              style={{
                                padding: '3px 6px',
                                borderRadius: 4,
                                background: '#ecfdf5',
                                color: '#059669',
                                textDecoration: 'none',
                                fontSize: isUltraCompact ? 9 : 10,
                                fontWeight: 700
                              }}
                              title={`Enviar email a ${company.email}`}
                            >
                              ✉️
                            </a>
                          )}
                          {company.contactUrl && (
                            <a
                              href={company.contactUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                padding: '3px 6px',
                                borderRadius: 4,
                                background: '#f5f3ff',
                                color: '#7c3aed',
                                textDecoration: 'none',
                                fontSize: isUltraCompact ? 9 : 10,
                                fontWeight: 700
                              }}
                              title="Ver contacto en LinkedIn / Web"
                            >
                              👤
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

      </main>

      {/* FOOTER */}
      <footer style={{ padding: '14px 24px', borderTop: '1px solid #e2e8f0', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8' }}>
        <span>Alina · Directorio Personal Privado</span>
        <span>Reordena arrastrando ⠿ o usa el menú ⋮ para marcar Empresas Soñadas ⭐</span>
      </footer>

      {/* ── MODAL: AÑADIR MANUALMENTE / EDITAR EMPRESA ────────────────── */}
      {showAddEditModal && (
        <ModalAddEditCompany
          isOpen={showAddEditModal}
          onClose={() => {
            setShowAddEditModal(false)
            setEditingCompany(null)
          }}
          onSave={handleSaveCompany}
          initialData={editingCompany}
        />
      )}

      {/* ── MODAL: IMPORTAR NOMBRES EN LOTE ───────────────────────────── */}
      {showBulkImportModal && (
        <ModalBulkImport
          isOpen={showBulkImportModal}
          onClose={() => setShowBulkImportModal(false)}
          onImport={handleBulkImport}
        />
      )}

      {/* ── MODAL: CAMBIAR CONTRASEÑA ─────────────────────────────────── */}
      {showChangePwdModal && (
        <ModalChangePassword
          isOpen={showChangePwdModal}
          onClose={() => setShowChangePwdModal(false)}
          onSuccess={() => showToast('Contraseña actualizada con éxito')}
        />
      )}
    </div>
  )
}

// ── COMPONENTE: MODAL AÑADIR MANUALMENTE / EDITAR EMPRESA ─────────────
function ModalAddEditCompany({ isOpen, onClose, onSave, initialData }) {
  const [name, setName] = useState(initialData?.name || '')
  const [isFavorite, setIsFavorite] = useState(initialData?.isFavorite || false)
  const [zone, setZone] = useState(initialData?.zone || 'Calle Colón')
  const [address, setAddress] = useState(initialData?.address || '')
  const [sector, setSector] = useState(initialData?.sector || '')
  const [careersUrl, setCareersUrl] = useState(initialData?.careersUrl || '')
  const [email, setEmail] = useState(initialData?.email || '')
  const [status, setStatus] = useState(initialData?.status || 'Pendiente')
  const [notes, setNotes] = useState(initialData?.notes || '')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('El nombre de la empresa o despacho es obligatorio.')
      return
    }

    onSave({
      name: name.trim(),
      isFavorite,
      zone,
      address: address.trim(),
      sector: sector.trim(),
      careersUrl: careersUrl.trim(),
      email: email.trim(),
      status,
      notes: notes.trim()
    })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 560,
          background: '#ffffff',
          borderRadius: 20,
          padding: '28px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '0 0 2px 0' }}>
              {initialData ? 'Editar Empresa / Despacho' : 'Añadir Nueva Empresa Manualmente'}
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Rellena los campos para incorporarla de inmediato a tu lista privada.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Nombre y Opción de Empresa Soñada */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Nombre de la Empresa o Despacho *
            </label>
            <input
              type="text"
              autoFocus
              placeholder="Ej: iPronics, Uría Menéndez, Ale-Hop, Odoo..."
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (error) setError('')
              }}
              style={{ width: '100%', padding: '11px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          {/* Switch / Checkbox de Empresa Soñada */}
          <div
            onClick={() => setIsFavorite(!isFavorite)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderRadius: 10,
              background: isFavorite ? '#fffbeb' : '#f8fafc',
              border: isFavorite ? '1.5px solid #f59e0b' : '1px solid #e2e8f0',
              cursor: 'pointer',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⭐</span>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: isFavorite ? '#b45309' : '#1e293b' }}>
                  Marcar como Empresa Soñada / Favorita
                </p>
                <p style={{ margin: 0, fontSize: 11, color: isFavorite ? '#d97706' : '#64748b' }}>
                  Aparecerá destacada con una estrella dorada y filtro prioritario.
                </p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={(e) => setIsFavorite(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#f59e0b', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                Zona de Valencia
              </label>
              <select
                value={zone}
                onChange={(e) => setZone(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#ffffff', boxSizing: 'border-box' }}
              >
                {VALENCIA_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {z}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                Sector o Especialidad
              </label>
              <input
                type="text"
                placeholder="Ej: Legal, Tech, Auditoría..."
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Dirección Física en Valencia
            </label>
            <input
              type="text"
              placeholder="Ej: Calle Colón, 15 / Av. Cortes Valencianas, 26..."
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                URL Apartado Careers / Empleo
              </label>
              <input
                type="text"
                placeholder="https://empresa.com/careers"
                value={careersUrl}
                onChange={(e) => setCareersUrl(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
                Email Talent Acquisition / RRHH
              </label>
              <input
                type="text"
                placeholder="talento@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Estado del Seguimiento
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#ffffff', boxSizing: 'border-box' }}
            >
              {COMPANY_STATUSES.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Notas / Seguimiento Personal
            </label>
            <textarea
              rows={3}
              placeholder="Anotaciones: contacto clave en LinkedIn, fecha de postulación, requisitos específicos..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 700, fontSize: 13, cursor: 'pointer', boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)' }}
            >
              {initialData ? 'Guardar Cambios' : 'Añadir Empresa a mi Lista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── COMPONENTE: MODAL IMPORTAR EN LOTE (PEGAR LISTA) ─────────────────
function ModalBulkImport({ isOpen, onClose, onImport }) {
  const [text, setText] = useState('')
  const [zone, setZone] = useState('Calle Colón')
  const [sector, setSector] = useState('Despacho / Empresa')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleImportClick = () => {
    if (!text.trim()) {
      setError('Pega al menos un nombre de empresa.')
      return
    }
    onImport(text, zone, sector)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          background: '#ffffff',
          borderRadius: 20,
          padding: '28px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 19, fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0' }}>Pegar Lista de Empresas en Lote</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Pega los nombres (uno por línea) de tu listado de Valencia.</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>
            ✕
          </button>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
            Nombres de empresas o despachos (uno por línea)
          </label>
          <textarea
            rows={7}
            placeholder={`Cuatrecasas\nGarrigues\nBroseta Abogados\nDeloitte Valencia\nSopra Steria...`}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (error) setError('')
            }}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', lineHeight: 1.5 }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Zona por defecto
            </label>
            <select
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, background: '#ffffff', boxSizing: 'border-box' }}
            >
              {VALENCIA_ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Sector por defecto
            </label>
            <input
              type="text"
              placeholder="Despacho / Empresa"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            style={{ padding: '10px 22px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
          >
            Importar al Directorio
          </button>
        </div>
      </div>
    </div>
  )
}

// ── COMPONENTE: MODAL CAMBIAR CONTRASEÑA ──────────────────────────────
function ModalChangePassword({ isOpen, onClose, onSuccess }) {
  const currentActive = getActivePassword()
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSave = (e) => {
    e.preventDefault()
    if (!newPwd || newPwd.trim().length < 3) {
      setError('La contraseña debe tener mínimo 3 caracteres.')
      return
    }
    if (newPwd !== confirmPwd) {
      setError('Las contraseñas no coinciden.')
      return
    }

    const res = updatePassword(newPwd)
    if (res.success) {
      onSuccess?.()
      onClose()
    } else {
      setError(res.error || 'Error al actualizar contraseña')
    }
  }

  const handleReset = () => {
    resetPasswordToDefault()
    onSuccess?.()
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#ffffff',
          borderRadius: 20,
          padding: '28px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 }}>Configurar Contraseña</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#94a3b8' }}>
            ✕
          </button>
        </div>

        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>
          Cambia tu clave secreta para acceder al directorio privado.
        </p>

        {error && (
          <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Nueva Contraseña
            </label>
            <input
              type="password"
              placeholder="Escribe tu nueva contraseña..."
              value={newPwd}
              onChange={(e) => {
                setNewPwd(e.target.value)
                if (error) setError('')
              }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 4 }}>
              Repetir Contraseña
            </label>
            <input
              type="password"
              placeholder="Confirma la contraseña..."
              value={confirmPwd}
              onChange={(e) => {
                setConfirmPwd(e.target.value)
                if (error) setError('')
              }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
            >
              Restablecer clave por defecto
            </button>

            <button
              type="submit"
              style={{ padding: '10px 20px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#ffffff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              Guardar Contraseña
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
