import { MessageCircle } from 'lucide-react';
import { trackEvent, whatsappLink } from '../siteConfig.js';

// Floating sales-chat button. Renders nothing until a WhatsApp number is
// configured in siteConfig / VITE_WHATSAPP_NUMBER.
export default function WhatsAppButton() {
  const href = whatsappLink();
  if (!href) return null;
  return (
    <a
      className="wa-float"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with HuntsTAG on WhatsApp"
      onClick={() => trackEvent('whatsapp_click', { placement: 'floating' })}
    >
      <MessageCircle size={22} strokeWidth={2} aria-hidden="true" />
      <span>Chat on WhatsApp</span>
    </a>
  );
}
