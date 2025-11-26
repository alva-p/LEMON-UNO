import React from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './context/AuthContext'
import { MiniApp } from './MiniApp'
import './styles.css'

const container = document.getElementById('root')!
const root = createRoot(container)

root.render(
  <React.StrictMode>
    <AuthProvider>
      <MiniApp />
    </AuthProvider>
  </React.StrictMode>
)
