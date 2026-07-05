const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id) {
    return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'Missing id' };
  }

  try {
    const store = getStore('share-links');
    const raw = await store.get(id);
    if (!raw) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><p>Results not found or expired. <a href="/">Back to app</a></p></body></html>',
      };
    }

    const data = JSON.parse(raw);

    // Fetch results.html from the deployed site (always up-to-date)
    const siteUrl = process.env.URL || 'http://localhost:8888';
    const resp = await fetch(`${siteUrl}/results.html`);
    const html = await resp.text();

    const injection = `<script>window.__SHARE_DATA__ = ${JSON.stringify(data)};</script>`;
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: html.replace('</head>', injection + '</head>'),
    };
  } catch (err) {
    console.error('results error:', err);
    return { statusCode: 500, body: 'Server error: ' + err.message };
  }
};
