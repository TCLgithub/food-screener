exports.handler = async () => {
  const keys = {
    google:   process.env.GOOGLE_PLACES_KEY  || '',
    gemini:   process.env.GEMINI_KEY          || '',
    deepseek: process.env.DEEPSEEK_KEY        || '',
    claude:   process.env.CLAUDE_KEY          || '',
    openai:   process.env.OPENAI_KEY          || '',
  };
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/javascript' },
    body: `window.FOOD_SCREENER_KEYS = ${JSON.stringify(keys)};`,
  };
};
