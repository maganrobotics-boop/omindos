// These legacy presentation resources do not load on the independent course
// entry. Keep course code, account controls, and application responses intact.
const entryPaths = new Set(['/learning', '/learning/', '/learning/index.html']);
const inactiveStyles = new Set([
  '/assets/login-layout-20261002.css',
  '/chat/assets/login-layout-20261002.css',
  '/learning/assets/login-layout-20261002.css',
  '/learning/course-professional-20261002.css',
  '/orientation-entry.css',
  '/chat/orientation-entry.css',
  '/learning/orientation-entry.css',
]);
const inactiveScripts = new Set([
  '/orientation-entry.js',
  '/chat/orientation-entry.js',
  '/learning/orientation-entry.js',
]);
const attribute = (tag, name) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2];
const resourcePath = value => value?.split(/[?#]/, 1)[0];

export function cleanCourseEntryResources(text, type, pathname) {
  if (!entryPaths.has(pathname) || !/^text\/html(?:\s*;|\s*$)/i.test(type)) return text;
  return text.replace(/<link\b[^>]*>/gi, tag =>
    attribute(tag, 'rel')?.toLowerCase() === 'stylesheet' && inactiveStyles.has(resourcePath(attribute(tag, 'href'))) ? '' : tag
  ).replace(/<script\b[^>]*>\s*<\/script\s*>/gi, tag =>
    inactiveScripts.has(resourcePath(attribute(tag, 'src'))) ? '' : tag
  );
}
