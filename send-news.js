const axios = require("axios");
const { Telegraf } = require("telegraf");
const { parseStringPromise } = require("xml2js");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Lấy secrets từ biến môi trường
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHANNEL = process.env.TELEGRAM_CHANNEL;
const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const bot = new Telegraf(TELEGRAM_TOKEN);

// Khởi tạo Gemini API
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// API URLs
const NEWS_API_URL = `https://newsapi.org/v2/everything?q=cryptocurrency&apiKey=${NEWS_API_KEY}&pageSize=10`;
const NEWSDATA_API_URL = `https://api.newsdata.io/v2/news?apikey=${NEWSDATA_API_KEY}&q=cryptocurrency&language=en&limit=10`;
const COINDESK_RSS_URL = "https://www.coindesk.com/arc/outboundfeeds/rss";
const CRYPTO_NEWS_RSS_URL = "https://crypto.news/feed/";
const COINTELEGRAPH_RSS_URL = "https://cointelegraph.com/rss";

// Lấy tin tức từ NewsAPI
async function fetchNewsFromNewsAPI() {
  try {
    const response = await axios.get(NEWS_API_URL);
    return response.data.articles
      .map(article => ({
        title: article.title,
        description: article.description || article.content,
        image_url: article.urlToImage,
        source_id: article.source.name,
      }))
      .filter(article => article.description && article.description.length > 50);
  } catch (error) {
    console.error("Error fetching NewsAPI:", error.message);
    return [];
  }
}

// Lấy tin tức từ newsdata.io
async function fetchNewsFromNewsData() {
  try {
    const response = await axios.get(NEWSDATA_API_URL);
    return response.data.results
      .map(article => ({
        title: article.title,
        description: article.description,
        image_url: article.image_url,
        source_id: article.source_id,
      }))
      .filter(article => article.description && article.description.length > 50);
  } catch (error) {
    console.error("Error fetching newsdata.io:", error.message);
    return [];
  }
}

// Lấy tin tức từ CoinDesk RSS
async function fetchNewsFromCoinDesk() {
  try {
    const response = await axios.get(COINDESK_RSS_URL);
    const xml = response.data;
    const result = await parseStringPromise(xml);
    const items = result.rss.channel[0].item || [];
    return items
      .map(item => ({
        title: item.title[0],
        description: item.description[0],
        image_url: item["media:thumbnail"]?.[0]?.$.url || null,
        source_id: "CoinDesk",
      }))
      .filter(article => article.description && article.description.length > 50);
  } catch (error) {
    console.error("Error fetching CoinDesk RSS:", error.message);
    return [];
  }
}

// Lấy tin tức từ Crypto News RSS
async function fetchNewsFromCryptoNews() {
  try {
    const response = await axios.get(CRYPTO_NEWS_RSS_URL);
    const xml = response.data;
    const result = await parseStringPromise(xml);
    const items = result.rss.channel[0].item || [];
    return items
      .map(item => ({
        title: item.title[0],
        description: item.description[0],
        image_url: item["media:content"]?.[0]?.$.url || null,
        source_id: "Crypto News",
      }))
      .filter(article => article.description && article.description.length > 50);
  } catch (error) {
    console.error("Error fetching Crypto News RSS:", error.message);
    return [];
  }
}

// Lấy tin tức từ Cointelegraph RSS
async function fetchNewsFromCointelegraph() {
  try {
    const response = await axios.get(COINTELEGRAPH_RSS_URL);
    const xml = response.data;
    const result = await parseStringPromise(xml);
    const items = result.rss.channel[0].item || [];
    return items
      .map(item => ({
        title: item.title[0],
        description: item.description[0],
        image_url: item["media:thumbnail"]?.[0]?.$.url || null,
        source_id: "Cointelegraph",
      }))
      .filter(article => article.description && article.description.length > 50);
  } catch (error) {
    console.error("Error fetching Cointelegraph RSS:", error.message);
    return [];
  }
}

