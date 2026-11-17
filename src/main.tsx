import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import StagePreview from './stage-preview.tsx'
import './style.css'

const preview = import.meta.env.MODE === 'stage-editor' && new URLSearchParams(location.search).has('stage-preview')
createRoot(document.getElementById('root')!).render(preview ? <StagePreview /> : <App />)
