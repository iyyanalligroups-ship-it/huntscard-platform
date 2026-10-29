import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PRIVACY } from '../src/legalContent.js';

test('website and mobile app privacy policy files are identical', () => {
  const web = fs.readFileSync(new URL('../src/legalContent.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../../mobile-app/src/lib/legalContent.js', import.meta.url), 'utf8');
  assert.equal(app, web, 'copy client-app/src/legalContent.js to mobile-app/src/lib/legalContent.js');
});

test('privacy policy says Google Analytics is used and that no name, phone or email is sent', () => {
  const text = JSON.stringify(PRIVACY);
  assert.match(text, /Google Analytics/);
  assert.match(text, /do not send it your name, phone number or email/);
});