// Lấy tin tức với chiến lược fallback và chọn 1 tin hấp dẫn nhất
async function fetchCryptoNews() {
  let articles = await fetchNewsFromNewsAPI();
  if (articles.length) return [articles.reduce((max, current) => (current.description.length > max.description.length ? current : max), articles[0])];

  articles = await fetchNewsFromNewsData();
  if (articles.length) return [articles.reduce((max, current) => (current.description.length > max.description.length ? current : max), articles[0])];

  articles = await fetchNewsFromCoinDesk();
  if (articles.length) return [articles.reduce((max, current) => (current.description.length > max.description.length ? current : max), articles[0])];

  articles = await fetchNewsFromCryptoNews();
  if (articles.length) return [articles.reduce((max, current) => (current.description.length > max.description.length ? current : max), articles[0])];

  articles = await fetchNewsFromCointelegraph();
  if (articles.length) return [articles.reduce((max, current) => (current.description.length > max.description.length ? current : max), articles[0])];

  return [];
}

// Sử dụng Gemini API để tóm tắt và định dạng
async function processWithAI(article) {
  const prompt = `
  Tóm tắt bài tin tức sau một cách ngắn gọn, hấp dẫn và tự nhiên bằng tiếng Việt:
  Tiêu đề: ${article.title || "Không có tiêu đề"}
  Mô tả: ${article.description || "Không có mô tả"}

  Định dạng đầu ra:
  - Tiêu đề: [Tiêu đề gốc]
  - Tóm tắt: [Tóm tắt ngắn gọn, tối đa 2 câu, nhấn mạnh điểm nổi bật]
  - Nguồn: [source_id]
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    const [titleLine, summaryLine, sourceLine] = response.split("\n").map(line => line.replace(/^- /, "").trim());

    return {
      title: titleLine.replace("Tiêu đề: ", "").trim(),
      summary: summaryLine.replace("Tóm tắt: ", "").trim(),
      source: sourceLine.replace("Nguồn: ", "").trim() || article.source_id || "Nguồn không rõ",
    };
  } catch (error) {
    console.error("Error with Gemini AI:", error.message);
    return {
      title: article.title || "Không có tiêu đề",
      summary: article.description || "Không có mô tả",
      source: article.source_id || "Nguồn không rõ",
    };
  }
}

// Gửi 1 tin với ảnh
async function sendNews() {
  const articles = await fetchCryptoNews();
  if (!articles.length) {
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL, "Không thể lấy tin tức từ bất kỳ nguồn nào.");
    return;
  }

  const article = articles[0]; // Chỉ lấy 1 tin hấp dẫn nhất
  const updateTime = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
  const processed = await processWithAI(article);

  // Định dạng tin nhắn với HTML
  const defaultImageUrl = "https://ik.imagekit.io/s0jjvjav7h/2151072976.jpg?updatedAt=1741248488016";
  const imageUrl = article.image_url || defaultImageUrl;

  const message = `
<b>RadioSignal News Day - ${updateTime}</b>
<b>📊:</b> ${processed.title}
<b>Description:</b> ${processed.summary}
<b>Source:</b> ${processed.source}

<a href="${imageUrl}">Ảnh minh họa</a>`;

  try {
    if (article.image_url) {
      await bot.telegram.sendPhoto(TELEGRAM_CHANNEL, article.image_url, {
        caption: message,
        parse_mode: "HTML",
      });
    } else {
      await bot.telegram.sendMessage(TELEGRAM_CHANNEL, message, { parse_mode: "HTML" });
    }
  } catch (error) {
    console.error("Error sending message:", error.message);
    await bot.telegram.sendMessage(TELEGRAM_CHANNEL, "Lỗi khi gửi tin tức. Vui lòng kiểm tra log.");
  }
}

// Chạy chức năng
const task = process.argv[2];
if (task === "news") sendNews();
else console.log("Vui lòng chọn 'news'");