import express from 'express';

import { config } from './config.js';

const app = express();

app.use((request, response, next) => {
  response.setHeader('Access-Control-Allow-Origin', config.clientOrigin);
  next();
});

app.get('/api/health', (request, response) => {
  response.json({ message: 'The demo API is healthy.' });
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Demo API listening on http://127.0.0.1:${config.port}`);
});
