import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { webkit } = require('playwright');
const html = fs.readFileSync(new URL('../index.html', import.meta.url));
const webkitAvailable = fs.existsSync(webkit.executablePath());

const supabaseStub = `
window.supabase={createClient(){return {auth:{
  getSession:async()=>({data:{session:{user:{id:'iphone-user',email:'campo@example.test',user_metadata:{nombre:'Campo'}}}},error:null}),
  onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
  exchangeCodeForSession:async()=>({error:null}),
  signOut:async()=>({error:null})
}}}};
`;

async function routeFrame(page) {
  await page.waitForFunction(() => {
    const frame = document.querySelector('#app');
    return frame?.contentDocument?.title === 'Ruta del Día — Certificación en Campo';
  });
  return page.frames().find((frame) => frame !== page.mainFrame() && frame.url() === 'about:srcdoc');
}

test('srcdoc entrega la navegación al documento superior y regresa a #ruta con sesión', {
  skip: webkitAvailable ? false : 'WebKit no está instalado; ejecutar en el entorno de prueba o en iPhone antes de publicar',
}, async (t) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(html);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());

  const browser = await webkit.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.fulfill({ contentType: 'application/javascript', body: supabaseStub }));
  await page.route('https://www.google.com/maps/dir/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Google Maps simulado</title><p id="maps">Navegación simulada</p>',
  }));

  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/#ruta`);
  const frame = await routeFrame(page);
  assert.ok(frame, 'Ruta debe vivir dentro del iframe srcdoc');
  assert.equal(context.pages().length, 1);

  await frame.evaluate(() => {
    const route = { tramo: 0, puntos: [{ lat: 18.4, lng: -66.1 }, { lat: 18.5, lng: -66.2 }] };
    abrirTramoORS(route, 1);
  });
  await page.waitForURL('https://www.google.com/maps/dir/**');
  assert.equal(context.pages().length, 1, 'no debe aparecer una pestaña adicional');
  assert.equal(await page.title(), 'Google Maps simulado');

  await page.goBack();
  await page.waitForURL(`${origin}/#ruta`);
  const restoredFrame = await routeFrame(page);
  assert.ok(restoredFrame);
  assert.equal(await restoredFrame.locator('#login').isVisible(), false, 'la sesión válida no debe mostrar el login');
  assert.equal(context.pages().length, 1);
});
