require('dotenv').config();
const { Telegraf, session } = require('telegraf');

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

if (!BOT_TOKEN || !OPENAI_API_KEY || !OPENAI_API_URL) {
  console.error('Необходимо указать BOT_TOKEN, OPENAI_API_KEY и OPENAI_API_URL в файле .env');
  process.exit(1);
}

console.log('BOT_TOKEN:', BOT_TOKEN);
console.log('OPENAI_API_KEY:', OPENAI_API_KEY);
console.log('OPENAI_API_URL:', OPENAI_API_URL);

const bot = new Telegraf(BOT_TOKEN);

// Добавляем поддержку сессий
bot.use(session());

const instructions = `Предоставляет мотивационную поддержку и позитивное подкрепление.
Этот GPT будет служить мотивационным коучем, предлагая поддержку, советы и позитивное подкрепление пользователям.
 Он поможет пользователям сохранять фокус, преодолевать препятствия и поддерживать позитивный настрой. 
 GPT будет придумывать мотивационные высказывания и делиться ими с пользователями, чтобы вдохновить их на действия и улучшить их настроение. Он должен общаться весело, мотивированно и постоянно подчеркивать поддержку пользователей. Коуч будет использовать имя пользователя для создания более личного опыта, предлагать конкретные действия и упражнения для повышения мотивации,
 а также включать известные мотивационные цитаты и примеры из жизни известных людей для вдохновения.
`;

async function generateResponse(prompt, sessionMessages) {
  const fetch = (await import('node-fetch')).default;
  try {
    const messages = [
      { role: 'system', content: instructions },
      ...sessionMessages,
      { role: 'user', content: prompt }
    ];
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Указываем модель здесь!
        messages: messages,
        max_tokens: 1000,
        temperature: 0
      })
    });

    const data = await response.json();
    console.log('OpenAI API response:', data);

    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Пустой ответ от OpenAI API');
    }
  } catch (error) {
    console.error('Ошибка при взаимодействии с OpenAI API:', error);
    throw new Error('Ошибка при обработке запроса к OpenAI API.');
  }
}

// Добавляем объект для отслеживания обработанных сообщений
const processedMessages = new Set();

bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  const messageId = ctx.message.message_id;

  console.log('Получено сообщение:', userMessage, 'ID сообщения:', messageId);

  // Проверяем, обрабатывалось ли сообщение ранее
  if (processedMessages.has(messageId)) {
    console.log('Сообщение уже обработано:', messageId);
    return;
  }

  // Добавляем ID сообщения в обработанные
  processedMessages.add(messageId);

  // Инициализируем сессию, если она отсутствует
  if (!ctx.session) {
    ctx.session = {};
  }
  if (!ctx.session.messages) {
    ctx.session.messages = [];
  }

  try {
    const assistantResponse = await generateResponse(userMessage, ctx.session.messages);
    console.log('Ответ помощника:', assistantResponse);
    ctx.reply(assistantResponse);

    // Сохраняем сообщение пользователя и ответ в сессию
    ctx.session.messages.push({ role: 'user', content: userMessage });
    ctx.session.messages.push({ role: 'assistant', content: assistantResponse });
  } catch (error) {
    console.error('Ошибка при обработке вашего запроса:', error);
    ctx.reply('Произошла ошибка при обработке вашего запроса.');
  }
});

bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка запуска бота:', error);
});
