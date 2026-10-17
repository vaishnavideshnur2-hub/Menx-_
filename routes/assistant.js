const express = require('express');
const db = require('../db');

const router = express.Router();
const MAX_MESSAGES = 8;
const MAX_MESSAGE_LENGTH = 800;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestCounts = new Map();

function isRateLimited(ipAddress) {
  const now = Date.now();
  let bucket = requestCounts.get(ipAddress);
  if (!bucket || now - bucket.startedAt >= RATE_LIMIT_WINDOW_MS) {
    bucket = { startedAt: now, count: 0 };
    requestCounts.set(ipAddress, bucket);
  }

  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) return true;
  bucket.count++;

  if (requestCounts.size > 1000) {
    for (const [ip, entry] of requestCounts) {
      if (now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) requestCounts.delete(ip);
    }
  }
  return false;
}

function localReply(message, products) {
  const query = message.toLowerCase();
  const budgetMatch = query.match(/(?:under|below|within|budget(?: of)?|up to|upto|₹|rs\.?)\s*₹?\s*([\d,]+)/i);
  const budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, '')) : null;
  const categories = [
    { pattern: /\b(tee|tees|t-shirt|t-shirts|tshirt|tshirts)\b/, name: 'T-Shirts' },
    { pattern: /\b(shirt|shirts|linen|oxford)\b/, name: 'Shirts' },
    { pattern: /\b(jean|jeans|denim|trouser|trousers)\b/, name: 'Jeans' },
    { pattern: /\b(hoodie|hoodies|sweatshirt|sweatshirts)\b/, name: 'Hoodies' },
    { pattern: /\b(jacket|jackets|bomber)\b/, name: 'Jackets' },
    { pattern: /\b(cap|caps|tote|totes|accessories|accessory)\b/, name: 'Accessories' },
  ].filter(category => category.pattern.test(query));
  const requestedProducts = query.split(/\s+/).filter(word =>
    word.length >= 4 && !/^(what|with|from|have|show|find|want|need|under|below|within|budget|recommend|suggest|looking|please|cheap|under|around|style|outfit|weekend|wear|size|sizes|price|prices|available|stock|there|this|that|some|best|good|mens|men|make|build|₹|rs)$/i.test(word)
  );
  const available = products.filter(product => product.stock > 0);
  let matches = available.filter(product =>
    (!categories.length || categories.some(category => product.category.toLowerCase() === category.name.toLowerCase())) &&
    (!budget || product.price <= budget)
  );

  if (requestedProducts.length) {
    const textMatches = matches.filter(product => requestedProducts.some(word =>
      `${product.name} ${product.description} ${product.category}`.toLowerCase().includes(word)
    ));
    if (textMatches.length) matches = textMatches;
  }

  if (/\b(size|sizes|fit)\b/.test(query)) {
    const sizeProducts = matches.length ? matches.slice(0, 4) : available.slice(0, 4);
    if (sizeProducts.length) {
      return `Available sizes in the catalog:\n${sizeProducts.map(product =>
        `• ${product.name}: ${product.sizes.join(', ')}`
      ).join('\n')}\n\nFor the best fit, check the garment description and choose your usual size.`;
    }
  }

  if (/\b(shipping|delivery|ship|deliver|payment|pay|cash on delivery|cod)\b/.test(query)) {
    return 'MENX currently accepts Cash on Delivery. Shipping is free on orders of ₹1,999 or more; otherwise it is ₹99. Delivery timing is not listed, so please use the contact details you provide at checkout for order updates.';
  }

  const greeting = /\b(hello|hi|hey|good morning|good evening)\b/.test(query);
  if (!matches.length) {
    const alternatives = available
      .filter(product => !budget || product.price <= budget)
      .slice(0, 3);
    const qualifier = budget ? ` under ₹${budget.toLocaleString('en-IN')}` : '';
    if (!alternatives.length) {
      return `I couldn't find an in-stock match${qualifier}. Try a higher budget or ask about tees, shirts, jeans, hoodies, jackets, and accessories.`;
    }
    return `I couldn't find an in-stock${categories.length ? ` ${categories.map(category => category.name.toLowerCase()).join(' or ')}` : ''} match${qualifier}. Here are a few other in-stock picks${qualifier}:\n${alternatives.map(product =>
      `• ${product.name} — ₹${product.price.toLocaleString('en-IN')} · sizes ${product.sizes.join(', ')}`
    ).join('\n')}`;
  }

  const suggestions = matches.slice(0, 3);
  const intro = greeting
    ? 'Hey! I can help with MENX styles, sizes, and prices. Here are a few in-stock favorites:'
    : categories.length
      ? `Here are in-stock ${categories.map(category => category.name.toLowerCase()).join(' and ')}${budget ? ` under ₹${budget.toLocaleString('en-IN')}` : ''}:`
      : `Here are a few in-stock picks${budget ? ` under ₹${budget.toLocaleString('en-IN')}` : ''}:`;

  return `${intro}\n${suggestions.map(product =>
    `• ${product.name} — ₹${product.price.toLocaleString('en-IN')} · sizes ${product.sizes.join(', ')}\n  ${product.description}`
  ).join('\n')}\n\nAsk me about a category, budget, size, or delivery.`;
}

