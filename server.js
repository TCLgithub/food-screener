const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Goog-Api-Key, X-Goog-FieldMask',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// ── Places proxy handler (mirrors netlify/functions/places.js) ──
async function placesHandler(params, res) {
  const { endpoint, ...rest } = params;

  try {
    if (endpoint === 'shorten') {
      const { url: longUrl } = rest;
      if (!longUrl) return send(res, 400, CORS, JSON.stringify({ error: 'Missing url' }), 'application/json');
      const data = await httpGet(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`);
      const short = data.trim();
      if (!short.startsWith('http')) throw new Error('Shortener returned: ' + short);
      return send(res, 200, { ...CORS, 'Content-Type': 'text/plain' }, short);
    }

    if (endpoint === 'geocode') {
      const qs = new URLSearchParams(rest).toString();
      const data = await httpGet(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
      return send(res, 200, { ...CORS, 'Content-Type': 'application/json' }, data);
    }

    if (endpoint === 'textsearch') {
      const { key, query, location, radius, maxResultCount } = rest;
      const [lat, lng] = (location || '').split(',');
      const body = {
        textQuery: query,
        maxResultCount: parseInt(maxResultCount || '20'),
        includedType: 'restaurant',
      };
      if (lat && lng) {
        body.locationBias = {
          circle: {
            center: { latitude: parseFloat(lat), longitude: parseFloat(lng) },
            radius: parseFloat(radius || '10000'),
          },
        };
      }
      const data = await httpPost(
        'https://places.googleapis.com/v1/places:searchText',
        body,
        {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.currentOpeningHours,places.photos',
        }
      );
      return send(res, 200, { ...CORS, 'Content-Type': 'application/json' }, data);
    }

    if (endpoint === 'details') {
      const { key, place_id } = rest;
      const data = await httpGet(
        `https://places.googleapis.com/v1/places/${place_id}`,
        {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'regularOpeningHours,websiteUri,nationalPhoneNumber,reviews,priceLevel',
        }
      );
      return send(res, 200, { ...CORS, 'Content-Type': 'application/json' }, data);
    }

    if (endpoint === 'photo') {
      const { key, photo_name, maxwidth } = rest;
      const photoUrl = `https://places.googleapis.com/v1/${photo_name}/media?maxWidthPx=${maxwidth || 640}&key=${key}&skipHttpRedirect=false`;
      return send(res, 302, { ...CORS, Location: photoUrl }, '');
    }

    send(res, 400, CORS, JSON.stringify({ error: 'Unknown endpoint: ' + endpoint }), 'application/json');
  } catch (err) {
    console.error('Proxy error:', err);
    send(res, 500, CORS, JSON.stringify({ error: err.message }), 'application/json');
  }
}

function send(res, status, headers, body, contentType) {
  res.writeHead(status, { 'Content-Type': contentType || 'text/plain', ...headers });
  res.end(body);
}

// ── HTTP helpers ──
function httpGet(targetUrl, extraHeaders) {
  extraHeaders = extraHeaders || {};
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: Object.assign({ Accept: 'application/json' }, extraHeaders),
    }, (r) => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function httpPost(targetUrl, body, extraHeaders) {
  extraHeaders = extraHeaders || {};
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(targetUrl);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Accept: 'application/json',
      }, extraHeaders),
    }, (r) => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Server ──
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS);
    res.end();
    return;
  }

  // Netlify-compatible proxy path
  if (pathname === '/.netlify/functions/places') {
    return placesHandler(parsed.query, res);
  }

  // Dynamic keys.js — served from Render environment variables
  if (pathname === '/keys.js') {
    const keys = {
      google:   process.env.GOOGLE_PLACES_KEY  || '',
      gemini:   process.env.GEMINI_KEY          || '',
      deepseek: process.env.DEEPSEEK_KEY        || '',
      claude:   process.env.CLAUDE_KEY          || '',
      openai:   process.env.OPENAI_KEY          || '',
    };
    const js = `window.FOOD_SCREENER_KEYS = ${JSON.stringify(keys)};`;
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(js);
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(__dirname, filePath);

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Food Screener running on port ${PORT}`);
});
