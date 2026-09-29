import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import './app/enterprise-theme.css'
import './tools/SphereWorkspacePerf2026.css'
import './app/accessibility-theme-v13411.css'
import './app/accessibility-theme-v13412.css'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)