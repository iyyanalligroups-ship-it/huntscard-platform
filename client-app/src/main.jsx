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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <CartProvider>
        <App />
      </CartProvider>
    </BrowserRouter>
  </React.StrictMode>
);
