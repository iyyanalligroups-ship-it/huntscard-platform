import LegalPage from '../components/LegalPage.jsx';
import { PRIVACY } from '../legalContent.js';

export default function PrivacyPolicy() {
  return <LegalPage doc={PRIVACY} other={{ to: '/terms-condition', label: 'Terms and Conditions' }} />;
}
