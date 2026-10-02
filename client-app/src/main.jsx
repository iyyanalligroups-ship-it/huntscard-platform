import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CartProvider } from './cart.jsx';
import './styles.css';

const savedAccent = window.localStorage.getItem('huntstag-dashboard-accent');
if (['teal', 'violet', 'amber'].includes(savedAccent)) {
  document.documentElement.dataset.huntstagAccent = savedAccent;
}

// Apply saved color mode (light/dark/system) immediately so there's no
// flash of the wrong theme before React hydrates and runs Layout's effect.
(function applyColorMode() {
  const saved = window.localStorage.getItem('huntstag-color-mode') || 'system';
  let resolved = saved;
  if (saved === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.colorMode = resolved;
})();


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </React.StrictMode>
);
