export const APP_VERSION = '2.0.1';

// Make available for Service Worker (importScripts)
if (typeof self !== 'undefined') {
    self.APP_VERSION = APP_VERSION;
}
