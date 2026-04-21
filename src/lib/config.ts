export const config = {
  // API key for cockpit-agent to authenticate status pushes
  apiKey: process.env.COCKPIT_API_KEY || "dev-key-change-me",

  // Telegram bot
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramChatId: process.env.TELEGRAM_CHAT_ID || "",

  // Weather (OpenWeatherMap)
  weatherApiKey: process.env.OPENWEATHER_API_KEY || "",
  weatherCity: "Antwerp,BE",

  // Sites to monitor for uptime
  // paths: additional paths to check beyond /. Defaults to ["/contact/"] if omitted.
  uptimeSites: [
    { url: "https://bookyourbox.com", name: "BookYourBox", check_interval_seconds: 300 },
    { url: "https://plaq.studio", name: "Plaq Studio", check_interval_seconds: 300 },
    { url: "https://americanjeansstore.be", name: "American Jeansstore", check_interval_seconds: 300 },
    { url: "https://login.cityscreens.be", name: "CityScreens", check_interval_seconds: 300 },
    { url: "https://sandboxservices.be", name: "Sandbox Services", check_interval_seconds: 300 },
    { url: "https://cockpit.sbxs.io", name: "SBXS Cockpit", check_interval_seconds: 300, paths: [] },
    { url: "https://studiostockmans.com", name: "Studio Stockmans", check_interval_seconds: 300 },
    { url: "https://impulscommunicatie.be", name: "Impuls Communicatie", check_interval_seconds: 300 },
    { url: "https://alucomfort.be", name: "Alucomfort", check_interval_seconds: 300, paths: ["/contact/", "/shop/"] },
  ],

  // Alert thresholds
  alerts: {
    diskWarningPercent: 80,
    diskCriticalPercent: 90,
    sslWarningDays: 14,
    domainWarningDays: 30,
    uptimeFailuresBeforeAlert: 3,
    backupStaleHours: 2, // extra hours past expected interval
    // Escalation: re-notify for unresolved critical alerts
    // First reminder after 30 min, then every 60 min
    escalationFirstMinutes: 30,
    escalationRepeatMinutes: 60,
  },
};
