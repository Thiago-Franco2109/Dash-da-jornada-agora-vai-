import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext.tsx'
import { ProductModeProvider } from './context/ProductModeContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ProductModeProvider>
        <App />
      </ProductModeProvider>
    </AuthProvider>
  </StrictMode>,
)
