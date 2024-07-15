// Cache for database configuration
const CACHE = CacheService.getScriptCache();

function getConfig() {
  const scriptProperties = PropertiesService.getScriptProperties();
  return {
    notionApiKey: scriptProperties.getProperty('NOTION_API_KEY'),
    openaiApiKey: scriptProperties.getProperty('OPENAI_API_KEY'),
    configDatabaseId: scriptProperties.getProperty('NOTION_CONFIG_DATABASE_ID')
  };
}

function getNotionHeaders(apiKey) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
  };
}

function getCachedDatabaseConfig() {
  const cachedConfig = CACHE.get('databaseConfig');
  if (cachedConfig) {
    return JSON.parse(cachedConfig);
  }
  return null;
}

function setCachedDatabaseConfig(config) {
  CACHE.put('databaseConfig', JSON.stringify(config), 21600); // Cache for 6 hours
}