function sendStreamEvent(res, event) {
  if (!res.writableEnded && !res.destroyed) {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

function upstreamError(response) {
  if (response.status === 401 || response.status === 403) {
    return { status: 502, message: 'Gemini rejected the API key. Check GEMINI_API_KEY in the server environment.' };
  }
  if (response.status === 429) {
    return { status: 503, message: 'Gemini is temporarily rate limited. Please try again shortly.' };
  }
  console.error(`Gemini API returned HTTP ${response.status}.`);
  return { status: 502, message: 'The shopping assistant is temporarily unavailable. Please try again.' };
}

function sendJsonError(res, error) {
  if (res.headersSent) {
    sendStreamEvent(res, { type: 'error', error: error.message });
    return;
  }
  res.status(error.status).json({ error: error.message });
}

async function streamReply(req, res, { apiKey, model, messages, systemMessage, catalog }) {
  if (!apiKey) {
    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    sendStreamEvent(res, { type: 'meta', provider: 'catalog' });
    sendStreamEvent(res, {
      type: 'delta',
      text: localReply(messages[messages.length - 1].content, catalog),
    });
    sendStreamEvent(res, { type: 'done', provider: 'catalog' });
    return res.end();
  }

  const disconnectController = new AbortController();
  const abortOnDisconnect = () => {
    if (!res.writableEnded) disconnectController.abort();
  };
  res.once('close', abortOnDisconnect);

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemMessage }, ...messages],
          max_tokens: 350,
          reasoning_effort: 'low',
          stream: true,
        }),
        signal: AbortSignal.any([
          disconnectController.signal,
          AbortSignal.timeout(45000),
        ]),
      },
    );

    if (!response.ok) return sendJsonError(res, upstreamError(response));
    if (!response.body) {
      return sendJsonError(res, {
        status: 502,
        message: 'Gemini returned an empty response stream. Please try again.',
      });
    }

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    sendStreamEvent(res, { type: 'meta', provider: 'gemini', model });

    const decoder = new TextDecoder();
    let buffer = '';
    let reply = '';
    let streamFinished = false;

    function processBlock(block) {
      const data = block
        .split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart())
        .join('\n');
      if (!data || data === '[DONE]') {
        if (data === '[DONE]') streamFinished = true;
        return;
      }

      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        throw new Error('Gemini returned an invalid streaming response.');
      }

      const choice = chunk.choices?.[0];
      if (choice?.finish_reason === 'error') {
        throw new Error('Gemini could not complete the response. Please try again.');
      }

      const text = choice?.delta?.content;
      if (typeof text === 'string' && text) {
        reply += text;
        sendStreamEvent(res, { type: 'delta', text });
      }
    }

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        processBlock(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
      }
      if (disconnectController.signal.aborted) return;
    }

    buffer += decoder.decode();
    if (buffer.trim()) processBlock(buffer);
    if (!reply.trim()) {
      throw new Error('Gemini returned an empty reply. Please try again.');
    }

    sendStreamEvent(res, { type: 'done', provider: 'gemini', model });
    res.end();
  } catch (error) {
    if (disconnectController.signal.aborted || res.destroyed) return;
    const isTimeout = error.name === 'TimeoutError' || error.name === 'AbortError';
    if (error instanceof TypeError) {
      console.error('Unable to reach the Gemini API:', error.message);
    }
    sendJsonError(res, {
      status: isTimeout ? 504 : error instanceof TypeError ? 502 : 502,
      message: isTimeout
        ? 'Gemini took too long to respond. Please try again.'
        : error instanceof TypeError
          ? 'Unable to reach Gemini. Check the server connection and try again.'
          : error.message,
    });
    if (res.headersSent && !res.destroyed) res.end();
  } finally {
    res.off('close', abortOnDisconnect);
  }
}

