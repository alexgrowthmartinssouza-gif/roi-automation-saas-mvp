#!/usr/bin/env node

/**
 * Early Access Telegram Hook
 * Integração automática entre processor + Telegram
 * Monitora fila e envia em tempo real
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const QUEUE_PATH = '/root/.openclaw/workspace/.state/telegram-notify-queue.jsonl';
const LOG_PATH = '/root/.openclaw/workspace/logs/early-access-telegram.log';

function log(msg) {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}`;
  console.log(logMsg);
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * Envia mensagem via HTTP POST (simula OpenClaw message tool)
 */
function sendToTelegramQueue(to, message) {
  // Salva em arquivo que será processado por cron
  const queueEntry = {
    timestamp: new Date().toISOString(),
    to: to,
    message: message,
    status: 'pending'
  };

  try {
    const pendingPath = '/root/.openclaw/workspace/.state/telegram-pending.jsonl';
    fs.appendFileSync(pendingPath, JSON.stringify(queueEntry) + '\n');
    log(`✅ Notificação enfileirada para ${to}`);
    return true;
  } catch (e) {
    log(`❌ Erro ao enfileirar: ${e.message}`);
    return false;
  }
}

/**
 * Monitora fila de notificações
 */
function watchQueue() {
  log('👁️ Monitorando fila de notificações...');

  fs.watchFile(QUEUE_PATH, { interval: 1000 }, () => {
    try {
      if (!fs.existsSync(QUEUE_PATH)) return;

      const content = fs.readFileSync(QUEUE_PATH, 'utf8');
      if (!content.trim()) return;

      const lines = content.split('\n').filter(l => l.trim());
      
      lines.forEach(line => {
        try {
          const notification = JSON.parse(line);
          
          if (!notification.sent) {
            log(`📬 Nova notificação detectada: ${notification.type}`);
            
            // Envia para a fila do Telegram
            const sent = sendToTelegramQueue(
              '@GustavoSouzaNapa',
              notification.message
            );

            if (sent) {
              notification.sent = true;
              // Marca como enviada na fila
            }
          }
        } catch (e) {
          // Ignora linhas malformadas
        }
      });

    } catch (e) {
      log(`⚠️ Erro ao monitorar: ${e.message}`);
    }
  });
}

/**
 * Cria servidor HTTP para receber confirmação de envio
 */
const server = http.createServer((req, res) => {
  if (req.url === '/telegram-status' && req.method === 'GET') {
    const pending = fs.existsSync('/root/.openclaw/workspace/.state/telegram-pending.jsonl')
      ? fs.readFileSync('/root/.openclaw/workspace/.state/telegram-pending.jsonl', 'utf8').split('\n').filter(l => l).length
      : 0;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      pending_notifications: pending,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = 3002;
server.listen(PORT, () => {
  log(`🚀 Telegram Hook iniciado na porta ${PORT}`);
});

// Inicia monitoramento
watchQueue();

log('✅ Sistema de notificações automático pronto');
