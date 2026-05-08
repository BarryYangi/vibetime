import { styles as numberFlowStyles } from '@number-flow/react'
import { Provider } from 'jotai'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/sn-pro/400.css'
import '@fontsource/sn-pro/500.css'
import '@fontsource/sn-pro/600.css'
import '@fontsource/sn-pro/700.css'
import App from './App'
import { store } from './store'
import './index.css'

if (!document.querySelector('style[data-number-flow]')) {
  const el = document.createElement('style')
  el.dataset.numberFlow = ''
  el.textContent = numberFlowStyles.join('\n')
  document.head.appendChild(el)
}

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </StrictMode>,
  )
}
