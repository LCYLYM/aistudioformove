const { contextBridge } = require('electron');

const baseurl = process.env.GEMINI_BASEURL || 'https://generativelanguage.googleapis.com';
const key = process.env.GEMINI_API_KEY || '';

contextBridge.exposeInMainWorld('GEMINI_CONFIG', {
  baseurl,
  key,
});
