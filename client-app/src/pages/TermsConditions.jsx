import LegalPage from '../components/LegalPage.jsx';
import { TERMS } from '../legalContent.js';

export default function TermsConditions() {
  return <LegalPage doc={TERMS} other={{ to: '/privacy-policy', label: 'Privacy Policy' }} />;
}