router.post('/', async (req, res, next) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

  const { messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) {
    return res.status(400).json({ error: `Send between 1 and ${MAX_MESSAGES} chat messages.` });
  }
  if (messages.some(message =>
    !message ||
    !['user', 'assistant'].includes(message.role) ||
    typeof message.content !== 'string' ||
    message.content.trim().length === 0 ||
    message.content.length > MAX_MESSAGE_LENGTH
  ) || messages[messages.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Check your message and try again.' });
  }
  if (isRateLimited(req.ip)) {
    return res.status(429).json({ error: 'You have reached the assistant message limit. Please try again in a few minutes.' });
  }
  const products = db.prepare(
    'SELECT name, description, price, category, sizes, stock FROM products WHERE active = 1 ORDER BY featured DESC, name LIMIT 60'
  ).all();
  const catalog = products.map(product => ({
    ...product,
    sizes: product.sizes.split(',').map(size => size.trim()).filter(Boolean),
  }));
  const systemMessage = [
    'You are the friendly MENX menswear shopping and styling assistant.',
    'Help customers discover clothes, coordinate outfits, and choose among the current catalog.',
    'Only recommend items in this catalog. Use the listed prices in Indian rupees, available sizes, and stock.',
    'Never claim an item or size is in stock when the catalog says otherwise. If stock is zero, say it is sold out.',
    'Do not invent product details, policies, delivery promises, or discounts. Keep answers helpful and concise.',
    `Current MENX catalog (JSON): ${JSON.stringify(catalog)}`,
  ].join('\n');

  if (req.accepts('text/event-stream')) {
    return streamReply(req, res, { apiKey, model, messages, systemMessage, catalog });
  }
  if (!apiKey) {
    return res.json({
      reply: localReply(messages[messages.length - 1].content, catalog),
      provider: 'catalog',
    });
  }

  try {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemMessage }, ...messages],
        max_tokens: 350,
        reasoning_effort: 'low',
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      const error = upstreamError(response);
      return res.status(error.status).json({ error: error.message });
    }
    const result = await response.json();
    const reply = result.choices?.[0]?.message?.content;
    if (typeof reply !== 'string' || !reply.trim()) {
      return res.status(502).json({ error: 'The shopping assistant returned an empty reply. Please try again.' });
    }
    res.json({ reply: reply.trim(), provider: 'gemini', model });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return res.status(504).json({ error: 'Gemini took too long to respond. Please try again.' });
    }
    if (error instanceof TypeError) {
      console.error('Unable to reach the Gemini API:', error.message);
      return res.status(502).json({ error: 'Unable to reach Gemini. Check the server connection and try again.' });
    }
    next(error);
  }
});

module.exports = router;
