Tabler core 1.7.1 — https://github.com/tabler/tabler

The original `dist/css/tabler.min.css` is vendored from the official npm package `@tabler/core@1.7.1`. Package integrity was checked against the registry's SHA-512 integrity value before extraction. Copyright and MIT license notices are retained in the stylesheet and LICENSE.

Only CSS is used. Existing native dialogs and schedule modules handle application interaction; Tabler's Bootstrap JavaScript bundle is not required.

The application shell, CRM, announcements, news and Google calendar also load this same vendored stylesheet. `moida-brand.css` supplies MOIDA's navy (#102C4B) and mint (#57D9C2) theme, and `moida-brand.js` adds Tabler button classes to existing controls without replacing their event handlers. Existing scheduler category colors, status colors and third-party service logos remain semantic.
