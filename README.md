# Auto Translate Block

Chrome extension для автоматического перевода текста внутри выбранных HTML-блоков.

## Структура проекта

```
auto-translate-block/
├── extension/     # Chrome extension (client)
├── server/        # Node.js proxy server
├── README.md      # Этот файл
└── .gitignore     # Git ignore rules
```

## Быстрый старт

### 1. Установка сервера

```bash
cd server
npm install
```

### 2. Запуск сервера

```bash
npm start
```

### 3. Установка расширения

1. Откройте `chrome://extensions/`
2. Включите "Режим разработчика"
3. Нажмите "Загрузить распакованное"
4. Выберите папку `extension`

## Документация

- [README расширения](./extension/README.md)
- [README сервера](./server/README.md)

## Возможности

- ✅ Выбор HTML-элемента для перевода
- ✅ Визуальная подсветка при выборе
- ✅ Локальный прокси-сервер (без CORS и капчи)
- ✅ HMAC-SHA256 аутентификация
- ✅ Умное разбиение текста
- ✅ Локализация (EN/RU)
- ✅ Настройки интерфейса

## Требования

- Chrome 88+
- Node.js 14+

## Лицензия

MIT

