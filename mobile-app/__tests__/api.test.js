import { API_URL, resolveAssetUrl } from '../src/api/client.js';

describe('API asset URLs', () => {
  test('keeps absolute asset URLs unchanged', () => {
    expect(resolveAssetUrl('https://cdn.example.com/card.png')).toBe('https://cdn.example.com/card.png');
  });

  test('resolves backend-relative asset URLs', () => {
    expect(resolveAssetUrl('/uploads/card.png')).toBe(`${API_URL}/uploads/card.png`);
  });

  test('keeps missing assets empty', () => {
    expect(resolveAssetUrl(null)).toBeNull();
  });
});
