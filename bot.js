require('dotenv').config();
const { Telegraf, session, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');

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
        model: 'gpt-4', // Указываем модель здесь!
        messages: messages,
        max_tokens: 1000,
        temperature: 0.7
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

// Статусы для управления процессом сбора данных
const steps = {
  ASK_NAME: 'ASK_NAME',
  ASK_PHONE: 'ASK_PHONE',
  ASK_ADDRESS: 'ASK_ADDRESS',
  DONE: 'DONE'
};

function saveUserData(userData) {
  const filePath = path.join(__dirname, 'users.json');
  let users = [];

  // Читаем существующий файл users.json
  if (fs.existsSync(filePath)) {
    const fileData = fs.readFileSync(filePath);
    users = JSON.parse(fileData);
  }

  // Добавляем новые данные пользователя
  users.push(userData);

  // Сохраняем обновленный массив в файл users.json
  fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
}

// Команда /start для начала диалога и показа кнопки "Сделать заказ"
bot.start((ctx) => {
  ctx.reply('Добро пожаловать! Начните общение или нажмите на кнопку ниже, чтобы сделать заказ.', Markup.inlineKeyboard([
    Markup.button.callback('Сделать заказ', 'start_order')
  ]));
});

// Обработчик нажатия кнопки "Сделать заказ"
bot.action('start_order', async (ctx) => {
  ctx.session.step = steps.ASK_NAME;
  await ctx.reply('Как вас зовут?');
});

// Обработка текстовых сообщений для сбора данных и взаимодействия с OpenAI
bot.on('text', async (ctx) => {
  const userMessage = ctx.message.text;
  const messageId = ctx.message.message_id;
  const chatId = ctx.chat.id;

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
    ctx.session = { messages: [] };
  }

  // Проверка, находится ли пользователь в процессе заполнения заказа
  if (ctx.session.step) {
    const session = ctx.session;

    try {
      switch (session.step) {
        case steps.ASK_NAME:
          if (userMessage.split(' ').length >= 2) {
            session.data = { name: userMessage };
            session.step = steps.ASK_PHONE;
            await ctx.reply('Отлично! Теперь введите ваш номер телефона.');
          } else {
            await ctx.reply('Пожалуйста, введите ваше полное имя (имя и фамилия).');
          }
          break;
        case steps.ASK_PHONE:
          if (/^\+?[0-9\s\-]+$/.test(userMessage)) {
            session.data.phone = userMessage;
            session.step = steps.ASK_ADDRESS;
            await ctx.reply('Спасибо! Теперь введите ваш адрес.');
          } else {
            await ctx.reply('Пожалуйста, введите корректный номер телефона.');
          }
          break;
        case steps.ASK_ADDRESS:
          if (userMessage.split(' ').length >= 2) {
            session.data.address = userMessage;
            session.step = steps.DONE;
            await ctx.reply(`Спасибо за информацию! Вот что мы собрали: \nФИО: ${session.data.name}\nНомер телефона: ${session.data.phone}\nАдрес: ${session.data.address}`);

            // Сохранение данных в JSON файл
            console.log('Сохранение данных пользователя:', session.data);
            saveUserData({
              chatId: chatId.toString(),
              name: session.data.name,
              phone: session.data.phone,
              address: session.data.address
            });

            // Сброс сессии
            session.step = null;
          } else {
            await ctx.reply('Пожалуйста, введите корректный адрес.');
          }
          break;
        case steps.DONE:
          await ctx.reply('Вы уже предоставили всю необходимую информацию. Спасибо!');
          break;
        default:
          await ctx.reply('Что-то пошло не так. Попробуйте начать сначала с команды /start.');
          session.step = null;
      }
    } catch (error) {
      console.error('Ошибка при обработке шага:', error);
      await ctx.reply('Произошла ошибка при обработке ваших данных. Попробуйте снова.');
    }
  } else {
    // Генерация ответа через OpenAI
    ctx.session.messages.push({ role: 'user', content: userMessage });

    try {
      const assistantResponse = await generateResponse(userMessage, ctx.session.messages);
      console.log('Ответ помощника:', assistantResponse);

      ctx.session.messages.push({ role: 'assistant', content: assistantResponse });
      await ctx.reply(assistantResponse, Markup.inlineKeyboard([
        Markup.button.callback('Сделать заказ', 'start_order')
      ]));
    } catch (error) {
      console.error('Ошибка при обработке запроса к OpenAI:', error);
      await ctx.reply('Произошла ошибка при обработке вашего запроса.');
    }
  }
});

bot.launch().then(() => {
  console.log('Бот запущен');
}).catch((error) => {
  console.error('Ошибка запуска бота:', error);
});
