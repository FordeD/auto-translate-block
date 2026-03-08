# Translate Proxy Server

Локальный Node.js прокси-сервер для Google Translate с HMAC-аутентификацией.

## Возможности

- **HMAC-SHA256 подпись**: Все запросы подписываются секретным ключом
- **Защита от replay-атак**: Уникальный nonce + timestamp (5 минут)
- **CORS**: Принимает запросы только от Chrome extension
- **Библиотека**: @iamtraction/google-translate

## Установка

```bash
npm install
```

## Использование

```bash
npm start
```

Сервер запустится на `http://localhost:3000`

## API

### POST /translate

**Требуется аутентификация**: Да (HMAC-SHA256)

**Заголовки**:
- `X-Signature`: HMAC-SHA256 подпись запроса
- `X-Timestamp`: Unix timestamp в миллисекундах
- `X-Nonce`: Уникальное случайное значение (32 hex символа)

**Тело запроса**:
```json
{
  "text": "Hello World",
  "from": "en",
  "to": "ru"
}
```

**Ответ**:
```json
{
  "success": true,
  "translatedText": "Привет Мир",
  "original": "Hello World"
}
```

### Генерация подписи

Подпись генерируется из строки:

```
{METHOD}:{PATH}:{TIMESTAMP}:{NONCE}:{JSON_BODY}
```

Пример:
```
POST:/translate:1709856000000:a1b2c3d4e5f6...:{"text":"Hello","from":"en","to":"ru"}
```

Используется HMAC-SHA256 с секретным ключом:
```
auto-translate-block-secret-key-2024-secure-token
```

### GET /health

Проверка работоспособности (без аутентификации).

**Ответ**:
```json
{
  "status": "ok",
  "port": 3000
}
```

## Настройки безопасности

### Секретный ключ

Хранится в `server.js` и `utils/auth.js` расширения.

**Для смены секрета**:
1. Измените `SHARED_SECRET` в `server.js`
2. Измените `SHARED_SECRET` в `background/background.js`
3. Перезапустите сервер
4. Перезагрузите расширение

### Время жизни токена

По умолчанию: 5 минут (300000 мс)

Для изменения измените `TOKEN_VALIDITY_MS` в `server.js`.

### Защита от replay-атак

Использованные токены хранятся в памяти и очищаются каждые 10 минут.

## Поддерживаемые языки

- en — English
- ru — Русский
- uk — Українська
- de — Deutsch
- fr — Français
- es — Español
- it — Italiano
- pt — Português
- pl — Polski
- tr — Türkçe
- zh — 中文
- ja — 日本語
- ko — 한국어
- ar — العربية
- hi — हिन्दी

## Библиотека

Использует [@iamtraction/google-translate](https://www.npmjs.com/package/@iamtraction/google-translate) — неофициальный API Google Translate.

## Лицензия

MIT License

