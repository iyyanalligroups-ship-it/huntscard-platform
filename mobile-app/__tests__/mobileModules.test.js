/* global describe, test, expect */
// Smoke test: the changed and new modules import without errors (imports resolve, no syntax problems).
describe('activity modules load', () => {
  test('My activity screen, UI components, auth and menu import cleanly', () => {
    expect(typeof require('../src/screens/MyActivityScreen.js').default).toBe('function');
    const ui = require('../src/components/ui.js');
    expect(typeof ui.Button).toBe('function');
    expect(typeof ui.IconButton).toBe('function');
    expect(typeof ui.Tabs).toBe('function');
    expect(typeof require('../src/auth/AuthContext.js').AuthProvider).toBe('function');
    expect(Array.isArray(require('../src/screens/MenuScreen.js').MEMBER_MENU)).toBe(true);
  });

  test('the menu links to My Activity and the stack has a screen with that name', () => {
    const { MEMBER_MENU } = require('../src/screens/MenuScreen.js');
    const names = MEMBER_MENU.flatMap((g) => g.items.map((i) => i.name));
    expect(names).toContain('My Activity');
  });
});
