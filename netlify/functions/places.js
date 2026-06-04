const https = require('https');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Goog-Api-Key, X-Goog-FieldMask',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const { endpoint, ...params } = event.queryStringParameters || {};

  try {
    // ── URL Shortener (via is.gd — free, no key, CORS-friendly from server) ──
    if (endpoint === 'shorten') {
      const { url } = params;
      if (!url) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing url' }) };
      const encoded = encodeURIComponent(url);
      const data = await httpGet(`https://is.gd/create.php?format=simple&url=${encoded}`);
      const short = data.trim();
      if (!short.startsWith('http')) throw new Error('Shortener returned: ' + short);
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'text/plain' }, body: short };
    }

    // ── Geocoding ──
    if (endpoint === 'geocode') {
      const qs = new URLSearchParams(params).toString();
      const data = await httpGet(`https://maps.googleapis.com/maps/api/geocode/json?${qs}`);
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: data };
    }

    // ── Text Search (Places API New) ──
    if (endpoint === 'textsearch') {
      const { key, query, location, radius, maxResultCount } = params;
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
            radius: parseFloat(radius || '10000')
          }
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
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: data };
    }

    // ── Place Details (Places API New) ──
    if (endpoint === 'details') {
      const { key, place_id } = params;
      const data = await httpGet(
        `https://places.googleapis.com/v1/places/${place_id}`,
        {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'regularOpeningHours,websiteUri,nationalPhoneNumber,reviews,priceLevel',
        }
      );
      return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: data };
    }

    // ── Photo ──
    if (endpoint === 'photo') {
      const { key, photo_name, maxwidth } = params;
      const url = `https://places.googleapis.com/v1/${photo_name}/media?maxWidthPx=${maxwidth || 640}&key=${key}&skipHttpRedirect=false`;
      return { statusCode: 302, headers: { ...CORS, Location: url }, body: '' };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Unknown endpoint: ' + endpoint }) };

  } catch (err) {
    console.error('Proxy error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};

function httpGet(url, extraHeaders) {
  extraHeaders = extraHeaders || {};
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    https.get({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: Object.assign({ 'Accept': 'application/json' }, extraHeaders)
    }, (res) => {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    }).on('error', reject);
  });
}

function httpPost(url, body, extraHeaders) {
  extraHeaders = extraHeaders || {};
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'Accept': 'application/json',
      }, extraHeaders)
    }, (res) => {
      let data = '';
      res.on('data', function(c) { data += c; });
      res.on('end', function() { resolve(data); });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
