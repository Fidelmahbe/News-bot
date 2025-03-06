const axios = require("axios");
const { Telegraf } = require("telegraf");

// Cấu hình Telegram
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;
const bot = new Telegraf(TELEGRAM_TOKEN);

// API cấu hình
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_URL = `https://newsapi.org/v2/everything?q=cryptocurrency&apiKey=${NEWS_API_KEY}`;
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1";

// Lấy tin tức
async function fetchCryptoNews() {
  try {
    const response = await axios.get(NEWS_API_URL);
    return response.data.articles.slice(0, 6);
  } catch (error) {
    console.error("Error fetching news:", error);
    return [];
  }
}

// Lấy xu hướng
async function fetchMarketTrend() {
  try {
    const response = await axios.get(COINGECKO_API_URL);
    const prices = response.data.prices;
    const latestPrice = prices[prices.length - 1][1];
    const previousPrice = prices[0][1];
    return {
      direction: latestPrice > previousPrice ? "Tăng" : "Giảm",
      latestPrice,
      percentageChange: ((latestPrice - previousPrice) / previousPrice) * 100,
    };
  } catch (error) {
    console.error("Error fetching trend:", error);
    return null;
  }
}

// Gửi tin tức
async function sendNews() {
  const articles = await fetchCryptoNews();
  if (!articles.length) {
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL, "Không thể lấy tin tức.");
    return;
  }

  for (const article of articles) {
    const updateTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
    const message = `- **Update time**: ${updateTime}\n- **Headline**: ${article.title}\n- **Summary**: ${article.description || "Không có mô tả."}`;
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: "Markdown" });
  }
}

// Gửi xu hướng
async function sendTrend() {
  const trend = await fetchMarketTrend();
  if (!trend) {
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL, "Không thể phân tích xu hướng.");
    return;
  }

  const updateTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const message = `- **Update time**: ${updateTime}\n- **Trend**: Giá Bitcoin đang ${trend.direction}\n- **Analysis**: Giá hiện tại: $${trend.latestPrice.toFixed(2)}, thay đổi: ${trend.percentageChange.toFixed(2)}%`;
  await bot.telegram.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: "Markdown" });
}

// Chạy tùy theo tham số (news hoặc trend)
const task = process.argv[2];
if (task === "news") sendNews();
else if (task === "trend") sendTrend();